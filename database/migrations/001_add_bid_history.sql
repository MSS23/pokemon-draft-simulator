-- Migration: Add bid history tracking for auctions
-- This creates a table to track all bids placed during auctions for analytics and history

-- Create bid_history table
CREATE TABLE bid_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  bid_amount INTEGER NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX bid_history_auction_id_idx ON bid_history(auction_id);
CREATE INDEX bid_history_draft_id_idx ON bid_history(draft_id);
CREATE INDEX bid_history_team_id_idx ON bid_history(team_id);
CREATE INDEX bid_history_created_at_idx ON bid_history(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE bid_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (currently permissive for development)
CREATE POLICY "Allow all operations on bid_history" ON bid_history
  FOR ALL USING (true);

-- Add comments for documentation
COMMENT ON TABLE bid_history IS 'Tracks all bids placed during auctions for history and analytics';
COMMENT ON COLUMN bid_history.auction_id IS 'Reference to the auction where the bid was placed';
COMMENT ON COLUMN bid_history.draft_id IS 'Reference to the draft for easier querying';
COMMENT ON COLUMN bid_history.team_id IS 'Reference to the team that placed the bid';
COMMENT ON COLUMN bid_history.team_name IS 'Denormalized team name for easier display';
COMMENT ON COLUMN bid_history.bid_amount IS 'Amount of the bid in draft currency';
