-- Migration: sec-p2a — close anon-escape on low-risk tables (chunk A of 3).
-- Tables: user_profiles, custom_formats, pokemon_tiers, push_subscriptions,
--         spectator_events, weekly_summaries, weekly_highlights, draft_results,
--         draft_result_teams, draft_actions
--
-- Mirrors sections 1, parts of 5, and parts of 7 of sec-p2-close-anon-escape-DRAFT.sql.
-- Verified against pre-flight snapshot 2026-05-10.

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '10s';

-- 0. Verify clerk_user_id() exists.
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'clerk_user_id'
  ) THEN
    RAISE EXCEPTION 'public.clerk_user_id() must exist before applying this migration. '
                    'Run fix-supabase-linter-warnings-clerk-final.sql first.';
  END IF;
END
$verify$;

-- =====================================================================
-- 1. user_profiles
-- =====================================================================
DROP POLICY IF EXISTS user_profiles_update_self ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert      ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_delete_self ON public.user_profiles;

CREATE POLICY user_profiles_update_self ON public.user_profiles
  FOR UPDATE
  USING      (user_id = public.clerk_user_id())
  WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY user_profiles_insert ON public.user_profiles
  FOR INSERT
  WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY user_profiles_delete_self ON public.user_profiles
  FOR DELETE
  USING (user_id = public.clerk_user_id());

REVOKE UPDATE ON public.user_profiles FROM anon, authenticated;
GRANT  UPDATE (display_name, avatar_url, bio, preferences, updated_at)
       ON public.user_profiles TO authenticated;

-- =====================================================================
-- 2. custom_formats
-- =====================================================================
DROP POLICY IF EXISTS custom_formats_update         ON public.custom_formats;
DROP POLICY IF EXISTS custom_formats_delete         ON public.custom_formats;
DROP POLICY IF EXISTS custom_formats_update_creator ON public.custom_formats;
DROP POLICY IF EXISTS custom_formats_delete_creator ON public.custom_formats;

CREATE POLICY custom_formats_update_creator ON public.custom_formats
  FOR UPDATE USING (creator_id = public.clerk_user_id())
              WITH CHECK (creator_id = public.clerk_user_id());
CREATE POLICY custom_formats_delete_creator ON public.custom_formats
  FOR DELETE USING (creator_id = public.clerk_user_id());

-- =====================================================================
-- 3. pokemon_tiers — service-role-only writes.
-- =====================================================================
DROP POLICY IF EXISTS pokemon_tiers_update         ON public.pokemon_tiers;
DROP POLICY IF EXISTS pokemon_tiers_delete         ON public.pokemon_tiers;
DROP POLICY IF EXISTS pokemon_tiers_update_host    ON public.pokemon_tiers;
DROP POLICY IF EXISTS pokemon_tiers_delete_host    ON public.pokemon_tiers;
-- (No new UPDATE/DELETE policies — service role only.)

-- =====================================================================
-- 4. push_subscriptions
-- =====================================================================
DROP POLICY IF EXISTS push_subscriptions_update      ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete      ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update_self ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete_self ON public.push_subscriptions;

CREATE POLICY push_subscriptions_update_self ON public.push_subscriptions
  FOR UPDATE USING (user_id = public.clerk_user_id())
              WITH CHECK (user_id = public.clerk_user_id());
CREATE POLICY push_subscriptions_delete_self ON public.push_subscriptions
  FOR DELETE USING (user_id = public.clerk_user_id());
-- push_subscriptions_self_{update,delete} from migration 023 are already strict; keep them.

-- =====================================================================
-- 5. spectator_events / draft_results / draft_result_teams / draft_actions
--    — service-role-only writes; SELECT also tightened on draft_actions.
-- =====================================================================
DROP POLICY IF EXISTS spectator_events_update     ON public.spectator_events;
DROP POLICY IF EXISTS spectator_events_delete     ON public.spectator_events;
DROP POLICY IF EXISTS draft_results_update        ON public.draft_results;
DROP POLICY IF EXISTS draft_results_delete        ON public.draft_results;
DROP POLICY IF EXISTS draft_result_teams_update   ON public.draft_result_teams;
DROP POLICY IF EXISTS draft_result_teams_delete   ON public.draft_result_teams;
DROP POLICY IF EXISTS draft_actions_update        ON public.draft_actions;
DROP POLICY IF EXISTS draft_actions_delete        ON public.draft_actions;

DROP POLICY IF EXISTS draft_actions_select        ON public.draft_actions;
CREATE POLICY draft_actions_select_in_draft ON public.draft_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.draft_id = draft_actions.draft_id
         AND p.user_id  = public.clerk_user_id()
    )
  );

-- =====================================================================
-- 6. weekly_summaries / weekly_highlights — already strict (qual='false');
--    no-op DROPs included for idempotency.
-- =====================================================================
-- (No anon-escape policies on these tables; keep weekly_*_no_write in place.)

-- =====================================================================
-- Record migration
-- =====================================================================
INSERT INTO _migrations (name, description) VALUES (
  '025a_sec_p2_low_risk_tables',
  'sec-p2 chunk A: anon-escape removed from user_profiles, custom_formats, pokemon_tiers, push_subscriptions, spectator_events, draft_results, draft_result_teams, draft_actions; SELECT on draft_actions tightened to draft participants.'
) ON CONFLICT (name) DO NOTHING;

COMMIT;
