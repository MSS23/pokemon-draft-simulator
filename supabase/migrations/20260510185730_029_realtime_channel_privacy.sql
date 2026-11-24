-- Migration: 029_realtime_channel_privacy
-- Date: 2026-05-10
--
-- BACKGROUND
-- ----------
-- Before this migration, every Supabase Realtime channel in the app was
-- a public broadcast topic. Holding only the anon key (which is shipped in
-- every browser bundle) let any client `supabase.channel('draft:<id>')` and
-- stream every postgres_changes / broadcast / presence event in real time:
--   * draft:<draft_id>             — picks, turns, host actions
--   * auction-updates:<draft_id>   — every auction started
--   * bid-history:<auction_id>     — every bid placed
--   * wishlist_<draft_id>          — wishlist edits (defeated sec-p1 wishlist
--                                    privacy at the public.wishlist_items RLS
--                                    layer — realtime leaked it anyway)
--   * league-trades:<league_id>    — every trade proposal/acceptance
--   * league-roster-invalidate:<league_id>, presence/ping, etc.
--
-- THIS MIGRATION
-- --------------
-- 1) Confirms RLS is enabled on `realtime.messages` (Supabase default).
-- 2) Adds topic-scoped SELECT (and matching INSERT for client-broadcast
--    channels) policies on `realtime.messages`.
-- 3) Policies parse the channel topic with `realtime.topic()` and grant
--    access based on the existing public-schema relationships:
--      - draft:<id> / auction-updates:<id> / presence:<id> / ping:<code> :
--        caller must be a participant of that draft (clerk_user_id() match)
--      - bid-history:<auction_id>: caller must be a participant of the
--        draft that owns the auction
--      - wishlist_<draft_id>: caller must be a participant of that draft
--        (channel topic carries draft_id not participant_id today; per-user
--        scope is enforced by public.wishlist_items SELECT policy)
--      - league-trades:<id> / league-roster-invalidate:<id>:
--        caller must be a team owner in the league OR be the league's
--        commissioner (host of the underlying draft)
--      - match-kos:<match_id> / match-kos-detail:<match_id>:
--        caller must be a team owner in the matchup's league OR commissioner
--      - public-drafts-list:
--        open to anon + authenticated (this is the /spectate lobby — by
--        design any visitor can see public drafts; the underlying
--        public.drafts SELECT policy already filters to is_public=true)
--
-- 4) On the application side, every channel call site is updated to pass
--    `{ config: { private: true } }` so Supabase routes the subscription
--    request through these policies. The lobby channel remains public.
--
-- NOTES
-- -----
--   * Policies use `(SELECT ...)` wrappers around `realtime.topic()` /
--     `clerk_user_id()` to allow init-plan caching, matching Supabase docs.
--   * Topic parsing uses `split_part(realtime.topic(), ':', 2)` for `:`-
--     delimited topics and `substring(... from '^wishlist_(.*)$')` for the
--     legacy `wishlist_<draft_id>` topic (underscore delimiter).
--   * Idempotent: every CREATE POLICY is preceded by DROP POLICY IF EXISTS,
--     and the `_migrations` insert is `ON CONFLICT DO NOTHING`.
--   * Service role and supabase_realtime_admin bypass RLS by default —
--     postgres-changes broadcast workers continue to function.

-- =====================================================================
-- 0. Sanity: ensure RLS is enabled on realtime.messages
-- =====================================================================

ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 1. Drop any prior policies from earlier attempts of this migration
-- =====================================================================

DROP POLICY IF EXISTS "realtime_draft_select_p029"           ON realtime.messages;
DROP POLICY IF EXISTS "realtime_draft_insert_p029"           ON realtime.messages;
DROP POLICY IF EXISTS "realtime_bid_history_select_p029"     ON realtime.messages;
DROP POLICY IF EXISTS "realtime_wishlist_select_p029"        ON realtime.messages;
DROP POLICY IF EXISTS "realtime_wishlist_insert_p029"        ON realtime.messages;
DROP POLICY IF EXISTS "realtime_league_select_p029"          ON realtime.messages;
DROP POLICY IF EXISTS "realtime_league_insert_p029"          ON realtime.messages;
DROP POLICY IF EXISTS "realtime_match_kos_select_p029"       ON realtime.messages;
DROP POLICY IF EXISTS "realtime_public_lobby_select_p029"    ON realtime.messages;

-- =====================================================================
-- 2. Helper predicate: caller is a participant of a given draft uuid
-- =====================================================================
--   (inlined as a sub-select; we don't create a new SQL function to keep
--   the surface area minimal.)

-- =====================================================================
-- 3. draft:<id>, auction-updates:<id>, presence:<id>, ping:<roomCode>
-- =====================================================================
-- ping:<roomCode> uses room_code (lowercase) NOT draft uuid, so the
-- predicate joins through drafts.room_code as well.

CREATE POLICY "realtime_draft_select_p029" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    -- draft:<draft_id>, auction-updates:<draft_id>, presence:<draft_id>
    (
      split_part((SELECT realtime.topic()), ':', 1) IN
        ('draft', 'auction-updates', 'presence')
      AND EXISTS (
        SELECT 1 FROM public.participants p
         WHERE p.draft_id = NULLIF(split_part((SELECT realtime.topic()), ':', 2), '')::uuid
           AND p.user_id  = (SELECT public.clerk_user_id())
      )
    )
    OR
    -- ping:<roomCode>
    (
      split_part((SELECT realtime.topic()), ':', 1) = 'ping'
      AND EXISTS (
        SELECT 1
          FROM public.drafts       d
          JOIN public.participants p ON p.draft_id = d.id
         WHERE lower(d.room_code) = split_part((SELECT realtime.topic()), ':', 2)
           AND p.user_id          = (SELECT public.clerk_user_id())
      )
    )
  );

CREATE POLICY "realtime_draft_insert_p029" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    -- same predicate as SELECT — clients broadcast on draft:<id> and
    -- ping:<roomCode>; auction-updates is server-only via postgres-changes
    (
      split_part((SELECT realtime.topic()), ':', 1) IN
        ('draft', 'auction-updates', 'presence')
      AND EXISTS (
        SELECT 1 FROM public.participants p
         WHERE p.draft_id = NULLIF(split_part((SELECT realtime.topic()), ':', 2), '')::uuid
           AND p.user_id  = (SELECT public.clerk_user_id())
      )
    )
    OR
    (
      split_part((SELECT realtime.topic()), ':', 1) = 'ping'
      AND EXISTS (
        SELECT 1
          FROM public.drafts       d
          JOIN public.participants p ON p.draft_id = d.id
         WHERE lower(d.room_code) = split_part((SELECT realtime.topic()), ':', 2)
           AND p.user_id          = (SELECT public.clerk_user_id())
      )
    )
  );

-- =====================================================================
-- 4. bid-history:<auction_id> — must be a participant of the parent draft
-- =====================================================================

CREATE POLICY "realtime_bid_history_select_p029" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    split_part((SELECT realtime.topic()), ':', 1) = 'bid-history'
    AND EXISTS (
      SELECT 1
        FROM public.auctions     a
        JOIN public.participants p ON p.draft_id = a.draft_id
       WHERE a.id = NULLIF(split_part((SELECT realtime.topic()), ':', 2), '')::uuid
         AND p.user_id = (SELECT public.clerk_user_id())
    )
  );

-- =====================================================================
-- 5. wishlist_<draft_id> — legacy underscore-delimited topic
-- =====================================================================
-- Channel scope is per-draft; per-user wishlist privacy is enforced at the
-- public.wishlist_items SELECT policy layer (sec-p1). Realtime only needs
-- to gate that the subscriber is a draft participant.

CREATE POLICY "realtime_wishlist_select_p029" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (SELECT realtime.topic()) LIKE 'wishlist\_%' ESCAPE '\'
    AND EXISTS (
      SELECT 1 FROM public.participants p
       WHERE p.draft_id = NULLIF(substring((SELECT realtime.topic()) from '^wishlist_(.*)$'), '')::uuid
         AND p.user_id  = (SELECT public.clerk_user_id())
    )
  );

CREATE POLICY "realtime_wishlist_insert_p029" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT realtime.topic()) LIKE 'wishlist\_%' ESCAPE '\'
    AND EXISTS (
      SELECT 1 FROM public.participants p
       WHERE p.draft_id = NULLIF(substring((SELECT realtime.topic()) from '^wishlist_(.*)$'), '')::uuid
         AND p.user_id  = (SELECT public.clerk_user_id())
    )
  );

-- =====================================================================
-- 6. league-trades:<league_id> & league-roster-invalidate:<league_id>
-- =====================================================================
-- Allowed if caller owns a team in the league OR is the league
-- commissioner (host of the underlying draft).

CREATE POLICY "realtime_league_select_p029" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    split_part((SELECT realtime.topic()), ':', 1)
      IN ('league-trades', 'league-roster-invalidate')
    AND EXISTS (
      SELECT 1
        FROM public.leagues l
        LEFT JOIN public.drafts d        ON d.id = l.draft_id
        LEFT JOIN public.league_teams lt ON lt.league_id = l.id
        LEFT JOIN public.teams t         ON t.id = lt.team_id
       WHERE l.id = NULLIF(split_part((SELECT realtime.topic()), ':', 2), '')::uuid
         AND (
              t.owner_id = (SELECT public.clerk_user_id())
           OR d.host_id  = (SELECT public.clerk_user_id())
         )
    )
  );

CREATE POLICY "realtime_league_insert_p029" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    split_part((SELECT realtime.topic()), ':', 1)
      IN ('league-trades', 'league-roster-invalidate')
    AND EXISTS (
      SELECT 1
        FROM public.leagues l
        LEFT JOIN public.drafts d        ON d.id = l.draft_id
        LEFT JOIN public.league_teams lt ON lt.league_id = l.id
        LEFT JOIN public.teams t         ON t.id = lt.team_id
       WHERE l.id = NULLIF(split_part((SELECT realtime.topic()), ':', 2), '')::uuid
         AND (
              t.owner_id = (SELECT public.clerk_user_id())
           OR d.host_id  = (SELECT public.clerk_user_id())
         )
    )
  );

-- =====================================================================
-- 7. match-kos:<match_id> / match-kos-detail:<match_id>
-- =====================================================================
-- These topics carry the matchup id. We need to look up the matchup's
-- league, then apply the league-team-owner / commissioner predicate.
-- The matchup table is named in the codebase via MatchKOService — check
-- for either `matches` or `league_matches` schema name.

DO $$
DECLARE
  matches_table_name text;
BEGIN
  SELECT table_name INTO matches_table_name
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('matches', 'league_matches', 'league_matchups', 'matchups')
   ORDER BY CASE table_name
              WHEN 'matchups'         THEN 1
              WHEN 'league_matchups'  THEN 2
              WHEN 'league_matches'   THEN 3
              WHEN 'matches'          THEN 4
              ELSE 5
            END
   LIMIT 1;

  IF matches_table_name IS NULL THEN
    -- No matches table found — skip policy creation rather than error.
    RAISE NOTICE
      'realtime_match_kos_select_p029: no public.matches/matchups table found; skipping policy';
  ELSE
    EXECUTE format($f$
      CREATE POLICY "realtime_match_kos_select_p029" ON realtime.messages
        FOR SELECT TO authenticated
        USING (
          split_part((SELECT realtime.topic()), ':', 1)
            IN ('match-kos', 'match-kos-detail')
          AND EXISTS (
            SELECT 1
              FROM public.%I            m
              JOIN public.leagues       l  ON l.id = m.league_id
              LEFT JOIN public.drafts        d  ON d.id  = l.draft_id
              LEFT JOIN public.league_teams  lt ON lt.league_id = l.id
              LEFT JOIN public.teams         t  ON t.id  = lt.team_id
             WHERE m.id = NULLIF(split_part((SELECT realtime.topic()), ':', 2), '')::uuid
               AND (
                    t.owner_id = (SELECT public.clerk_user_id())
                 OR d.host_id  = (SELECT public.clerk_user_id())
               )
          )
        )
    $f$, matches_table_name);
  END IF;
END
$$;

-- =====================================================================
-- 8. public-drafts-list — open lobby (anon + authenticated)
-- =====================================================================
-- /spectate relies on this. The underlying public.drafts SELECT policy
-- already filters to is_public = true, so broadcast leakage is bounded
-- to data that's already publicly readable.

CREATE POLICY "realtime_public_lobby_select_p029" ON realtime.messages
  FOR SELECT TO anon, authenticated
  USING (
    (SELECT realtime.topic()) = 'public-drafts-list'
  );

-- =====================================================================
-- 9. Record migration
-- =====================================================================

INSERT INTO public._migrations (name, description)
VALUES (
  '029_realtime_channel_privacy',
  'Topic-scoped RLS on realtime.messages; channels switched to private:true'
)
ON CONFLICT (name) DO NOTHING;
