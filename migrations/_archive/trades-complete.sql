-- Combined trade system migration
-- Includes: trades table, trade_approvals table, trade_history view, execute_trade function, RLS, indexes
-- NOTE: Drops and recreates trades/trade_approvals to ensure correct schema

-- ============================================
-- 0. Drop old objects (view depends on table, so drop first)
-- ============================================

DROP VIEW IF EXISTS trade_history;
DROP TABLE IF EXISTS trade_approvals CASCADE;
DROP TABLE IF EXISTS trades CASCADE;

-- ============================================
-- 1. Trades table
-- ============================================

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
-- 2. Trade approvals table
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
-- 3. Trade history view
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
-- 4. Execute trade function (atomic pick swap)
-- ============================================

CREATE OR REPLACE FUNCTION execute_trade(trade_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trade RECORD;
  v_pick_id TEXT;
BEGIN
  -- Lock the trade row
  SELECT * INTO v_trade FROM trades WHERE id = trade_uuid FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;

  IF v_trade.status != 'accepted' THEN
    RAISE EXCEPTION 'Trade must be in accepted status to execute (current: %)', v_trade.status;
  END IF;

  -- Swap team A's picks to team B
  IF v_trade.team_a_gives IS NOT NULL THEN
    FOREACH v_pick_id IN ARRAY v_trade.team_a_gives
    LOOP
      UPDATE picks SET team_id = v_trade.team_b_id
      WHERE id = v_pick_id::uuid AND team_id = v_trade.team_a_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pick % not found on team A', v_pick_id;
      END IF;
    END LOOP;
  END IF;

  -- Swap team B's picks to team A
  IF v_trade.team_b_gives IS NOT NULL THEN
    FOREACH v_pick_id IN ARRAY v_trade.team_b_gives
    LOOP
      UPDATE picks SET team_id = v_trade.team_a_id
      WHERE id = v_pick_id::uuid AND team_id = v_trade.team_b_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pick % not found on team B', v_pick_id;
      END IF;
    END LOOP;
  END IF;

  -- Mark trade as completed
  UPDATE trades SET
    status = 'completed',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = trade_uuid;
END;
$$;

-- ============================================
-- 5. Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_trades_league_id ON trades(league_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_a ON trades(team_a_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_b ON trades(team_b_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trade_approvals_trade ON trade_approvals(trade_id);

-- ============================================
-- 6. RLS Policies
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
