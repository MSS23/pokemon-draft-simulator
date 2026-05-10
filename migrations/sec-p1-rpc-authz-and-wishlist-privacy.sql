-- Migration: P0 follow-ups not covered by sec-p0-* migrations
-- Date: 2026-05-10
--
-- Closes the residual P0/P1 findings from the RLS audit:
--
--   1. user_profiles.is_admin self-promote: any signed-in user could run
--      `UPDATE user_profiles SET is_admin = TRUE` on their own row and gain
--      `/admin` + `/api/formats/sync` access. Column-level REVOKE locks
--      writes to service-role only. Promotion happens out of band.
--
--   2. participants.is_admin / is_host self-promote: a user already in a
--      draft could update their own row and become host. Column-level
--      REVOKE keeps writes to the SECURITY DEFINER RPCs only
--      (promote_to_admin / demote_from_admin / draft creation).
--
--   3. place_bid had no caller authorization. Anyone with the anon key
--      could bid up to ANY team's budget on ANY auction. Now requires the
--      caller to own the bidding team.
--
--   4. execute_trade had no caller authorization. Now requires the caller
--      to be either team's owner OR the league commissioner.
--
--   5. undo_last_pick had no caller authorization. Now requires the caller
--      to own the team OR be the host of the draft.
--
--   6. wishlist_items SELECT/UPDATE/DELETE had `... OR auth.uid() IS NULL`
--      escape branches that made every wishlist publicly readable from the
--      anon key. Replaced with strict clerk_user_id() ownership.
--
-- PREREQUISITES:
--   * `public.clerk_user_id()` must exist (created by
--     `fix-supabase-linter-warnings-clerk-final.sql`).
--   * Clerk -> Supabase JWT bridge must be live, otherwise the RPCs below
--     will reject every call. (User confirmed bridge is live before
--     applying this migration.)
--
-- Idempotent — safe to re-run.

-- =====================================================================
-- 1. Lock down user_profiles.is_admin column
-- =====================================================================

REVOKE UPDATE (is_admin) ON public.user_profiles FROM anon;
REVOKE UPDATE (is_admin) ON public.user_profiles FROM authenticated;

COMMENT ON COLUMN public.user_profiles.is_admin IS
  'Global app admin flag. NEVER writable from anon/authenticated — only '
  'the service role can set this column. Promotion happens out of band '
  '(Supabase studio with service-role JWT, or a future grant_global_admin '
  'RPC).';

-- =====================================================================
-- 2. Lock down participants.is_admin and is_host columns
-- =====================================================================

REVOKE UPDATE (is_admin, is_host) ON public.participants FROM anon;
REVOKE UPDATE (is_admin, is_host) ON public.participants FROM authenticated;

COMMENT ON COLUMN public.participants.is_admin IS
  'Per-draft admin flag. Set only via promote_to_admin RPC (which uses '
  'SECURITY DEFINER so the column REVOKE does not block it).';

COMMENT ON COLUMN public.participants.is_host IS
  'Original draft host. Set at participant creation only (via the server-'
  'side /api/draft/create route using the service role) and never updated '
  'from a client.';

-- =====================================================================
-- 3. place_bid: bind to caller via teams.owner_id
-- =====================================================================

CREATE OR REPLACE FUNCTION place_bid(
  auction_id     UUID,
  bidder_team_id UUID,
  bid_amount     INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller  TEXT;
  v_auction RECORD;
  v_team    RECORD;
BEGIN
  v_caller := public.clerk_user_id();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = bidder_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team % not found', bidder_team_id;
  END IF;

  IF v_team.owner_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Only the team owner can place bids for this team'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_auction FROM auctions WHERE id = auction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction % not found', auction_id;
  END IF;

  IF v_auction.status != 'active' THEN
    RAISE EXCEPTION 'Auction is not active';
  END IF;

  IF bid_amount <= v_auction.current_bid THEN
    RAISE EXCEPTION 'Bid must be higher than current bid of %', v_auction.current_bid;
  END IF;

  IF v_team.budget_remaining < bid_amount THEN
    RAISE EXCEPTION 'Insufficient budget: % < %', v_team.budget_remaining, bid_amount;
  END IF;

  UPDATE auctions
     SET current_bid    = bid_amount,
         current_bidder = bidder_team_id::TEXT,
         updated_at     = NOW()
   WHERE id = auction_id;

  INSERT INTO bid_history (auction_id, draft_id, team_id, team_name, bid_amount)
  VALUES (auction_id, v_auction.draft_id, bidder_team_id, v_team.name, bid_amount);
END;
$$;

COMMENT ON FUNCTION place_bid(UUID, UUID, INTEGER) IS
  'Place a bid in an auction. Caller (clerk_user_id()) must own the '
  'bidder_team_id. Atomic: row-locks the auction before validating bid '
  'amount.';

GRANT EXECUTE ON FUNCTION place_bid(UUID, UUID, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION place_bid(UUID, UUID, INTEGER) FROM anon;

-- =====================================================================
-- 4. execute_trade: bind to team owners or commissioner
-- =====================================================================

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
  v_commissioner TEXT;
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

  -- League commissioner is stored in leagues.settings->>'commissionerId'
  SELECT (settings->>'commissionerId') INTO v_commissioner
    FROM leagues WHERE id = v_trade.league_id;

  IF v_caller IS DISTINCT FROM v_team_a.owner_id
     AND v_caller IS DISTINCT FROM v_team_b.owner_id
     AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Only a team owner or the commissioner can execute this trade'
      USING ERRCODE = '42501';
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

COMMENT ON FUNCTION execute_trade(UUID) IS
  'Execute an accepted trade atomically. Caller must own one of the two '
  'teams or be the league commissioner.';

GRANT EXECUTE ON FUNCTION execute_trade(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION execute_trade(UUID) FROM anon;

-- =====================================================================
-- 5. undo_last_pick: bind to team owner or draft host
-- =====================================================================

CREATE OR REPLACE FUNCTION undo_last_pick(
  p_draft_id UUID,
  p_team_id  UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller     TEXT;
  v_draft      RECORD;
  v_team       RECORD;
  v_last_pick  RECORD;
  v_action     RECORD;
  v_is_host    BOOLEAN;
BEGIN
  v_caller := public.clerk_user_id();

  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id AND draft_id = p_draft_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found in this draft');
  END IF;

  -- Caller must own the team OR be the draft host (participant.is_host).
  v_is_host := EXISTS (
    SELECT 1 FROM participants
     WHERE draft_id = p_draft_id
       AND user_id  = v_caller
       AND is_host  = TRUE
  );

  IF v_team.owner_id IS DISTINCT FROM v_caller AND NOT v_is_host THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Only the team owner or draft host can undo this team''s last pick'
    );
  END IF;

  -- Find this team's most recent pick
  SELECT * INTO v_last_pick
    FROM picks
   WHERE draft_id = p_draft_id AND team_id = p_team_id
   ORDER BY pick_order DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No picks to undo for this team');
  END IF;

  -- Refund budget
  UPDATE teams
     SET budget_remaining = budget_remaining + v_last_pick.cost,
         undos_remaining  = GREATEST(undos_remaining - 1, 0)
   WHERE id = p_team_id;

  -- Delete the pick
  DELETE FROM picks WHERE id = v_last_pick.id;

  -- Roll the draft turn back by 1 (clamped to 1)
  UPDATE drafts
     SET current_turn = GREATEST(current_turn - 1, 1),
         updated_at   = NOW()
   WHERE id = p_draft_id;

  -- Best-effort audit log (only if the draft_actions table exists)
  BEGIN
    INSERT INTO draft_actions (draft_id, action_type, action_data)
    VALUES (
      p_draft_id,
      'pick_undone',
      jsonb_build_object(
        'team_id',      p_team_id,
        'pokemon_id',   v_last_pick.pokemon_id,
        'pokemon_name', v_last_pick.pokemon_name,
        'cost',         v_last_pick.cost,
        'undone_by',    v_caller
      )
    );
  EXCEPTION WHEN undefined_table THEN
    -- draft_actions table does not exist in this environment — skip.
    NULL;
  END;

  RETURN jsonb_build_object(
    'success',     true,
    'undone_pick', jsonb_build_object(
      'id',           v_last_pick.id,
      'pokemon_id',   v_last_pick.pokemon_id,
      'pokemon_name', v_last_pick.pokemon_name,
      'cost',         v_last_pick.cost
    )
  );
END;
$$;

COMMENT ON FUNCTION undo_last_pick(UUID, UUID) IS
  'Undo the most recent pick made by p_team_id in p_draft_id. Caller must '
  'own the team or be the draft host.';

GRANT EXECUTE ON FUNCTION undo_last_pick(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION undo_last_pick(UUID, UUID) FROM anon;

-- =====================================================================
-- 6. Wishlist privacy: drop the `OR auth.uid() IS NULL` escape branches
-- =====================================================================

DROP POLICY IF EXISTS wishlist_items_select ON public.wishlist_items;
DROP POLICY IF EXISTS wishlist_items_select_owner ON public.wishlist_items;
DROP POLICY IF EXISTS wishlist_items_update ON public.wishlist_items;
DROP POLICY IF EXISTS wishlist_items_update_owner ON public.wishlist_items;
DROP POLICY IF EXISTS wishlist_items_delete ON public.wishlist_items;
DROP POLICY IF EXISTS wishlist_items_delete_owner ON public.wishlist_items;

CREATE POLICY wishlist_items_select_owner ON public.wishlist_items
  FOR SELECT
  USING (
    -- The participant_id row must belong to the calling Clerk user.
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlist_items.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  );

CREATE POLICY wishlist_items_update_owner ON public.wishlist_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlist_items.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlist_items.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  );

CREATE POLICY wishlist_items_delete_owner ON public.wishlist_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlist_items.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  );

COMMENT ON TABLE public.wishlist_items IS
  'Private per-participant priority queue. Owner-only RLS — neither anon '
  'nor cross-tenant authenticated reads are allowed.';

-- =====================================================================
-- 7. Record migration in tracking table
-- =====================================================================

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '019_sec_p1_rpc_authz_and_wishlist_privacy',
  'JWT-bind place_bid/execute_trade/undo_last_pick to clerk_user_id(); '
  'lock down is_admin/is_host columns on user_profiles + participants; '
  'drop anon escape from wishlist_items policies.',
  'See migration file. Reverting is non-trivial — restore prior RPC '
  'definitions from PRODUCTION_MIGRATION.sql and re-grant column UPDATEs.'
) ON CONFLICT (name) DO NOTHING;
