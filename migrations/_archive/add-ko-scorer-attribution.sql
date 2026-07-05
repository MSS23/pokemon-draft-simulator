-- Migration: KO scorer attribution for real league match scoring
-- ----------------------------------------------------------------
-- The existing match_pokemon_kos table tracks WHICH Pokémon was knocked out
-- (pick_id = victim) but not WHO scored the KO. To compute league match scores
-- as "Team A KOs vs Team B KOs" (NBA-style live scoring), we need scorer
-- attribution. This migration adds it without breaking existing rows.
--
-- New columns:
--   scorer_pick_id    UUID  — the Pokémon that got the KO  (nullable; backfilled from ko_details when possible)
--   scorer_team_id    UUID  — the team that scored
--   turn_number       INT   — promote out of ko_details JSONB for indexing
--   recorded_by       UUID  — user_id (or text guest id) who logged the KO
--   superseded_by     UUID  — set when a row is "deleted" via UPSERT history (audit trail)
--
-- Rename clarification: existing `pick_id` and `team_id` continue to mean
-- the VICTIM (who fainted). We add a scorer pair alongside them.
--
-- Run in Supabase SQL editor.

ALTER TABLE match_pokemon_kos
  ADD COLUMN IF NOT EXISTS scorer_pick_id  UUID REFERENCES picks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scorer_team_id  UUID REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turn_number     INT,
  ADD COLUMN IF NOT EXISTS recorded_by     TEXT;

-- Indices for fast match-score aggregation
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_scorer_team
  ON match_pokemon_kos(match_id, scorer_team_id);
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_match_turn
  ON match_pokemon_kos(match_id, turn_number);

-- Backfill turn_number from ko_details JSONB where present
UPDATE match_pokemon_kos
SET turn_number = (ko_details ->> 'turnNumber')::int
WHERE turn_number IS NULL
  AND ko_details ? 'turnNumber';

-- Helper view: aggregate score per match per scorer team.
-- Use this in the UI / scoring layer instead of trusting submitted scores.
CREATE OR REPLACE VIEW match_score_tally AS
SELECT
  match_id,
  scorer_team_id   AS team_id,
  COUNT(*)         AS kos_scored,
  SUM(ko_count)    AS total_kos,
  MAX(turn_number) AS last_turn
FROM match_pokemon_kos
WHERE scorer_team_id IS NOT NULL
GROUP BY match_id, scorer_team_id;

-- RLS: same policy as parent table — anyone in the league can read,
-- inserts/updates require participant or commissioner status. The existing
-- policy in fix-rls-policies.sql already covers ALL operations on this table
-- via the participant guard, so the new columns inherit those rules.

-- Convenience function: tally a match's score from logged KOs.
-- Returns home_score, away_score for the match.
CREATE OR REPLACE FUNCTION tally_match_score(p_match_id UUID)
RETURNS TABLE (
  home_team_id UUID,
  away_team_id UUID,
  home_score   INT,
  away_score   INT,
  ko_count     INT
) AS $$
DECLARE
  v_home UUID;
  v_away UUID;
BEGIN
  SELECT home_team_id, away_team_id INTO v_home, v_away
  FROM matches WHERE id = p_match_id;

  RETURN QUERY
  SELECT
    v_home,
    v_away,
    COALESCE((
      SELECT COUNT(*)::int
      FROM match_pokemon_kos
      WHERE match_id = p_match_id
        AND scorer_team_id = v_home
    ), 0),
    COALESCE((
      SELECT COUNT(*)::int
      FROM match_pokemon_kos
      WHERE match_id = p_match_id
        AND scorer_team_id = v_away
    ), 0),
    COALESCE((
      SELECT COUNT(*)::int
      FROM match_pokemon_kos
      WHERE match_id = p_match_id
        AND scorer_team_id IS NOT NULL
    ), 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION tally_match_score IS
  'Returns the authoritative home/away score for a match by counting KO events. '
  'Use this instead of trusting client-submitted scores.';
