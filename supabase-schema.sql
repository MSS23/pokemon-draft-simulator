-- Pokemon Draft Database Schema
-- Run this in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tables
CREATE TABLE drafts (
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

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT,
  budget_remaining INTEGER DEFAULT 100,
  draft_order INTEGER NOT NULL
);

CREATE TABLE picks (
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

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  user_id TEXT,
  display_name TEXT NOT NULL,
  team_id UUID REFERENCES teams(id),
  is_host BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pokemon_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  is_legal BOOLEAN DEFAULT TRUE
);

CREATE TABLE auctions (
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

CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  bidder_name TEXT NOT NULL
);

CREATE TABLE wishlist_items (
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

-- Add indexes for better performance
CREATE INDEX idx_drafts_room_code ON drafts(room_code);
CREATE INDEX idx_teams_draft_id ON teams(draft_id);
CREATE INDEX idx_picks_draft_id ON picks(draft_id);
CREATE INDEX idx_participants_draft_id ON participants(draft_id);
CREATE INDEX idx_pokemon_tiers_draft_id ON pokemon_tiers(draft_id);
CREATE INDEX idx_auctions_draft_id ON auctions(draft_id);
CREATE INDEX idx_bids_auction_id ON bids(auction_id);
CREATE INDEX idx_wishlist_items_draft_id ON wishlist_items(draft_id);

-- Enable Row Level Security (RLS)
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for development (you can tighten these later)
CREATE POLICY "Allow all operations on drafts" ON drafts FOR ALL USING (true);
CREATE POLICY "Allow all operations on teams" ON teams FOR ALL USING (true);
CREATE POLICY "Allow all operations on picks" ON picks FOR ALL USING (true);
CREATE POLICY "Allow all operations on participants" ON participants FOR ALL USING (true);
CREATE POLICY "Allow all operations on pokemon_tiers" ON pokemon_tiers FOR ALL USING (true);
CREATE POLICY "Allow all operations on auctions" ON auctions FOR ALL USING (true);
CREATE POLICY "Allow all operations on bids" ON bids FOR ALL USING (true);
CREATE POLICY "Allow all operations on wishlist_items" ON wishlist_items FOR ALL USING (true);

-- Enable real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE picks;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE pokemon_tiers;
ALTER PUBLICATION supabase_realtime ADD TABLE auctions;
ALTER PUBLICATION supabase_realtime ADD TABLE bids;
ALTER PUBLICATION supabase_realtime ADD TABLE wishlist_items;
