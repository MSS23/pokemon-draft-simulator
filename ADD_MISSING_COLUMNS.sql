-- =====================================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- =====================================================
-- Run this if you get "column does not exist" errors
-- This adds all the columns needed for the full application
-- =====================================================

-- Add missing columns to drafts table
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS spectator_count INTEGER DEFAULT 0;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS custom_format_id UUID;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS allow_undos BOOLEAN DEFAULT TRUE;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS max_undos_per_team INTEGER DEFAULT 3;

-- Create any missing tables

-- Spectator events table
CREATE TABLE IF NOT EXISTS spectator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  spectator_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bid history table (if not exists)
CREATE TABLE IF NOT EXISTS bid_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  team_id UUID NOT NULL,
  team_name TEXT NOT NULL,
  bid_amount INTEGER NOT NULL
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

-- Wishlist items table (if not exists)
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

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_drafts_is_public ON drafts(is_public);
CREATE INDEX IF NOT EXISTS idx_drafts_status_public ON drafts(status, is_public);
CREATE INDEX IF NOT EXISTS idx_spectator_events_draft_id ON spectator_events(draft_id);
CREATE INDEX IF NOT EXISTS idx_spectator_events_created_at ON spectator_events(created_at);
CREATE INDEX IF NOT EXISTS idx_custom_formats_created_by ON custom_formats(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_custom_formats_public ON custom_formats(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bid_history_auction_id ON bid_history(auction_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_draft_id ON wishlist_items(draft_id);

-- Disable RLS for guest access
ALTER TABLE drafts DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE picks DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE auctions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bid_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wishlist_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS spectator_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS custom_formats DISABLE ROW LEVEL SECURITY;

-- Create or replace the public drafts view
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

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Missing columns and tables added successfully!';
  RAISE NOTICE '📊 Your database is now fully updated';
  RAISE NOTICE '🎮 Try creating a draft at: https://pokemon-draft-simulator.vercel.app';
END $$;
