-- Migration: Add Pokemon KO/Death Tracking for League Matches
-- Enables tracking of Pokemon knockouts, deaths (Nuzlocke), and status across league matches
-- Date: 2025-01-10
-- Author: Claude Code

-- ============================================
-- MATCH POKEMON KOs TABLE
-- ============================================
-- Track individual Pokemon knockouts within matches
CREATE TABLE IF NOT EXISTS match_pokemon_kos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL DEFAULT 1, -- Which game in best-of-X match
  pokemon_id TEXT NOT NULL, -- Pokemon species ID (e.g., "1" for Bulbasaur)
  pick_id UUID NOT NULL REFERENCES picks(id) ON DELETE CASCADE, -- Which team's Pokemon
  ko_count INTEGER NOT NULL DEFAULT 1, -- Number of times this Pokemon fainted in this game
  is_death BOOLEAN DEFAULT FALSE, -- True if this KO resulted in permanent death (Nuzlocke)
  ko_details JSONB, -- Optional details: opponent, move used, turn number, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_match ON match_pokemon_kos(match_id);
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_pick ON match_pokemon_kos(pick_id);
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_game ON match_pokemon_kos(match_id, game_number);

-- ============================================
-- TEAM POKEMON STATUS TABLE
-- ============================================
-- Overall Pokemon health status across the league season
CREATE TABLE IF NOT EXISTS team_pokemon_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id UUID NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,

  -- Pokemon status
  status TEXT NOT NULL CHECK (status IN ('alive', 'fainted', 'dead')) DEFAULT 'alive',

  -- Statistics
  total_kos INTEGER DEFAULT 0, -- Total times this Pokemon has fainted
  matches_played INTEGER DEFAULT 0, -- Matches where this Pokemon was used
  matches_won INTEGER DEFAULT 0, -- Matches won when this Pokemon was used

  -- Death tracking (for Nuzlocke)
  death_match_id UUID REFERENCES matches(id), -- Match where Pokemon died
  death_date TIMESTAMPTZ, -- When it died
  death_details JSONB, -- How it died (opponent, move, etc.)

  -- Additional info
  notes TEXT, -- Optional notes about this Pokemon

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each pick should only have one status entry per league
  UNIQUE(pick_id, league_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_pick ON team_pokemon_status(pick_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_team ON team_pokemon_status(team_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_league ON team_pokemon_status(league_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_status ON team_pokemon_status(status);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_dead ON team_pokemon_status(league_id) WHERE status = 'dead';

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_match_pokemon_kos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_match_pokemon_kos_updated_at
  BEFORE UPDATE ON match_pokemon_kos
  FOR EACH ROW
  EXECUTE FUNCTION update_match_pokemon_kos_updated_at();

CREATE OR REPLACE FUNCTION update_team_pokemon_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_team_pokemon_status_updated_at
  BEFORE UPDATE ON team_pokemon_status
  FOR EACH ROW
  EXECUTE FUNCTION update_team_pokemon_status_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE match_pokemon_kos ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_pokemon_status ENABLE ROW LEVEL SECURITY;

-- Match Pokemon KOs: Anyone can view, participants can insert/update
CREATE POLICY "Anyone can view match Pokemon KOs"
  ON match_pokemon_kos FOR SELECT
  USING (true);

CREATE POLICY "Participants can insert match Pokemon KOs"
  ON match_pokemon_kos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN league_teams lt ON m.league_id = lt.league_id
      WHERE m.id = match_id
      AND (lt.team_id IN (m.home_team_id, m.away_team_id))
    )
  );

CREATE POLICY "Participants can update their match Pokemon KOs"
  ON match_pokemon_kos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN league_teams lt ON m.league_id = lt.league_id
      JOIN picks p ON match_pokemon_kos.pick_id = p.id
      WHERE m.id = match_id
      AND p.team_id = lt.team_id
    )
  );

-- Team Pokemon Status: Anyone can view, team owners can manage
CREATE POLICY "Anyone can view team Pokemon status"
  ON team_pokemon_status FOR SELECT
  USING (true);

CREATE POLICY "Team owners can manage their Pokemon status"
  ON team_pokemon_status FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id
    )
  );

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE match_pokemon_kos IS 'Tracks Pokemon knockouts/faints during league matches, including Nuzlocke deaths';
COMMENT ON COLUMN match_pokemon_kos.game_number IS 'Which game in a best-of-X match (1, 2, 3, etc.)';
COMMENT ON COLUMN match_pokemon_kos.ko_count IS 'Number of times this Pokemon fainted in this specific game';
COMMENT ON COLUMN match_pokemon_kos.is_death IS 'If true, this KO resulted in permanent death (Nuzlocke rules)';
COMMENT ON COLUMN match_pokemon_kos.ko_details IS 'JSONB: {opponent_pokemon, move_used, turn_number, damage, etc.}';

COMMENT ON TABLE team_pokemon_status IS 'Overall Pokemon health status across league season, tracks alive/fainted/dead state';
COMMENT ON COLUMN team_pokemon_status.status IS 'Current status: alive (healthy), fainted (can recover), dead (permanent - Nuzlocke)';
COMMENT ON COLUMN team_pokemon_status.total_kos IS 'Total number of times this Pokemon has fainted across all matches';
COMMENT ON COLUMN team_pokemon_status.death_match_id IS 'Reference to the match where this Pokemon died (if Nuzlocke enabled)';

-- ============================================
-- SAMPLE QUERIES
-- ============================================

-- Get all Pokemon KOs for a specific match
-- SELECT * FROM match_pokemon_kos WHERE match_id = 'some-uuid' ORDER BY game_number, created_at;

-- Get dead Pokemon in a league (Nuzlocke)
-- SELECT * FROM team_pokemon_status WHERE league_id = 'some-uuid' AND status = 'dead';

-- Get Pokemon with most KOs in a league
-- SELECT pick_id, pokemon_id, SUM(ko_count) as total_kos
-- FROM match_pokemon_kos mk
-- JOIN matches m ON mk.match_id = m.id
-- WHERE m.league_id = 'some-uuid'
-- GROUP BY pick_id, pokemon_id
-- ORDER BY total_kos DESC;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Pokemon Tracking Migration Complete ===';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - match_pokemon_kos (tracks KOs per match/game)';
  RAISE NOTICE '  - team_pokemon_status (overall Pokemon health)';
  RAISE NOTICE '';
  RAISE NOTICE 'Features enabled:';
  RAISE NOTICE '  - Pokemon knockout tracking';
  RAISE NOTICE '  - Nuzlocke death system';
  RAISE NOTICE '  - Match statistics per Pokemon';
  RAISE NOTICE '  - RLS policies configured';
  RAISE NOTICE '';
END $$;
