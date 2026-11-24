-- Migration 024: safe closures from the vibe-security audit
-- These are the deltas with zero or near-zero blast radius:
--   * REVOKE SELECT on drafts.password — server uses service role for /api/draft/verify-password.
--   * Drop dead-code legacy drafts policies that reference auth.uid() (always NULL under Clerk).
--   * Lock the `wishlists` parent table the same way sec-p1 locked `wishlist_items` — clearly the original intent.
--   * Patch undo_last_pick to reject when undos_remaining <= 0 (prevents unlimited undo).

-- 1. Hide bcrypt password hash from client reads
REVOKE SELECT (password) ON public.drafts FROM anon;
REVOKE SELECT (password) ON public.drafts FROM authenticated;

COMMENT ON COLUMN public.drafts.password IS
  'bcrypt hash of the draft join password. NEVER returned to the client — only readable by the service role. Use /api/draft/verify-password for password checks.';

-- 2. Drop dead-code legacy drafts policies
-- "Hosts can update their drafts" uses auth.uid() (no IS NULL escape) — for Clerk users
-- auth.uid() is NULL, so host_id = NULL evaluates NULL → policy denies. Dead code.
-- "Users can view drafts they are in" same dead-code pattern; drafts_select USING(true) already grants reads.
DROP POLICY IF EXISTS "Hosts can update their drafts"      ON public.drafts;
DROP POLICY IF EXISTS "Users can view drafts they are in"  ON public.drafts;

-- 3. Lock down `wishlists` parent table — mirrors sec-p1 wishlist_items policy shape
DROP POLICY IF EXISTS wishlists_select        ON public.wishlists;
DROP POLICY IF EXISTS wishlists_select_owner  ON public.wishlists;
DROP POLICY IF EXISTS wishlists_insert        ON public.wishlists;
DROP POLICY IF EXISTS wishlists_insert_owner  ON public.wishlists;
DROP POLICY IF EXISTS wishlists_update        ON public.wishlists;
DROP POLICY IF EXISTS wishlists_update_owner  ON public.wishlists;
DROP POLICY IF EXISTS wishlists_delete        ON public.wishlists;
DROP POLICY IF EXISTS wishlists_delete_owner  ON public.wishlists;

CREATE POLICY wishlists_select_owner ON public.wishlists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlists.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  );

CREATE POLICY wishlists_insert_owner ON public.wishlists
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlists.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  );

CREATE POLICY wishlists_update_owner ON public.wishlists
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlists.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlists.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  );

CREATE POLICY wishlists_delete_owner ON public.wishlists
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlists.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  );

COMMENT ON TABLE public.wishlists IS
  'Per-participant wishlist parent. Owner-only RLS — neither anon nor cross-tenant authenticated reads/writes are allowed.';

-- 4. Patch undo_last_pick: reject when no undos remain (CR finding)
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

  -- NEW: reject when team has exhausted its undo allowance
  IF COALESCE(v_team.undos_remaining, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'No undos remaining for this team'
    );
  END IF;

  SELECT * INTO v_last_pick
    FROM picks
   WHERE draft_id = p_draft_id AND team_id = p_team_id
   ORDER BY pick_order DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No picks to undo for this team');
  END IF;

  UPDATE teams
     SET budget_remaining = budget_remaining + v_last_pick.cost,
         undos_remaining  = undos_remaining - 1
   WHERE id = p_team_id;

  DELETE FROM picks WHERE id = v_last_pick.id;

  UPDATE drafts
     SET current_turn = GREATEST(current_turn - 1, 1),
         updated_at   = NOW()
   WHERE id = p_draft_id;

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
  'Undo the most recent pick made by p_team_id in p_draft_id. Caller must own the team or be the draft host. Rejects when undos_remaining <= 0.';

GRANT EXECUTE ON FUNCTION undo_last_pick(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION undo_last_pick(UUID, UUID) FROM anon;

-- Record migration
INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '024_sec_p1_safe_closures',
  'Safe-subset follow-ups to sec-p1: revoke SELECT on drafts.password from anon/authenticated; drop dead-code legacy drafts policies; lock the wishlists parent table to clerk_user_id() (mirroring wishlist_items); patch undo_last_pick to reject when undos_remaining <= 0.',
  'GRANT SELECT (password) ON public.drafts TO anon, authenticated; -- revert wishlists/undo_last_pick from PRODUCTION_MIGRATION.sql'
) ON CONFLICT (name) DO NOTHING;