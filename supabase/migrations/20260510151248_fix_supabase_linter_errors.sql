-- Migration: Fix Supabase database linter errors (security)
-- ============================================================
-- Resolves the following lint findings reported by the Supabase linter:
--
--   1× policy_exists_rls_disabled  → public.bids
--   6× security_definer_view       → active_public_drafts, user_league_history,
--                                    trade_history, migration_status,
--                                    draft_history, user_draft_summary
--   2× rls_disabled_in_public      → public._migrations, public.bids
--
-- Run in Supabase SQL editor.
-- Idempotent: safe to re-run.

-- ----------------------------------------------------------------
-- 1. Enable RLS on `public.bids`
--    The table already has policies (`bids_select`, `bids_insert`) defined
--    in fix-rls-policies.sql, but RLS itself was never turned on, so the
--    policies were dormant and the table was effectively wide open.
-- ----------------------------------------------------------------
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

-- Make sure both core policies exist (re-create idempotently). The
-- previous setup mirrors auctions: any participant can read, any
-- participant can insert. If your app needs tighter rules, replace
-- USING/WITH CHECK with auth-aware predicates.
DROP POLICY IF EXISTS "bids_select" ON public.bids;
DROP POLICY IF EXISTS "bids_insert" ON public.bids;
DROP POLICY IF EXISTS "bids_update" ON public.bids;
DROP POLICY IF EXISTS "bids_delete" ON public.bids;

CREATE POLICY "bids_select" ON public.bids
  FOR SELECT USING (true);
CREATE POLICY "bids_insert" ON public.bids
  FOR INSERT WITH CHECK (true);
-- Bids are append-only by convention — only the bidder or service role
-- should ever update/delete. Block both at the table level.
CREATE POLICY "bids_update_block" ON public.bids
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "bids_delete_block" ON public.bids
  FOR DELETE USING (false);

-- ----------------------------------------------------------------
-- 2. Enable RLS on `public._migrations`
--    Internal migration tracker. No policies → all access denied to
--    anon/authenticated. The service role bypasses RLS, so migrations
--    keep working from the dashboard or admin tooling.
-- ----------------------------------------------------------------
ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;

-- Defensive: drop any inherited permissive policies from earlier setups
DROP POLICY IF EXISTS "_migrations_select" ON public._migrations;
DROP POLICY IF EXISTS "_migrations_all"    ON public._migrations;

-- Explicit deny for anon/authenticated (service_role still bypasses RLS)
CREATE POLICY "_migrations_no_public_access"
  ON public._migrations
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Belt-and-braces: revoke direct table privileges from the public roles
REVOKE ALL ON public._migrations FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 3. Switch SECURITY DEFINER views to SECURITY INVOKER
--    Supabase Postgres 15+ supports `ALTER VIEW ... SET (security_invoker = on)`
--    which preserves the view definition while making it enforce the
--    *querying* user's permissions and RLS instead of the creator's.
--
--    Each ALTER is wrapped in a DO block that no-ops if the view is
--    missing (defensive — projects diverge over time).
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'active_public_drafts',
    'user_league_history',
    'trade_history',
    'migration_status',
    'draft_history',
    'user_draft_summary'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_views
      WHERE schemaname = 'public' AND viewname = v_name
    ) THEN
      EXECUTE format(
        'ALTER VIEW public.%I SET (security_invoker = on)',
        v_name
      );
      RAISE NOTICE 'security_invoker enabled on public.%', v_name;
    ELSE
      RAISE NOTICE 'view public.% does not exist — skipped', v_name;
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------
-- 4. Verify (informational — output appears in SQL editor messages)
-- ----------------------------------------------------------------
DO $$
DECLARE
  rls_off_count int;
  definer_count int;
BEGIN
  -- Tables in public with RLS still disabled
  SELECT count(*) INTO rls_off_count
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = (t.schemaname || '.' || t.tablename)::regclass
        AND c.relrowsecurity = true
    );

  -- Views still marked SECURITY DEFINER (i.e. security_invoker not set)
  SELECT count(*) INTO definer_count
  FROM pg_views v
  WHERE v.schemaname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = (v.schemaname || '.' || v.viewname)::regclass
        AND 'security_invoker=on' = ANY(c.reloptions)
    )
    AND v.viewname IN (
      'active_public_drafts','user_league_history','trade_history',
      'migration_status','draft_history','user_draft_summary'
    );

  RAISE NOTICE 'Public tables still without RLS: %', rls_off_count;
  RAISE NOTICE 'Targeted views still without security_invoker: %', definer_count;
END $$;
