-- =====================================================
-- POKEMON DRAFT LEAGUE - COMPLETE DATABASE SETUP
-- =====================================================
-- Run this entire script in your Supabase SQL Editor
-- Go to: https://supabase.com/dashboard > Your Project > SQL Editor
-- Then paste this entire file and click "Run"
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- BASE SCHEMA - Core Tables
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
  room_code TEXT UNIQUE,
  is_public BOOLEAN DEFAULT FALSE,
  spectator_count INTEGER DEFAULT 0,
  description TEXT,
  tags TEXT[],
  custom_format_id UUID,
  allow_undos BOOLEAN DEFAULT TRUE,
  max_undos_per_team INTEGER DEFAULT 3
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
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  nominated_by TEXT NOT NULL,
  current_bid INTEGER DEFAULT 0,
  current_bidder TEXT,
  auction_end TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active'
);

-- Bid history table
CREATE TABLE IF NOT EXISTS bid_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  team_id UUID NOT NULL,
  team_name TEXT NOT NULL,
  bid_amount INTEGER NOT NULL
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

-- Spectator events table
CREATE TABLE IF NOT EXISTS spectator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  spectator_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom formats table
CREATE TABLE IF NOT EXISTS custom_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 3 AND 100),
  description TEXT CHECK (length(description) <= 500),
  pokemon_pricing JSONB NOT NULL,
  total_pokemon INTEGER NOT NULL DEFAULT 0,
  min_cost INTEGER NOT NULL DEFAULT 0,
  max_cost INTEGER NOT NULL DEFAULT 0,
  avg_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_by_display_name TEXT NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- =====================================================
-- INDEXES for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_drafts_room_code ON drafts(room_code);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_is_public ON drafts(is_public);
CREATE INDEX IF NOT EXISTS idx_teams_draft_id ON teams(draft_id);
CREATE INDEX IF NOT EXISTS idx_picks_draft_id ON picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_picks_team_id ON picks(team_id);
CREATE INDEX IF NOT EXISTS idx_participants_draft_id ON participants(draft_id);
CREATE INDEX IF NOT EXISTS idx_auctions_draft_id ON auctions(draft_id);
CREATE INDEX IF NOT EXISTS idx_bid_history_auction_id ON bid_history(auction_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_draft_id ON wishlist_items(draft_id);
CREATE INDEX IF NOT EXISTS idx_spectator_events_draft_id ON spectator_events(draft_id);
CREATE INDEX IF NOT EXISTS idx_custom_formats_created_by ON custom_formats(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_custom_formats_public ON custom_formats(is_public, created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Disable RLS for now to allow guest access
ALTER TABLE drafts DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE picks DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_tiers DISABLE ROW LEVEL SECURITY;
ALTER TABLE auctions DISABLE ROW LEVEL SECURITY;
ALTER TABLE bid_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE spectator_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE custom_formats DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- VIEWS
-- =====================================================

CREATE OR REPLACE VIEW active_public_drafts AS
SELECT
  d.id,
  d.name,
  d.description,
  d.format,
  d.status,
  d.max_teams,
  d.current_round,
  d.spectator_count,
  d.tags,
  d.created_at,
  d.updated_at,
  COUNT(DISTINCT t.id) as teams_joined,
  COUNT(DISTINCT p.id) as total_picks,
  COALESCE(MAX(p.created_at), d.created_at) as last_activity
FROM drafts d
LEFT JOIN teams t ON t.draft_id = d.id
LEFT JOIN picks p ON p.draft_id = d.id
WHERE d.is_public = true
  AND d.status IN ('setup', 'active', 'paused')
GROUP BY d.id, d.name, d.description, d.format, d.status, d.max_teams,
         d.current_round, d.spectator_count, d.tags, d.created_at, d.updated_at
ORDER BY last_activity DESC, d.created_at DESC;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Pokemon Draft League database setup complete!';
  RAISE NOTICE '📊 All tables created successfully';
  RAISE NOTICE '🔧 Indexes added for performance';
  RAISE NOTICE '🔓 RLS disabled for guest access';
  RAISE NOTICE '👁️ Views created for public drafts';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Your Vercel app is already configured with environment variables';
  RAISE NOTICE '2. Test draft creation at: https://pokemon-draft.vercel.app';
  RAISE NOTICE '3. Enjoy your Pokemon Draft League! 🎮';
END $$;
