-- =====================================================================
-- League engine fixes (2026-08-23 regression pass)
--
-- 1. standings writes were RLS-blocked for all clients (policies dropped
--    by 20260510184131 with no replacement RPCs) → initialize + update
--    standings via SECURITY DEFINER RPCs.
-- 2. recalculate_league_standings erased current_streak → now computes it.
-- 3. team sheets: drafts.settings writes are host-only under RLS, so
--    non-host players' sheets silently vanished → owner-scoped atomic RPC.
-- 4. match result submissions: read-modify-write race on matches.notes +
--    no ownership check on the submitting side → atomic merge RPC.
-- 5. waiver claims: pick delete was FK-blocked, budget update was
--    permission-denied, drop-pick ownership unchecked → atomic RPC.
-- 6. match_pokemon_kos / team_pokemon_status: UPDATE/DELETE policies were
--    dropped with no replacement, silently breaking KO undo, death
--    marking and match stats → restore scoped policies.
-- 7. trades: 'countered' status was rejected by the CHECK constraint, and
--    any signed-in user could open a trade against two other teams →
--    extend constraint, tighten INSERT policy.
-- 8. increment_pokemon_match_stats existed only in the archived
--    do-not-apply migration → define it here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1a. initialize_league_standings
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION initialize_league_standings(p_league_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO standings (league_id, team_id, wins, losses, draws, points_for, points_against)
  SELECT lt.league_id, lt.team_id, 0, 0, 0, 0, 0
    FROM league_teams lt
   WHERE lt.league_id = p_league_id
     AND NOT EXISTS (
       SELECT 1 FROM standings s
        WHERE s.league_id = lt.league_id AND s.team_id = lt.team_id
     );
END;
$$;

GRANT EXECUTE ON FUNCTION initialize_league_standings(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION initialize_league_standings(UUID) FROM anon;

-- ---------------------------------------------------------------------
-- 1b/2. recalculate_league_standings — now also computes current_streak
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
BEGIN
  SELECT settings INTO v_settings FROM leagues WHERE id = p_league_id;
  v_points_per_win := COALESCE((v_settings->>'pointsPerWin')::integer, 3);
  v_points_per_draw := COALESCE((v_settings->>'pointsPerDraw')::integer, 1);

  UPDATE standings SET
    wins = 0, losses = 0, draws = 0,
    points_for = 0, points_against = 0,
    point_differential = 0, rank = 0,
    current_streak = NULL,
    updated_at = NOW()
  WHERE league_id = p_league_id;

  FOR v_match IN
    SELECT * FROM matches
    WHERE league_id = p_league_id AND status = 'completed'
    ORDER BY COALESCE(completed_at, updated_at) ASC
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
      SELECT winner_team_id FROM matches
       WHERE league_id = p_league_id AND status = 'completed'
         AND (home_team_id = v_team.team_id OR away_team_id = v_team.team_id)
       ORDER BY COALESCE(completed_at, updated_at) DESC
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

-- ---------------------------------------------------------------------
-- 3. submit_team_sheet — owner-scoped atomic write into drafts.settings
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_team_sheet(
  p_draft_id UUID,
  p_team_id UUID,
  p_sheet JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
  v_team RECORD;
  v_host TEXT;
BEGIN
  v_caller := public.clerk_user_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT owner_id, draft_id INTO v_team FROM teams WHERE id = p_team_id;
  IF NOT FOUND OR v_team.draft_id IS DISTINCT FROM p_draft_id THEN
    RAISE EXCEPTION 'Team not found in this draft';
  END IF;

  SELECT host_id INTO v_host FROM drafts WHERE id = p_draft_id;

  IF v_caller IS DISTINCT FROM v_team.owner_id AND v_caller IS DISTINCT FROM v_host THEN
    RAISE EXCEPTION 'Only the team owner or host can submit this team sheet'
      USING ERRCODE = '42501';
  END IF;

  -- Atomic per-team merge: concurrent submitters cannot clobber each other
  UPDATE drafts
     SET settings = jsonb_set(
           COALESCE(settings, '{}'::jsonb),
           ARRAY['teamSheets', p_team_id::text],
           p_sheet,
           true
         ),
         updated_at = NOW()
   WHERE id = p_draft_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_team_sheet(UUID, UUID, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION submit_team_sheet(UUID, UUID, JSONB) FROM anon;

-- ---------------------------------------------------------------------
-- 4. submit_match_side — atomic submission merge into matches.notes.
--    Verifies the caller owns the side they submit for (or is the
--    commissioner) and returns the post-merge notes so the client can
--    decide confirmed/disputed on consistent data.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_match_side(
  p_match_id UUID,
  p_side TEXT,             -- 'home' | 'away'
  p_submission JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
  v_match RECORD;
  v_team_id UUID;
  v_owner TEXT;
  v_commissioner TEXT;
  v_notes JSONB;
BEGIN
  v_caller := public.clerk_user_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_side NOT IN ('home', 'away') THEN
    RAISE EXCEPTION 'Invalid side %', p_side;
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF v_match.status = 'completed' THEN
    RAISE EXCEPTION 'Match result has already been confirmed';
  END IF;

  v_team_id := CASE WHEN p_side = 'home' THEN v_match.home_team_id ELSE v_match.away_team_id END;
  SELECT owner_id INTO v_owner FROM teams WHERE id = v_team_id;
  SELECT (settings->>'commissionerId') INTO v_commissioner
    FROM leagues WHERE id = v_match.league_id;

  IF v_caller IS DISTINCT FROM v_owner AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Only the % team owner or the commissioner can submit for that side', p_side
      USING ERRCODE = '42501';
  END IF;

  -- Tolerate legacy plain-text notes by demoting them to a "note" key
  BEGIN
    v_notes := COALESCE(v_match.notes::jsonb, '{}'::jsonb);
    IF jsonb_typeof(v_notes) <> 'object' THEN
      v_notes := jsonb_build_object('note', v_match.notes);
    END IF;
  EXCEPTION WHEN others THEN
    v_notes := jsonb_build_object('note', v_match.notes);
  END;

  v_notes := jsonb_set(
    v_notes,
    ARRAY['submissions', p_side],
    p_submission,
    true
  );

  UPDATE matches
     SET notes = v_notes::text,
         updated_at = NOW()
   WHERE id = p_match_id;

  RETURN v_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_match_side(UUID, TEXT, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION submit_match_side(UUID, TEXT, JSONB) FROM anon;

-- ---------------------------------------------------------------------
-- 5. process_waiver_claim — atomic free-agent claim
-- ---------------------------------------------------------------------
-- The pick delete was FK-blocked before: keep claim history via SET NULL
ALTER TABLE waiver_claims DROP CONSTRAINT IF EXISTS waiver_claims_dropped_pick_id_fkey;
ALTER TABLE waiver_claims
  ADD CONSTRAINT waiver_claims_dropped_pick_id_fkey
  FOREIGN KEY (dropped_pick_id) REFERENCES picks(id) ON DELETE SET NULL;

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

  -- Pre-season window: locked once any match has been played
  IF EXISTS (
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
-- 6. Restore scoped write policies for KO tracking
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS match_pokemon_kos_update_participant ON public.match_pokemon_kos;
CREATE POLICY match_pokemon_kos_update_participant ON public.match_pokemon_kos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
      WHERE m.id = match_pokemon_kos.match_id
        AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM matches m
      JOIN leagues l ON l.id = m.league_id
      WHERE m.id = match_pokemon_kos.match_id
        AND (l.settings->>'commissionerId') = public.clerk_user_id()
    )
  );

DROP POLICY IF EXISTS match_pokemon_kos_delete_participant ON public.match_pokemon_kos;
CREATE POLICY match_pokemon_kos_delete_participant ON public.match_pokemon_kos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
      WHERE m.id = match_pokemon_kos.match_id
        AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM matches m
      JOIN leagues l ON l.id = m.league_id
      WHERE m.id = match_pokemon_kos.match_id
        AND (l.settings->>'commissionerId') = public.clerk_user_id()
    )
  );

DROP POLICY IF EXISTS team_pokemon_status_update_member ON public.team_pokemon_status;
CREATE POLICY team_pokemon_status_update_member ON public.team_pokemon_status
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM league_teams lt
      JOIN teams t ON t.id = lt.team_id
      WHERE lt.league_id = team_pokemon_status.league_id
        AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM leagues l
      WHERE l.id = team_pokemon_status.league_id
        AND (l.settings->>'commissionerId') = public.clerk_user_id()
    )
  );

-- ---------------------------------------------------------------------
-- 7. Trades: allow 'countered', tighten proposer INSERT
-- ---------------------------------------------------------------------
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_status_check;
ALTER TABLE trades ADD CONSTRAINT trades_status_check
  CHECK (status IN ('proposed', 'accepted', 'rejected', 'completed', 'cancelled', 'countered'));

DROP POLICY IF EXISTS trades_insert ON public.trades;
CREATE POLICY trades_insert ON public.trades
  FOR INSERT WITH CHECK (
    -- proposer must own one of the two teams in the trade
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id IN (trades.team_a_id, trades.team_b_id)
        AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM leagues l
      WHERE l.id = trades.league_id
        AND (l.settings->>'commissionerId') = public.clerk_user_id()
    )
  );

-- ---------------------------------------------------------------------
-- 7b. execute_trade — enforce enableTrades + tradeDeadlineWeek server-side
--     (previously only hidden client-side UI, trivially bypassed)
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

  -- League-level trade rules (commissioner may override the deadline)
  IF COALESCE((v_league.settings->>'enableTrades')::boolean, true) = false THEN
    RAISE EXCEPTION 'Trades are disabled for this league';
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
-- 8. increment_pokemon_match_stats (previously archive-only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_pokemon_match_stats(
  p_pick_id UUID,
  p_won BOOLEAN
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE team_pokemon_status
     SET matches_played = COALESCE(matches_played, 0) + 1,
         matches_won    = COALESCE(matches_won, 0) + CASE WHEN p_won THEN 1 ELSE 0 END,
         updated_at     = NOW()
   WHERE pick_id = p_pick_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_pokemon_match_stats(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION increment_pokemon_match_stats(UUID, BOOLEAN) FROM anon;
