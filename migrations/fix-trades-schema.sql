-- Fix trades table and create trade_history view
-- The trades table schema doesn't match what the application code expects.

-- ============================================
-- 1. Recreate trades table with correct columns
-- ============================================

-- Drop old trades table (and trade_approvals due to FK)
DROP TABLE IF EXISTS trade_approvals CASCADE;
DROP TABLE IF EXISTS trades CASCADE;

CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL DEFAULT 1,
  team_a_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_b_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_a_gives TEXT[] NOT NULL DEFAULT '{}',
  team_b_gives TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected', 'completed', 'cancelled')),
  proposed_by UUID NOT NULL,
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  commissioner_approved BOOLEAN,
  commissioner_id TEXT,
  commissioner_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Recreate trade_approvals with correct columns
-- ============================================

CREATE TABLE trade_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL,
  approver_role TEXT NOT NULL DEFAULT 'commissioner' CHECK (approver_role IN ('commissioner', 'admin', 'owner')),
  approved BOOLEAN NOT NULL,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trade_id, approver_user_id)
);

-- ============================================
-- 3. Create trade_history view
-- ============================================

CREATE OR REPLACE VIEW trade_history AS
SELECT
  t.id,
  t.league_id,
  t.week_number,
  t.team_a_id,
  t.team_b_id,
  t.team_a_gives,
  t.team_b_gives,
  t.status,
  t.proposed_by,
  t.proposed_at,
  t.responded_at,
  t.completed_at,
  t.notes,
  t.commissioner_approved,
  t.commissioner_id,
  t.commissioner_notes,
  t.created_at,
  t.updated_at,
  COALESCE(ta.name, 'Unknown') AS team_a_name,
  COALESCE(tb.name, 'Unknown') AS team_b_name,
  COALESCE(tp.name, 'Unknown') AS proposed_by_name,
  COALESCE(l.name, 'Unknown') AS league_name
FROM trades t
LEFT JOIN teams ta ON ta.id = t.team_a_id
LEFT JOIN teams tb ON tb.id = t.team_b_id
LEFT JOIN teams tp ON tp.id = t.proposed_by
LEFT JOIN leagues l ON l.id = t.league_id;

-- ============================================
-- 4. Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_trades_league_id ON trades(league_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_a ON trades(team_a_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_b ON trades(team_b_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trade_approvals_trade ON trade_approvals(trade_id);

-- ============================================
-- 5. RLS Policies
-- ============================================

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trades are viewable by everyone" ON trades;
DROP POLICY IF EXISTS "Trades can be managed by anyone" ON trades;
CREATE POLICY "Trades are viewable by everyone" ON trades FOR SELECT USING (true);
CREATE POLICY "Trades can be managed by anyone" ON trades FOR ALL USING (true);

DROP POLICY IF EXISTS "Trade approvals are viewable by everyone" ON trade_approvals;
DROP POLICY IF EXISTS "Trade approvals can be managed by anyone" ON trade_approvals;
CREATE POLICY "Trade approvals are viewable by everyone" ON trade_approvals FOR SELECT USING (true);
CREATE POLICY "Trade approvals can be managed by anyone" ON trade_approvals FOR ALL USING (true);
