-- Migration: Linter-warning cleanup with Clerk JWT bridge ACTIVE
-- ============================================================
-- This is the final, runnable Path 1 migration.  Run it AFTER:
--   1. Configuring the "supabase" JWT template in the Clerk dashboard
--      (HS256 signed with your Supabase JWT secret).
--   2. Deploying the updated `src/lib/supabase.ts` and the new
--      `src/lib/supabase-server.ts`.
--   3. Verifying the bridge works:
--        select auth.jwt() ->> 'sub'
--        from a signed-in client request — should return the Clerk user id.
--
-- If you run this BEFORE the Clerk JWT template + app code are deployed,
-- every signed-in user (and all guests) will be locked out of writes.
--
-- Idempotent.

-- ----------------------------------------------------------------
-- 1. Helper: clerk_user_id() reads the Clerk user id from the JWT.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clerk_user_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.jwt() ->> 'sub'
$$;

GRANT EXECUTE ON FUNCTION public.clerk_user_id() TO anon, authenticated;

COMMENT ON FUNCTION public.clerk_user_id() IS
  'Returns the Clerk user id from the bearer JWT, or NULL for anonymous '
  'requests (and for guest mode, which presents no JWT). Used in RLS '
  'predicates as a Clerk-aware replacement for auth.uid().';

-- ----------------------------------------------------------------
-- 2. Tighten `*_insert` policies — require any signed-in Clerk user
-- ----------------------------------------------------------------
-- Drops the `*_insert` policies that used `WITH CHECK (true)` and
-- replaces each with `WITH CHECK (clerk_user_id() IS NOT NULL)`.
--
-- Effect:
--   • Signed-in Clerk users can insert via direct PostgREST ✅
--   • Anonymous visitors cannot ✅
--   • Guest-mode users (no JWT) cannot insert directly ⚠️
--     → BUT the SECURITY DEFINER RPCs (make_draft_pick, place_bid, etc.)
--       still work because they bypass RLS. As long as guest writes go
--       through those RPCs, guest mode keeps working.
DO $$
DECLARE
  tbl text;
  insert_tables text[] := ARRAY[
    'auctions', 'bid_history', 'bids', 'chat_messages', 'custom_formats',
    'draft_actions', 'draft_result_teams', 'draft_results', 'drafts',
    'league_teams', 'leagues', 'match_games', 'match_pokemon_kos',
    'matches', 'participants', 'picks', 'pokemon_tiers', 'spectator_events',
    'standings', 'team_pokemon_status', 'teams', 'trade_approvals',
    'trades', 'waiver_claims', 'wishlists'
  ];
BEGIN
  FOREACH tbl IN ARRAY insert_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      RAISE NOTICE '  table public.% does not exist — skipped', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR INSERT
         WITH CHECK (public.clerk_user_id() IS NOT NULL)',
      tbl || '_insert', tbl
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------
-- 3. push_subscriptions — self-only, by Clerk user id
-- ----------------------------------------------------------------
-- Assumes push_subscriptions.user_id is the Clerk user id (text).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
  ) THEN
    DROP POLICY IF EXISTS "Users can insert their own subscriptions"
      ON public.push_subscriptions;
    DROP POLICY IF EXISTS "Users can update their own subscriptions"
      ON public.push_subscriptions;
    DROP POLICY IF EXISTS "Users can delete their own subscriptions"
      ON public.push_subscriptions;
    DROP POLICY IF EXISTS "push_subscriptions_self_select"
      ON public.push_subscriptions;
    DROP POLICY IF EXISTS "push_subscriptions_self_insert"
      ON public.push_subscriptions;
    DROP POLICY IF EXISTS "push_subscriptions_self_update"
      ON public.push_subscriptions;
    DROP POLICY IF EXISTS "push_subscriptions_self_delete"
      ON public.push_subscriptions;

    CREATE POLICY "push_subscriptions_self_select"
      ON public.push_subscriptions FOR SELECT
      USING (public.clerk_user_id() = user_id::text);

    CREATE POLICY "push_subscriptions_self_insert"
      ON public.push_subscriptions FOR INSERT
      WITH CHECK (public.clerk_user_id() = user_id::text);

    CREATE POLICY "push_subscriptions_self_update"
      ON public.push_subscriptions FOR UPDATE
      USING (public.clerk_user_id() = user_id::text)
      WITH CHECK (public.clerk_user_id() = user_id::text);

    CREATE POLICY "push_subscriptions_self_delete"
      ON public.push_subscriptions FOR DELETE
      USING (public.clerk_user_id() = user_id::text);
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. Verification
-- ----------------------------------------------------------------
DO $$
DECLARE
  permissive_count int;
BEGIN
  SELECT count(*) INTO permissive_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (cmd IN ('INSERT', 'UPDATE') AND with_check = 'true')
      OR (cmd IN ('UPDATE', 'DELETE', 'SELECT') AND qual = 'true')
      OR (cmd = 'ALL' AND (with_check = 'true' OR qual = 'true'))
    )
    -- SELECT policies with USING (true) are intentional public-read,
    -- linter excludes them too.
    AND NOT (cmd = 'SELECT' AND qual = 'true');

  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'Permissive INSERT/UPDATE/DELETE/ALL policies remaining: %', permissive_count;
  RAISE NOTICE 'Sanity check the policies were created:';
  RAISE NOTICE '  SELECT tablename, policyname, with_check FROM pg_policies';
  RAISE NOTICE '  WHERE schemaname = ''public'' AND policyname LIKE ''%%_insert'';';
  RAISE NOTICE '----------------------------------------';
END $$;

-- ----------------------------------------------------------------
-- 5. NOTES
-- ----------------------------------------------------------------
-- 5a. Guest mode after this migration
--     Direct PostgREST inserts from guests (no JWT) → 403.
--     Writes via SECURITY DEFINER RPCs (make_draft_pick, place_bid,
--     send_chat_message, etc.) keep working — they bypass RLS.
--     If any guest flow does direct inserts, migrate it to use the
--     corresponding RPC, or drop the policy for that table.
--
-- 5b. Remaining `authenticated_security_definer_function_executable`
--     warnings on user-facing RPCs (make_draft_pick, place_bid, etc.)
--     are STRUCTURAL — these RPCs intentionally accept an authenticated
--     caller. Accept the warnings.
--
--     If you want to additionally enforce identity inside the RPCs,
--     follow up by adding:
--         IF public.clerk_user_id() IS NULL THEN
--           RAISE EXCEPTION 'unauthenticated';
--         END IF;
--     at the top of each RPC body. (Separate migration.)
--
-- 5c. auth_leaked_password_protection — dashboard toggle. Since you're
--     using Clerk for auth, this only affects the legacy Supabase Auth
--     code path (which appears to be unused). Safe to leave as-is or
--     enable for defence-in-depth.
