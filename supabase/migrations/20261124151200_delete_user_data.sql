-- 048: delete_user_data(p_user_id text) for account deletion (audit B-16,
-- handoff E-01)
--
-- /api/user/delete (bucket E) runs the wipe as separate service-role calls.
-- This RPC runs the same steps in one transaction, plus the user-linked
-- columns the route does not touch yet (chat_messages.sender_id/sender_name,
-- trade_approvals.approver_user_id, draft_actions.performed_by,
-- drafts.deleted_by, custom_formats.created_by_display_name).
-- Ids are replaced with the sentinel 'deleted-user', which can never be a
-- Clerk id, so host/owner RLS locks those rows. Drafts, teams and public
-- custom formats are anonymized, not deleted, so other users' drafts keep
-- their history and pick costs.
-- Service role only. Returns per-table row counts.
-- Idempotent.

CREATE OR REPLACE FUNCTION public.delete_user_data(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_deleted CONSTANT text := 'deleted-user';
  v_participant_ids uuid[];
  v_team_ids uuid[];
  v_out jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 OR p_user_id = c_deleted THEN
    RAISE EXCEPTION 'A user id is required';
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_participant_ids FROM participants WHERE user_id = p_user_id;
  SELECT COALESCE(array_agg(id), '{}') INTO v_team_ids FROM teams WHERE owner_id = p_user_id;

  UPDATE bid_history SET team_name = 'Deleted User' WHERE team_id = ANY (v_team_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('bid_history', v_n);

  UPDATE teams SET owner_id = c_deleted, name = 'Deleted User ' || left(id::text, 8),
                   coach_display_name = NULL, discord_handle = NULL
  WHERE id = ANY (v_team_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('teams', v_n);

  UPDATE drafts SET host_id = c_deleted WHERE host_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('drafts', v_n);
  UPDATE drafts SET deleted_by = c_deleted WHERE deleted_by = p_user_id;

  UPDATE trades SET commissioner_id = c_deleted WHERE commissioner_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('trades', v_n);

  UPDATE trade_approvals SET approver_user_id = c_deleted WHERE approver_user_id = p_user_id;
  UPDATE draft_actions SET performed_by = c_deleted WHERE performed_by = p_user_id;
  UPDATE chat_messages SET sender_id = c_deleted, sender_name = 'Deleted User' WHERE sender_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_messages', v_n);

  UPDATE custom_formats SET created_by_user_id = NULL, created_by_display_name = 'Deleted User'
  WHERE created_by_user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('custom_formats', v_n);

  DELETE FROM push_subscriptions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('push_subscriptions', v_n);
  DELETE FROM user_profiles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('user_profiles', v_n);

  DELETE FROM wishlist_items WHERE participant_id = ANY (v_participant_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('wishlist_items', v_n);
  DELETE FROM wishlists WHERE participant_id = ANY (v_participant_ids);
  DELETE FROM participants WHERE id = ANY (v_participant_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('participants', v_n);

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_user_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(text) TO service_role;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '048_delete_user_data',
  'Service-role delete_user_data(text): one-transaction account wipe/anonymization across participants, wishlists, profiles, push subscriptions, drafts, teams, trades, approvals, chat, draft_actions, custom formats.',
  'DROP FUNCTION public.delete_user_data(text);'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '048_delete_user_data'
);
