-- Migration: TIER-0 — whoami() probe for the Clerk -> Supabase JWT bridge
-- Date: 2026-07-05
--
-- The entire write-authorization model (every RLS policy and the *_pick / bid /
-- trade RPCs) depends on `public.clerk_user_id()` resolving the caller's Clerk
-- `sub` from the forwarded JWT. If the Clerk "supabase" JWT template is ever
-- misconfigured or the shared secret rotates, that silently returns NULL and
-- the security posture changes. There was no way to detect this at runtime.
--
-- whoami() simply returns clerk_user_id() so an authenticated request can assert
-- the bridge is live. /api/health/bridge calls it and compares the result to the
-- Clerk userId, alerting (Sentry) if they diverge.
--
-- Idempotent — safe to re-run.

CREATE OR REPLACE FUNCTION public.whoami()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.clerk_user_id();
$$;

COMMENT ON FUNCTION public.whoami() IS
  'Returns clerk_user_id() for the calling JWT. Health-probe only — lets '
  '/api/health/bridge verify the Clerk -> Supabase JWT bridge is live.';

GRANT EXECUTE ON FUNCTION public.whoami() TO authenticated, anon;

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '023_whoami_bridge_probe',
  'Add whoami() returning clerk_user_id() for the JWT-bridge health probe.',
  'DROP FUNCTION IF EXISTS public.whoami();'
) ON CONFLICT (name) DO NOTHING;
