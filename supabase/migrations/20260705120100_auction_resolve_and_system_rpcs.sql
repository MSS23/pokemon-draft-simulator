-- Migration: TIER-1 — atomic auction resolution + service-role system RPCs
-- Date: 2026-07-05
--
-- Addresses:
--
--   1.1  Auction resolution was a non-atomic multi-step CLIENT sequence that
--        every connected browser ran simultaneously when the timer hit 0
--        (read auction -> insert pick -> read/update budget -> mark completed).
--        With N clients, all passed the status='active' gate before any wrote
--        'completed', producing duplicate picks and corrupted budgets. This
--        moves resolution into ONE idempotent, expiry-guarded, transactional
--        SECURITY DEFINER function. N concurrent callers are now safe: the
--        first finalizes, the rest no-op.
--
--   1.3  Absent-user progression (auto-pick from wishlist, turn skip) needs a
--        TRUSTED server actor — the interactive make_draft_pick now requires the
--        caller's own identity and cannot pick for an absent player. These
--        system_* functions are granted to service_role ONLY and are invoked by
--        the /api/draft/[id]/tick route and the /api/cron/draft-tick backstop.
--
-- Relies on the global UNIQUE (draft_id, pokemon_id) constraint and
-- get_current_team_id() from companion / prior migrations.
--
-- Idempotent — safe to re-run.

-- =====================================================================
-- resolve_auction: finalize an EXPIRED auction exactly once
-- =====================================================================

CREATE OR REPLACE FUNCTION resolve_auction(
  p_draft_id   UUID,
  p_auction_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auction        RECORD;
  v_winner_team_id UUID;
  v_team           RECORD;
  v_total_teams    INTEGER;
  v_max_picks      INTEGER;
  v_total_picks    INTEGER;
  v_current_turn   INTEGER;
  v_current_round  INTEGER;
  v_is_complete    BOOLEAN;
  v_pick_id        UUID;
BEGIN
  -- Lock the auction. The row lock + status re-check is what makes N
  -- concurrent callers safe: only the first sees status='active'.
  SELECT * INTO v_auction FROM auctions
   WHERE id = p_auction_id AND draft_id = p_draft_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'Auction not found');
  END IF;

  IF v_auction.status <> 'active' THEN
    -- Already resolved by another caller — idempotent no-op.
    RETURN jsonb_build_object('resolved', false, 'reason', 'Auction already resolved');
  END IF;

  -- Guard against premature resolution (griefing): only finalize once the
  -- timer has actually elapsed. Clients may call a hair early due to clock
  -- skew, so allow a 2s grace.
  IF NOW() < (v_auction.auction_end - INTERVAL '2 seconds') THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'Auction not yet expired');
  END IF;

  SELECT COUNT(*) INTO v_total_teams FROM teams WHERE draft_id = p_draft_id;
  v_max_picks := COALESCE(
    (SELECT (settings->>'maxPokemonPerTeam')::INTEGER FROM drafts WHERE id = p_draft_id),
    (SELECT (settings->>'pokemonPerTeam')::INTEGER    FROM drafts WHERE id = p_draft_id),
    10
  );

  IF v_auction.current_bidder IS NOT NULL THEN
    v_winner_team_id := v_auction.current_bidder::UUID;

    -- Global uniqueness safety: if the mon is somehow already drafted, do NOT
    -- create a duplicate — just close the auction (no winner recorded).
    IF EXISTS (SELECT 1 FROM picks WHERE draft_id = p_draft_id AND pokemon_id = v_auction.pokemon_id) THEN
      UPDATE auctions SET status = 'completed', updated_at = NOW() WHERE id = p_auction_id;
      RETURN jsonb_build_object('resolved', true, 'winner', NULL, 'reason', 'Pokemon already drafted — auction voided');
    END IF;

    SELECT * INTO v_team FROM teams WHERE id = v_winner_team_id FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE auctions SET status = 'completed', updated_at = NOW() WHERE id = p_auction_id;
      RETURN jsonb_build_object('resolved', true, 'winner', NULL, 'reason', 'Winning team not found — auction voided');
    END IF;

    IF v_team.budget_remaining < v_auction.current_bid THEN
      -- Winner can no longer afford the bid (budget was not reserved — see
      -- roadmap 2.1). Void rather than drive budget negative.
      UPDATE auctions SET status = 'completed', updated_at = NOW() WHERE id = p_auction_id;
      RETURN jsonb_build_object('resolved', true, 'winner', NULL, 'reason', 'Winner cannot afford bid — auction voided');
    END IF;

    SELECT COUNT(*) INTO v_total_picks FROM picks WHERE draft_id = p_draft_id;

    INSERT INTO picks (draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round)
    VALUES (
      p_draft_id, v_winner_team_id, v_auction.pokemon_id, v_auction.pokemon_name,
      v_auction.current_bid,
      v_total_picks + 1,
      (v_total_picks / NULLIF(v_total_teams, 0)) + 1
    )
    RETURNING id INTO v_pick_id;

    UPDATE teams
       SET budget_remaining = budget_remaining - v_auction.current_bid,
           updated_at = NOW()
     WHERE id = v_winner_team_id;
  END IF;

  -- Close the auction.
  UPDATE auctions SET status = 'completed', updated_at = NOW() WHERE id = p_auction_id;

  -- Advance auction-draft turn/round bookkeeping from the AUTHORITATIVE count.
  SELECT COUNT(*) INTO v_total_picks FROM picks WHERE draft_id = p_draft_id;
  v_current_turn  := v_total_picks + 1;
  v_current_round := (v_total_picks / NULLIF(v_total_teams, 0)) + 1;
  v_is_complete   := v_total_picks >= (v_total_teams * v_max_picks);

  IF v_is_complete THEN
    UPDATE drafts SET status = 'completed', current_turn = v_current_turn, current_round = v_current_round, updated_at = NOW()
     WHERE id = p_draft_id;
  ELSE
    UPDATE drafts SET current_turn = v_current_turn, current_round = v_current_round, turn_started_at = NOW(), updated_at = NOW()
     WHERE id = p_draft_id;
  END IF;

  RETURN jsonb_build_object(
    'resolved', true,
    'pickId', v_pick_id,
    'winner', v_winner_team_id,
    'isComplete', v_is_complete,
    'newTurn', v_current_turn,
    'newRound', v_current_round
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Another caller inserted the pick between our check and insert. Ensure the
    -- auction is closed and report idempotent success.
    UPDATE auctions SET status = 'completed', updated_at = NOW() WHERE id = p_auction_id AND status = 'active';
    RETURN jsonb_build_object('resolved', false, 'reason', 'Concurrent resolution — already finalized');
END;
$$;

COMMENT ON FUNCTION resolve_auction(UUID, UUID) IS
  'Finalize an expired auction exactly once. Idempotent and expiry-guarded: '
  'safe for every client to call at timer=0. Awards the mon to the standing '
  'high bidder, deducts budget, advances turn — all in one transaction.';

GRANT EXECUTE ON FUNCTION resolve_auction(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION resolve_auction(UUID, UUID) FROM anon;

-- =====================================================================
-- system_make_pick: trusted, service-role-only pick (auto-pick from wishlist)
-- =====================================================================
-- Identical game-rule validation to make_draft_pick, MINUS the caller-identity
-- check (the service role acts on behalf of an absent user). Never granted to
-- anon/authenticated — only the server (service role) may call it.

CREATE OR REPLACE FUNCTION system_make_pick(
  p_draft_id      UUID,
  p_team_id       UUID,
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
BEGIN
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
  END IF;
  IF v_draft.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft is not active');
  END IF;
  IF v_draft.current_turn IS DISTINCT FROM p_expected_turn THEN
    RETURN jsonb_build_object('success', false, 'error', 'Turn has changed', 'currentTurn', v_draft.current_turn);
  END IF;

  SELECT COUNT(*) INTO v_total_teams FROM teams WHERE draft_id = p_draft_id;
  IF v_total_teams = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No teams in draft');
  END IF;

  v_current_team_id := get_current_team_id(p_draft_id, v_draft.current_turn, v_total_teams);
  IF v_current_team_id IS DISTINCT FROM p_team_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not this team''s turn');
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.budget_remaining < p_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient budget');
  END IF;

  v_max_picks := COALESCE((v_draft.settings->>'maxPokemonPerTeam')::INTEGER, (v_draft.settings->>'pokemonPerTeam')::INTEGER, 6);
  SELECT COUNT(*) INTO v_current_picks FROM picks WHERE team_id = p_team_id AND draft_id = p_draft_id;
  IF v_current_picks >= v_max_picks THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum picks reached');
  END IF;

  IF EXISTS (SELECT 1 FROM picks WHERE draft_id = p_draft_id AND pokemon_id = p_pokemon_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted in this draft');
  END IF;

  INSERT INTO picks (draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round)
  VALUES (p_draft_id, p_team_id, p_pokemon_id, p_pokemon_name, p_cost, v_draft.current_turn, COALESCE(v_draft.current_round, 1))
  RETURNING id INTO v_pick_id;

  UPDATE teams SET budget_remaining = budget_remaining - p_cost, updated_at = NOW() WHERE id = p_team_id;

  v_next_turn  := v_draft.current_turn + 1;
  v_next_round := COALESCE(v_draft.current_round, 1);
  IF (v_next_turn - 1) > 0 AND ((v_next_turn - 1) % v_total_teams = 0) THEN
    v_next_round := v_next_round + 1;
  END IF;
  v_is_complete := (SELECT COUNT(*) FROM picks WHERE draft_id = p_draft_id) >= (v_total_teams * v_max_picks);

  IF v_is_complete THEN
    UPDATE drafts SET status = 'completed', current_turn = v_next_turn, current_round = v_next_round, updated_at = NOW() WHERE id = p_draft_id;
  ELSE
    UPDATE drafts SET current_turn = v_next_turn, current_round = v_next_round, turn_started_at = NOW(), updated_at = NOW() WHERE id = p_draft_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'pickId', v_pick_id, 'newTurn', v_next_turn, 'isComplete', v_is_complete);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted (duplicate constraint)');
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Budget constraint violated');
END;
$$;

COMMENT ON FUNCTION system_make_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) IS
  'Trusted auto-pick on behalf of an absent user. Service role ONLY — invoked '
  'by the draft-tick server route/cron. Same game rules as make_draft_pick '
  'minus the caller-identity check.';

REVOKE EXECUTE ON FUNCTION system_make_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION system_make_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- =====================================================================
-- system_advance_turn: trusted turn skip (no pick made)
-- =====================================================================

CREATE OR REPLACE FUNCTION system_advance_turn(
  p_draft_id      UUID,
  p_expected_turn INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft       RECORD;
  v_total_teams INTEGER;
  v_max_picks   INTEGER;
  v_next_turn   INTEGER;
  v_next_round  INTEGER;
  v_is_complete BOOLEAN;
BEGIN
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
  END IF;
  IF v_draft.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft is not active');
  END IF;

  -- Optimistic guard: if the turn already moved, treat as success (idempotent).
  IF v_draft.current_turn IS DISTINCT FROM p_expected_turn THEN
    RETURN jsonb_build_object('success', true, 'skipped', false, 'reason', 'Turn already advanced', 'currentTurn', v_draft.current_turn);
  END IF;

  SELECT COUNT(*) INTO v_total_teams FROM teams WHERE draft_id = p_draft_id;
  v_max_picks := COALESCE((v_draft.settings->>'maxPokemonPerTeam')::INTEGER, (v_draft.settings->>'pokemonPerTeam')::INTEGER, 6);

  v_next_turn  := v_draft.current_turn + 1;
  v_next_round := COALESCE(v_draft.current_round, 1);
  IF (v_next_turn - 1) > 0 AND v_total_teams > 0 AND ((v_next_turn - 1) % v_total_teams = 0) THEN
    v_next_round := v_next_round + 1;
  END IF;
  v_is_complete := v_total_teams > 0 AND (v_next_turn > (v_total_teams * v_max_picks));

  IF v_is_complete THEN
    UPDATE drafts SET status = 'completed', current_turn = v_next_turn, current_round = v_next_round, updated_at = NOW() WHERE id = p_draft_id;
  ELSE
    UPDATE drafts SET current_turn = v_next_turn, current_round = v_next_round, turn_started_at = NOW(), updated_at = NOW() WHERE id = p_draft_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'skipped', true, 'newTurn', v_next_turn, 'isComplete', v_is_complete);
END;
$$;

COMMENT ON FUNCTION system_advance_turn(UUID, INTEGER) IS
  'Trusted turn skip when a player times out with no auto-pick. Service role '
  'ONLY. Optimistic on p_expected_turn so concurrent ticks are idempotent.';

REVOKE EXECUTE ON FUNCTION system_advance_turn(UUID, INTEGER) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION system_advance_turn(UUID, INTEGER) TO service_role;

-- =====================================================================
-- Record migration
-- =====================================================================

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '021_auction_resolve_and_system_rpcs',
  'Add idempotent resolve_auction() (authenticated); add service-role-only '
  'system_make_pick() and system_advance_turn() for the draft-tick scheduler.',
  'DROP FUNCTION IF EXISTS resolve_auction(UUID,UUID); '
  'DROP FUNCTION IF EXISTS system_make_pick(UUID,UUID,TEXT,TEXT,TEXT,INTEGER,INTEGER); '
  'DROP FUNCTION IF EXISTS system_advance_turn(UUID,INTEGER);'
) ON CONFLICT (name) DO NOTHING;
