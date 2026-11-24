-- Hotfix, part 4 (audit lens 3/4 finding, verified live 2026-11-24).
-- Several legacy SECURITY DEFINER functions that exist only in the live DB
-- (never in supabase/migrations) are executable by anon and authenticated and
-- perform writes with no identity check:
--   make_pick_atomic           inserts picks into any draft at any cost (negative
--                              cost mints budget) and advances the turn
--   undo_last_pick(uuid,uuid,uuid)  legacy 3-arg overload; the app calls the
--                              2-arg one, which checks clerk_user_id()
--   send_chat_message, add_message_reaction, remove_message_reaction
--                              no caller in src/
--   record_migration           anyone could write the _migrations ledger
-- initialize_league_standings has no identity check either; the app calls it
-- signed in, so only anon is revoked here (bucket B tightens it properly).
-- Functions are kept (not dropped) so this is trivially reversible with GRANT.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND (
        p.proname IN ('make_pick_atomic', 'send_chat_message', 'add_message_reaction',
                      'remove_message_reaction', 'record_migration')
        OR (p.proname = 'undo_last_pick' AND p.pronargs = 3)
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'initialize_league_standings'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '034_revoke_legacy_unauthenticated_rpcs',
  'Revoke anon/authenticated EXECUTE on legacy live-only SECURITY DEFINER RPCs with no identity check (make_pick_atomic, undo_last_pick 3-arg, chat RPCs, record_migration); revoke anon on initialize_league_standings.',
  'GRANT EXECUTE ON FUNCTION public.make_pick_atomic(uuid,uuid,text,text,integer,text) TO anon, authenticated; -- repeat for the others if ever needed'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '034_revoke_legacy_unauthenticated_rpcs'
);
