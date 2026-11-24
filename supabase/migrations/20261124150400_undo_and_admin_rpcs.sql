-- 040: undo_last_pick rewrite and host-checked admin promote/demote
-- Audit B-19, the undo part of B-02, handoff K (promote/demote).
--
-- B-19  Live undo_last_pick(uuid,uuid) always failed: its draft_actions insert
--       omitted performed_by (NOT NULL) and used action_type 'pick_undone'
--       (CHECK allows pick/bid/auction_win/undo). Its turn logic was also
--       wrong. The rewrite:
--         * locks the draft; snake drafts only; status active/completed/paused;
--           drafts.allow_undos must be true
--         * undoes the DRAFT's latest pick (round > 0, so waiver rows are
--           never touched) and requires it to belong to p_team_id
--         * host = drafts.host_id = clerk_user_id() (not participants.is_host,
--           B-02); a host undo is free, an owner undo costs one of the team's
--           undos_remaining
--         * refunds only points drafts; restores current_turn = the pick's
--           pick_order and recomputes current_round; status 'active';
--           turn_started_at = NOW() so the tick does not instantly skip
--         * logs draft_actions with performed_by.
--       The broken legacy 3-arg overload is dropped.
-- K     Live promote_to_admin/demote_from_admin(uuid, text) had no caller
--       check and no authenticated grant, so the admin UI was broken. They now
--       require the draft host and are granted to authenticated. The unused
--       3-arg overloads are dropped. Signatures match src/lib/admin-service.ts.
-- Idempotent.

DROP FUNCTION IF EXISTS public.undo_last_pick(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.undo_last_pick(p_draft_id uuid, p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller     TEXT := public.clerk_user_id();
  v_draft      RECORD;
  v_team       RECORD;
  v_last_pick  RECORD;
  v_is_host    BOOLEAN;
  v_total      INTEGER;
  v_refund     INTEGER := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 1));
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
  END IF;
  IF v_draft.format <> 'snake' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Undo is only available in snake drafts');
  END IF;
  IF v_draft.status NOT IN ('active', 'completed', 'paused') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft has not started');
  END IF;
  IF NOT COALESCE(v_draft.allow_undos, true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Undos are disabled for this draft');
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id AND draft_id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found in this draft');
  END IF;

  v_is_host := v_draft.host_id = v_caller;
  IF v_team.owner_id IS DISTINCT FROM v_caller AND NOT v_is_host THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Only the team owner or draft host can undo this team''s last pick');
  END IF;
  IF NOT v_is_host AND COALESCE(v_team.undos_remaining, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No undos remaining for this team');
  END IF;

  SELECT * INTO v_last_pick
    FROM picks
   WHERE draft_id = p_draft_id AND round > 0
   ORDER BY pick_order DESC, created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No picks to undo');
  END IF;
  IF v_last_pick.team_id IS DISTINCT FROM p_team_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the most recent pick in the draft can be undone');
  END IF;

  IF COALESCE(v_draft.settings->>'scoringSystem', '') <> 'tiered' THEN
    v_refund := v_last_pick.cost;
  END IF;

  UPDATE teams
     SET budget_remaining = budget_remaining + v_refund,
         undos_remaining  = CASE WHEN v_is_host THEN undos_remaining ELSE undos_remaining - 1 END,
         updated_at       = NOW()
   WHERE id = p_team_id;

  DELETE FROM picks WHERE id = v_last_pick.id;

  SELECT COUNT(*) INTO v_total FROM teams WHERE draft_id = p_draft_id;
  UPDATE drafts
     SET current_turn    = v_last_pick.pick_order,
         current_round   = ((v_last_pick.pick_order - 1) / GREATEST(v_total, 1)) + 1,
         status          = 'active',
         turn_started_at = NOW(),
         updated_at      = NOW()
   WHERE id = p_draft_id;

  INSERT INTO draft_actions (draft_id, team_id, action_type, action_data, performed_by)
  VALUES (
    p_draft_id, p_team_id, 'undo',
    jsonb_build_object(
      'pick_id',      v_last_pick.id,
      'pokemon_id',   v_last_pick.pokemon_id,
      'pokemon_name', v_last_pick.pokemon_name,
      'cost',         v_last_pick.cost,
      'refund',       v_refund,
      'pick_order',   v_last_pick.pick_order,
      'by_host',      v_is_host
    ),
    v_caller
  );

  RETURN jsonb_build_object(
    'success',     true,
    'undone_pick', jsonb_build_object(
      'id',           v_last_pick.id,
      'pokemon_id',   v_last_pick.pokemon_id,
      'pokemon_name', v_last_pick.pokemon_name,
      'cost',         v_last_pick.cost
    ),
    'newTurn', v_last_pick.pick_order
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_last_pick(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_last_pick(uuid, uuid) TO authenticated, service_role;

-- Admin promote/demote -------------------------------------------------------
DROP FUNCTION IF EXISTS public.promote_to_admin(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.demote_from_admin(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.promote_to_admin(p_draft_id uuid, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.clerk_user_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM drafts WHERE id = p_draft_id AND host_id = public.clerk_user_id()
  ) THEN
    RAISE EXCEPTION 'Only the draft host can promote admins' USING ERRCODE = '42501';
  END IF;

  UPDATE participants
  SET is_admin = TRUE
  WHERE draft_id = p_draft_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant with user_id % not found in draft %', p_user_id, p_draft_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.demote_from_admin(p_draft_id uuid, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.clerk_user_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM drafts WHERE id = p_draft_id AND host_id = public.clerk_user_id()
  ) THEN
    RAISE EXCEPTION 'Only the draft host can demote admins' USING ERRCODE = '42501';
  END IF;

  UPDATE participants
  SET is_admin = FALSE
  WHERE draft_id = p_draft_id AND user_id = p_user_id AND is_host = FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_to_admin(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.demote_from_admin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_to_admin(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demote_from_admin(uuid, text) TO authenticated, service_role;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '040_undo_and_admin_rpcs',
  'Rewrite undo_last_pick (draft-latest pick, host via drafts.host_id, correct turn/round, tiered no refund, performed_by logged), drop 3-arg overload; host-checked promote_to_admin/demote_from_admin(uuid,text) granted to authenticated, drop 3-arg overloads.',
  'Re-apply undo_last_pick and promote/demote from 20260510174552 / 20260510163222;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '040_undo_and_admin_rpcs'
);
