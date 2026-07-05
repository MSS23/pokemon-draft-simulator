/**
 * POKEMON DRAFT - COMPLETE DATABASE SCHEMA
 *
 * This file contains the complete database schema for the Pokemon Draft application.
 * It is idempotent and can be run multiple times safely.
 *
 * Based on actual current database structure from:
 * - 1-core-schema.sql
 * - 2-rls-policies.sql
 * - 3-league-schema.sql
 *
 * Run this in your Supabase SQL Editor to set up or update the database.
 *
 * Last Updated: 2025-01-11
 */

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES
-- ============================================

-- User profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drafts
CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  host_id TEXT NOT NULL,
  format TEXT CHECK (format IN ('snake', 'auction')) NOT NULL,
  ruleset TEXT DEFAULT 'regulation-h',
  budget_per_team INTEGER DEFAULT 100,
  max_teams INTEGER DEFAULT 8,
  status TEXT CHECK (status IN ('setup', 'active', 'completed', 'paused')) DEFAULT 'setup',
  current_turn INTEGER,
  current_round INTEGER DEFAULT 1,
  settings JSONB DEFAULT '{}'::jsonb,
  room_code TEXT UNIQUE
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT,
  budget_remaining INTEGER DEFAULT 100,
  draft_order INTEGER NOT NULL
);

-- Picks
CREATE TABLE IF NOT EXISTS picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  pick_order INTEGER NOT NULL,
  round INTEGER NOT NULL
);

-- Participants
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  user_id TEXT,
  display_name TEXT NOT NULL,
  team_id UUID REFERENCES teams(id),
  is_host BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Pokemon tiers (per-draft pricing)
CREATE TABLE IF NOT EXISTS pokemon_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  is_legal BOOLEAN DEFAULT TRUE
);

-- Auctions (for auction drafts)
CREATE TABLE IF NOT EXISTS auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  starting_bid INTEGER NOT NULL,
  current_bid INTEGER NOT NULL,
  current_bidder_id UUID REFERENCES teams(id),
  time_remaining INTEGER NOT NULL,
  status TEXT CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
  nominated_by UUID REFERENCES teams(id)
);

-- Bids (bid history for auctions)
CREATE TABLE IF NOT EXISTS bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  bidder_name TEXT NOT NULL
);

-- Wishlist items
CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  priority INTEGER NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  cost INTEGER NOT NULL
);

-- Spectator events
CREATE TABLE IF NOT EXISTS spectator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  spectator_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LEAGUE SYSTEM TABLES
-- ============================================

-- Leagues (created from completed drafts)
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
  seed INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, team_id)
);

-- Matches (individual matchups)
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  home_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scheduled_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),

  -- Match Results
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  winner_team_id UUID REFERENCES teams(id),

  -- Match Details
  battle_format TEXT DEFAULT 'best_of_3',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(league_id, week_number, home_team_id, away_team_id)
);

-- Standings (league standings)
CREATE TABLE IF NOT EXISTS standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Win/Loss Record
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,

  -- Points
  points_for INTEGER DEFAULT 0,
  points_against INTEGER DEFAULT 0,
  point_differential INTEGER GENERATED ALWAYS AS (points_for - points_against) STORED,

  -- Ranking
  rank INTEGER,

  -- Streaks
  current_streak TEXT,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(league_id, team_id)
);

-- Match games (individual games within a match)
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

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- User profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Drafts
CREATE INDEX IF NOT EXISTS idx_drafts_room_code ON drafts(room_code);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_host_id ON drafts(host_id);

-- Teams
CREATE INDEX IF NOT EXISTS idx_teams_draft_id ON teams(draft_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);

-- Picks
CREATE INDEX IF NOT EXISTS idx_picks_draft_id ON picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_picks_team_id ON picks(team_id);
CREATE INDEX IF NOT EXISTS idx_picks_pokemon_id ON picks(pokemon_id);

-- Participants
CREATE INDEX IF NOT EXISTS idx_participants_draft_id ON participants(draft_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);

-- Pokemon tiers
CREATE INDEX IF NOT EXISTS idx_pokemon_tiers_draft_id ON pokemon_tiers(draft_id);
CREATE INDEX IF NOT EXISTS idx_pokemon_tiers_pokemon_id ON pokemon_tiers(pokemon_id);

-- Auctions
CREATE INDEX IF NOT EXISTS idx_auctions_draft_id ON auctions(draft_id);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);

-- Bids
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_team_id ON bids(team_id);

-- Wishlist items
CREATE INDEX IF NOT EXISTS idx_wishlist_items_draft_id ON wishlist_items(draft_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_participant_id ON wishlist_items(participant_id);

-- Spectator events
CREATE INDEX IF NOT EXISTS idx_spectator_events_draft_id ON spectator_events(draft_id);

-- Leagues
CREATE INDEX IF NOT EXISTS idx_leagues_draft_id ON leagues(draft_id);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);

-- League teams
CREATE INDEX IF NOT EXISTS idx_league_teams_league_id ON league_teams(league_id);
CREATE INDEX IF NOT EXISTS idx_league_teams_team_id ON league_teams(team_id);

-- Matches
CREATE INDEX IF NOT EXISTS idx_matches_league_id ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_week ON matches(league_id, week_number);
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- Standings
CREATE INDEX IF NOT EXISTS idx_standings_league_id ON standings(league_id);
CREATE INDEX IF NOT EXISTS idx_standings_rank ON standings(league_id, rank);

-- Match games
CREATE INDEX IF NOT EXISTS idx_match_games_match_id ON match_games(match_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id::text,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- ============================================
-- TRIGGERS
-- ============================================

-- Drop existing triggers (for idempotency)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trigger_update_standings ON matches;

-- Trigger to create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to auto-update standings
CREATE TRIGGER trigger_update_standings
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION update_standings_for_match();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE spectator_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_games ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- DROP EXISTING POLICIES (for idempotency)
-- =====================================================

-- User Profiles
DROP POLICY IF EXISTS "User profiles are viewable by everyone" ON user_profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;

-- Drafts
DROP POLICY IF EXISTS "Drafts are viewable by everyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be created by anyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be updated by anyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be deleted by anyone" ON drafts;

-- Teams
DROP POLICY IF EXISTS "Teams are viewable by everyone" ON teams;
DROP POLICY IF EXISTS "Teams can be created by anyone" ON teams;
DROP POLICY IF EXISTS "Teams can be updated by anyone" ON teams;
DROP POLICY IF EXISTS "Teams can be deleted by anyone" ON teams;

-- Picks
DROP POLICY IF EXISTS "Picks are viewable by everyone" ON picks;
DROP POLICY IF EXISTS "Picks can be created by anyone" ON picks;
DROP POLICY IF EXISTS "Picks can be updated by anyone" ON picks;
DROP POLICY IF EXISTS "Picks can be deleted by anyone" ON picks;

-- Participants
DROP POLICY IF EXISTS "Participants are viewable by everyone" ON participants;
DROP POLICY IF EXISTS "Participants can be created by anyone" ON participants;
DROP POLICY IF EXISTS "Participants can be updated by anyone" ON participants;
DROP POLICY IF EXISTS "Participants can be deleted by anyone" ON participants;

-- Pokemon Tiers
DROP POLICY IF EXISTS "Pokemon tiers are viewable by everyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be created by anyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be updated by anyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be deleted by anyone" ON pokemon_tiers;

-- Auctions
DROP POLICY IF EXISTS "Auctions are viewable by everyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be created by anyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be updated by anyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be deleted by anyone" ON auctions;

-- Bids
DROP POLICY IF EXISTS "Bids are viewable by everyone" ON bids;
DROP POLICY IF EXISTS "Bids can be created by anyone" ON bids;

-- Wishlist Items
DROP POLICY IF EXISTS "Wishlist items are viewable by everyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be managed by anyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be updated by anyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be deleted by anyone" ON wishlist_items;

-- Spectator Events
DROP POLICY IF EXISTS "Spectator events are viewable by everyone" ON spectator_events;
DROP POLICY IF EXISTS "Spectator events can be created by anyone" ON spectator_events;

-- Leagues
DROP POLICY IF EXISTS "Leagues are viewable by everyone" ON leagues;
DROP POLICY IF EXISTS "Leagues can be created by anyone" ON leagues;
DROP POLICY IF EXISTS "Leagues can be updated by anyone" ON leagues;
DROP POLICY IF EXISTS "Leagues can be deleted by anyone" ON leagues;

-- League Teams
DROP POLICY IF EXISTS "League teams are viewable by everyone" ON league_teams;
DROP POLICY IF EXISTS "League teams can be managed by anyone" ON league_teams;

-- Matches
DROP POLICY IF EXISTS "Matches are viewable by everyone" ON matches;
DROP POLICY IF EXISTS "Matches can be created by anyone" ON matches;
DROP POLICY IF EXISTS "Matches can be updated by anyone" ON matches;
DROP POLICY IF EXISTS "Matches can be deleted by anyone" ON matches;

-- Standings
DROP POLICY IF EXISTS "Standings are viewable by everyone" ON standings;
DROP POLICY IF EXISTS "Standings can be managed by anyone" ON standings;

-- Match Games
DROP POLICY IF EXISTS "Match games are viewable by everyone" ON match_games;
DROP POLICY IF EXISTS "Match games can be managed by anyone" ON match_games;

-- =====================================================
-- CREATE PERMISSIVE POLICIES
-- =====================================================
-- These policies allow guest users (anon) to participate
-- since the app uses guest authentication
-- =====================================================

-- USER PROFILES
CREATE POLICY "User profiles are viewable by everyone"
  ON user_profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (true);

-- DRAFTS
CREATE POLICY "Drafts are viewable by everyone"
  ON drafts FOR SELECT
  USING (true);

CREATE POLICY "Drafts can be created by anyone"
  ON drafts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Drafts can be updated by anyone"
  ON drafts FOR UPDATE
  USING (true);

CREATE POLICY "Drafts can be deleted by anyone"
  ON drafts FOR DELETE
  USING (true);

-- TEAMS
CREATE POLICY "Teams are viewable by everyone"
  ON teams FOR SELECT
  USING (true);

CREATE POLICY "Teams can be created by anyone"
  ON teams FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Teams can be updated by anyone"
  ON teams FOR UPDATE
  USING (true);

CREATE POLICY "Teams can be deleted by anyone"
  ON teams FOR DELETE
  USING (true);

-- PICKS
CREATE POLICY "Picks are viewable by everyone"
  ON picks FOR SELECT
  USING (true);

CREATE POLICY "Picks can be created by anyone"
  ON picks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Picks can be updated by anyone"
  ON picks FOR UPDATE
  USING (true);

CREATE POLICY "Picks can be deleted by anyone"
  ON picks FOR DELETE
  USING (true);

-- PARTICIPANTS
CREATE POLICY "Participants are viewable by everyone"
  ON participants FOR SELECT
  USING (true);

CREATE POLICY "Participants can be created by anyone"
  ON participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Participants can be updated by anyone"
  ON participants FOR UPDATE
  USING (true);

CREATE POLICY "Participants can be deleted by anyone"
  ON participants FOR DELETE
  USING (true);

-- POKEMON TIERS
CREATE POLICY "Pokemon tiers are viewable by everyone"
  ON pokemon_tiers FOR SELECT
  USING (true);

CREATE POLICY "Pokemon tiers can be created by anyone"
  ON pokemon_tiers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Pokemon tiers can be updated by anyone"
  ON pokemon_tiers FOR UPDATE
  USING (true);

CREATE POLICY "Pokemon tiers can be deleted by anyone"
  ON pokemon_tiers FOR DELETE
  USING (true);

-- AUCTIONS
CREATE POLICY "Auctions are viewable by everyone"
  ON auctions FOR SELECT
  USING (true);

CREATE POLICY "Auctions can be created by anyone"
  ON auctions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Auctions can be updated by anyone"
  ON auctions FOR UPDATE
  USING (true);

CREATE POLICY "Auctions can be deleted by anyone"
  ON auctions FOR DELETE
  USING (true);

-- BIDS
CREATE POLICY "Bids are viewable by everyone"
  ON bids FOR SELECT
  USING (true);

CREATE POLICY "Bids can be created by anyone"
  ON bids FOR INSERT
  WITH CHECK (true);

-- WISHLIST ITEMS
CREATE POLICY "Wishlist items are viewable by everyone"
  ON wishlist_items FOR SELECT
  USING (true);

CREATE POLICY "Wishlist items can be managed by anyone"
  ON wishlist_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Wishlist items can be updated by anyone"
  ON wishlist_items FOR UPDATE
  USING (true);

CREATE POLICY "Wishlist items can be deleted by anyone"
  ON wishlist_items FOR DELETE
  USING (true);

-- SPECTATOR EVENTS
CREATE POLICY "Spectator events are viewable by everyone"
  ON spectator_events FOR SELECT
  USING (true);

CREATE POLICY "Spectator events can be created by anyone"
  ON spectator_events FOR INSERT
  WITH CHECK (true);

-- LEAGUES
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

-- LEAGUE TEAMS
CREATE POLICY "League teams are viewable by everyone"
  ON league_teams FOR SELECT
  USING (true);

CREATE POLICY "League teams can be managed by anyone"
  ON league_teams FOR ALL
  USING (true);

-- MATCHES
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

-- STANDINGS
CREATE POLICY "Standings are viewable by everyone"
  ON standings FOR SELECT
  USING (true);

CREATE POLICY "Standings can be managed by anyone"
  ON standings FOR ALL
  USING (true);

-- MATCH GAMES
CREATE POLICY "Match games are viewable by everyone"
  ON match_games FOR SELECT
  USING (true);

CREATE POLICY "Match games can be managed by anyone"
  ON match_games FOR ALL
  USING (true);

-- ============================================
-- ENABLE REALTIME SUBSCRIPTIONS
-- ============================================

DO $$
DECLARE
  table_names TEXT[] := ARRAY[
    'drafts', 'teams', 'picks', 'participants', 'pokemon_tiers',
    'auctions', 'bids', 'wishlist_items', 'user_profiles', 'spectator_events',
    'leagues', 'league_teams', 'matches', 'standings', 'match_games'
  ];
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

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Pokemon Draft Database Setup Complete ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created: 15';
  RAISE NOTICE 'Indexes created: 30+';
  RAISE NOTICE 'Functions created: 2';
  RAISE NOTICE 'Triggers created: 2';
  RAISE NOTICE 'RLS Policies: Enabled on all tables';
  RAISE NOTICE '';
  RAISE NOTICE 'Core Features:';
  RAISE NOTICE '  ✓ Draft system (Snake & Auction)';
  RAISE NOTICE '  ✓ League management';
  RAISE NOTICE '  ✓ Match tracking with auto-standings';
  RAISE NOTICE '  ✓ User profiles with auth trigger';
  RAISE NOTICE '  ✓ Wishlist system';
  RAISE NOTICE '  ✓ Spectator mode';
  RAISE NOTICE '  ✓ Realtime subscriptions';
  RAISE NOTICE '';
  RAISE NOTICE 'Database ready for Pokemon Draft League!';
  RAISE NOTICE '';
END $$;
