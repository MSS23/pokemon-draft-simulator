-- Migration: 027_anon_select_public_drafts
-- Date: 2026-05-10
--
-- BUG FIX: /watch-drafts and /lobby returned `permission denied for table
-- drafts (PG 42501)` for anon (signed-out) visitors.
--
-- ROOT CAUSE: Two layered issues —
--   1. anon and authenticated had NO `SELECT` privilege on public.drafts at
--      the table-grant level (verified via information_schema.role_table_grants).
--      RLS policies only run after table grants, so even the existing
--      `drafts_select USING(true)` policy was silently neutralized.
--   2. The legacy `drafts_select USING(true)` policy is overly broad — it
--      would expose private and soft-deleted drafts the moment SELECT is
--      granted. So we drop it before granting.
--
-- FIX:
--   • Drop legacy `drafts_select USING(true)`.
--   • Add `drafts_select_public_for_discovery` — anon + authenticated may
--     read drafts that are explicitly is_public=true AND not soft-deleted.
--     This is what /watch-drafts and /lobby need.
--   • Add `drafts_select_own_or_host` — authenticated users may read drafts
--     where they are the host_id (matches Clerk user_id via clerk_user_id()).
--     This preserves dashboard access to a user's own drafts even when the
--     draft is private.
--   • Add `drafts_select_participant` — authenticated users may read drafts
--     they are a participant in (so /draft/[id] keeps working for invitees
--     of private drafts).
--   • GRANT SELECT on public.drafts to anon and authenticated.
--
-- The existing "Admins can view all drafts including deleted" policy is
-- left intact — admins still see soft-deleted rows.
--
-- Idempotent — safe to re-run.

-- =====================================================================
-- 1. Drop the over-permissive legacy SELECT policy
-- =====================================================================

DROP POLICY IF EXISTS drafts_select ON public.drafts;
DROP POLICY IF EXISTS "drafts_select" ON public.drafts;

-- =====================================================================
-- 2. Public discovery policy — anon + authenticated, public+not-deleted
-- =====================================================================

DROP POLICY IF EXISTS drafts_select_public_for_discovery ON public.drafts;

CREATE POLICY drafts_select_public_for_discovery ON public.drafts
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true AND deleted_at IS NULL);

COMMENT ON POLICY drafts_select_public_for_discovery ON public.drafts IS
  'Permits anon and authenticated to SELECT drafts that are explicitly '
  'public (is_public=true) and not soft-deleted (deleted_at IS NULL). '
  'Required for /watch-drafts and /lobby to render for signed-out visitors.';

-- =====================================================================
-- 3. Owner/host policy — authenticated users see their own drafts
-- =====================================================================

DROP POLICY IF EXISTS drafts_select_own_or_host ON public.drafts;

CREATE POLICY drafts_select_own_or_host ON public.drafts
  FOR SELECT
  TO authenticated
  USING (
    host_id IS NOT NULL
    AND host_id = public.clerk_user_id()
    AND deleted_at IS NULL
  );

COMMENT ON POLICY drafts_select_own_or_host ON public.drafts IS
  'Permits the draft host (host_id matches Clerk JWT sub) to read their own '
  'drafts even when is_public=false. Required for the dashboard to show a '
  'user''s private drafts.';

-- =====================================================================
-- 4. Participant policy — authenticated users see drafts they joined
-- =====================================================================

DROP POLICY IF EXISTS drafts_select_participant ON public.drafts;

CREATE POLICY drafts_select_participant ON public.drafts
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.participants p
       WHERE p.draft_id = drafts.id
         AND p.user_id  = public.clerk_user_id()
    )
  );

COMMENT ON POLICY drafts_select_participant ON public.drafts IS
  'Permits authenticated participants to read private drafts they have '
  'joined (matches via participants.user_id = clerk_user_id()). Required '
  'so invitees can open /draft/[id] for private drafts.';

-- =====================================================================
-- 5. Grant SELECT to anon and authenticated
--    (table-level grant was missing — RLS alone is not sufficient)
-- =====================================================================

GRANT SELECT ON public.drafts TO anon;
GRANT SELECT ON public.drafts TO authenticated;

-- =====================================================================
-- 6. Record migration in tracking table
-- =====================================================================

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '027_anon_select_public_drafts',
  'Grants SELECT on public.drafts to anon+authenticated and replaces the '
  'over-permissive drafts_select USING(true) policy with three narrower '
  'policies: public-discovery (anon+authenticated, is_public+not-deleted), '
  'own_or_host (authenticated host_id match), and participant (authenticated '
  'participants of private drafts). Fixes 42501 errors on /watch-drafts and '
  '/lobby for signed-out visitors.',
  $rollback$
DROP POLICY IF EXISTS drafts_select_public_for_discovery ON public.drafts;
DROP POLICY IF EXISTS drafts_select_own_or_host ON public.drafts;
DROP POLICY IF EXISTS drafts_select_participant ON public.drafts;
REVOKE SELECT ON public.drafts FROM anon;
REVOKE SELECT ON public.drafts FROM authenticated;
CREATE POLICY drafts_select ON public.drafts FOR SELECT USING (true);
$rollback$
) ON CONFLICT (name) DO NOTHING;