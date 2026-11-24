-- 044: realtime.messages channel policies (audit B-21, B-22, B-17; handoff H-01)
--
-- Every client channel is private:true, so realtime.messages RLS decides who
-- may join. The nine *_p029 policies were hand-applied to prod and never
-- committed (B-17); they are captured here from pg_policies (2026-11-24) so a
-- fresh project matches live, with two changes:
--   B-22/H-01  'auction-live:<draft uuid>' (useDraftAuction.ts) is added to the
--              participant SELECT policy. It is NOT added to INSERT: nothing
--              broadcasts on it, so spectators/participants cannot forge.
--   B-21       new realtime_draft_spectate_select_p044: anon and authenticated
--              may SELECT on 'draft:<uuid>' and 'auction-live:<uuid>' when the
--              draft is public and not deleted. Private drafts stay
--              participant-only. No INSERT for spectators.
-- Not done (H-03): limiting broadcast INSERT on 'draft:' to the host. That
-- needs pick/delete broadcasts to move server-side first.
-- Idempotent; skipped when the realtime schema is absent.

DO $realtime$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'realtime.messages not found, skipping channel policies';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS realtime_draft_select_p029 ON realtime.messages;
  CREATE POLICY realtime_draft_select_p029 ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      ((split_part((SELECT realtime.topic()), ':', 1) = ANY (ARRAY['draft', 'auction-updates', 'auction-live', 'presence']))
        AND EXISTS (
          SELECT 1 FROM public.participants p
          WHERE p.draft_id = (NULLIF(split_part((SELECT realtime.topic()), ':', 2), ''))::uuid
            AND p.user_id = (SELECT public.clerk_user_id())))
      OR ((split_part((SELECT realtime.topic()), ':', 1) = 'ping')
        AND EXISTS (
          SELECT 1 FROM public.drafts d JOIN public.participants p ON p.draft_id = d.id
          WHERE lower(d.room_code) = split_part((SELECT realtime.topic()), ':', 2)
            AND p.user_id = (SELECT public.clerk_user_id())))
    );

  DROP POLICY IF EXISTS realtime_draft_insert_p029 ON realtime.messages;
  CREATE POLICY realtime_draft_insert_p029 ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
      ((split_part((SELECT realtime.topic()), ':', 1) = ANY (ARRAY['draft', 'auction-updates', 'presence']))
        AND EXISTS (
          SELECT 1 FROM public.participants p
          WHERE p.draft_id = (NULLIF(split_part((SELECT realtime.topic()), ':', 2), ''))::uuid
            AND p.user_id = (SELECT public.clerk_user_id())))
      OR ((split_part((SELECT realtime.topic()), ':', 1) = 'ping')
        AND EXISTS (
          SELECT 1 FROM public.drafts d JOIN public.participants p ON p.draft_id = d.id
          WHERE lower(d.room_code) = split_part((SELECT realtime.topic()), ':', 2)
            AND p.user_id = (SELECT public.clerk_user_id())))
    );

  DROP POLICY IF EXISTS realtime_draft_spectate_select_p044 ON realtime.messages;
  CREATE POLICY realtime_draft_spectate_select_p044 ON realtime.messages
    FOR SELECT TO anon, authenticated
    USING (
      split_part((SELECT realtime.topic()), ':', 1) = ANY (ARRAY['draft', 'auction-live'])
      AND EXISTS (
        SELECT 1 FROM public.drafts d
        WHERE d.id = (NULLIF(split_part((SELECT realtime.topic()), ':', 2), ''))::uuid
          AND d.is_public = true
          AND d.deleted_at IS NULL)
    );

  DROP POLICY IF EXISTS realtime_bid_history_select_p029 ON realtime.messages;
  CREATE POLICY realtime_bid_history_select_p029 ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      split_part((SELECT realtime.topic()), ':', 1) = 'bid-history'
      AND EXISTS (
        SELECT 1 FROM public.auctions a JOIN public.participants p ON p.draft_id = a.draft_id
        WHERE a.id = (NULLIF(split_part((SELECT realtime.topic()), ':', 2), ''))::uuid
          AND p.user_id = (SELECT public.clerk_user_id()))
    );

  DROP POLICY IF EXISTS realtime_league_select_p029 ON realtime.messages;
  CREATE POLICY realtime_league_select_p029 ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      split_part((SELECT realtime.topic()), ':', 1) = ANY (ARRAY['league-trades', 'league-roster-invalidate'])
      AND EXISTS (
        SELECT 1 FROM public.leagues l
        LEFT JOIN public.drafts d ON d.id = l.draft_id
        LEFT JOIN public.league_teams lt ON lt.league_id = l.id
        LEFT JOIN public.teams t ON t.id = lt.team_id
        WHERE l.id = (NULLIF(split_part((SELECT realtime.topic()), ':', 2), ''))::uuid
          AND (t.owner_id = (SELECT public.clerk_user_id()) OR d.host_id = (SELECT public.clerk_user_id())))
    );

  DROP POLICY IF EXISTS realtime_league_insert_p029 ON realtime.messages;
  CREATE POLICY realtime_league_insert_p029 ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
      split_part((SELECT realtime.topic()), ':', 1) = ANY (ARRAY['league-trades', 'league-roster-invalidate'])
      AND EXISTS (
        SELECT 1 FROM public.leagues l
        LEFT JOIN public.drafts d ON d.id = l.draft_id
        LEFT JOIN public.league_teams lt ON lt.league_id = l.id
        LEFT JOIN public.teams t ON t.id = lt.team_id
        WHERE l.id = (NULLIF(split_part((SELECT realtime.topic()), ':', 2), ''))::uuid
          AND (t.owner_id = (SELECT public.clerk_user_id()) OR d.host_id = (SELECT public.clerk_user_id())))
    );

  DROP POLICY IF EXISTS realtime_match_kos_select_p029 ON realtime.messages;
  CREATE POLICY realtime_match_kos_select_p029 ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      split_part((SELECT realtime.topic()), ':', 1) = ANY (ARRAY['match-kos', 'match-kos-detail'])
      AND EXISTS (
        SELECT 1 FROM public.matches m
        JOIN public.leagues l ON l.id = m.league_id
        LEFT JOIN public.drafts d ON d.id = l.draft_id
        LEFT JOIN public.league_teams lt ON lt.league_id = l.id
        LEFT JOIN public.teams t ON t.id = lt.team_id
        WHERE m.id = (NULLIF(split_part((SELECT realtime.topic()), ':', 2), ''))::uuid
          AND (t.owner_id = (SELECT public.clerk_user_id()) OR d.host_id = (SELECT public.clerk_user_id())))
    );

  DROP POLICY IF EXISTS realtime_public_lobby_select_p029 ON realtime.messages;
  CREATE POLICY realtime_public_lobby_select_p029 ON realtime.messages
    FOR SELECT TO anon, authenticated
    USING ((SELECT realtime.topic()) = 'public-drafts-list');

  DROP POLICY IF EXISTS realtime_wishlist_select_p029 ON realtime.messages;
  CREATE POLICY realtime_wishlist_select_p029 ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      (SELECT realtime.topic()) LIKE 'wishlist\_%'
      AND EXISTS (
        SELECT 1 FROM public.participants p
        WHERE p.draft_id = (NULLIF(substring((SELECT realtime.topic()) FROM '^wishlist_(.*)$'), ''))::uuid
          AND p.user_id = (SELECT public.clerk_user_id()))
    );

  DROP POLICY IF EXISTS realtime_wishlist_insert_p029 ON realtime.messages;
  CREATE POLICY realtime_wishlist_insert_p029 ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
      (SELECT realtime.topic()) LIKE 'wishlist\_%'
      AND EXISTS (
        SELECT 1 FROM public.participants p
        WHERE p.draft_id = (NULLIF(substring((SELECT realtime.topic()) FROM '^wishlist_(.*)$'), ''))::uuid
          AND p.user_id = (SELECT public.clerk_user_id()))
    );
END
$realtime$;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '044_realtime_channel_policies',
  'Capture the live *_p029 realtime.messages policies in the repo; add auction-live to the participant SELECT policy; public-draft spectators may SELECT draft:/auction-live: topics.',
  'DROP POLICY realtime_draft_spectate_select_p044 ON realtime.messages; recreate realtime_draft_select_p029 without auction-live;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '044_realtime_channel_policies'
);
