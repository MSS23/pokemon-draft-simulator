-- 050: revoke direct client writes that now have host/server RPCs
-- Audit B-10, B-12, B-26 (draft_order), handoff F-01.
--
-- APPLY ONLY AFTER the TS deploy that switches these call sites to RPCs:
--   extendAuctionTime (draft-auction-methods.ts)  -> rpc('extend_auction')
--   submitMatchResult auto-confirm and MatchRecorderModal notes write
--                         (league-service.ts, MatchRecorderModal.tsx)
--                                                 -> rpc('confirm_match_side')
--   startDraft / shuffleDraftOrder shuffle loops (draft-lifecycle-service.ts)
--                                                 -> rpc('start_draft') /
--                                                    rpc('shuffle_draft_order')
-- Applying it earlier breaks those flows (42501 / 0 rows).
--
-- B-12  auctions: drop auctions_update_host and revoke UPDATE/INSERT; every
--       auction write is a SECURITY DEFINER RPC (nominate/place_bid/resolve/
--       extend_auction). auctions_delete_host stays (reset/delete flows).
-- B-10  matches: participants may no longer UPDATE matches directly (they
--       could self-report a win). UPDATE is limited to the league
--       commissioner or the draft host; results go through confirm_match_side.
-- B-26  teams.draft_order: owners lose UPDATE on it; seats change only via
--       start_draft / shuffle_draft_order / remove_team / join_draft_atomic.
--       UNIQUE (draft_id, draft_order) DEFERRABLE INITIALLY DEFERRED.
--
-- PRE-CHECK (must be 0):
--   SELECT count(*) FROM (SELECT 1 FROM teams GROUP BY draft_id, draft_order HAVING count(*) > 1) x;
-- Idempotent.

DROP POLICY IF EXISTS auctions_update_host ON public.auctions;
REVOKE INSERT, UPDATE ON public.auctions FROM anon, authenticated;

DROP POLICY IF EXISTS matches_update_commish_or_participant ON public.matches;
DROP POLICY IF EXISTS matches_update_commish_or_host ON public.matches;
CREATE POLICY matches_update_commish_or_host ON public.matches
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leagues l LEFT JOIN public.drafts d ON d.id = l.draft_id
    WHERE l.id = matches.league_id
      AND ((l.settings ->> 'commissionerId') = public.clerk_user_id() OR d.host_id = public.clerk_user_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leagues l LEFT JOIN public.drafts d ON d.id = l.draft_id
    WHERE l.id = matches.league_id
      AND ((l.settings ->> 'commissionerId') = public.clerk_user_id() OR d.host_id = public.clerk_user_id())));

REVOKE UPDATE (draft_order) ON public.teams FROM anon, authenticated;

DO $uniq$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_draft_order_unique') THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_draft_order_unique
      UNIQUE (draft_id, draft_order) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$uniq$;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '050_post_ts_write_lockdown',
  'Revoke client auction writes, limit matches UPDATE to commissioner/host, revoke teams.draft_order UPDATE, unique deferrable (draft_id, draft_order).',
  'GRANT UPDATE ON public.auctions TO authenticated; recreate auctions_update_host and matches_update_commish_or_participant from 20260510151249; GRANT UPDATE (draft_order) ON public.teams TO authenticated; ALTER TABLE public.teams DROP CONSTRAINT teams_draft_order_unique;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '050_post_ts_write_lockdown'
);
