-- Migration: Fix `rls_enabled_no_policy` linter findings (INFO)
-- ============================================================
-- 12 tables have RLS enabled but no policies, which means they're
-- effectively locked to anon/authenticated (only service_role can
-- read or write). The lint wants explicit policies so the intent is
-- documented in the catalog.
--
-- Two groups:
--
--   A. Tables actually used by this app:
--        - weekly_highlights
--        - weekly_summaries
--      These had `allow_all_*` policies that were dropped by the
--      previous warnings migration. Re-add the access this app expects:
--      public SELECT (league stats are visible to participants/spectators),
--      service-role-only writes (rows are computed server-side).
--
--   B. Orphan tables (not referenced anywhere in src/):
--        album_shares, albums, comments, followers, follows,
--        level_requirements, likes, photos, user_levels, users
--      These appear to be from a previous Supabase project sharing this
--      database. Adding an explicit deny-all policy for anon+authenticated
--      makes the locked-down behavior explicit (and silences the linter)
--      without changing actual access — service_role bypasses RLS, so any
--      legitimate consumer keeps working.
--
-- Run in Supabase SQL editor. Idempotent.

-- ----------------------------------------------------------------
-- A. Tables this app uses — public read, service-role-only write
-- ----------------------------------------------------------------

-- weekly_highlights ----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'weekly_highlights') THEN
    DROP POLICY IF EXISTS "weekly_highlights_select" ON public.weekly_highlights;
    DROP POLICY IF EXISTS "weekly_highlights_no_write" ON public.weekly_highlights;

    -- Anyone can read (these are public season-recap stats)
    CREATE POLICY "weekly_highlights_select"
      ON public.weekly_highlights
      FOR SELECT
      USING (true);

    -- Block client writes — rows are inserted by the league lifecycle
    -- job which runs as service_role (bypasses RLS).
    CREATE POLICY "weekly_highlights_no_write"
      ON public.weekly_highlights
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- weekly_summaries -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'weekly_summaries') THEN
    DROP POLICY IF EXISTS "weekly_summaries_select" ON public.weekly_summaries;
    DROP POLICY IF EXISTS "weekly_summaries_no_write" ON public.weekly_summaries;

    CREATE POLICY "weekly_summaries_select"
      ON public.weekly_summaries
      FOR SELECT
      USING (true);

    CREATE POLICY "weekly_summaries_no_write"
      ON public.weekly_summaries
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- ----------------------------------------------------------------
-- B. Orphan tables — explicit deny-all for anon/authenticated
-- ----------------------------------------------------------------
-- These tables aren't referenced by this app's source. Adding a deny
-- policy documents the lockdown explicitly. service_role bypasses RLS
-- by design, so any external/legacy consumer with admin credentials
-- keeps working.
DO $$
DECLARE
  t text;
  orphan_tables text[] := ARRAY[
    'album_shares',
    'albums',
    'comments',
    'followers',
    'follows',
    'level_requirements',
    'likes',
    'photos',
    'user_levels',
    'users'
  ];
  policy_name text;
BEGIN
  FOREACH t IN ARRAY orphan_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t
    ) THEN
      RAISE NOTICE '  table public.% does not exist — skipped', t;
      CONTINUE;
    END IF;

    policy_name := format('%s_deny_public', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      policy_name, t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR ALL
         TO anon, authenticated
         USING (false)
         WITH CHECK (false)',
      policy_name, t
    );

    -- Belt-and-braces: revoke direct table privileges as well.
    -- Some Supabase setups grant blanket SELECT to anon; this removes that.
    EXECUTE format(
      'REVOKE ALL ON public.%I FROM anon, authenticated',
      t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------
-- Verification
-- ----------------------------------------------------------------
DO $$
DECLARE
  pending int;
BEGIN
  SELECT count(*) INTO pending
  FROM pg_tables t
  JOIN pg_class c ON c.oid = (t.schemaname || '.' || t.tablename)::regclass
  WHERE t.schemaname = 'public'
    AND c.relrowsecurity = true
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = t.schemaname
        AND p.tablename = t.tablename
    );

  RAISE NOTICE 'Tables with RLS enabled but no policies remaining: %', pending;
END $$;
