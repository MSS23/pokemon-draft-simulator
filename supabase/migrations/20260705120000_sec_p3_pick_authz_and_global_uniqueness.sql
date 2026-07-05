-- Migration: TIER-1 P3 — global pick uniqueness + make_draft_pick auth hardening
-- Date: 2026-07-05
--
-- Addresses two production-readiness findings:
--
--   1.2  No GLOBAL "already drafted" guarantee. The only uniqueness on picks
--        was UNIQUE (draft_id, team_id, pokemon_id) — per TEAM. Two different
--        teams could draft the SAME Pokemon (snake, or an auction re-nominating
--        an owned mon). Global uniqueness was enforced only by client-side
--        filtering. This adds a hard DB constraint UNIQUE (draft_id, pokemon_id)
--        plus an explicit friendly check inside make_draft_pick.
--
--   1.4  make_draft_pick was EXECUTE-granted to anon and, when the caller
--        presented no JWT (raw anon key, no bearer token), fell through to a
--        participant-only check on a CLIENT-SUPPLIED p_user_id. Because
--        participants/teams are world-readable, anyone could force picks for
--        any team whose turn it was, in any active draft. This mirrors the
--        sec-p1 hardening already applied to place_bid / execute_trade /
--        undo_last_pick: REVOKE anon and require clerk_user_id() to match.
--
-- PREREQUISITE: Clerk -> Supabase JWT bridge must be live (already true — the
-- sec-p1 migration, which hard-requires it, is applied in production). The new
-- /api/health probe added alongside this work monitors that the bridge stays up.
--
-- Server-driven auto-pick / auto-skip do NOT call make_draft_pick; they use the
-- service-role-only system_make_pick / system_advance_turn functions created in
-- the companion migration, so requiring caller identity here is safe.
--
-- Idempotent — safe to re-run.

-- =====================================================================
-- 1.2  Global uniqueness: one Pokemon per draft, across all teams
-- =====================================================================

-- Guard: if legacy data already contains the same Pokemon on two teams in a
-- draft (a symptom of the pre-fix duplicate bug), fail loudly with the offending
-- rows rather than letting ADD CONSTRAINT throw an opaque error. Clean those up
-- (keep the earliest pick, delete the rest) and re-run.
DO $$
DECLARE
  v_dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dupes FROM (
    SELECT draft_id, pokemon_id
    FROM picks
    GROUP BY draft_id, pokemon_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'Cannot add UNIQUE (draft_id, pokemon_id): % draft/pokemon pair(s) already duplicated. Resolve duplicate picks first (see the query in this migration).',
      v_dupes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_draft_pokemon'
  ) THEN
    ALTER TABLE picks ADD CONSTRAINT unique_draft_pokemon
      UNIQUE (draft_id, pokemon_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================================
-- 1.4  Harden make_draft_pick: require caller identity, add global dup check
-- =====================================================================

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
  -- SEC: bind to JWT identity. No anonymous or cross-user picks.
  -- ===================================================================
  v_jwt_user := public.clerk_user_id();

  IF v_jwt_user IS NULL THEN
    -- Bridge must be live in production. A NULL here means either the caller
    -- presented no Clerk JWT (anon key) or the bridge is misconfigured. Either
    -- way we refuse — the server-side system_* functions handle absent-user
    -- picks, and interactive picks always carry the user's token.
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF v_jwt_user <> p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Authentication mismatch — p_user_id does not match session'
    );
  END IF;

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

  -- Verify the (already identity-checked) user is a participant of this team
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

  v_max_picks := COALESCE((v_draft.settings->>'maxPokemonPerTeam')::INTEGER, (v_draft.settings->>'pokemonPerTeam')::INTEGER, 6);
  SELECT COUNT(*) INTO v_current_picks FROM picks WHERE team_id = p_team_id AND draft_id = p_draft_id;

  IF v_current_picks >= v_max_picks THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Maximum picks reached',
      'currentPicks', v_current_picks,
      'maxPicks', v_max_picks
    );
  END IF;

  -- GLOBAL uniqueness (1.2): reject if ANY team in this draft already has it.
  IF EXISTS (SELECT 1 FROM picks WHERE draft_id = p_draft_id AND pokemon_id = p_pokemon_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted in this draft');
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

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted (duplicate constraint)');
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Budget constraint violated');
END;
$$;

COMMENT ON FUNCTION make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) IS
  'Atomic user-initiated draft pick. Requires clerk_user_id() = p_user_id '
  '(no anon, no cross-user). Enforces global per-draft Pokemon uniqueness. '
  'Absent-user auto-picks go through system_make_pick (service role only).';

-- Only authenticated callers. Absent-user picks use the service-role system_* fns.
REVOKE EXECUTE ON FUNCTION make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM anon;
GRANT  EXECUTE ON FUNCTION make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- =====================================================================
-- Record migration
-- =====================================================================

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '020_sec_p3_pick_authz_and_global_uniqueness',
  'Add UNIQUE (draft_id, pokemon_id) to picks; harden make_draft_pick to '
  'require clerk_user_id()=p_user_id and reject anon; add global dup check.',
  'ALTER TABLE picks DROP CONSTRAINT IF EXISTS unique_draft_pokemon; '
  'restore make_draft_pick from 20260510163221_sec_p0_make_draft_pick_jwt_binding.sql; '
  'GRANT EXECUTE ON FUNCTION make_draft_pick(UUID,UUID,TEXT,TEXT,TEXT,INTEGER,INTEGER) TO anon.'
) ON CONFLICT (name) DO NOTHING;
