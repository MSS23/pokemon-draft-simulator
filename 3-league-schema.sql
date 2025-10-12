-- =====================================================
-- POKEMON DRAFT - LEAGUE SYSTEM (OPTIONAL)
-- =====================================================
-- This adds competitive league play features
-- Safe to run multiple times (uses IF NOT EXISTS)
-- Run this THIRD after 1-core-schema.sql and 2-rls-policies.sql
-- Only run if you want league features enabled
-- =====================================================

-- =====================================================
-- LEAGUE TABLES
-- =====================================================

-- Leagues table (created from completed drafts)
CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  league_type TEXT NOT NULL CHECK (league_type IN ('single', 'split_conference_a', 'split_conference_b')),
  season_number INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  current_week INTEGER DEFAULT 1,
  total_weeks INTEGER NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- League teams (maps teams to leagues)
CREATE TABLE IF NOT EXISTS league_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  seed INTEGER, -- Draft order or ranking seed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, team_id)
);

-- Matches table (individual matchups)
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL, -- Match # within the week
  home_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scheduled_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),

  -- Match Results
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  winner_team_id UUID REFERENCES teams(id),

  -- Match Details
  battle_format TEXT DEFAULT 'best_of_3', -- best_of_1, best_of_3, best_of_5
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(league_id, week_number, home_team_id, away_team_id)
);

-- Standings table (league standings)
CREATE TABLE IF NOT EXISTS standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Win/Loss Record
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,

  -- Points
  points_for INTEGER DEFAULT 0, -- Total points scored
  points_against INTEGER DEFAULT 0, -- Total points conceded
  point_differential INTEGER GENERATED ALWAYS AS (points_for - points_against) STORED,

  -- Ranking
  rank INTEGER,

  -- Streaks
  current_streak TEXT, -- e.g., "W3" (3 win streak), "L2" (2 loss streak)

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(league_id, team_id)
);

-- Match games table (individual games within a match)
CREATE TABLE IF NOT EXISTS match_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  winner_team_id UUID REFERENCES teams(id),
  home_team_score INTEGER DEFAULT 0,
  away_team_score INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(match_id, game_number)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_leagues_draft_id ON leagues(draft_id);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);

CREATE INDEX IF NOT EXISTS idx_league_teams_league_id ON league_teams(league_id);
CREATE INDEX IF NOT EXISTS idx_league_teams_team_id ON league_teams(team_id);

CREATE INDEX IF NOT EXISTS idx_matches_league_id ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_week ON matches(league_id, week_number);
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

CREATE INDEX IF NOT EXISTS idx_standings_league_id ON standings(league_id);
CREATE INDEX IF NOT EXISTS idx_standings_rank ON standings(league_id, rank);

CREATE INDEX IF NOT EXISTS idx_match_games_match_id ON match_games(match_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_games ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (for idempotency)
DROP POLICY IF EXISTS "Leagues are viewable by everyone" ON leagues;
DROP POLICY IF EXISTS "Leagues can be created by anyone" ON leagues;
DROP POLICY IF EXISTS "Leagues can be updated by anyone" ON leagues;

DROP POLICY IF EXISTS "League teams are viewable by everyone" ON league_teams;
DROP POLICY IF EXISTS "League teams can be managed by anyone" ON league_teams;

DROP POLICY IF EXISTS "Matches are viewable by everyone" ON matches;
DROP POLICY IF EXISTS "Matches can be created by anyone" ON matches;
DROP POLICY IF EXISTS "Matches can be updated by anyone" ON matches;

DROP POLICY IF EXISTS "Standings are viewable by everyone" ON standings;
DROP POLICY IF EXISTS "Standings can be managed by anyone" ON standings;

DROP POLICY IF EXISTS "Match games are viewable by everyone" ON match_games;
DROP POLICY IF EXISTS "Match games can be managed by anyone" ON match_games;

-- Create permissive policies (guest auth support)
CREATE POLICY "Leagues are viewable by everyone"
  ON leagues FOR SELECT
  USING (true);

CREATE POLICY "Leagues can be created by anyone"
  ON leagues FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Leagues can be updated by anyone"
  ON leagues FOR UPDATE
  USING (true);

CREATE POLICY "Leagues can be deleted by anyone"
  ON leagues FOR DELETE
  USING (true);

CREATE POLICY "League teams are viewable by everyone"
  ON league_teams FOR SELECT
  USING (true);

CREATE POLICY "League teams can be managed by anyone"
  ON league_teams FOR ALL
  USING (true);

CREATE POLICY "Matches are viewable by everyone"
  ON matches FOR SELECT
  USING (true);

CREATE POLICY "Matches can be created by anyone"
  ON matches FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Matches can be updated by anyone"
  ON matches FOR UPDATE
  USING (true);

CREATE POLICY "Matches can be deleted by anyone"
  ON matches FOR DELETE
  USING (true);

CREATE POLICY "Standings are viewable by everyone"
  ON standings FOR SELECT
  USING (true);

CREATE POLICY "Standings can be managed by anyone"
  ON standings FOR ALL
  USING (true);

CREATE POLICY "Match games are viewable by everyone"
  ON match_games FOR SELECT
  USING (true);

CREATE POLICY "Match games can be managed by anyone"
  ON match_games FOR ALL
  USING (true);

-- =====================================================
-- ENABLE REALTIME SUBSCRIPTIONS
-- =====================================================

DO $$
DECLARE
  table_names TEXT[] := ARRAY['leagues', 'league_teams', 'matches', 'standings', 'match_games'];
  table_name TEXT;
BEGIN
  -- Check if supabase_realtime publication exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Add each table to publication if not already added
    FOREACH table_name IN ARRAY table_names
    LOOP
      -- Check if table is already in publication
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', table_name);
      END IF;
    END LOOP;
  END IF;
END $$;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Drop existing function (for idempotency)
DROP FUNCTION IF EXISTS update_standings_for_match() CASCADE;

-- Function to update standings when match is completed
CREATE OR REPLACE FUNCTION update_standings_for_match()
RETURNS TRIGGER AS $$
DECLARE
  loser_id UUID;
  winner_score INTEGER;
  loser_score INTEGER;
BEGIN
  -- Only update if match is completed
  IF NEW.status = 'completed' AND NEW.winner_team_id IS NOT NULL THEN

    -- Determine loser and scores
    IF NEW.winner_team_id = NEW.home_team_id THEN
      loser_id := NEW.away_team_id;
      winner_score := NEW.home_score;
      loser_score := NEW.away_score;
    ELSE
      loser_id := NEW.home_team_id;
      winner_score := NEW.away_score;
      loser_score := NEW.home_score;
    END IF;

    -- Update winner standings
    INSERT INTO standings (league_id, team_id, wins, points_for, points_against)
    VALUES (NEW.league_id, NEW.winner_team_id, 1, winner_score, loser_score)
    ON CONFLICT (league_id, team_id) DO UPDATE SET
      wins = standings.wins + 1,
      points_for = standings.points_for + winner_score,
      points_against = standings.points_against + loser_score,
      updated_at = NOW();

    -- Update loser standings
    INSERT INTO standings (league_id, team_id, losses, points_for, points_against)
    VALUES (NEW.league_id, loser_id, 1, loser_score, winner_score)
    ON CONFLICT (league_id, team_id) DO UPDATE SET
      losses = standings.losses + 1,
      points_for = standings.points_for + loser_score,
      points_against = standings.points_against + winner_score,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger (for idempotency)
DROP TRIGGER IF EXISTS trigger_update_standings ON matches;

-- Trigger to auto-update standings
CREATE TRIGGER trigger_update_standings
AFTER UPDATE ON matches
FOR EACH ROW
EXECUTE FUNCTION update_standings_for_match();

-- =====================================================
-- LEAGUE SCHEMA COMPLETE
-- =====================================================
-- All league features are now installed and ready to use
-- =====================================================
