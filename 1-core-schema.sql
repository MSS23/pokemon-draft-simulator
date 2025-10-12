-- =====================================================
-- POKEMON DRAFT - CORE SCHEMA
-- =====================================================
-- This creates the core draft tables
-- Safe to run multiple times (uses IF NOT EXISTS)
-- Run this FIRST in Supabase SQL Editor
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CORE TABLES
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

-- Pokemon tiers table (for custom pricing per draft)
CREATE TABLE IF NOT EXISTS pokemon_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  is_legal BOOLEAN DEFAULT TRUE
);

-- Auctions table (for auction drafts)
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

-- Bids table (bid history for auctions)
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

-- User profiles table (for display names and preferences)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spectator events table (for tracking spectator activity)
CREATE TABLE IF NOT EXISTS spectator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  spectator_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
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

-- user_profiles.user_id already has UNIQUE constraint which creates an index automatically
-- No explicit index needed

CREATE INDEX IF NOT EXISTS idx_spectator_events_draft_id ON spectator_events(draft_id);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id::text,  -- Cast UUID to text
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
-- SCHEMA COMPLETE
-- =====================================================
-- Next: Run 2-rls-policies.sql to set up security
-- =====================================================
