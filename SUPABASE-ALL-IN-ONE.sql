-- =====================================================
-- POKEMON DRAFT - COMPLETE DATABASE SETUP
-- =====================================================
-- This is an ALL-IN-ONE script that sets up everything
-- Just copy/paste this entire file into Supabase SQL Editor
-- Safe to run multiple times (idempotent)
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PART 1: CORE TABLES
-- =====================================================

-- Drafts table
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

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT,
  budget_remaining INTEGER DEFAULT 100,
  draft_order INTEGER NOT NULL
);

-- Picks table
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

-- Participants table
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

-- Pokemon tiers table
CREATE TABLE IF NOT EXISTS pokemon_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  is_legal BOOLEAN DEFAULT TRUE
);

-- Auctions table
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

-- Bids table
CREATE TABLE IF NOT EXISTS bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  bidder_name TEXT NOT NULL
);

-- Wishlist items table
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

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spectator events table
CREATE TABLE IF NOT EXISTS spectator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  spectator_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PART 2: PERFORMANCE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_drafts_room_code ON drafts(room_code);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_host_id ON drafts(host_id);

CREATE INDEX IF NOT EXISTS idx_teams_draft_id ON teams(draft_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);

CREATE INDEX IF NOT EXISTS idx_picks_draft_id ON picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_picks_team_id ON picks(team_id);
CREATE INDEX IF NOT EXISTS idx_picks_pokemon_id ON picks(pokemon_id);

CREATE INDEX IF NOT EXISTS idx_participants_draft_id ON participants(draft_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);

CREATE INDEX IF NOT EXISTS idx_pokemon_tiers_draft_id ON pokemon_tiers(draft_id);
CREATE INDEX IF NOT EXISTS idx_pokemon_tiers_pokemon_id ON pokemon_tiers(pokemon_id);

CREATE INDEX IF NOT EXISTS idx_auctions_draft_id ON auctions(draft_id);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);

CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_team_id ON bids(team_id);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_draft_id ON wishlist_items(draft_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_participant_id ON wishlist_items(participant_id);

CREATE INDEX IF NOT EXISTS idx_spectator_events_draft_id ON spectator_events(draft_id);

-- =====================================================
-- PART 3: FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Trigger to create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- PART 4: ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE spectator_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (for idempotency)
DROP POLICY IF EXISTS "Drafts are viewable by everyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be created by anyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be updated by anyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be deleted by anyone" ON drafts;

DROP POLICY IF EXISTS "Teams are viewable by everyone" ON teams;
DROP POLICY IF EXISTS "Teams can be created by anyone" ON teams;
DROP POLICY IF EXISTS "Teams can be updated by anyone" ON teams;
DROP POLICY IF EXISTS "Teams can be deleted by anyone" ON teams;

DROP POLICY IF EXISTS "Picks are viewable by everyone" ON picks;
DROP POLICY IF EXISTS "Picks can be created by anyone" ON picks;
DROP POLICY IF EXISTS "Picks can be updated by anyone" ON picks;
DROP POLICY IF EXISTS "Picks can be deleted by anyone" ON picks;

DROP POLICY IF EXISTS "Participants are viewable by everyone" ON participants;
DROP POLICY IF EXISTS "Participants can be created by anyone" ON participants;
DROP POLICY IF EXISTS "Participants can be updated by anyone" ON participants;
DROP POLICY IF EXISTS "Participants can be deleted by anyone" ON participants;

DROP POLICY IF EXISTS "Pokemon tiers are viewable by everyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be created by anyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be updated by anyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be deleted by anyone" ON pokemon_tiers;

DROP POLICY IF EXISTS "Auctions are viewable by everyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be created by anyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be updated by anyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be deleted by anyone" ON auctions;

DROP POLICY IF EXISTS "Bids are viewable by everyone" ON bids;
DROP POLICY IF EXISTS "Bids can be created by anyone" ON bids;

DROP POLICY IF EXISTS "Wishlist items are viewable by everyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be managed by anyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be updated by anyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be deleted by anyone" ON wishlist_items;

DROP POLICY IF EXISTS "User profiles are viewable by everyone" ON user_profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;

DROP POLICY IF EXISTS "Spectator events are viewable by everyone" ON spectator_events;
DROP POLICY IF EXISTS "Spectator events can be created by anyone" ON spectator_events;

-- Create permissive policies (supports guest authentication)
-- DRAFTS
CREATE POLICY "Drafts are viewable by everyone" ON drafts FOR SELECT USING (true);
CREATE POLICY "Drafts can be created by anyone" ON drafts FOR INSERT WITH CHECK (true);
CREATE POLICY "Drafts can be updated by anyone" ON drafts FOR UPDATE USING (true);
CREATE POLICY "Drafts can be deleted by anyone" ON drafts FOR DELETE USING (true);

-- TEAMS
CREATE POLICY "Teams are viewable by everyone" ON teams FOR SELECT USING (true);
CREATE POLICY "Teams can be created by anyone" ON teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Teams can be updated by anyone" ON teams FOR UPDATE USING (true);
CREATE POLICY "Teams can be deleted by anyone" ON teams FOR DELETE USING (true);

-- PICKS
CREATE POLICY "Picks are viewable by everyone" ON picks FOR SELECT USING (true);
CREATE POLICY "Picks can be created by anyone" ON picks FOR INSERT WITH CHECK (true);
CREATE POLICY "Picks can be updated by anyone" ON picks FOR UPDATE USING (true);
CREATE POLICY "Picks can be deleted by anyone" ON picks FOR DELETE USING (true);

-- PARTICIPANTS
CREATE POLICY "Participants are viewable by everyone" ON participants FOR SELECT USING (true);
CREATE POLICY "Participants can be created by anyone" ON participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Participants can be updated by anyone" ON participants FOR UPDATE USING (true);
CREATE POLICY "Participants can be deleted by anyone" ON participants FOR DELETE USING (true);

-- POKEMON_TIERS
CREATE POLICY "Pokemon tiers are viewable by everyone" ON pokemon_tiers FOR SELECT USING (true);
CREATE POLICY "Pokemon tiers can be created by anyone" ON pokemon_tiers FOR INSERT WITH CHECK (true);
CREATE POLICY "Pokemon tiers can be updated by anyone" ON pokemon_tiers FOR UPDATE USING (true);
CREATE POLICY "Pokemon tiers can be deleted by anyone" ON pokemon_tiers FOR DELETE USING (true);

-- AUCTIONS
CREATE POLICY "Auctions are viewable by everyone" ON auctions FOR SELECT USING (true);
CREATE POLICY "Auctions can be created by anyone" ON auctions FOR INSERT WITH CHECK (true);
CREATE POLICY "Auctions can be updated by anyone" ON auctions FOR UPDATE USING (true);
CREATE POLICY "Auctions can be deleted by anyone" ON auctions FOR DELETE USING (true);

-- BIDS
CREATE POLICY "Bids are viewable by everyone" ON bids FOR SELECT USING (true);
CREATE POLICY "Bids can be created by anyone" ON bids FOR INSERT WITH CHECK (true);

-- WISHLIST_ITEMS
CREATE POLICY "Wishlist items are viewable by everyone" ON wishlist_items FOR SELECT USING (true);
CREATE POLICY "Wishlist items can be managed by anyone" ON wishlist_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Wishlist items can be updated by anyone" ON wishlist_items FOR UPDATE USING (true);
CREATE POLICY "Wishlist items can be deleted by anyone" ON wishlist_items FOR DELETE USING (true);

-- USER_PROFILES
CREATE POLICY "User profiles are viewable by everyone" ON user_profiles FOR SELECT USING (true);
CREATE POLICY "Users can create their own profile" ON user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own profile" ON user_profiles FOR UPDATE USING (true);

-- SPECTATOR_EVENTS
CREATE POLICY "Spectator events are viewable by everyone" ON spectator_events FOR SELECT USING (true);
CREATE POLICY "Spectator events can be created by anyone" ON spectator_events FOR INSERT WITH CHECK (true);

-- =====================================================
-- PART 5: ENABLE REALTIME SUBSCRIPTIONS
-- =====================================================

DO $$
DECLARE
  table_names TEXT[] := ARRAY[
    'drafts', 'teams', 'picks', 'participants', 'pokemon_tiers',
    'auctions', 'bids', 'wishlist_items', 'user_profiles', 'spectator_events'
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

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================
-- Your Pokemon Draft database is ready to use!
--
-- Next steps:
-- 1. Verify tables were created (see SUPABASE-SETUP-GUIDE.md)
-- 2. (Optional) Run 3-league-schema.sql for league features
-- 3. Add environment variables to your app
-- 4. Deploy and test!
-- =====================================================
