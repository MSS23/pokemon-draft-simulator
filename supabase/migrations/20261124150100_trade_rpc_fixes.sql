-- 037: trade RPC fixes (audit clusters B-04, B-07, and trade_approvals from B-24)
--
-- B-07  trades.proposed_by is TEXT live (it holds the proposing TEAM uuid, see
--       src/app/league/[id]/trades/page.tsx) while team ids / responded_by are
--       uuid. respond_to_trade, cancel_trade and execute_trade compared them
--       directly and raised 42883, so league trading was broken end to end.
--       The column cannot be ALTERed to uuid in place because the
--       trade_history view depends on it, so the RPCs compare as text.
-- B-04  execute_trade now also requires both teams to belong to the league's
--       draft, and honours settings.requireCommissionerApproval (only the
--       commissioner can execute an unapproved trade when approval is on).
-- Hotfix 20261124140000 set trades_insert to `proposed_by = clerk_user_id()`,
--       but the client writes the team uuid there, so every proposal is now
--       rejected. The policy is rebuilt: proposed_by must be one of the two
--       teams and owned by the caller (or the caller is the commissioner).
-- B-24  trade_approvals INSERT was "any signed-in user"; now only the league
--       commissioner may record an approval, as themselves.
-- Direct UPDATE/DELETE on trades: no client path updates trades except the
--       PGRST202 fallbacks in trade-service.ts (dead once these RPCs exist).
--       UPDATE is revoked so a future permissive policy cannot reopen B-04.
--
-- RPC signatures unchanged. Idempotent.

CREATE OR REPLACE FUNCTION public.respond_to_trade(p_trade_id uuid, p_response text)
RETURNS void
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
     AND t.id::text IS DISTINCT FROM v_trade.proposed_by
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

CREATE OR REPLACE FUNCTION public.cancel_trade(p_trade_id uuid)
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
  SELECT owner_id INTO v_proposer_owner FROM teams WHERE id::text = v_trade.proposed_by;

  IF v_caller IS DISTINCT FROM v_proposer_owner AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Only the proposing team owner or the commissioner can cancel this trade'
      USING ERRCODE = '42501';
  END IF;

  UPDATE trades
     SET status = 'cancelled', updated_at = NOW()
   WHERE id = p_trade_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_trade(trade_uuid uuid)
RETURNS void
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
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_trade FROM trades WHERE id = trade_uuid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;
  IF v_trade.status != 'accepted' THEN
    RAISE EXCEPTION 'Trade must be accepted before execution (current: %)', v_trade.status;
  END IF;

  SELECT owner_id, draft_id INTO v_team_a FROM teams WHERE id = v_trade.team_a_id;
  SELECT owner_id, draft_id INTO v_team_b FROM teams WHERE id = v_trade.team_b_id;

  SELECT draft_id, current_week, settings INTO v_league FROM leagues WHERE id = v_trade.league_id;
  v_commissioner := v_league.settings->>'commissionerId';

  -- Both teams must be in the league's own draft (no cross-draft pick moves).
  IF v_team_a.draft_id IS DISTINCT FROM v_league.draft_id
     OR v_team_b.draft_id IS DISTINCT FROM v_league.draft_id THEN
    RAISE EXCEPTION 'Both teams must belong to this league''s draft' USING ERRCODE = '42501';
  END IF;

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
    v_consented := v_trade.responded_by::text IS DISTINCT FROM v_trade.proposed_by;
  ELSIF v_trade.responded_at IS NOT NULL AND v_caller = v_commissioner THEN
    v_consented := true;
  ELSE
    v_consented := EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id IN (v_trade.team_a_id, v_trade.team_b_id)
         AND t.id::text IS DISTINCT FROM v_trade.proposed_by
         AND t.owner_id = v_caller
    );
  END IF;
  IF NOT v_consented THEN
    RAISE EXCEPTION 'This trade has not been accepted by the receiving team'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE((v_league.settings->>'requireCommissionerApproval')::boolean, false)
     AND v_trade.commissioner_approved IS NOT TRUE
     AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'This trade needs commissioner approval before it can be executed'
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

REVOKE EXECUTE ON FUNCTION public.respond_to_trade(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_trade(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.execute_trade(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_trade(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_trade(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_trade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_trade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_trade(uuid, boolean, text) TO authenticated, service_role;

-- Proposals: proposed_by is the proposing team (text uuid), owned by the caller.
DROP POLICY IF EXISTS trades_insert ON public.trades;
CREATE POLICY trades_insert ON public.trades
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'proposed'
    AND proposed_by IN (team_a_id::text, team_b_id::text)
    AND responded_by IS NULL AND responded_at IS NULL AND completed_at IS NULL
    AND commissioner_approved IS NULL AND commissioner_id IS NULL AND commissioner_notes IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.teams t
              WHERE t.id::text = proposed_by AND t.owner_id = public.clerk_user_id())
      OR EXISTS (SELECT 1 FROM public.leagues l
                 WHERE l.id = league_id AND (l.settings ->> 'commissionerId') = public.clerk_user_id())
    )
    AND EXISTS (SELECT 1 FROM public.leagues l
                JOIN public.teams ta ON ta.id = team_a_id
                JOIN public.teams tb ON tb.id = team_b_id
                WHERE l.id = league_id AND ta.draft_id = l.draft_id AND tb.draft_id = l.draft_id)
  );

REVOKE UPDATE ON public.trades FROM anon, authenticated;

-- trade_approvals: only the commissioner, recording themselves.
DROP POLICY IF EXISTS trade_approvals_insert ON public.trade_approvals;
CREATE POLICY trade_approvals_insert ON public.trade_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    approver_user_id = public.clerk_user_id()
    AND EXISTS (
      SELECT 1 FROM public.trades t
      JOIN public.leagues l ON l.id = t.league_id
      WHERE t.id = trade_id AND (l.settings ->> 'commissionerId') = public.clerk_user_id()
    )
  );

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '037_trade_rpc_fixes',
  'Trade RPCs compare proposed_by as text (fixes 42883); execute_trade checks league draft and commissioner approval; trades_insert accepts the proposing team uuid; trade_approvals insert limited to the commissioner; revoke UPDATE on trades.',
  'Re-apply respond_to_trade/cancel_trade/execute_trade from 20260824120000 and trades_insert from 20261124140000; GRANT UPDATE ON public.trades TO authenticated;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '037_trade_rpc_fixes'
);
