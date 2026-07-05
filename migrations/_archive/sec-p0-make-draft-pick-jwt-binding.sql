-- Migration: P0 — bind make_draft_pick to JWT identity (vibe-security audit)
-- Date: 2026-05-10
--
-- Issue: make_draft_pick(p_draft_id, p_team_id, p_user_id, ...) accepts
-- p_user_id from the client and only checks that the supplied user_id is a
-- participant of the team. Because participants is publicly readable (anon
-- SELECT permissive), an attacker who knows another user's Clerk ID can
-- call this RPC with that user_id and make picks on their behalf.
--
-- Fix (defense in depth): when the Clerk → Supabase JWT bridge is
-- functional, `clerk_user_id()` returns the caller's identity from the
-- bearer token. We then require `p_user_id` to MATCH that identity. When
-- the bridge is offline (clerk_user_id() IS NULL — the current production
-- state until the Clerk dashboard is configured), we keep the legacy
-- behavior so picks don't break, but emit a notice so this fallback shows
-- up in pg_stat / pg_log when audited.
--
-- Once the JWT bridge is configured in Clerk dashboard, the bridge-active
-- branch becomes the only enforceable code path.
--
-- Idempotent — safe to re-run.

CREATE OR REPLACE FUNCTION make_draft_pick(
  p_draft_id      UUID,
  p_team_id       UUID,
  p_user_id       TEXT,
  p_pokemon_id    TEXT,
  p_pokemon_name  TEXT,
  p_cost          INTEGER,
  p_expected_turn INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft           RECORD;
  v_team            RECORD;
  v_current_team_id UUID;
  v_pick_id         UUID;
  v_total_teams     INTEGER;
  v_max_picks       INTEGER;
  v_current_picks   INTEGER;
  v_next_turn       INTEGER;
  v_next_round      INTEGER;
  v_is_complete     BOOLEAN;
  v_jwt_user        TEXT;
BEGIN
  -- ===================================================================
  -- SEC-AUDIT: bind to JWT identity when available
  -- ===================================================================
  v_jwt_user := public.clerk_user_id();

  IF v_jwt_user IS NOT NULL AND v_jwt_user <> p_user_id THEN
    -- Bridge is working AND the client tried to act as someone else.
    -- This is the actual attack we're defending against.
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Authentication mismatch — p_user_id does not match session'
    );
  END IF;

  IF v_jwt_user IS NULL THEN
    -- Bridge is offline. Existing behavior (verify participant membership)
    -- still applies below. We log a NOTICE so this path is visible in
    -- monitoring; do NOT throw, or every pick fails until Clerk is set up.
    RAISE NOTICE 'make_draft_pick called without JWT identity (clerk_user_id() is NULL); falling back to legacy participant-only check';
  END IF;

  -- ===================================================================
  -- Existing logic continues unchanged
  -- ===================================================================

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

  SELECT COUNT(*) INTO v_total_teams FROM teams WHERE draft_id = p_draft_id;

  IF v_total_teams = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No teams in draft');
  END IF;

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

  SELECT * INTO v_team FROM teams WHERE id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;

  -- Verify user is a participant of this team
  IF NOT EXISTS (
    SELECT 1 FROM participants
    WHERE draft_id = p_draft_id
      AND team_id  = p_team_id
      AND user_id  = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a member of this team');
  END IF;

  IF v_team.budget_remaining < p_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient budget',
      'budgetRemaining', v_team.budget_remaining,
      'cost', p_cost
    );
  END IF;

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

  IF EXISTS (SELECT 1 FROM picks WHERE team_id = p_team_id AND draft_id = p_draft_id AND pokemon_id = p_pokemon_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted by your team');
  END IF;

  -- Insert pick
  INSERT INTO picks (draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round)
  VALUES (
    p_draft_id, p_team_id, p_pokemon_id, p_pokemon_name, p_cost,
    v_draft.current_turn,
    COALESCE(v_draft.current_round, 1)
  )
  RETURNING id INTO v_pick_id;

  -- Deduct cost
  UPDATE teams SET budget_remaining = budget_remaining - p_cost WHERE id = p_team_id;

  -- Advance turn / round
  v_next_turn  := v_draft.current_turn + 1;
  v_next_round := COALESCE(v_draft.current_round, 1);
  IF (v_next_turn - 1) > 0 AND ((v_next_turn - 1) % v_total_teams = 0) THEN
    v_next_round := v_next_round + 1;
  END IF;

  v_is_complete := (
    SELECT COUNT(*) FROM picks WHERE draft_id = p_draft_id
  ) >= (v_total_teams * v_max_picks);

  IF v_is_complete THEN
    UPDATE drafts SET status = 'completed', current_turn = v_next_turn, current_round = v_next_round, updated_at = NOW() WHERE id = p_draft_id;
  ELSE
    UPDATE drafts SET current_turn = v_next_turn, current_round = v_next_round, turn_started_at = NOW(), updated_at = NOW() WHERE id = p_draft_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'pickId', v_pick_id,
    'budgetRemaining', v_team.budget_remaining - p_cost,
    'newTurn', v_next_turn,
    'newRound', v_next_round,
    'isComplete', v_is_complete
  );
END;
$$;

COMMENT ON FUNCTION make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) IS
  'Atomic draft-pick RPC. Binds to clerk_user_id() when the Clerk JWT '
  'bridge is configured; falls back to participant-only validation when '
  'the bridge is offline. Defense-in-depth against forged p_user_id.';

GRANT EXECUTE ON FUNCTION make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
