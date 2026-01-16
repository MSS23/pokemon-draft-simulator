/**
 * ATOMIC PICK FUNCTION AND REAL-TIME SYSTEM IMPROVEMENTS
 *
 * This migration adds:
 * 1. Atomic pick function (make_draft_pick) with row-level locking
 * 2. Helper function for snake draft turn calculation
 * 3. Database constraints for data integrity
 * 4. Additional indexes for performance
 * 5. updated_at column for teams table
 *
 * Run this in your Supabase SQL Editor after the main schema is set up.
 */

-- ============================================
-- ADD MISSING COLUMNS
-- ============================================

-- Add updated_at to teams table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE teams ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create trigger for teams updated_at
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DATABASE CONSTRAINTS
-- ============================================

-- Prevent duplicate Pokemon picks per team (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_team_pokemon'
  ) THEN
    ALTER TABLE picks ADD CONSTRAINT unique_team_pokemon
      UNIQUE (draft_id, team_id, pokemon_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Prevent negative budgets (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'positive_budget'
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT positive_budget
      CHECK (budget_remaining >= 0);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- HELPER FUNCTION: GET CURRENT TEAM IN SNAKE DRAFT
-- ============================================

CREATE OR REPLACE FUNCTION get_current_team_id(
  p_draft_id UUID,
  p_turn INTEGER,
  p_total_teams INTEGER
) RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_round INTEGER;
  v_position INTEGER;
  v_team_order INTEGER;
  v_team_id UUID;
BEGIN
  -- Calculate which round we're in (0-indexed)
  v_round := ((p_turn - 1) / p_total_teams);

  -- Calculate position within the round (0-indexed)
  v_position := ((p_turn - 1) % p_total_teams);

  -- Snake draft: odd rounds go backwards
  IF v_round % 2 = 1 THEN
    v_team_order := p_total_teams - v_position;
  ELSE
    v_team_order := v_position + 1;
  END IF;

  -- Get the team ID for this draft order
  SELECT id INTO v_team_id
  FROM teams
  WHERE draft_id = p_draft_id AND draft_order = v_team_order;

  RETURN v_team_id;
END;
$$;

-- ============================================
-- ATOMIC PICK FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION make_draft_pick(
  p_draft_id UUID,
  p_team_id UUID,
  p_user_id TEXT,
  p_pokemon_id TEXT,
  p_pokemon_name TEXT,
  p_cost INTEGER,
  p_expected_turn INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draft RECORD;
  v_team RECORD;
  v_current_team_id UUID;
  v_pick_id UUID;
  v_total_teams INTEGER;
  v_max_picks INTEGER;
  v_current_picks INTEGER;
  v_next_turn INTEGER;
  v_next_round INTEGER;
  v_is_complete BOOLEAN;
BEGIN
  -- Lock and fetch draft (prevents concurrent modifications)
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
  END IF;

  IF v_draft.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft is not active', 'status', v_draft.status);
  END IF;

  IF v_draft.current_turn IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft turn not initialized');
  END IF;

  IF v_draft.current_turn != p_expected_turn THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not your turn - turn has changed',
      'currentTurn', v_draft.current_turn,
      'expectedTurn', p_expected_turn
    );
  END IF;

  -- Get team count
  SELECT COUNT(*) INTO v_total_teams FROM teams WHERE draft_id = p_draft_id;

  IF v_total_teams = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No teams in draft');
  END IF;

  -- Calculate current team based on snake draft order
  v_current_team_id := get_current_team_id(p_draft_id, v_draft.current_turn, v_total_teams);

  IF v_current_team_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not determine current team');
  END IF;

  IF v_current_team_id != p_team_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not your turn',
      'currentTeamId', v_current_team_id,
      'yourTeamId', p_team_id
    );
  END IF;

  -- Lock and validate team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;

  IF v_team.budget_remaining < p_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient budget',
      'budgetRemaining', v_team.budget_remaining,
      'cost', p_cost
    );
  END IF;

  -- Check pick limit
  v_max_picks := COALESCE((v_draft.settings->>'maxPokemonPerTeam')::INTEGER, 6);
  SELECT COUNT(*) INTO v_current_picks FROM picks WHERE team_id = p_team_id AND draft_id = p_draft_id;

  IF v_current_picks >= v_max_picks THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Maximum picks reached',
      'currentPicks', v_current_picks,
      'maxPicks', v_max_picks
    );
  END IF;

  -- Check for duplicate Pokemon on this team
  IF EXISTS (SELECT 1 FROM picks WHERE team_id = p_team_id AND draft_id = p_draft_id AND pokemon_id = p_pokemon_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted by your team');
  END IF;

  -- All validations passed - perform the pick atomically

  -- Insert pick
  INSERT INTO picks (draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round)
  VALUES (
    p_draft_id,
    p_team_id,
    p_pokemon_id,
    p_pokemon_name,
    p_cost,
    v_draft.current_turn,
    ((v_draft.current_turn - 1) / v_total_teams) + 1
  )
  RETURNING id INTO v_pick_id;

  -- Update team budget
  UPDATE teams
  SET budget_remaining = budget_remaining - p_cost,
      updated_at = NOW()
  WHERE id = p_team_id;

  -- Calculate next turn
  v_next_turn := v_draft.current_turn + 1;
  v_next_round := ((v_next_turn - 1) / v_total_teams) + 1;
  v_is_complete := v_next_turn > (v_total_teams * v_max_picks);

  -- Update draft
  IF v_is_complete THEN
    UPDATE drafts
    SET status = 'completed',
        updated_at = NOW()
    WHERE id = p_draft_id;
  ELSE
    UPDATE drafts
    SET current_turn = v_next_turn,
        current_round = v_next_round,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE id = p_draft_id;
  END IF;

  -- Return success with all relevant data
  RETURN jsonb_build_object(
    'success', true,
    'pickId', v_pick_id,
    'newBudget', v_team.budget_remaining - p_cost,
    'nextTurn', v_next_turn,
    'nextRound', v_next_round,
    'isComplete', v_is_complete,
    'totalTeams', v_total_teams,
    'maxPicks', v_max_picks
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted (duplicate constraint)');
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Budget constraint violated');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================
-- ADDITIONAL INDEXES FOR REAL-TIME PERFORMANCE
-- ============================================

-- Composite index for faster pick lookups during validation
CREATE INDEX IF NOT EXISTS idx_picks_draft_team_pokemon ON picks(draft_id, team_id, pokemon_id);

-- Index for faster turn calculations
CREATE INDEX IF NOT EXISTS idx_teams_draft_order ON teams(draft_id, draft_order);

-- ============================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================

-- Allow anon role to execute the function (for guest users)
GRANT EXECUTE ON FUNCTION make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_team_id(UUID, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_current_team_id(UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '   Atomic Pick Function Migration Complete!';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Added:';
  RAISE NOTICE '  - make_draft_pick() - Atomic pick function with row locking';
  RAISE NOTICE '  - get_current_team_id() - Snake draft turn calculation';
  RAISE NOTICE '  - unique_team_pokemon constraint - Prevents duplicate picks';
  RAISE NOTICE '  - positive_budget constraint - Prevents negative budgets';
  RAISE NOTICE '  - teams.updated_at column - For real-time tracking';
  RAISE NOTICE '  - Additional performance indexes';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  SELECT make_draft_pick(';
  RAISE NOTICE '    draft_id,';
  RAISE NOTICE '    team_id,';
  RAISE NOTICE '    user_id,';
  RAISE NOTICE '    pokemon_id,';
  RAISE NOTICE '    pokemon_name,';
  RAISE NOTICE '    cost,';
  RAISE NOTICE '    expected_turn';
  RAISE NOTICE '  );';
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════';
END $$;
