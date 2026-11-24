-- 046: remaining table policy and grant cleanup
-- Audit B-23, B-24, B-26 (undos/name part), and residuals of B-02, B-03, B-14
-- not covered by the 20261124140000 hotfix.
--
-- B-23  push_subscriptions: drop the legacy SELECT USING (true) policy that
--       exposed every endpoint/key, and the duplicate self policies. Only
--       signed-in users subscribe, so anon loses all access.
-- B-24  INSERT policies that were just "any signed-in user":
--         bid_history   only place_bid / nominate_auction (SECURITY DEFINER)
--                       write it: drop the policy, revoke INSERT/UPDATE.
--                       DELETE stays granted (no policy, so 0 rows) because
--                       draft-lifecycle-service still calls it.
--         waiver_claims drop the loose insert and the USING (true) select,
--                       keep the owner/league ones; owner inserts must be
--                       'pending'; drop owner UPDATE (an owner could flip a
--                       completed claim to 'rejected' to regain quota).
--                       process_waiver_claim owns the real writes.
--         draft_actions, draft_results, draft_result_teams: no client writer;
--                       drop the insert policies and revoke INSERT.
--         chat_messages sender must be the caller and a participant.
--         bids          legacy, 0 rows, no callers: revoke all client access.
-- B-03  picks DELETE limited to the draft host (owners could delete their own
--       picks without a refund).
-- B-02  UNIQUE (draft_id, user_id) on participants (0 duplicates live).
-- B-14  UNIQUE (draft_id, pokemon_id) on pokemon_tiers (0 duplicates live);
--       duplicates are removed first (earliest row kept) for replays.
-- B-26  owners can no longer UPDATE teams.undos_remaining (undo_last_pick
--       decrements it as SECURITY DEFINER); team renames must stay unique per
--       draft (case-insensitive) via a trigger. draft_order is revoked later in
--       20261124151400, after the TS uses shuffle_draft_order.
-- TRUNCATE/TRIGGER/REFERENCES are revoked from anon/authenticated on every
-- public table (RLS does not cover TRUNCATE).
--
-- PRE-CHECKS (each must return 0):
--   SELECT count(*) FROM (SELECT 1 FROM participants WHERE user_id IS NOT NULL
--     GROUP BY draft_id, user_id HAVING count(*) > 1) x;
--   SELECT count(*) FROM (SELECT 1 FROM pokemon_tiers
--     GROUP BY draft_id, pokemon_id HAVING count(*) > 1) x;   -- else deduped
-- Idempotent.

-- B-23 push_subscriptions ----------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete_self ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update_self ON public.push_subscriptions;
REVOKE ALL ON public.push_subscriptions FROM anon;

-- B-24 -----------------------------------------------------------------------
DROP POLICY IF EXISTS bid_history_insert ON public.bid_history;
REVOKE INSERT, UPDATE ON public.bid_history FROM anon, authenticated;

DROP POLICY IF EXISTS waiver_claims_insert ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_select ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_update_owner ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_insert_owner ON public.waiver_claims;
CREATE POLICY waiver_claims_insert_owner ON public.waiver_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(status, 'pending') = 'pending'
    AND processed_at IS NULL
    AND EXISTS (SELECT 1 FROM public.teams t
                WHERE t.id = team_id AND t.owner_id = public.clerk_user_id())
  );
REVOKE UPDATE ON public.waiver_claims FROM anon, authenticated;

DROP POLICY IF EXISTS draft_actions_insert ON public.draft_actions;
DROP POLICY IF EXISTS draft_results_insert ON public.draft_results;
DROP POLICY IF EXISTS draft_result_teams_insert ON public.draft_result_teams;
REVOKE INSERT ON public.draft_actions, public.draft_results, public.draft_result_teams FROM anon, authenticated;

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = public.clerk_user_id()
    AND EXISTS (SELECT 1 FROM public.participants p
                WHERE p.draft_id = chat_messages.draft_id AND p.user_id = public.clerk_user_id())
  );

DO $bids$
BEGIN
  IF to_regclass('public.bids') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS bids_insert ON public.bids';
    EXECUTE 'REVOKE ALL ON public.bids FROM anon, authenticated';
  END IF;
END
$bids$;

-- B-03 picks delete ----------------------------------------------------------
DROP POLICY IF EXISTS picks_delete_owner_or_host ON public.picks;
DROP POLICY IF EXISTS picks_delete_host_only ON public.picks;
CREATE POLICY picks_delete_host_only ON public.picks
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drafts d
                 WHERE d.id = picks.draft_id AND d.host_id = public.clerk_user_id()));

-- B-02 / B-14 uniqueness -----------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS participants_draft_user_unique
  ON public.participants (draft_id, user_id);

DELETE FROM public.pokemon_tiers pt
USING public.pokemon_tiers keep
WHERE pt.draft_id = keep.draft_id AND pt.pokemon_id = keep.pokemon_id
  AND (keep.created_at, keep.id) < (pt.created_at, pt.id);
CREATE UNIQUE INDEX IF NOT EXISTS pokemon_tiers_draft_pokemon_unique
  ON public.pokemon_tiers (draft_id, pokemon_id);

-- B-26 teams -----------------------------------------------------------------
REVOKE UPDATE (undos_remaining) ON public.teams FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.teams_unique_name_on_rename()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF lower(NEW.name) IS DISTINCT FROM lower(OLD.name) AND EXISTS (
    SELECT 1 FROM public.teams
    WHERE draft_id = NEW.draft_id AND id <> NEW.id AND lower(name) = lower(NEW.name)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Team name is already taken';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.teams_unique_name_on_rename() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teams_unique_name_on_rename ON public.teams;
CREATE TRIGGER teams_unique_name_on_rename
  BEFORE UPDATE OF name ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.teams_unique_name_on_rename();

-- TRUNCATE / TRIGGER / REFERENCES on every public table ----------------------
DO $tbl$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT c.oid::regclass AS t FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON %s FROM anon, authenticated', r.t);
  END LOOP;
END
$tbl$;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '046_policy_cleanup',
  'Drop permissive push_subscriptions/bid_history/waiver_claims/draft_actions/draft_results/chat/bids policies; picks delete host-only; unique participants(draft,user) and pokemon_tiers(draft,pokemon); revoke teams.undos_remaining update; unique team rename; revoke TRUNCATE/TRIGGER/REFERENCES.',
  '-- recreate dropped policies from 20260510151249 / 20260824120000 if needed; DROP INDEX participants_draft_user_unique, pokemon_tiers_draft_pokemon_unique;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '046_policy_cleanup'
);
