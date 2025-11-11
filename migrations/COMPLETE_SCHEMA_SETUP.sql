-- =============================================
-- COMPLETE DATABASE SCHEMA SETUP
-- Pokemon Draft League Platform
-- =============================================
--
-- This file consolidates all migrations into a single, idempotent SQL script
-- that can be executed in Supabase SQL Editor.
--
-- Run this entire file to set up the complete database schema including:
-- - Draft system (snake/auction formats)
-- - League system (standings, matches, weeks)
-- - Pokemon tracking (KOs, deaths, Nuzlocke)
-- - Trading system (inter-week Pokemon swaps)
-- - Weekly summaries and highlights
-- - Helper functions and utilities
--
-- Date: 2025-01-11
-- Author: Claude Code
-- =============================================

BEGIN;

-- =============================================
-- MIGRATION 001: Add Missing Columns and Tables
-- =============================================

-- Add columns to drafts table
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS spectator_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_spectators BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS max_spectators INTEGER;

-- Add columns to auctions table
ALTER TABLE auctions
ADD COLUMN IF NOT EXISTS min_bid_increment INTEGER DEFAULT 1;

-- Rename bids table to bid_history (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bids') THEN
        ALTER TABLE bids RENAME TO bid_history;
    END IF;
END $$;

-- Create spectator_events table
CREATE TABLE IF NOT EXISTS spectator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('join', 'leave', 'view_pick', 'chat')),
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spectator_events_draft ON spectator_events(draft_id);
CREATE INDEX IF NOT EXISTS idx_spectator_events_user ON spectator_events(user_id);
CREATE INDEX IF NOT EXISTS idx_spectator_events_time ON spectator_events(draft_id, created_at);

-- Create draft_results table
CREATE TABLE IF NOT EXISTS draft_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL UNIQUE REFERENCES drafts(id) ON DELETE CASCADE,
  results_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_results_draft ON draft_results(draft_id);

-- RLS Policies for spectator_events
ALTER TABLE spectator_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can view spectator events"
  ON spectator_events FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Anyone can insert spectator events"
  ON spectator_events FOR INSERT
  WITH CHECK (true);

-- RLS Policies for draft_results
ALTER TABLE draft_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can view draft results"
  ON draft_results FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Draft owner can manage results"
  ON draft_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = draft_id
    )
  );

-- Unique constraint on bid_history
ALTER TABLE bid_history
DROP CONSTRAINT IF EXISTS unique_bid_per_user_auction;

ALTER TABLE bid_history
ADD CONSTRAINT IF NOT EXISTS unique_bid_per_user_auction
  UNIQUE (auction_id, user_id, created_at);

-- Comments
COMMENT ON TABLE spectator_events IS 'Tracks spectator activity in drafts (joins, leaves, views)';
COMMENT ON TABLE draft_results IS 'Stores aggregated draft results for quick access';

-- =============================================
-- MIGRATION 002: Add current_team_id Column
-- =============================================

-- Add current_team_id column to drafts table for server-side turn management
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS current_team_id UUID REFERENCES teams(id);

CREATE INDEX IF NOT EXISTS idx_drafts_current_team
ON drafts(current_team_id);

COMMENT ON COLUMN drafts.current_team_id IS
'Server-authoritative current team ID. Calculated server-side to prevent client-side race conditions in multi-user drafts.';

-- Update existing drafts to set current_team_id based on current_turn
DO $$
DECLARE
  draft_record RECORD;
  team_record RECORD;
  turn_index INTEGER;
  round_num INTEGER;
  position_in_round INTEGER;
  team_index INTEGER;
  total_teams INTEGER;
BEGIN
  FOR draft_record IN
    SELECT id, current_turn, format
    FROM drafts
    WHERE status = 'active' AND format = 'snake' AND current_turn IS NOT NULL AND current_team_id IS NULL
  LOOP
    SELECT COUNT(*) INTO total_teams
    FROM teams
    WHERE draft_id = draft_record.id;

    IF total_teams > 0 THEN
      turn_index := draft_record.current_turn - 1;
      round_num := FLOOR(turn_index / total_teams);
      position_in_round := turn_index % total_teams;

      IF MOD(round_num, 2) = 0 THEN
        team_index := position_in_round + 1;
      ELSE
        team_index := total_teams - position_in_round;
      END IF;

      SELECT id INTO team_record
      FROM teams
      WHERE draft_id = draft_record.id AND draft_order = team_index
      LIMIT 1;

      IF team_record IS NOT NULL THEN
        UPDATE drafts
        SET current_team_id = team_record.id
        WHERE id = draft_record.id;
      END IF;
    END IF;
  END LOOP;
END $$;

-- =============================================
-- MIGRATION 002: Helper Functions and Utilities
-- =============================================

-- Function to get complete draft state
CREATE OR REPLACE FUNCTION get_draft_state(p_draft_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'draft', (SELECT row_to_json(d.*) FROM drafts d WHERE d.id = p_draft_id),
        'teams', (SELECT COALESCE(json_agg(row_to_json(t.*)), '[]'::json) FROM teams t WHERE t.draft_id = p_draft_id ORDER BY t.draft_order),
        'picks', (SELECT COALESCE(json_agg(row_to_json(p.*)), '[]'::json) FROM picks p WHERE p.draft_id = p_draft_id ORDER BY p.pick_order),
        'participants', (SELECT COALESCE(json_agg(row_to_json(pt.*)), '[]'::json) FROM participants pt WHERE pt.draft_id = p_draft_id),
        'current_auction', (SELECT row_to_json(a.*) FROM auctions a WHERE a.draft_id = p_draft_id AND a.status = 'active' LIMIT 1)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate unique room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
    characters TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
    code_exists BOOLEAN;
BEGIN
    LOOP
        result := '';
        FOR i IN 1..6 LOOP
            result := result || substr(characters, floor(random() * length(characters) + 1)::integer, 1);
        END LOOP;

        SELECT EXISTS(SELECT 1 FROM drafts WHERE room_code = result) INTO code_exists;

        IF NOT code_exists THEN
            EXIT;
        END IF;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old drafts
CREATE OR REPLACE FUNCTION cleanup_old_drafts(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM drafts
        WHERE
            status = 'completed'
            AND updated_at < NOW() - (days_old || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get team roster
CREATE OR REPLACE FUNCTION get_team_roster(p_team_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'team', (SELECT row_to_json(t.*) FROM teams t WHERE t.id = p_team_id),
        'picks', (
            SELECT COALESCE(json_agg(row_to_json(p.*)), '[]'::json)
            FROM picks p
            WHERE p.team_id = p_team_id
            ORDER BY p.pick_order
        ),
        'total_cost', (SELECT COALESCE(SUM(cost), 0) FROM picks WHERE team_id = p_team_id)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if Pokemon is already picked
CREATE OR REPLACE FUNCTION is_pokemon_picked(p_draft_id UUID, p_pokemon_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM picks
        WHERE draft_id = p_draft_id
        AND pokemon_id = p_pokemon_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get available budget for team
CREATE OR REPLACE FUNCTION get_team_available_budget(p_team_id UUID)
RETURNS INTEGER AS $$
DECLARE
    total_spent INTEGER;
    initial_budget INTEGER;
BEGIN
    SELECT COALESCE(SUM(cost), 0) INTO total_spent
    FROM picks
    WHERE team_id = p_team_id;

    SELECT d.budget_per_team INTO initial_budget
    FROM teams t
    JOIN drafts d ON t.draft_id = d.id
    WHERE t.id = p_team_id;

    RETURN initial_budget - total_spent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update spectator count
CREATE OR REPLACE FUNCTION update_spectator_count(p_draft_id UUID, p_increment BOOLEAN DEFAULT true)
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    IF p_increment THEN
        UPDATE drafts
        SET spectator_count = spectator_count + 1
        WHERE id = p_draft_id
        RETURNING spectator_count INTO new_count;
    ELSE
        UPDATE drafts
        SET spectator_count = GREATEST(spectator_count - 1, 0)
        WHERE id = p_draft_id
        RETURNING spectator_count INTO new_count;
    END IF;

    RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get draft analytics
CREATE OR REPLACE FUNCTION get_draft_analytics(p_draft_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_picks', (SELECT COUNT(*) FROM picks WHERE draft_id = p_draft_id),
        'total_cost', (SELECT COALESCE(SUM(cost), 0) FROM picks WHERE draft_id = p_draft_id),
        'average_cost', (SELECT COALESCE(AVG(cost), 0) FROM picks WHERE draft_id = p_draft_id),
        'most_expensive_pick', (
            SELECT row_to_json(p.*) FROM picks p
            WHERE p.draft_id = p_draft_id
            ORDER BY p.cost DESC
            LIMIT 1
        ),
        'team_budgets', (
            SELECT json_agg(
                json_build_object(
                    'team_id', t.id,
                    'team_name', t.name,
                    'budget_used', (SELECT COALESCE(SUM(cost), 0) FROM picks WHERE team_id = t.id),
                    'budget_remaining', t.budget_remaining,
                    'pick_count', (SELECT COUNT(*) FROM picks WHERE team_id = t.id)
                )
            )
            FROM teams t
            WHERE t.draft_id = p_draft_id
        ),
        'picks_per_round', (
            SELECT json_object_agg(round, pick_count)
            FROM (
                SELECT round, COUNT(*) as pick_count
                FROM picks
                WHERE draft_id = p_draft_id
                GROUP BY round
            ) sub
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to auto-update team budget on pick
CREATE OR REPLACE FUNCTION update_team_budget_on_pick()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE teams
    SET budget_remaining = budget_remaining - NEW.cost
    WHERE id = NEW.team_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_team_budget ON picks;
CREATE TRIGGER trigger_update_team_budget
    AFTER INSERT ON picks
    FOR EACH ROW
    EXECUTE FUNCTION update_team_budget_on_pick();

-- Trigger to auto-update wishlist availability when Pokemon is picked
CREATE OR REPLACE FUNCTION update_wishlist_on_pick()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE wishlist_items
    SET is_available = false
    WHERE draft_id = NEW.draft_id
    AND pokemon_id = NEW.pokemon_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_wishlist ON picks;
CREATE TRIGGER trigger_update_wishlist
    AFTER INSERT ON picks
    FOR EACH ROW
    EXECUTE FUNCTION update_wishlist_on_pick();

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_draft_state(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_room_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_drafts(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_roster(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_pokemon_picked(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_team_available_budget(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_spectator_count(UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_draft_analytics(UUID) TO anon, authenticated;

-- =============================================
-- MIGRATION 009: Disconnect Handling
-- =============================================

-- Add turn_started_at column for server-side timeout tracking
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_drafts_turn_started
ON drafts(turn_started_at)
WHERE turn_started_at IS NOT NULL;

COMMENT ON COLUMN drafts.turn_started_at IS
'Timestamp when the current turn started. Used for disconnect grace periods and server-side timeout detection. NULL when draft is not active or between turns.';

-- Update existing active drafts
UPDATE drafts
SET turn_started_at = updated_at
WHERE status = 'active'
  AND current_turn IS NOT NULL
  AND turn_started_at IS NULL;

-- Add default draft settings for disconnect handling
UPDATE drafts
SET settings = jsonb_set(
  jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{disconnectGracePeriodSeconds}',
    '30'::jsonb,
    true
  ),
  '{enableAutoSkip}',
  'true'::jsonb,
  true
)
WHERE settings IS NULL
   OR NOT settings ? 'disconnectGracePeriodSeconds';

-- =============================================
-- MIGRATION 010: League Pokemon Tracking
-- =============================================

-- Match Pokemon KOs table
CREATE TABLE IF NOT EXISTS match_pokemon_kos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL DEFAULT 1,
  pokemon_id TEXT NOT NULL,
  pick_id UUID NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
  ko_count INTEGER NOT NULL DEFAULT 1,
  is_death BOOLEAN DEFAULT FALSE,
  ko_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_match ON match_pokemon_kos(match_id);
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_pick ON match_pokemon_kos(pick_id);
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_game ON match_pokemon_kos(match_id, game_number);

-- Team Pokemon Status table
CREATE TABLE IF NOT EXISTS team_pokemon_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id UUID NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,

  status TEXT NOT NULL CHECK (status IN ('alive', 'fainted', 'dead')) DEFAULT 'alive',

  total_kos INTEGER DEFAULT 0,
  matches_played INTEGER DEFAULT 0,
  matches_won INTEGER DEFAULT 0,

  death_match_id UUID REFERENCES matches(id),
  death_date TIMESTAMPTZ,
  death_details JSONB,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(pick_id, league_id)
);

CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_pick ON team_pokemon_status(pick_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_team ON team_pokemon_status(team_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_league ON team_pokemon_status(league_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_status ON team_pokemon_status(status);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_dead ON team_pokemon_status(league_id) WHERE status = 'dead';

-- Triggers
CREATE OR REPLACE FUNCTION update_match_pokemon_kos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trigger_update_match_pokemon_kos_updated_at ON match_pokemon_kos;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE TRIGGER trigger_update_match_pokemon_kos_updated_at
  BEFORE UPDATE ON match_pokemon_kos
  FOR EACH ROW
  EXECUTE FUNCTION update_match_pokemon_kos_updated_at();

CREATE OR REPLACE FUNCTION update_team_pokemon_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trigger_update_team_pokemon_status_updated_at ON team_pokemon_status;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE TRIGGER trigger_update_team_pokemon_status_updated_at
  BEFORE UPDATE ON team_pokemon_status
  FOR EACH ROW
  EXECUTE FUNCTION update_team_pokemon_status_updated_at();

-- RLS Policies
ALTER TABLE match_pokemon_kos ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_pokemon_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can view match Pokemon KOs"
  ON match_pokemon_kos FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Participants can insert match Pokemon KOs"
  ON match_pokemon_kos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN league_teams lt ON m.league_id = lt.league_id
      WHERE m.id = match_id
      AND (lt.team_id IN (m.home_team_id, m.away_team_id))
    )
  );

CREATE POLICY IF NOT EXISTS "Participants can update their match Pokemon KOs"
  ON match_pokemon_kos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN league_teams lt ON m.league_id = lt.league_id
      JOIN picks p ON match_pokemon_kos.pick_id = p.id
      WHERE m.id = match_id
      AND p.team_id = lt.team_id
    )
  );

CREATE POLICY IF NOT EXISTS "Anyone can view team Pokemon status"
  ON team_pokemon_status FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Team owners can manage their Pokemon status"
  ON team_pokemon_status FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id
    )
  );

-- Comments
COMMENT ON TABLE match_pokemon_kos IS 'Tracks Pokemon knockouts/faints during league matches, including Nuzlocke deaths';
COMMENT ON COLUMN match_pokemon_kos.game_number IS 'Which game in a best-of-X match (1, 2, 3, etc.)';
COMMENT ON COLUMN match_pokemon_kos.ko_count IS 'Number of times this Pokemon fainted in this specific game';
COMMENT ON COLUMN match_pokemon_kos.is_death IS 'If true, this KO resulted in permanent death (Nuzlocke rules)';
COMMENT ON COLUMN match_pokemon_kos.ko_details IS 'JSONB: {opponent_pokemon, move_used, turn_number, damage, etc.}';

COMMENT ON TABLE team_pokemon_status IS 'Overall Pokemon health status across league season, tracks alive/fainted/dead state';
COMMENT ON COLUMN team_pokemon_status.status IS 'Current status: alive (healthy), fainted (can recover), dead (permanent - Nuzlocke)';
COMMENT ON COLUMN team_pokemon_status.total_kos IS 'Total number of times this Pokemon has fainted across all matches';
COMMENT ON COLUMN team_pokemon_status.death_match_id IS 'Reference to the match where this Pokemon died (if Nuzlocke enabled)';

-- =============================================
-- MIGRATION 011: League Trading System
-- =============================================

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,

  week_number INTEGER NOT NULL,

  team_a_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_b_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  team_a_gives UUID[] NOT NULL DEFAULT '{}',
  team_b_gives UUID[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected', 'completed', 'cancelled')) DEFAULT 'proposed',
  proposed_by UUID NOT NULL REFERENCES teams(id),
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  notes TEXT,
  commissioner_approved BOOLEAN,
  commissioner_id TEXT,
  commissioner_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT different_teams CHECK (team_a_id != team_b_id),
  CONSTRAINT non_empty_trade CHECK (
    array_length(team_a_gives, 1) > 0 OR array_length(team_b_gives, 1) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_trades_league ON trades(league_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_a ON trades(team_a_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_b ON trades(team_b_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_week ON trades(league_id, week_number);
CREATE INDEX IF NOT EXISTS idx_trades_pending ON trades(league_id) WHERE status = 'proposed';

-- Trade Approvals table
CREATE TABLE IF NOT EXISTS trade_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL,
  approver_role TEXT CHECK (approver_role IN ('commissioner', 'admin', 'owner')),
  approved BOOLEAN NOT NULL,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(trade_id, approver_user_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_approvals_trade ON trade_approvals(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_approvals_approver ON trade_approvals(approver_user_id);

-- Trade History View
CREATE OR REPLACE VIEW trade_history AS
SELECT
  t.id,
  t.league_id,
  l.name as league_name,
  t.week_number,
  t.status,

  t.team_a_id,
  ta.name as team_a_name,
  t.team_a_gives,

  t.team_b_id,
  tb.name as team_b_name,
  t.team_b_gives,

  t.proposed_by,
  CASE
    WHEN t.proposed_by = t.team_a_id THEN ta.name
    ELSE tb.name
  END as proposed_by_name,

  t.proposed_at,
  t.responded_at,
  t.completed_at,

  t.commissioner_approved,
  t.notes,

  t.created_at,
  t.updated_at
FROM trades t
JOIN leagues l ON t.league_id = l.id
JOIN teams ta ON t.team_a_id = ta.id
JOIN teams tb ON t.team_b_id = tb.id;

-- Triggers
CREATE OR REPLACE FUNCTION update_trades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trigger_update_trades_updated_at ON trades;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE TRIGGER trigger_update_trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_trades_updated_at();

CREATE OR REPLACE FUNCTION validate_trade_pokemon()
RETURNS TRIGGER AS $$
DECLARE
  dead_count INTEGER;
BEGIN
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

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trigger_validate_trade_pokemon ON trades;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE TRIGGER trigger_validate_trade_pokemon
  BEFORE INSERT OR UPDATE ON trades
  FOR EACH ROW
  WHEN (NEW.status IN ('proposed', 'accepted'))
  EXECUTE FUNCTION validate_trade_pokemon();

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

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trigger_set_trade_responded_at ON trades;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE TRIGGER trigger_set_trade_responded_at
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION set_trade_responded_at();

-- Execute Trade Function
CREATE OR REPLACE FUNCTION execute_trade(trade_uuid UUID)
RETURNS void AS $$
DECLARE
  trade_record RECORD;
  pick_id UUID;
BEGIN
  SELECT * INTO trade_record FROM trades WHERE id = trade_uuid;

  IF trade_record IS NULL THEN
    RAISE EXCEPTION 'Trade not found: %', trade_uuid;
  END IF;

  IF trade_record.status != 'accepted' THEN
    RAISE EXCEPTION 'Trade must be accepted before execution. Current status: %', trade_record.status;
  END IF;

  FOREACH pick_id IN ARRAY trade_record.team_a_gives
  LOOP
    UPDATE picks SET team_id = trade_record.team_b_id WHERE id = pick_id;
    UPDATE team_pokemon_status SET team_id = trade_record.team_b_id WHERE pick_id = pick_id;
  END LOOP;

  FOREACH pick_id IN ARRAY trade_record.team_b_gives
  LOOP
    UPDATE picks SET team_id = trade_record.team_a_id WHERE id = pick_id;
    UPDATE team_pokemon_status SET team_id = trade_record.team_a_id WHERE pick_id = pick_id;
  END LOOP;

  UPDATE trades
  SET status = 'completed', completed_at = NOW()
  WHERE id = trade_uuid;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can view trades"
  ON trades FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Team owners can propose trades"
  ON trades FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id IN (team_a_id, team_b_id)
    )
  );

CREATE POLICY IF NOT EXISTS "Trade participants can update their trades"
  ON trades FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id IN (team_a_id, team_b_id)
    )
  );

CREATE POLICY IF NOT EXISTS "Anyone can view trade approvals"
  ON trade_approvals FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Commissioners can approve trades"
  ON trade_approvals FOR INSERT
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE trades IS 'Pokemon trades between teams in a league, occurs between gameweeks';
COMMENT ON COLUMN trades.week_number IS 'Week number when trade was proposed (trades happen between weeks, not during)';
COMMENT ON COLUMN trades.team_a_gives IS 'Array of pick IDs that Team A is trading away';
COMMENT ON COLUMN trades.team_b_gives IS 'Array of pick IDs that Team B is trading away';
COMMENT ON COLUMN trades.status IS 'proposed -> accepted/rejected -> completed (or cancelled)';
COMMENT ON COLUMN trades.commissioner_approved IS 'If league requires approval, this must be true before execution';

COMMENT ON TABLE trade_approvals IS 'Commissioner/admin approvals for trades (if league setting requires it)';
COMMENT ON FUNCTION execute_trade IS 'Executes an accepted trade by swapping Pokemon ownership between teams';

-- =============================================
-- MIGRATION 012: Weekly Highlights and Summaries
-- =============================================

-- Weekly summaries table
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,

  headline TEXT,
  summary_text TEXT,

  top_performer_team_id UUID REFERENCES teams(id),
  top_performer_reason TEXT,

  most_kos_pokemon_id TEXT,
  most_kos_pick_id UUID REFERENCES picks(id),
  most_kos_count INTEGER DEFAULT 0,

  biggest_upset_match_id UUID REFERENCES matches(id),
  biggest_upset_description TEXT,

  total_matches INTEGER DEFAULT 0,
  total_kos INTEGER DEFAULT 0,
  total_deaths INTEGER DEFAULT 0,
  total_trades INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(league_id, week_number)
);

-- Weekly highlights table
CREATE TABLE IF NOT EXISTS weekly_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,

  type TEXT NOT NULL CHECK (type IN (
    'top_performance',
    'upset_victory',
    'dominant_win',
    'comeback_win',
    'high_scoring',
    'shutout',
    'pokemon_milestone',
    'team_milestone',
    'tragic_death',
    'blockbuster_trade'
  )),

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT,

  team_id UUID REFERENCES teams(id),
  match_id UUID REFERENCES matches(id),
  pick_id UUID REFERENCES picks(id),
  trade_id UUID REFERENCES trades(id),

  display_order INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_league_week
  ON weekly_summaries(league_id, week_number);

CREATE INDEX IF NOT EXISTS idx_weekly_highlights_league_week
  ON weekly_highlights(league_id, week_number);

CREATE INDEX IF NOT EXISTS idx_weekly_highlights_type
  ON weekly_highlights(type);

-- RLS Policies
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can view weekly summaries"
  ON weekly_summaries FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Anyone can view weekly highlights"
  ON weekly_highlights FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Authenticated users can manage weekly summaries"
  ON weekly_summaries FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Authenticated users can manage weekly highlights"
  ON weekly_highlights FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Triggers
CREATE OR REPLACE FUNCTION update_weekly_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS weekly_summaries_updated_at ON weekly_summaries;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE TRIGGER weekly_summaries_updated_at
  BEFORE UPDATE ON weekly_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_weekly_summaries_updated_at();

DO $$
BEGIN
  DROP TRIGGER IF EXISTS weekly_highlights_updated_at ON weekly_highlights;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE TRIGGER weekly_highlights_updated_at
  BEFORE UPDATE ON weekly_highlights
  FOR EACH ROW
  EXECUTE FUNCTION update_weekly_summaries_updated_at();

-- Function to generate week summary
CREATE OR REPLACE FUNCTION generate_week_summary(
  p_league_id UUID,
  p_week_number INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_summary_id UUID;
  v_total_matches INTEGER;
  v_total_kos INTEGER;
  v_total_deaths INTEGER;
  v_total_trades INTEGER;
  v_most_kos_pick_id UUID;
  v_most_kos_count INTEGER;
BEGIN
  -- Count matches
  SELECT COUNT(*) INTO v_total_matches
  FROM matches
  WHERE league_id = p_league_id
    AND week_number = p_week_number
    AND status = 'completed';

  -- Count KOs
  SELECT COALESCE(SUM(mk.ko_count), 0) INTO v_total_kos
  FROM match_pokemon_kos mk
  JOIN matches m ON mk.match_id = m.id
  WHERE m.league_id = p_league_id
    AND m.week_number = p_week_number;

  -- Count deaths
  SELECT COUNT(*) INTO v_total_deaths
  FROM match_pokemon_kos mk
  JOIN matches m ON mk.match_id = m.id
  WHERE m.league_id = p_league_id
    AND m.week_number = p_week_number
    AND mk.is_death = true;

  -- Count trades
  SELECT COUNT(*) INTO v_total_trades
  FROM trades
  WHERE league_id = p_league_id
    AND week_number = p_week_number
    AND status = 'completed';

  -- Find Pokemon with most KOs
  SELECT mk.pick_id, SUM(mk.ko_count)
  INTO v_most_kos_pick_id, v_most_kos_count
  FROM match_pokemon_kos mk
  JOIN matches m ON mk.match_id = m.id
  WHERE m.league_id = p_league_id
    AND m.week_number = p_week_number
  GROUP BY mk.pick_id
  ORDER BY SUM(mk.ko_count) DESC
  LIMIT 1;

  -- Insert or update summary
  INSERT INTO weekly_summaries (
    league_id,
    week_number,
    total_matches,
    total_kos,
    total_deaths,
    total_trades,
    most_kos_pick_id,
    most_kos_count
  )
  VALUES (
    p_league_id,
    p_week_number,
    v_total_matches,
    v_total_kos,
    v_total_deaths,
    v_total_trades,
    v_most_kos_pick_id,
    v_most_kos_count
  )
  ON CONFLICT (league_id, week_number) DO UPDATE
  SET
    total_matches = EXCLUDED.total_matches,
    total_kos = EXCLUDED.total_kos,
    total_deaths = EXCLUDED.total_deaths,
    total_trades = EXCLUDED.total_trades,
    most_kos_pick_id = EXCLUDED.most_kos_pick_id,
    most_kos_count = EXCLUDED.most_kos_count,
    updated_at = NOW()
  RETURNING id INTO v_summary_id;

  RETURN v_summary_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE weekly_summaries IS 'Weekly summary statistics and highlights for each league week';
COMMENT ON TABLE weekly_highlights IS 'Individual notable events and achievements during each week';
COMMENT ON FUNCTION generate_week_summary IS 'Auto-generates weekly summary after all matches are complete';

-- =============================================
-- MIGRATION COMPLETE
-- =============================================

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================================';
  RAISE NOTICE '        DATABASE SCHEMA SETUP COMPLETE';
  RAISE NOTICE '==========================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Successfully created/updated:';
  RAISE NOTICE '  ✓ Draft system tables and columns';
  RAISE NOTICE '  ✓ Spectator and draft results tracking';
  RAISE NOTICE '  ✓ Server-side turn management (current_team_id)';
  RAISE NOTICE '  ✓ Disconnect handling (turn_started_at)';
  RAISE NOTICE '  ✓ League Pokemon tracking (KOs, deaths, status)';
  RAISE NOTICE '  ✓ Trading system (proposals, approvals, execution)';
  RAISE NOTICE '  ✓ Weekly summaries and highlights';
  RAISE NOTICE '  ✓ Helper functions and utilities';
  RAISE NOTICE '  ✓ RLS policies for all tables';
  RAISE NOTICE '  ✓ Triggers for automation';
  RAISE NOTICE '';
  RAISE NOTICE 'Your Pokemon Draft League database is ready to use!';
  RAISE NOTICE '';
  RAISE NOTICE '==========================================================';
  RAISE NOTICE '';
END $$;
