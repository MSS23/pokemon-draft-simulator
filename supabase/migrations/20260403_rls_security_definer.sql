-- Phase 25: SUPA-05 — Security-definer RLS helper functions
-- Wraps auth checks in SECURITY DEFINER functions so the policy body
-- executes once per query (not once per subscriber).
--
-- CRITICAL: Never use auth.uid() — it returns NULL for Clerk string user IDs.
-- Always use auth.jwt() ->> 'sub' to get the Clerk user ID from JWT sub claim.

-- ============================================================
-- Helper: Get the current user's ID from the Clerk JWT sub claim
-- SECURITY DEFINER so it runs as the function owner, cached per transaction
-- ============================================================
CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'sub',
    current_setting('request.jwt.claims', true)::json ->> 'sub'
  )
$$;

-- Grant execute to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.requesting_user_id() TO authenticated, anon;

-- ============================================================
-- Helper: Check if current user is a participant in a given draft
-- Used in SELECT policies for picks, teams to allow spectators
-- DRAFT-SCOPED (not user-scoped) so spectators can see all picks
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_draft_accessible(p_draft_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drafts
    WHERE id = p_draft_id
      AND deleted_at IS NULL
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_draft_accessible(uuid) TO authenticated, anon;

-- ============================================================
-- Helper: Check if current user is the host of a draft
-- Used in INSERT/UPDATE/DELETE policies for admin operations
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_draft_host(p_draft_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drafts
    WHERE id = p_draft_id
      AND host_id = public.requesting_user_id()
      AND deleted_at IS NULL
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_draft_host(uuid) TO authenticated, anon;

-- ============================================================
-- Helper: Check if current user owns a specific team
-- Used in INSERT policies for picks (can only pick for your own team)
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_owns_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id
      AND user_id = public.requesting_user_id()
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_team(uuid) TO authenticated, anon;

-- ============================================================
-- NOTE: RLS policy updates
-- The executor should check existing policies with:
--   SELECT policyname, cmd, qual FROM pg_policies WHERE tablename IN ('picks','teams','participants','auctions','wishlist_items');
-- Then update policies that use inline auth checks to use these functions instead.
-- Key policy pattern to replace:
--   OLD: USING (auth.uid() = host_id)       -- BROKEN: returns NULL for Clerk
--   NEW: USING (public.is_draft_host(draft_id))  -- CORRECT: uses JWT sub
--
-- picks SELECT: keep DRAFT-SCOPED, not user-scoped
--   USING (public.is_draft_accessible(draft_id))
--
-- wishlist_items SELECT: keep USER-SCOPED (private per-user)
--   USING (participant_id = public.requesting_user_id())
-- ============================================================

-- Audit query: find all policies still using the broken auth.uid() pattern
-- Run this in Supabase SQL editor after applying this migration:
--
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
-- ORDER BY tablename;
--
-- For each policy returned, update it to use public.requesting_user_id()
-- instead of auth.uid().

-- Example policy update for picks SELECT (replace if exists):
-- DROP POLICY IF EXISTS "picks_select" ON public.picks;
-- CREATE POLICY "picks_select" ON public.picks
--   FOR SELECT USING (public.is_draft_accessible(draft_id));
