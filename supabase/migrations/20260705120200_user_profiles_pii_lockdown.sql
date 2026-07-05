-- Migration: TIER-1 (1.5) — stop user_profiles from leaking email to anyone
-- Date: 2026-07-05
--
-- Issue: user_profiles has `SELECT USING (true)` (world-readable, intentional
-- so display names show for every team owner) and the table carries an `email`
-- column. In the legacy Supabase-auth era a trigger populated email from
-- auth.users; anyone with the public anon key could `SELECT email FROM
-- user_profiles` and harvest addresses for every user.
--
-- Reality check performed before writing this migration:
--   * No client code reads other users' profile.email — cross-user reads only
--     ever SELECT display_name (draft-service team-owner lookups). Every
--     `user.email` read in the app is the caller's OWN Clerk user object.
--   * The settings upsert never writes email. Clerk is the source of truth for
--     email; the column is redundant.
--
-- Fix (non-breaking): null out existing email values and revoke client writes
-- to the column so it can never be repopulated from the browser. `SELECT *`
-- from own-profile pages keeps working (email just returns NULL). RLS is
-- row-level and cannot hide a single column, so removing the DATA + blocking
-- writes is the clean, non-breaking way to close the exposure.
--
-- Idempotent — safe to re-run.

-- 1. Remove the PII currently sitting in the column.
UPDATE public.user_profiles SET email = NULL WHERE email IS NOT NULL;

-- 2. Block the column from ever being written from anon/authenticated clients.
--    (A future server route using the service role may still set it if needed.)
REVOKE INSERT (email), UPDATE (email) ON public.user_profiles FROM anon, authenticated;

COMMENT ON COLUMN public.user_profiles.email IS
  'DEPRECATED / always NULL. Email is owned by Clerk — never stored here. '
  'Client writes to this column are revoked; kept only for schema/type '
  'compatibility. Do not surface to other users (world-readable table).';

-- Note: `preferences` and `stats` (jsonb) are also world-readable and remain so.
-- They are not written by the current client and are expected to be NULL. If
-- either ever holds sensitive data, give it the same treatment or move reads to
-- a service-role route (see roadmap 3.3 / MEDIUM-2 for the fuller lockdown).

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '022_user_profiles_pii_lockdown',
  'Null out user_profiles.email and revoke client INSERT/UPDATE on the column '
  'to close world-readable email exposure. Clerk owns email.',
  'GRANT INSERT (email), UPDATE (email) ON public.user_profiles TO anon, authenticated;'
) ON CONFLICT (name) DO NOTHING;
