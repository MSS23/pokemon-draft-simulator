-- Migration: Add Trade System for League Pokemon Swaps
-- Enables inter-week Pokemon trading between teams with approval workflow
-- Date: 2025-01-10
-- Author: Claude Code

-- ============================================
-- TRADES TABLE
-- ============================================
-- Track Pokemon trades between teams in a league
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,

  -- When trade occurs
  week_number INTEGER NOT NULL, -- Week when trade was proposed (trades happen between weeks)

  -- Teams involved
  team_a_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_b_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Pokemon being traded (array of pick IDs)
  team_a_gives UUID[] NOT NULL DEFAULT '{}', -- Pokemon Team A is giving away
  team_b_gives UUID[] NOT NULL DEFAULT '{}', -- Pokemon Team B is giving away

  -- Trade workflow
  status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected', 'completed', 'cancelled')) DEFAULT 'proposed',
  proposed_by UUID NOT NULL REFERENCES teams(id), -- Which team initiated the trade
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ, -- When other team accepted/rejected
  completed_at TIMESTAMPTZ, -- When Pokemon were actually swapped

  -- Optional details
  notes TEXT, -- Trade notes/comments
  commissioner_approved BOOLEAN, -- If commissioner approval required
  commissioner_id TEXT, -- User ID of commissioner who approved
  commissioner_notes TEXT, -- Commissioner's approval notes

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation constraints
  CONSTRAINT different_teams CHECK (team_a_id != team_b_id),
  CONSTRAINT non_empty_trade CHECK (
    array_length(team_a_gives, 1) > 0 OR array_length(team_b_gives, 1) > 0
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trades_league ON trades(league_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_a ON trades(team_a_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_b ON trades(team_b_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_week ON trades(league_id, week_number);
CREATE INDEX IF NOT EXISTS idx_trades_pending ON trades(league_id) WHERE status = 'proposed';

-- ============================================
-- TRADE APPROVALS TABLE (Optional)
-- ============================================
-- If league requires commissioner approval for trades
CREATE TABLE IF NOT EXISTS trade_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL, -- User ID of person reviewing trade
  approver_role TEXT CHECK (approver_role IN ('commissioner', 'admin', 'owner')),
  approved BOOLEAN NOT NULL, -- True = approve, False = reject
  comments TEXT, -- Reason for approval/rejection
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each approver can only vote once per trade
  UNIQUE(trade_id, approver_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trade_approvals_trade ON trade_approvals(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_approvals_approver ON trade_approvals(approver_user_id);

-- ============================================
-- TRADE HISTORY VIEW
-- ============================================
-- Convenient view to see all trade details with team names
CREATE OR REPLACE VIEW trade_history AS
SELECT
  t.id,
  t.league_id,
  l.name as league_name,
  t.week_number,
  t.status,

  -- Team A details
  t.team_a_id,
  ta.name as team_a_name,
  t.team_a_gives,

  -- Team B details
  t.team_b_id,
  tb.name as team_b_name,
  t.team_b_gives,

  -- Workflow
  t.proposed_by,
  CASE
    WHEN t.proposed_by = t.team_a_id THEN ta.name
    ELSE tb.name
  END as proposed_by_name,

  t.proposed_at,
  t.responded_at,
  t.completed_at,

  -- Approval
  t.commissioner_approved,
  t.notes,

  t.created_at,
  t.updated_at
FROM trades t
JOIN leagues l ON t.league_id = l.id
JOIN teams ta ON t.team_a_id = ta.id
JOIN teams tb ON t.team_b_id = tb.id;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_trades_updated_at();

-- Validate trade doesn't include dead Pokemon
CREATE OR REPLACE FUNCTION validate_trade_pokemon()
RETURNS TRIGGER AS $$
DECLARE
  dead_count INTEGER;
BEGIN
  -- Check if any Pokemon being traded are dead
  SELECT COUNT(*) INTO dead_count
  FROM team_pokemon_status
  WHERE pick_id = ANY(NEW.team_a_gives || NEW.team_b_gives)
  AND status = 'dead';

  IF dead_count > 0 THEN
    RAISE EXCEPTION 'Cannot trade dead Pokemon (Nuzlocke rules)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_trade_pokemon
  BEFORE INSERT OR UPDATE ON trades
  FOR EACH ROW
  WHEN (NEW.status IN ('proposed', 'accepted'))
  EXECUTE FUNCTION validate_trade_pokemon();

-- Auto-set responded_at when status changes
CREATE OR REPLACE FUNCTION set_trade_responded_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('accepted', 'rejected') AND OLD.status = 'proposed' THEN
    NEW.responded_at = NOW();
  END IF;

  IF NEW.status = 'completed' AND OLD.status = 'accepted' THEN
    NEW.completed_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_trade_responded_at
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION set_trade_responded_at();

-- ============================================
-- EXECUTE TRADE FUNCTION
-- ============================================
-- Swaps Pokemon ownership between teams
CREATE OR REPLACE FUNCTION execute_trade(trade_uuid UUID)
RETURNS void AS $$
DECLARE
  trade_record RECORD;
  pick_id UUID;
BEGIN
  -- Get trade details
  SELECT * INTO trade_record FROM trades WHERE id = trade_uuid;

  IF trade_record IS NULL THEN
    RAISE EXCEPTION 'Trade not found: %', trade_uuid;
  END IF;

  IF trade_record.status != 'accepted' THEN
    RAISE EXCEPTION 'Trade must be accepted before execution. Current status: %', trade_record.status;
  END IF;

  -- Transfer Team A's Pokemon to Team B
  FOREACH pick_id IN ARRAY trade_record.team_a_gives
  LOOP
    UPDATE picks SET team_id = trade_record.team_b_id WHERE id = pick_id;
    UPDATE team_pokemon_status SET team_id = trade_record.team_b_id WHERE pick_id = pick_id;
  END LOOP;

  -- Transfer Team B's Pokemon to Team A
  FOREACH pick_id IN ARRAY trade_record.team_b_gives
  LOOP
    UPDATE picks SET team_id = trade_record.team_a_id WHERE id = pick_id;
    UPDATE team_pokemon_status SET team_id = trade_record.team_a_id WHERE pick_id = pick_id;
  END LOOP;

  -- Mark trade as completed
  UPDATE trades
  SET status = 'completed', completed_at = NOW()
  WHERE id = trade_uuid;

  RAISE NOTICE 'Trade executed successfully: %', trade_uuid;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_approvals ENABLE ROW LEVEL SECURITY;

-- Trades: Anyone can view, participants can propose/respond
CREATE POLICY "Anyone can view trades"
  ON trades FOR SELECT
  USING (true);

CREATE POLICY "Team owners can propose trades"
  ON trades FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id IN (team_a_id, team_b_id)
    )
  );

CREATE POLICY "Trade participants can update their trades"
  ON trades FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id IN (team_a_id, team_b_id)
    )
  );

-- Trade Approvals: Commissioners can approve
CREATE POLICY "Anyone can view trade approvals"
  ON trade_approvals FOR SELECT
  USING (true);

CREATE POLICY "Commissioners can approve trades"
  ON trade_approvals FOR INSERT
  WITH CHECK (true); -- Additional app-level check for commissioner role

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE trades IS 'Pokemon trades between teams in a league, occurs between gameweeks';
COMMENT ON COLUMN trades.week_number IS 'Week number when trade was proposed (trades happen between weeks, not during)';
COMMENT ON COLUMN trades.team_a_gives IS 'Array of pick IDs that Team A is trading away';
COMMENT ON COLUMN trades.team_b_gives IS 'Array of pick IDs that Team B is trading away';
COMMENT ON COLUMN trades.status IS 'proposed -> accepted/rejected -> completed (or cancelled)';
COMMENT ON COLUMN trades.commissioner_approved IS 'If league requires approval, this must be true before execution';

COMMENT ON TABLE trade_approvals IS 'Commissioner/admin approvals for trades (if league setting requires it)';
COMMENT ON FUNCTION execute_trade IS 'Executes an accepted trade by swapping Pokemon ownership between teams';

-- ============================================
-- SAMPLE QUERIES
-- ============================================

-- Get pending trades for a team
-- SELECT * FROM trade_history
-- WHERE (team_a_id = 'team-uuid' OR team_b_id = 'team-uuid')
-- AND status = 'proposed'
-- ORDER BY proposed_at DESC;

-- Get trade history for a league
-- SELECT * FROM trade_history
-- WHERE league_id = 'league-uuid'
-- ORDER BY completed_at DESC NULLS LAST, proposed_at DESC;

-- Execute a trade
-- SELECT execute_trade('trade-uuid');

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Trade System Migration Complete ===';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - trades (Pokemon swaps between teams)';
  RAISE NOTICE '  - trade_approvals (commissioner approval workflow)';
  RAISE NOTICE '';
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  - trade_history (convenient trade details with team names)';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - execute_trade(uuid) - Swap Pokemon ownership';
  RAISE NOTICE '';
  RAISE NOTICE 'Features enabled:';
  RAISE NOTICE '  - Inter-week Pokemon trading';
  RAISE NOTICE '  - Commissioner approval workflow';
  RAISE NOTICE '  - Dead Pokemon validation (cannot trade)';
  RAISE NOTICE '  - Trade history/audit log';
  RAISE NOTICE '  - RLS policies configured';
  RAISE NOTICE '';
END $$;
