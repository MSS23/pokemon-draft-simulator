-- fix-dashboard-view.sql
-- Creates a user_draft_summary view for server-side dashboard queries.
-- Corrects the original migration that referenced d.pokemon_per_team
-- (which doesn't exist as a column -- it's stored inside settings JSONB).

DROP VIEW IF EXISTS public.user_draft_summary;

CREATE OR REPLACE VIEW public.user_draft_summary AS
SELECT
  d.id                    AS draft_id,
  d.name                  AS draft_name,
  d.status,
  d.format,
  d.ruleset,
  d.room_code,
  d.host_id,
  d.created_at,
  d.updated_at,
  d.max_teams,
  COALESCE((d.settings->>'maxPokemonPerTeam')::int, 6) AS pokemon_per_team,
  d.current_turn,
  d.spectator_count,
  t.id                    AS user_team_id,
  t.name                  AS user_team_name,
  t.owner_id              AS user_id,
  t.budget_remaining,
  t.draft_order,
  (d.host_id = t.owner_id) AS is_host,
  COALESCE(pc.picks_made, 0) AS picks_made,
  CASE
    WHEN COALESCE((d.settings->>'maxPokemonPerTeam')::int, 6) > 0
    THEN LEAST(100, ROUND(
      COALESCE(pc.picks_made, 0)::numeric
      / COALESCE((d.settings->>'maxPokemonPerTeam')::int, 6)
      * 100
    ))
    ELSE 0
  END AS progress_percent
FROM teams t
JOIN drafts d ON d.id = t.draft_id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS picks_made
  FROM picks p
  WHERE p.team_id = t.id
) pc ON true
WHERE d.deleted_at IS NULL;

-- Grant read access (adjust role if needed)
GRANT SELECT ON public.user_draft_summary TO authenticated;
GRANT SELECT ON public.user_draft_summary TO anon;
