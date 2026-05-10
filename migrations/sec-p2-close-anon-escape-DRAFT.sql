-- Migration: P0 — close every `auth.uid() IS NULL` RLS escape across the app
-- Date: 2026-05-10
-- Status: DRAFTED, NOT APPLIED. Review + plan guest-mode tradeoff first.
--
-- ════════════════════════════════════════════════════════════════════
--   ⚠️  HIGH-IMPACT MIGRATION — READ BEFORE APPLYING
-- ════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES
--   Replaces every RLS policy of the form
--     `((col = COALESCE(auth.uid()::text, '')) OR (auth.uid() IS NULL))`
--   with a strict `clerk_user_id()` check. Drops legacy duplicates that
--   carry the same bypass. After this migration, the public anon key
--   alone is no longer sufficient to mutate any of the affected tables.
--
-- WHY IT'S DEFERRED FROM SEC-P1 / SEC-P0-TIGHTEN
--   sec-p0-tighten was supposed to handle drafts/teams/picks/leagues/
--   matches but its as-applied state in production has the broken
--   pattern baked into the "strict" policies themselves
--   (e.g. drafts_update_host_only.qual = "((host_id = COALESCE(auth.uid())::text, '')) OR (auth.uid() IS NULL))").
--   The sec-p1 migration patched only wishlist_items SELECT/UPDATE/DELETE.
--   Everything else is still anon-mutable.
--
-- BLAST RADIUS
--   Any client code path that writes to these tables WITHOUT a
--   Clerk-authenticated session will start failing. Audit before applying:
--
--   Tables made strict-write here:
--     user_profiles, participants, teams, picks, drafts, auctions, bids,
--     bid_history, pokemon_tiers, custom_formats, chat_messages,
--     spectator_events, draft_actions, draft_results, draft_result_teams,
--     leagues, league_teams, matches, match_games, standings,
--     team_pokemon_status, match_pokemon_kos, trades, trade_approvals,
--     waiver_claims, push_subscriptions, weekly_summaries, weekly_highlights.
--
--   Guest-mode (no Clerk session) flows that currently WRITE directly to
--   these tables from the browser will break. Inventory before applying:
--     • src/lib/auction-service.ts (writes bids/auctions/bid_history)
--     • src/lib/draft-picks-service.ts (manual undo path on picks/teams/drafts)
--     • src/lib/wishlist-service.ts (already broken for guests by sec-p1)
--     • src/lib/trade-service.ts manual fallback (executeTradeManually)
--     • Any direct `supabase.from('participants').update(...)` calls
--
--   For each, EITHER:
--     (a) require Clerk sign-in (recommended path — guest mode is being
--         deprecated per src/lib/user-session.ts comments), OR
--     (b) move the write into a server-side API route that uses
--         createServiceRoleClient() (matches the existing /api/draft/create
--         pattern from commit 3bcf077).
--
-- PRE-APPLY CHECKLIST
--   [ ] Run the codebase grep:
--         git grep -nE "supabase\.from\('(participants|teams|drafts|auctions|bid_history|picks|chat_messages|user_profiles|wishlists?)'\)\.(update|insert|delete)" src/
--       Every hit needs to be either through a Clerk session or moved server-side.
--   [ ] Confirm the Clerk → Supabase JWT bridge:
--         a. The Clerk dashboard has a JWT template named "supabase",
--            HS256-signed with the Supabase JWT secret, claim `sub` = {{user.id}}.
--         b. From a signed-in browser on prod: `fetch('/api/_diag/jwt')` (or
--            execute `SELECT auth.jwt() ->> 'sub'` from Supabase studio
--            impersonating the user) returns the Clerk user id.
--   [ ] Smoke-test in a staging Supabase project, not prod, the first run.
--   [ ] Have a rollback ready — it's destructive only in the sense that
--       the prior policies are dropped; they can be recreated from
--       PRODUCTION_MIGRATION.sql + the migrations applied since.
--
-- COLUMN PRIVILEGE NOTE
--   PostgreSQL column-level REVOKE is a no-op when table-level UPDATE is
--   granted. So this migration first REVOKEs table-level UPDATE on the
--   tables with sensitive columns, then re-GRANTs UPDATE on the columns
--   that ARE legitimately client-writable. Adjust the column lists below
--   before applying — they are conservative defaults.
--
-- Idempotent — safe to re-run.

BEGIN;

-- =====================================================================
-- 0. Verify clerk_user_id() exists (would fail loudly otherwise).
-- =====================================================================
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
-- 1. user_profiles — strip anon escape from UPDATE/INSERT/DELETE
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

-- Effective column lockdown on is_admin (table-level revoke + column-level grant).
REVOKE UPDATE ON public.user_profiles FROM anon, authenticated;
GRANT  UPDATE (display_name, avatar_url, bio, preferences, updated_at)
       ON public.user_profiles TO authenticated;
-- Adjust the column list above to match your actual user-editable columns.

-- =====================================================================
-- 2. participants — strip anon escape; sensitive columns service-role-only
-- =====================================================================
DROP POLICY IF EXISTS participants_update_self        ON public.participants;
DROP POLICY IF EXISTS participants_delete_self_or_host ON public.participants;

CREATE POLICY participants_update_self_or_host ON public.participants
  FOR UPDATE
  USING (
    user_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = participants.draft_id
         AND d.host_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    user_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = participants.draft_id
         AND d.host_id = public.clerk_user_id()
    )
  );

CREATE POLICY participants_delete_host_only ON public.participants
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = participants.draft_id
         AND d.host_id = public.clerk_user_id()
    )
  );

-- is_admin / is_host / user_id / team_id should never be client-writable.
-- Verified via information_schema 2026-05-10: participants has columns
--   id, created_at, draft_id, user_id, display_name, team_id, is_host, is_admin, last_seen
-- so the only legitimately client-writable ones are display_name and last_seen.
REVOKE UPDATE ON public.participants FROM anon, authenticated;
GRANT  UPDATE (display_name, last_seen)
       ON public.participants TO authenticated;
-- promote_to_admin/demote_from_admin and the server-side participant join API
-- are SECURITY DEFINER and bypass this.

-- =====================================================================
-- 3. drafts — replace BOTH the broken strict policies AND the legacy ones
-- =====================================================================
DROP POLICY IF EXISTS drafts_update_host_only  ON public.drafts;
DROP POLICY IF EXISTS drafts_delete_host_only  ON public.drafts;
-- (Legacy "Hosts can update their drafts" / "Users can view drafts they are in"
--  were removed in migration 024_sec_p1_safe_closures.)

CREATE POLICY drafts_update_host_only ON public.drafts
  FOR UPDATE
  USING      (host_id = public.clerk_user_id())
  WITH CHECK (host_id = public.clerk_user_id());

CREATE POLICY drafts_delete_host_only ON public.drafts
  FOR DELETE
  USING (host_id = public.clerk_user_id());

REVOKE UPDATE ON public.drafts FROM anon, authenticated;
GRANT  UPDATE (status, current_turn, current_round, turn_started_at,
               settings, name, description, max_teams, allow_undos,
               max_undos_per_team, deleted_at, updated_at)
       ON public.drafts TO authenticated;
-- host_id, password are never client-writable. Adjust as needed.

-- =====================================================================
-- 4. teams / picks — strict UPDATE/DELETE on clerk_user_id()
-- =====================================================================
DROP POLICY IF EXISTS teams_update_owner_or_host ON public.teams;
DROP POLICY IF EXISTS teams_delete_host_only     ON public.teams;

CREATE POLICY teams_update_owner_or_host ON public.teams
  FOR UPDATE
  USING (
    owner_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = teams.draft_id AND d.host_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    owner_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = teams.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

CREATE POLICY teams_delete_host_only ON public.teams
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = teams.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

REVOKE UPDATE ON public.teams FROM anon, authenticated;
-- Verified via information_schema 2026-05-10: teams has columns
--   id, created_at, draft_id, name, owner_id, budget_remaining, draft_order,
--   undos_remaining, updated_at, logo_url, abbreviation, coach_display_name,
--   discord_handle, division_name
-- Client-writable: cosmetic + draft_order. owner_id and budget_remaining are server-only.
GRANT  UPDATE (name, draft_order, undos_remaining, updated_at,
               logo_url, abbreviation, coach_display_name,
               discord_handle, division_name)
       ON public.teams TO authenticated;

DROP POLICY IF EXISTS picks_update_host_only       ON public.picks;
DROP POLICY IF EXISTS picks_delete_owner_or_host   ON public.picks;
DROP POLICY IF EXISTS picks_delete_host_only       ON public.picks; -- prod-actual name

CREATE POLICY picks_update_host_only ON public.picks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = picks.draft_id AND d.host_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = picks.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

CREATE POLICY picks_delete_owner_or_host ON public.picks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = picks.team_id AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = picks.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

-- =====================================================================
-- 5. auctions / bid_history / pokemon_tiers / custom_formats /
--    chat_messages / spectator_events / draft_actions / draft_results /
--    draft_result_teams — strict policies, dropping anon-escape ones
-- =====================================================================

-- auctions: only the draft host can mutate (bidding goes through place_bid RPC).
DROP POLICY IF EXISTS auctions_update      ON public.auctions;
DROP POLICY IF EXISTS auctions_delete      ON public.auctions;
DROP POLICY IF EXISTS auctions_delete_host ON public.auctions; -- prod-actual name
CREATE POLICY auctions_update_host ON public.auctions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = auctions.draft_id AND d.host_id = public.clerk_user_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = auctions.draft_id AND d.host_id = public.clerk_user_id()
    )
  );
CREATE POLICY auctions_delete_host ON public.auctions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = auctions.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

-- bid_history is append-only; lock UPDATE/DELETE entirely (use service role for any cleanup).
DROP POLICY IF EXISTS bid_history_update ON public.bid_history;
DROP POLICY IF EXISTS bid_history_delete ON public.bid_history;
-- (No new policies — UPDATE/DELETE allowed only to service role.)

-- chat_messages: senders can edit/delete their own; host can moderate.
DROP POLICY IF EXISTS chat_messages_update ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_delete ON public.chat_messages;
CREATE POLICY chat_messages_update_self ON public.chat_messages
  FOR UPDATE USING (sender_id = public.clerk_user_id())
              WITH CHECK (sender_id = public.clerk_user_id());
CREATE POLICY chat_messages_delete_self_or_host ON public.chat_messages
  FOR DELETE USING (
    sender_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = chat_messages.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

-- pokemon_tiers / custom_formats / draft_actions / draft_results /
-- draft_result_teams / spectator_events: lock client UPDATE/DELETE.
DROP POLICY IF EXISTS pokemon_tiers_update         ON public.pokemon_tiers;
DROP POLICY IF EXISTS pokemon_tiers_delete         ON public.pokemon_tiers;
DROP POLICY IF EXISTS pokemon_tiers_update_host    ON public.pokemon_tiers; -- prod-actual name
DROP POLICY IF EXISTS pokemon_tiers_delete_host    ON public.pokemon_tiers; -- prod-actual name
DROP POLICY IF EXISTS custom_formats_update         ON public.custom_formats;
DROP POLICY IF EXISTS custom_formats_delete         ON public.custom_formats;
DROP POLICY IF EXISTS custom_formats_update_creator ON public.custom_formats; -- prod-actual name
DROP POLICY IF EXISTS custom_formats_delete_creator ON public.custom_formats; -- prod-actual name
DROP POLICY IF EXISTS draft_actions_update     ON public.draft_actions;
DROP POLICY IF EXISTS draft_actions_delete     ON public.draft_actions;
DROP POLICY IF EXISTS draft_results_update     ON public.draft_results;
DROP POLICY IF EXISTS draft_results_delete     ON public.draft_results;
DROP POLICY IF EXISTS draft_result_teams_update ON public.draft_result_teams;
DROP POLICY IF EXISTS draft_result_teams_delete ON public.draft_result_teams;
DROP POLICY IF EXISTS spectator_events_update  ON public.spectator_events;
DROP POLICY IF EXISTS spectator_events_delete  ON public.spectator_events;

-- custom_formats: creator-only for UPDATE/DELETE.
CREATE POLICY custom_formats_update_creator ON public.custom_formats
  FOR UPDATE USING (creator_id = public.clerk_user_id())
              WITH CHECK (creator_id = public.clerk_user_id());
CREATE POLICY custom_formats_delete_creator ON public.custom_formats
  FOR DELETE USING (creator_id = public.clerk_user_id());

-- pokemon_tiers / draft_actions / draft_results / draft_result_teams /
-- spectator_events: server-role-only writes (no replacement policies).

-- =====================================================================
-- 6. League system — leagues / league_teams / matches / match_games /
--    standings / team_pokemon_status / match_pokemon_kos / trades /
--    trade_approvals / waiver_claims / weekly_summaries / weekly_highlights
-- =====================================================================

-- leagues: commissioner-or-host (already mostly correct from sec-p0-tighten,
-- but recheck after this migration for any anon-escape duplicates).
-- Drop any legacy duplicates that may still exist:
DROP POLICY IF EXISTS leagues_update              ON public.leagues;
DROP POLICY IF EXISTS leagues_delete              ON public.leagues;
DROP POLICY IF EXISTS leagues_update_commissioner ON public.leagues;
DROP POLICY IF EXISTS leagues_delete_commissioner ON public.leagues;

CREATE POLICY leagues_update_commissioner ON public.leagues
  FOR UPDATE USING (
    public.clerk_user_id() IS NOT NULL
    AND (
      (settings ->> 'commissionerId') = public.clerk_user_id()
      OR EXISTS (
        SELECT 1 FROM drafts d
         WHERE d.id = leagues.draft_id AND d.host_id = public.clerk_user_id()
      )
    )
  ) WITH CHECK (
    public.clerk_user_id() IS NOT NULL
    AND (
      (settings ->> 'commissionerId') = public.clerk_user_id()
      OR EXISTS (
        SELECT 1 FROM drafts d
         WHERE d.id = leagues.draft_id AND d.host_id = public.clerk_user_id()
      )
    )
  );

CREATE POLICY leagues_delete_commissioner ON public.leagues
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = leagues.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

-- matches: commissioner OR participating team owner can update; commissioner-only delete.
DROP POLICY IF EXISTS matches_update                       ON public.matches;
DROP POLICY IF EXISTS matches_delete                       ON public.matches;
DROP POLICY IF EXISTS matches_update_commish_or_participant ON public.matches;
DROP POLICY IF EXISTS matches_update_participants          ON public.matches;
DROP POLICY IF EXISTS matches_delete_commish_only          ON public.matches;
DROP POLICY IF EXISTS matches_delete_commissioner          ON public.matches;

CREATE POLICY matches_update_commish_or_participant ON public.matches
  FOR UPDATE USING (
    public.clerk_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM leagues l
         WHERE l.id = matches.league_id
           AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
      )
      OR EXISTS (
        SELECT 1 FROM teams t
         WHERE t.id IN (matches.home_team_id, matches.away_team_id)
           AND t.owner_id = public.clerk_user_id()
      )
    )
  ) WITH CHECK (
    public.clerk_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM leagues l
         WHERE l.id = matches.league_id
           AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
      )
      OR EXISTS (
        SELECT 1 FROM teams t
         WHERE t.id IN (matches.home_team_id, matches.away_team_id)
           AND t.owner_id = public.clerk_user_id()
      )
    )
  );

CREATE POLICY matches_delete_commish_only ON public.matches
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = matches.league_id
         AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
    )
  );

-- waiver_claims: drop legacy permissive policies, lock to team owner.
DROP POLICY IF EXISTS "Anyone can view waiver claims"       ON public.waiver_claims;
DROP POLICY IF EXISTS "Team owners can insert claims"       ON public.waiver_claims;
DROP POLICY IF EXISTS "Team owners can update own claims"   ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_update                  ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_delete                  ON public.waiver_claims;

CREATE POLICY waiver_claims_select_in_league ON public.waiver_claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = waiver_claims.team_id
         AND (
           t.owner_id = public.clerk_user_id()
           OR EXISTS (
             SELECT 1 FROM teams t2
              WHERE t2.draft_id = t.draft_id
                AND t2.owner_id = public.clerk_user_id()
           )
         )
    )
  );

CREATE POLICY waiver_claims_insert_owner ON public.waiver_claims
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = waiver_claims.team_id
         AND t.owner_id = public.clerk_user_id()
    )
  );

CREATE POLICY waiver_claims_update_owner ON public.waiver_claims
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = waiver_claims.team_id
         AND t.owner_id = public.clerk_user_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = waiver_claims.team_id
         AND t.owner_id = public.clerk_user_id()
    )
  );

CREATE POLICY waiver_claims_delete_owner ON public.waiver_claims
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = waiver_claims.team_id
         AND t.owner_id = public.clerk_user_id()
    )
  );

-- standings / team_pokemon_status / match_pokemon_kos / match_games:
-- service-role-only writes (these are derived/computed by RPCs).
DROP POLICY IF EXISTS standings_update                ON public.standings;
DROP POLICY IF EXISTS standings_delete                ON public.standings;
DROP POLICY IF EXISTS standings_insert                ON public.standings;
DROP POLICY IF EXISTS standings_update_commissioner   ON public.standings;            -- prod-actual name
DROP POLICY IF EXISTS standings_delete_commissioner   ON public.standings;            -- prod-actual name
DROP POLICY IF EXISTS team_pokemon_status_update              ON public.team_pokemon_status;
DROP POLICY IF EXISTS team_pokemon_status_delete              ON public.team_pokemon_status;
DROP POLICY IF EXISTS team_pokemon_status_delete_commissioner ON public.team_pokemon_status; -- prod-actual name
DROP POLICY IF EXISTS match_pokemon_kos_update              ON public.match_pokemon_kos;
DROP POLICY IF EXISTS match_pokemon_kos_delete              ON public.match_pokemon_kos;
DROP POLICY IF EXISTS match_pokemon_kos_delete_commissioner ON public.match_pokemon_kos; -- prod-actual name
DROP POLICY IF EXISTS match_games_update                ON public.match_games;
DROP POLICY IF EXISTS match_games_delete                ON public.match_games;
DROP POLICY IF EXISTS match_games_delete_commissioner   ON public.match_games;        -- prod-actual name

-- league_teams: commissioner-or-host write only.
DROP POLICY IF EXISTS league_teams_update                  ON public.league_teams;
DROP POLICY IF EXISTS league_teams_delete                  ON public.league_teams;
DROP POLICY IF EXISTS league_teams_update_commissioner     ON public.league_teams;    -- prod-actual name
DROP POLICY IF EXISTS league_teams_delete_commissioner     ON public.league_teams;    -- prod-actual name
CREATE POLICY league_teams_update_commish ON public.league_teams
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = league_teams.league_id
         AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = league_teams.league_id
         AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
    )
  );

-- trades / trade_approvals: only the involved team owners or commissioner.
DROP POLICY IF EXISTS trades_update                  ON public.trades;
DROP POLICY IF EXISTS trades_delete                  ON public.trades;
DROP POLICY IF EXISTS trades_update_involved         ON public.trades;          -- prod-actual name
DROP POLICY IF EXISTS trades_delete_commissioner     ON public.trades;          -- prod-actual name
DROP POLICY IF EXISTS trade_approvals_update         ON public.trade_approvals;
DROP POLICY IF EXISTS trade_approvals_delete         ON public.trade_approvals;
DROP POLICY IF EXISTS trade_approvals_update_self    ON public.trade_approvals; -- prod-actual name

CREATE POLICY trades_update_owner_or_commish ON public.trades
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id IN (trades.team_a_id, trades.team_b_id)
         AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = trades.league_id
         AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id IN (trades.team_a_id, trades.team_b_id)
         AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = trades.league_id
         AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
    )
  );

CREATE POLICY trades_delete_proposer_or_commish ON public.trades
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = trades.team_a_id
         AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = trades.league_id
         AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
    )
  );

-- trade_approvals has columns: id, trade_id, approver_user_id, approver_role,
-- approved, comments, created_at. Approver-self model.
CREATE POLICY trade_approvals_update_self ON public.trade_approvals
  FOR UPDATE
  USING      (approver_user_id = public.clerk_user_id())
  WITH CHECK (approver_user_id = public.clerk_user_id());

-- push_subscriptions: server-side only (route uses service role); lock client UPDATE/DELETE.
-- Prod-actual names from migration 023 are push_subscriptions_self_{update,delete};
-- both have a strict `clerk_user_id() = user_id` check (no anon-escape). Drop both
-- generic and prod-actual names so re-running this migration is idempotent and any
-- legacy permissive policies are also removed.
DROP POLICY IF EXISTS push_subscriptions_update      ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete      ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update_self ON public.push_subscriptions; -- this migration's own
DROP POLICY IF EXISTS push_subscriptions_delete_self ON public.push_subscriptions; -- this migration's own
CREATE POLICY push_subscriptions_update_self ON public.push_subscriptions
  FOR UPDATE USING (user_id = public.clerk_user_id())
              WITH CHECK (user_id = public.clerk_user_id());
CREATE POLICY push_subscriptions_delete_self ON public.push_subscriptions
  FOR DELETE USING (user_id = public.clerk_user_id());
-- NOTE: push_subscriptions_self_{update,delete} from migration 023 are also strict;
-- they remain in place. Permissive duplicates merely OR together — having two
-- equivalent strict policies is safe.

-- =====================================================================
-- 7. Tighten public SELECT on tables that should be draft-scoped
-- =====================================================================

-- These currently have `qual = true` (public). Restrict to draft participants:
-- chat_messages, bid_history, draft_actions, spectator_events.
-- (Leave drafts/teams/picks/participants public — spectator mode depends on them.)

DROP POLICY IF EXISTS chat_messages_select      ON public.chat_messages;
CREATE POLICY chat_messages_select_in_draft ON public.chat_messages
  FOR SELECT USING (
    public.clerk_user_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM participants p
       WHERE p.draft_id = chat_messages.draft_id
         AND p.user_id  = public.clerk_user_id()
    )
  );

DROP POLICY IF EXISTS bid_history_select        ON public.bid_history;
-- bid_history has no draft_id; join through auctions.
CREATE POLICY bid_history_select_in_draft ON public.bid_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM auctions a
        JOIN participants p ON p.draft_id = a.draft_id
       WHERE a.id = bid_history.auction_id
         AND p.user_id = public.clerk_user_id()
    )
  );

DROP POLICY IF EXISTS draft_actions_select      ON public.draft_actions;
CREATE POLICY draft_actions_select_in_draft ON public.draft_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.draft_id = draft_actions.draft_id
         AND p.user_id  = public.clerk_user_id()
    )
  );

-- =====================================================================
-- 8. Record migration
-- =====================================================================
INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '025_sec_p2_close_anon_escape',
  'Strip every `auth.uid() IS NULL` escape across user_profiles/participants/drafts/teams/picks/auctions/bid_history/leagues/matches/trades/etc; rebuild on clerk_user_id(); table-level UPDATE revoked + column-grants reissued for legitimately client-writable columns; tighten SELECT on chat/bid_history/draft_actions to draft participants.',
  'See PRODUCTION_MIGRATION.sql for the prior policy definitions. Reverting is non-trivial.'
) ON CONFLICT (name) DO NOTHING;

COMMIT;
