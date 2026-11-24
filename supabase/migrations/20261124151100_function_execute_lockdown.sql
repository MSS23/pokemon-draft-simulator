-- 047: SECURITY DEFINER function EXECUTE lockdown (audit B-20)
--
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon, authenticated and service_role explicitly, so the repo's
-- `REVOKE ... FROM anon` (PUBLIC still granted) and `FROM PUBLIC` (explicit
-- anon grant kept) patterns each left gaps. Live, anon could still run
-- get_chat_messages (private chat), get_participant_user_id (Clerk ids),
-- get_draft_state* / get_draft_history / get_draft_analytics / get_team_*
-- (bypass drafts RLS), submit_match_side, process_waiver_claim, the trade RPCs
-- and more.
--
-- 1. Drop live-only read RPCs with no caller in src/ (grep 2026-11-24).
-- 2. For every remaining public SECURITY DEFINER function: revoke EXECUTE from
--    PUBLIC, anon and authenticated, grant service_role, then re-grant
--    authenticated only for the RPCs the app calls with a user JWT (each has
--    its own clerk_user_id() check), and anon only for whoami().
--    No SECURITY DEFINER function is referenced by an RLS policy (checked
--    against pg_policies), so revoking from anon/authenticated breaks no
--    policy. Trigger functions need no EXECUTE grant to fire.
-- 3. Future functions created by postgres in public get no PUBLIC/anon/
--    authenticated EXECUTE by default: every migration must GRANT explicitly.
--
-- Must run after every file that creates or replaces an RPC (036-046).
-- Idempotent.

DO $drop$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'get_chat_messages', 'get_participant_user_id', 'get_draft_state',
        'get_draft_state_optimized', 'get_draft_history', 'get_draft_analytics',
        'get_team_roster', 'get_team_stats', 'get_team_available_budget',
        'is_pokemon_picked'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END
$drop$;

DO $grants$
DECLARE
  r RECORD;
  v_authenticated text[] := ARRAY[
    -- draft engine
    'make_draft_pick', 'nominate_auction', 'place_bid', 'resolve_auction',
    'undo_last_pick', 'promote_to_admin', 'demote_from_admin',
    'reset_draft', 'remove_team', 'start_draft', 'shuffle_draft_order', 'extend_auction',
    -- leagues
    'approve_trade', 'cancel_trade', 'execute_trade', 'respond_to_trade',
    'process_waiver_claim', 'submit_team_sheet', 'submit_match_side', 'confirm_match_side',
    'initialize_league_standings', 'recalculate_league_standings', 'generate_week_summary',
    'force_advance_week', 'increment_pokemon_match_stats', 'is_league_commissioner',
    -- health probe
    'whoami'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    IF r.proname = ANY (v_authenticated) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    IF r.proname = 'whoami' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    END IF;
  END LOOP;
END
$grants$;

-- Schema-level entries hold Supabase's explicit anon/authenticated grants; the
-- PUBLIC grant is a global default and can only be revoked globally.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
-- The database-wide `REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` default was
-- deliberately not applied: it would also affect extension functions postgres
-- creates outside public. Every repo migration GRANTs explicitly instead.

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '047_function_execute_lockdown',
  'Drop unused live-only read RPCs; revoke EXECUTE on every public SECURITY DEFINER function from PUBLIC/anon/authenticated and re-grant authenticated for the app RPC allowlist (anon: whoami only); default privileges no longer grant EXECUTE.',
  'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated; GRANT EXECUTE ON FUNCTION <sig> TO authenticated per function as needed;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '047_function_execute_lockdown'
);
