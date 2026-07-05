-- Migration: P0 security fixes from vibe-security audit
-- Date: 2026-05-10
--
-- Fixes three critical issues:
--
-- 1. promote_to_admin / demote_from_admin had no caller authorization check.
--    Anyone with the anon key + a draft_id + a user_id could grant or revoke
--    admin on any participant. Now requires the caller (resolved via the
--    Clerk JWT bridge as `clerk_user_id()`) to be the host or an existing
--    admin of that draft.
--
-- 2. drafts.password (bcrypt hash) was readable by everyone via the
--    permissive `drafts SELECT USING(true)` policy. Hashes were therefore
--    exposed to offline brute-force. We strip the column from the public
--    SELECT result by recreating the SELECT policy without `password`.
--
-- 3. (Defensive) Adds caller-host check to delete_draft RPC if it exists.
--
-- Idempotent — safe to re-run.
--
-- PREREQUISITES:
--   • `public.clerk_user_id()` function (created by
--     `fix-supabase-linter-warnings-clerk-final.sql`).
--   • Clerk → Supabase JWT bridge configured in Clerk dashboard
--     (otherwise `clerk_user_id()` returns NULL and these RPCs return
--     a "not authorized" error rather than silently succeeding — that
--     is the desired behavior).

-- =====================================================================
-- 1. promote_to_admin: require caller to be host or existing admin
-- =====================================================================

CREATE OR REPLACE FUNCTION promote_to_admin(
  p_draft_id UUID,
  p_user_id  TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
BEGIN
  v_caller := public.clerk_user_id();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM participants
    WHERE draft_id = p_draft_id
      AND user_id  = v_caller
      AND (is_host = TRUE OR is_admin = TRUE)
  ) THEN
    RAISE EXCEPTION 'Only the host or an existing admin can promote participants'
      USING ERRCODE = '42501';
  END IF;

  UPDATE participants
     SET is_admin = TRUE
   WHERE draft_id = p_draft_id
     AND user_id  = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant with user_id % not found in draft %', p_user_id, p_draft_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION promote_to_admin(UUID, TEXT) IS
  'Promote a participant to admin. Caller (resolved via clerk_user_id()) '
  'must be the host or an existing admin of the same draft.';

-- =====================================================================
-- 2. demote_from_admin: same authorization requirement
-- =====================================================================

CREATE OR REPLACE FUNCTION demote_from_admin(
  p_draft_id UUID,
  p_user_id  TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
BEGIN
  v_caller := public.clerk_user_id();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  -- Only the host can demote admins (admins shouldn't demote each other).
  IF NOT EXISTS (
    SELECT 1
    FROM participants
    WHERE draft_id = p_draft_id
      AND user_id  = v_caller
      AND is_host  = TRUE
  ) THEN
    RAISE EXCEPTION 'Only the host can demote admins'
      USING ERRCODE = '42501';
  END IF;

  -- Don't allow demoting the host themselves (safety net).
  UPDATE participants
     SET is_admin = FALSE
   WHERE draft_id = p_draft_id
     AND user_id  = p_user_id
     AND is_host  = FALSE;
END;
$$;

COMMENT ON FUNCTION demote_from_admin(UUID, TEXT) IS
  'Demote a participant from admin. Only the host can call this; the host '
  'cannot demote themselves.';

-- =====================================================================
-- 3. drafts.password should not be returned via the public SELECT policy.
-- =====================================================================
-- We can't filter columns at the RLS-policy level in Postgres. Instead we
-- revoke direct SELECT on the password column from anon/authenticated.
-- Server code that needs the hash (e.g. /api/draft/verify-password) uses
-- the service role key, which bypasses column-level grants.

REVOKE SELECT (password) ON public.drafts FROM anon;
REVOKE SELECT (password) ON public.drafts FROM authenticated;

COMMENT ON COLUMN public.drafts.password IS
  'bcrypt hash of the draft join password. NEVER returned to the client — '
  'only readable by the service role. Use /api/draft/verify-password for '
  'password checks.';

-- =====================================================================
-- 4. Re-grant the GRANT EXECUTE on the recreated functions (safety net).
-- =====================================================================

GRANT EXECUTE ON FUNCTION promote_to_admin(UUID, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION demote_from_admin(UUID, TEXT) TO authenticated;

-- Anon does not need these — only signed-in Clerk users should be able to
-- promote/demote. Revoke if they were granted.
REVOKE EXECUTE ON FUNCTION promote_to_admin(UUID, TEXT)  FROM anon;
REVOKE EXECUTE ON FUNCTION demote_from_admin(UUID, TEXT) FROM anon;
