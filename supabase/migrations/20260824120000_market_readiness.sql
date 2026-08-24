-- =====================================================================
-- Market-readiness pass (2026-08-24)
--
-- 1. Trades: counterparty consent enforced at the DB level. Previously the
--    trades UPDATE policy let EITHER involved owner flip status, so a
--    proposer could self-accept and execute. All status changes now go
--    through SECURITY DEFINER RPCs (respond_to_trade / cancel_trade /
--    approve_trade) and the client UPDATE policy is dropped. execute_trade
--    additionally verifies the acceptance came from the non-proposing side
--    and respects the commissioner's roster lock.
-- 2. Waivers: optional in-season free agency. The hard "locked after the
--    first match" rule now only applies when the league has not enabled
--    allowInSeasonWaivers. waiverDeadline (already settable in the admin
--    UI but previously unenforced) and rosterLocked are enforced.
-- 3. match_games: per-game results are now persisted (Bo3/Bo5 game winners
--    were collapsed to two integers). UNIQUE (match_id, game_number) for
--    upserts + scoped write policies (the old INSERT policy was
--    WITH CHECK (true); UPDATE/DELETE had been dropped entirely).
-- 4. Standings: cross-conference matches now count for BOTH conferences
--    (they were counted only for the conference whose league row stored
--    the match). Playoff/knockout bracket matches (notes contain
--    "bracketMatchId") are excluded from regular-season standings.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1a. trades.responded_by — which team accepted/rejected the trade.
--     Written only by respond_to_trade; lets execute_trade verify consent.
-- ---------------------------------------------------------------------
ALTER TABLE trades ADD COLUMN IF NOT EXISTS responded_by UUID;

-- ---------------------------------------------------------------------
-- 1b. respond_to_trade — accept / reject / counter-close a proposal.
--     Only an owner of a team in the trade OTHER than the proposing team
--     (or the commissioner) may respond. The proposer backs out via
--     cancel_trade instead.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION respond_to_trade(
  p_trade_id UUID,
  p_response TEXT   -- 'accepted' | 'rejected' | 'countered'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
  v_trade RECORD;
  v_commissioner TEXT;
  v_responder_team UUID;
BEGIN
  v_caller := public.clerk_user_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_response NOT IN ('accepted', 'rejected', 'countered') THEN
    RAISE EXCEPTION 'Invalid response %', p_response;
  END IF;

  SELECT * INTO v_trade FROM trades WHERE id = p_trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_trade.status <> 'proposed' THEN
    RAISE EXCEPTION 'Trade is no longer open for a response (current: %)', v_trade.status;
  END IF;

  SELECT (settings->>'commissionerId') INTO v_commissioner
    FROM leagues WHERE id = v_trade.league_id;

  -- The responding team: owned by the caller, in the trade, NOT the proposer
  SELECT t.id INTO v_responder_team
    FROM teams t
   WHERE t.id IN (v_trade.team_a_id, v_trade.team_b_id)
     AND t.id IS DISTINCT FROM v_trade.proposed_by
     AND t.owner_id = v_caller
   LIMIT 1;

  IF v_responder_team IS NULL AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Only the receiving team owner or the commissioner can respond to this trade'
      USING ERRCODE = '42501';
  END IF;

  UPDATE trades
     SET status = p_response,
         responded_at = NOW(),
         responded_by = v_responder_team,   -- NULL when the commissioner responds
         updated_at = NOW()
   WHERE id = p_trade_id;
END;
$$;

GRANT EXECUTE ON FUNCTION respond_to_trade(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION respond_to_trade(UUID, TEXT) FROM anon;

-- ---------------------------------------------------------------------
-- 1c. cancel_trade — proposer (or commissioner) withdraws an open proposal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_trade(p_trade_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
  v_trade RECORD;
  v_commissioner TEXT;
  v_proposer_owner TEXT;
BEGIN
  v_caller := public.clerk_user_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_trade FROM trades WHERE id = p_trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_trade.status <> 'proposed' THEN
    RAISE EXCEPTION 'Only an open proposal can be cancelled (current: %)', v_trade.status;
  END IF;

  SELECT (settings->>'commissionerId') INTO v_commissioner
    FROM leagues WHERE id = v_trade.league_id;
  SELECT owner_id INTO v_proposer_owner FROM teams WHERE id = v_trade.proposed_by;

  IF v_caller IS DISTINCT FROM v_proposer_owner AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Only the proposing team owner or the commissioner can cancel this trade'
      USING ERRCODE = '42501';
  END IF;

  UPDATE trades
     SET status = 'cancelled', updated_at = NOW()
   WHERE id = p_trade_id;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_trade(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION cancel_trade(UUID) FROM anon;

-- ---------------------------------------------------------------------
-- 1d. approve_trade — commissioner verdict on an accepted trade
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_trade(
  p_trade_id UUID,
  p_approved BOOLEAN,
  p_notes TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
  v_trade RECORD;
  v_commissioner TEXT;
BEGIN
  v_caller := public.clerk_user_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_trade FROM trades WHERE id = p_trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;

  SELECT (settings->>'commissionerId') INTO v_commissioner
    FROM leagues WHERE id = v_trade.league_id;
  IF v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Only the league commissioner can approve trades'
      USING ERRCODE = '42501';
  END IF;

  IF p_approved THEN
    -- A rejected/cancelled trade must not be resurrected by approval
    IF v_trade.status <> 'accepted' THEN
      RAISE EXCEPTION 'Trade is not in an approvable state (current: %)', v_trade.status;
    END IF;
    UPDATE trades
       SET commissioner_approved = true,
           commissioner_id = v_caller,
           commissioner_notes = p_notes,
           responded_at = NOW(),
           updated_at = NOW()
     WHERE id = p_trade_id;
  ELSE
    IF v_trade.status NOT IN ('proposed', 'accepted') THEN
      RAISE EXCEPTION 'Trade is not vetoable (current: %)', v_trade.status;
    END IF;
    UPDATE trades
       SET commissioner_approved = false,
           commissioner_id = v_caller,
           commissioner_notes = p_notes,
           status = 'rejected',
           responded_at = NOW(),
           updated_at = NOW()
     WHERE id = p_trade_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_trade(UUID, BOOLEAN, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION approve_trade(UUID, BOOLEAN, TEXT) FROM anon;

-- ---------------------------------------------------------------------
-- 1e. execute_trade — now also verifies counterparty consent and the
--     commissioner's roster lock (supersedes 20260823120000 version)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION execute_trade(trade_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller       TEXT;
  v_trade        RECORD;
  v_team_a       RECORD;
  v_team_b       RECORD;
  v_league       RECORD;
  v_commissioner TEXT;
  v_deadline     INTEGER;
  v_pick_id      TEXT;
  v_consented    BOOLEAN;
BEGIN
  v_caller := public.clerk_user_id();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_trade FROM trades WHERE id = trade_uuid FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;

  IF v_trade.status != 'accepted' THEN
    RAISE EXCEPTION 'Trade must be accepted before execution (current: %)', v_trade.status;
  END IF;

  SELECT owner_id INTO v_team_a FROM teams WHERE id = v_trade.team_a_id;
  SELECT owner_id INTO v_team_b FROM teams WHERE id = v_trade.team_b_id;

  SELECT current_week, settings INTO v_league FROM leagues WHERE id = v_trade.league_id;
  v_commissioner := v_league.settings->>'commissionerId';

  IF v_caller IS DISTINCT FROM v_team_a.owner_id
     AND v_caller IS DISTINCT FROM v_team_b.owner_id
     AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Only a team owner or the commissioner can execute this trade'
      USING ERRCODE = '42501';
  END IF;

  -- Counterparty consent: the acceptance must have come from a team other
  -- than the proposer (recorded by respond_to_trade), or from the
  -- commissioner (responded_by NULL after respond_to_trade). For legacy
  -- rows accepted before responded_by existed, require the executor
  -- themselves to be the non-proposing owner or the commissioner.
  IF v_trade.responded_by IS NOT NULL THEN
    v_consented := v_trade.responded_by IS DISTINCT FROM v_trade.proposed_by;
  ELSIF v_trade.responded_at IS NOT NULL AND v_caller = v_commissioner THEN
    v_consented := true;
  ELSE
    v_consented := EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id IN (v_trade.team_a_id, v_trade.team_b_id)
         AND t.id IS DISTINCT FROM v_trade.proposed_by
         AND t.owner_id = v_caller
    );
  END IF;
  IF NOT v_consented THEN
    RAISE EXCEPTION 'This trade has not been accepted by the receiving team'
      USING ERRCODE = '42501';
  END IF;

  -- League-level trade rules (commissioner may override the deadline)
  IF COALESCE((v_league.settings->>'enableTrades')::boolean, true) = false THEN
    RAISE EXCEPTION 'Trades are disabled for this league';
  END IF;

  IF COALESCE((v_league.settings->>'rosterLocked')::boolean, false)
     AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Rosters are currently locked by the commissioner';
  END IF;

  v_deadline := (v_league.settings->>'tradeDeadlineWeek')::integer;
  IF v_deadline IS NOT NULL
     AND COALESCE(v_league.current_week, 1) > v_deadline
     AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'The trade deadline (week %) has passed', v_deadline;
  END IF;

  FOREACH v_pick_id IN ARRAY v_trade.team_a_gives
  LOOP
    UPDATE picks SET team_id = v_trade.team_b_id
     WHERE id = v_pick_id::UUID AND team_id = v_trade.team_a_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pick % not found on team A', v_pick_id;
    END IF;
  END LOOP;

  FOREACH v_pick_id IN ARRAY v_trade.team_b_gives
  LOOP
    UPDATE picks SET team_id = v_trade.team_a_id
     WHERE id = v_pick_id::UUID AND team_id = v_trade.team_b_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pick % not found on team B', v_pick_id;
    END IF;
  END LOOP;

  UPDATE trades
     SET status       = 'completed',
         completed_at = NOW(),
         updated_at   = NOW()
   WHERE id = trade_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION execute_trade(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION execute_trade(UUID) FROM anon;

-- ---------------------------------------------------------------------
-- 1f. Drop the client UPDATE policy — every status change now goes
--     through the SECURITY DEFINER RPCs above.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS trades_update_owner_or_commish ON public.trades;
DROP POLICY IF EXISTS trades_update_involved ON public.trades;
DROP POLICY IF EXISTS trades_update ON public.trades;
DROP POLICY IF EXISTS "Trades can be managed by anyone" ON public.trades;

-- ---------------------------------------------------------------------
-- 2. process_waiver_claim — optional in-season free agency
--    (supersedes 20260823120000 version; adds allowInSeasonWaivers,
--    waiverDeadline and rosterLocked enforcement)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_waiver_claim(
  p_league_id UUID,
  p_team_id UUID,
  p_pokemon_id TEXT,
  p_pokemon_name TEXT,
  p_pokemon_cost INTEGER,
  p_drop_pick_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
  v_team RECORD;
  v_league RECORD;
  v_drop RECORD;
  v_settings JSONB;
  v_max_claims INTEGER;
  v_used_claims INTEGER;
  v_net_cost INTEGER;
  v_next_order INTEGER;
  v_claim_id UUID;
  v_deadline TIMESTAMPTZ;
BEGIN
  v_caller := public.clerk_user_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found'; END IF;
  IF v_team.owner_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Only the team owner can claim free agents' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_league FROM leagues WHERE id = p_league_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'League not found'; END IF;
  IF v_league.draft_id IS DISTINCT FROM v_team.draft_id THEN
    RAISE EXCEPTION 'Team does not belong to this league';
  END IF;

  v_settings := COALESCE(v_league.settings, '{}'::jsonb);
  IF COALESCE((v_settings->>'enableWaivers')::boolean, true) = false THEN
    RAISE EXCEPTION 'Free agent claims are disabled for this league';
  END IF;

  IF COALESCE((v_settings->>'rosterLocked')::boolean, false) THEN
    RAISE EXCEPTION 'Rosters are currently locked by the commissioner';
  END IF;

  -- Commissioner-set deadline (datetime-local string; tolerate bad values)
  BEGIN
    v_deadline := NULLIF(v_settings->>'waiverDeadline', '')::timestamptz;
  EXCEPTION WHEN others THEN
    v_deadline := NULL;
  END;
  IF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
    RAISE EXCEPTION 'The free agency deadline has passed';
  END IF;

  -- Pre-season window: locked once any match has been played, UNLESS the
  -- league has enabled in-season free agency.
  IF COALESCE((v_settings->>'allowInSeasonWaivers')::boolean, false) = false
     AND EXISTS (
       SELECT 1 FROM matches
        WHERE league_id = p_league_id AND status IN ('completed', 'in_progress')
     ) THEN
    RAISE EXCEPTION 'Free agent claims are locked once the first match has been played';
  END IF;

  v_max_claims := COALESCE(
    (v_settings->>'freeAgentPicksAllowed')::integer,
    (v_settings->>'maxWaiverClaimsPerSeason')::integer,
    3
  );
  SELECT COUNT(*) INTO v_used_claims FROM waiver_claims
   WHERE league_id = p_league_id AND team_id = p_team_id
     AND status IN ('completed', 'approved');
  IF v_used_claims >= v_max_claims THEN
    RAISE EXCEPTION 'Free agent pick limit reached (% allowed)', v_max_claims;
  END IF;

  -- Drop pick must exist AND belong to the claiming team
  SELECT * INTO v_drop FROM picks WHERE id = p_drop_pick_id AND team_id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dropped Pokemon is not on your roster';
  END IF;

  v_net_cost := p_pokemon_cost - COALESCE(v_drop.cost, 0);
  IF v_net_cost > 0 AND COALESCE(v_team.budget_remaining, 0) < v_net_cost THEN
    RAISE EXCEPTION 'Insufficient budget: need % extra points', v_net_cost;
  END IF;

  INSERT INTO waiver_claims (league_id, team_id, claimed_pokemon_id, claimed_pokemon_name,
                             dropped_pick_id, status, claimed_at, processed_at, notes)
  VALUES (p_league_id, p_team_id, p_pokemon_id, p_pokemon_name,
          p_drop_pick_id, 'completed', NOW(), NOW(),
          'Dropped ' || v_drop.pokemon_name)
  RETURNING id INTO v_claim_id;

  DELETE FROM picks WHERE id = p_drop_pick_id;

  SELECT COALESCE(MAX(pick_order), 0) + 1 INTO v_next_order
    FROM picks WHERE draft_id = v_team.draft_id;

  -- unique (draft_id, pokemon_id) makes concurrent claims of the same mon
  -- fail here and roll the whole claim back
  INSERT INTO picks (draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round)
  VALUES (v_team.draft_id, p_team_id, p_pokemon_id, p_pokemon_name, p_pokemon_cost, v_next_order, 0);

  UPDATE teams
     SET budget_remaining = COALESCE(budget_remaining, 0) - v_net_cost
   WHERE id = p_team_id;

  RETURN v_claim_id;
END;
$$;

GRANT EXECUTE ON FUNCTION process_waiver_claim(UUID, UUID, TEXT, TEXT, INTEGER, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION process_waiver_claim(UUID, UUID, TEXT, TEXT, INTEGER, UUID) FROM anon;

-- ---------------------------------------------------------------------
-- 3. match_games — persist per-game results
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_games_match_game
  ON match_games (match_id, game_number);

-- The legacy INSERT policy was WITH CHECK (true); UPDATE/DELETE were
-- dropped with no replacement. Scope all three to match participants or
-- the league commissioner (SELECT stays open, like matches).
DROP POLICY IF EXISTS "match_games_insert" ON public.match_games;
DROP POLICY IF EXISTS match_games_insert_participant ON public.match_games;
DROP POLICY IF EXISTS match_games_update_participant ON public.match_games;
DROP POLICY IF EXISTS match_games_delete_participant ON public.match_games;

CREATE POLICY match_games_insert_participant ON public.match_games
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
      WHERE m.id = match_games.match_id
        AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM matches m
      JOIN leagues l ON l.id = m.league_id
      WHERE m.id = match_games.match_id
        AND (l.settings->>'commissionerId') = public.clerk_user_id()
    )
  );

CREATE POLICY match_games_update_participant ON public.match_games
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
      WHERE m.id = match_games.match_id
        AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM matches m
      JOIN leagues l ON l.id = m.league_id
      WHERE m.id = match_games.match_id
        AND (l.settings->>'commissionerId') = public.clerk_user_id()
    )
  );

CREATE POLICY match_games_delete_participant ON public.match_games
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
      WHERE m.id = match_games.match_id
        AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM matches m
      JOIN leagues l ON l.id = m.league_id
      WHERE m.id = match_games.match_id
        AND (l.settings->>'commissionerId') = public.clerk_user_id()
    )
  );

-- ---------------------------------------------------------------------
-- 4. recalculate_league_standings — cross-conference matches count for
--    both conferences; bracket (playoff/knockout) matches are excluded
--    from regular-season standings.
--    (supersedes 20260823120000 version)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_league_standings(p_league_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_team RECORD;
  v_match RECORD;
  v_rank INTEGER := 0;
  v_settings JSONB;
  v_points_per_win INTEGER;
  v_points_per_draw INTEGER;
  v_res CHAR(1);
  v_streak_char CHAR(1);
  v_streak_count INTEGER;
  v_league RECORD;
  v_sibling_id UUID;
BEGIN
  SELECT draft_id, league_type, settings INTO v_league FROM leagues WHERE id = p_league_id;
  v_settings := v_league.settings;
  v_points_per_win := COALESCE((v_settings->>'pointsPerWin')::integer, 3);
  v_points_per_draw := COALESCE((v_settings->>'pointsPerDraw')::integer, 1);

  -- Cross-conference matches are stored in one conference's league row but
  -- involve a team from the sibling conference — include the sibling's
  -- matches too. Updates below are scoped to this league's standings rows,
  -- so the sibling's intra-conference matches are naturally ignored.
  v_sibling_id := NULL;
  IF v_league.league_type IN ('split_conference_a', 'split_conference_b') THEN
    SELECT id INTO v_sibling_id FROM leagues
     WHERE draft_id = v_league.draft_id
       AND id <> p_league_id
       AND league_type IN ('split_conference_a', 'split_conference_b')
     LIMIT 1;
  END IF;

  UPDATE standings SET
    wins = 0, losses = 0, draws = 0,
    points_for = 0, points_against = 0,
    point_differential = 0, rank = 0,
    current_streak = NULL,
    updated_at = NOW()
  WHERE league_id = p_league_id;

  FOR v_match IN
    SELECT * FROM matches m
    WHERE m.league_id IN (p_league_id, v_sibling_id)
      AND m.status = 'completed'
      -- playoff/knockout rows must not pollute regular-season standings
      AND (m.notes IS NULL OR m.notes NOT LIKE '%bracketMatchId%')
    ORDER BY COALESCE(m.completed_at, m.updated_at) ASC
  LOOP
    UPDATE standings SET
      points_for = points_for + COALESCE(v_match.home_score, 0),
      points_against = points_against + COALESCE(v_match.away_score, 0),
      wins = wins + CASE WHEN v_match.winner_team_id = v_match.home_team_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_match.winner_team_id = v_match.away_team_id THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN v_match.winner_team_id IS NULL THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE league_id = p_league_id AND team_id = v_match.home_team_id;

    UPDATE standings SET
      points_for = points_for + COALESCE(v_match.away_score, 0),
      points_against = points_against + COALESCE(v_match.home_score, 0),
      wins = wins + CASE WHEN v_match.winner_team_id = v_match.away_team_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_match.winner_team_id = v_match.home_team_id THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN v_match.winner_team_id IS NULL THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE league_id = p_league_id AND team_id = v_match.away_team_id;
  END LOOP;

  UPDATE standings SET
    point_differential = points_for - points_against
  WHERE league_id = p_league_id;

  -- Streaks: walk each team's completed matches from most recent backwards
  FOR v_team IN
    SELECT team_id FROM standings WHERE league_id = p_league_id
  LOOP
    v_streak_char := NULL;
    v_streak_count := 0;
    FOR v_match IN
      SELECT winner_team_id FROM matches m
       WHERE m.league_id IN (p_league_id, v_sibling_id)
         AND m.status = 'completed'
         AND (m.notes IS NULL OR m.notes NOT LIKE '%bracketMatchId%')
         AND (m.home_team_id = v_team.team_id OR m.away_team_id = v_team.team_id)
       ORDER BY COALESCE(m.completed_at, m.updated_at) DESC
    LOOP
      v_res := CASE
        WHEN v_match.winner_team_id = v_team.team_id THEN 'W'
        WHEN v_match.winner_team_id IS NULL THEN 'D'
        ELSE 'L'
      END;
      IF v_streak_char IS NULL THEN
        v_streak_char := v_res; v_streak_count := 1;
      ELSIF v_res = v_streak_char THEN
        v_streak_count := v_streak_count + 1;
      ELSE
        EXIT;
      END IF;
    END LOOP;
    UPDATE standings
       SET current_streak = CASE WHEN v_streak_char IS NULL THEN NULL
                                 ELSE v_streak_char || v_streak_count::text END
     WHERE league_id = p_league_id AND team_id = v_team.team_id;
  END LOOP;

  v_rank := 0;
  FOR v_team IN
    SELECT id FROM standings
    WHERE league_id = p_league_id
    ORDER BY
      (wins * v_points_per_win + draws * v_points_per_draw) DESC,
      point_differential DESC,
      wins DESC
  LOOP
    v_rank := v_rank + 1;
    UPDATE standings SET rank = v_rank WHERE id = v_team.id;
  END LOOP;
END;
$$;
