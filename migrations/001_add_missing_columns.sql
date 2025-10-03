-- =============================================
-- MIGRATION: Add Missing Columns
-- Run this in Supabase SQL Editor to update existing schema
-- =============================================

-- Add missing columns to drafts table
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS spectator_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Update auctions table to match TypeScript types
ALTER TABLE auctions
ADD COLUMN IF NOT EXISTS auction_end TIMESTAMPTZ;

-- Rename bids table to bid_history to match TypeScript types
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bids') THEN
        ALTER TABLE bids RENAME TO bid_history;
    END IF;
END $$;

-- Add missing columns to bid_history
ALTER TABLE bid_history
ADD COLUMN IF NOT EXISTS draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE;

-- Rename bidder_name to team_name if it exists (only if team_name doesn't already exist)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bid_history' AND column_name = 'bidder_name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bid_history' AND column_name = 'team_name'
    ) THEN
        ALTER TABLE bid_history RENAME COLUMN bidder_name TO team_name;
    END IF;
END $$;

-- Add team_name column if neither bidder_name nor team_name exist
ALTER TABLE bid_history
ADD COLUMN IF NOT EXISTS team_name TEXT;

-- Rename amount to bid_amount in bid_history (only if bid_amount doesn't already exist)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bid_history' AND column_name = 'amount'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bid_history' AND column_name = 'bid_amount'
    ) THEN
        ALTER TABLE bid_history RENAME COLUMN amount TO bid_amount;
    END IF;
END $$;

-- Add bid_amount column if neither amount nor bid_amount exist
ALTER TABLE bid_history
ADD COLUMN IF NOT EXISTS bid_amount INTEGER;

-- Update auctions table column names (only if current_bidder doesn't already exist)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'auctions' AND column_name = 'current_bidder_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'auctions' AND column_name = 'current_bidder'
    ) THEN
        ALTER TABLE auctions RENAME COLUMN current_bidder_id TO current_bidder;
    END IF;
END $$;

-- Add current_bidder column if neither exists
ALTER TABLE auctions
ADD COLUMN IF NOT EXISTS current_bidder UUID REFERENCES teams(id);

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_drafts_is_public ON drafts(is_public);
CREATE INDEX IF NOT EXISTS idx_drafts_tags ON drafts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_bid_history_draft_id ON bid_history(draft_id);
CREATE INDEX IF NOT EXISTS idx_bid_history_created_at ON bid_history(created_at DESC);

-- Create spectator_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS spectator_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    spectator_id TEXT,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_spectator_events_draft_id ON spectator_events(draft_id);
CREATE INDEX IF NOT EXISTS idx_spectator_events_created_at ON spectator_events(created_at DESC);

-- Enable RLS on spectator_events
ALTER TABLE spectator_events ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for spectator_events
DROP POLICY IF EXISTS "Allow all operations on spectator_events" ON spectator_events;
CREATE POLICY "Allow all operations on spectator_events" ON spectator_events FOR ALL USING (true);

-- Enable realtime for spectator_events
DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE spectator_events';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- Create draft_results table if it doesn't exist
CREATE TABLE IF NOT EXISTS draft_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    results_data JSONB NOT NULL,
    team_standings JSONB,
    analytics JSONB,
    UNIQUE(draft_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_results_draft_id ON draft_results(draft_id);

-- Enable RLS on draft_results
ALTER TABLE draft_results ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for draft_results
DROP POLICY IF EXISTS "Allow all operations on draft_results" ON draft_results;
CREATE POLICY "Allow all operations on draft_results" ON draft_results FOR ALL USING (true);

-- Enable realtime for draft_results
DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE draft_results';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- Update the updated_at trigger for drafts if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_drafts_updated_at ON drafts;
CREATE TRIGGER update_drafts_updated_at BEFORE UPDATE ON drafts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wishlist_updated_at ON wishlist_items;
CREATE TRIGGER update_wishlist_updated_at BEFORE UPDATE ON wishlist_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_auctions_updated_at ON auctions;
CREATE TRIGGER update_auctions_updated_at BEFORE UPDATE ON auctions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add unique constraints
DO $$
BEGIN
    ALTER TABLE participants ADD CONSTRAINT unique_draft_user UNIQUE (draft_id, user_id);
EXCEPTION
    WHEN duplicate_table THEN
        NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE teams ADD CONSTRAINT unique_draft_order UNIQUE (draft_id, draft_order);
EXCEPTION
    WHEN duplicate_table THEN
        NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE picks ADD CONSTRAINT unique_pick_order UNIQUE (draft_id, pick_order);
EXCEPTION
    WHEN duplicate_table THEN
        NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE pokemon_tiers ADD CONSTRAINT unique_draft_pokemon UNIQUE (draft_id, pokemon_id);
EXCEPTION
    WHEN duplicate_table THEN
        NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE wishlist_items ADD CONSTRAINT unique_wishlist_pokemon UNIQUE (draft_id, participant_id, pokemon_id);
EXCEPTION
    WHEN duplicate_table THEN
        NULL;
END $$;

-- Update RLS policy for bid_history if table was renamed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bid_history') THEN
        ALTER TABLE bid_history ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Allow all operations on bids" ON bid_history;
        DROP POLICY IF EXISTS "Allow all operations on bid_history" ON bid_history;
        EXECUTE 'CREATE POLICY "Allow all operations on bid_history" ON bid_history FOR ALL USING (true)';
    END IF;
END $$;

-- Enable realtime for bid_history
DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE bids';
EXCEPTION
    WHEN undefined_object THEN
        NULL;
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE bid_history';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

COMMIT;
