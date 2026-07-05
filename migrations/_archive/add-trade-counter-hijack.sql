-- Add counter_to_id column to trades table for counter-offers and hijack references
-- Also add 'countered' to the valid status values

ALTER TABLE trades ADD COLUMN IF NOT EXISTS counter_to_id UUID REFERENCES trades(id) ON DELETE SET NULL;

-- Index for finding counter/hijack trades linked to an original
CREATE INDEX IF NOT EXISTS idx_trades_counter_to_id ON trades(counter_to_id) WHERE counter_to_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN trades.counter_to_id IS 'References the original trade this is a counter-offer or competing offer (hijack) for';
