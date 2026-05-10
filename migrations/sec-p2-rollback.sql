-- sec-p2 ROLLBACK — restores the policy state captured in
-- migrations/sec-p2-pre-flight-snapshot.json (taken on 2026-05-10 from prod).
--
-- WARNING: This file recreates policies that contain the
--   `(... OR (auth.uid() IS NULL))` anon-escape pattern. Running this puts
--   you back in the pre-sec-p2 state, in which the public anon key alone is
--   sufficient to mutate every covered table. Only use as an emergency back-out.
--
-- Apply order: drop new strict policies first, recreate the old permissive ones,
-- restore the table-level UPDATE grants, remove the migration record.
--
-- Idempotent: safe to re-run.

BEGIN;

SET LOCAL lock_timeout      = '5s';
SET LOCAL statement_timeout = '30s';

-- ============================================================
-- 1. Drop all policies created by sec-p2 (and its A/B/C chunks)
-- ============================================================
DROP POLICY IF EXISTS user_profiles_update_self                 ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert                      ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_delete_self                 ON public.user_profiles;
DROP POLICY IF EXISTS participants_update_self_or_host          ON public.participants;
DROP POLICY IF EXISTS participants_delete_host_only             ON public.participants;
DROP POLICY IF EXISTS drafts_update_host_only                   ON public.drafts;
DROP POLICY IF EXISTS drafts_delete_host_only                   ON public.drafts;
DROP POLICY IF EXISTS teams_update_owner_or_host                ON public.teams;
DROP POLICY IF EXISTS teams_delete_host_only                    ON public.teams;
DROP POLICY IF EXISTS picks_update_host_only                    ON public.picks;
DROP POLICY IF EXISTS picks_delete_owner_or_host                ON public.picks;
DROP POLICY IF EXISTS auctions_update_host                      ON public.auctions;
DROP POLICY IF EXISTS auctions_delete_host                      ON public.auctions;
DROP POLICY IF EXISTS chat_messages_update_self                 ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_delete_self_or_host         ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_select_in_draft             ON public.chat_messages;
DROP POLICY IF EXISTS bid_history_select_in_draft               ON public.bid_history;
DROP POLICY IF EXISTS draft_actions_select_in_draft             ON public.draft_actions;
DROP POLICY IF EXISTS custom_formats_update_creator             ON public.custom_formats;
DROP POLICY IF EXISTS custom_formats_delete_creator             ON public.custom_formats;
DROP POLICY IF EXISTS leagues_update_commissioner               ON public.leagues;
DROP POLICY IF EXISTS leagues_delete_commissioner               ON public.leagues;
DROP POLICY IF EXISTS matches_update_commish_or_participant     ON public.matches;
DROP POLICY IF EXISTS matches_delete_commish_only               ON public.matches;
DROP POLICY IF EXISTS league_teams_update_commish               ON public.league_teams;
DROP POLICY IF EXISTS waiver_claims_select_in_league            ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_insert_owner                ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_update_owner                ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_delete_owner                ON public.waiver_claims;
DROP POLICY IF EXISTS trades_update_owner_or_commish            ON public.trades;
DROP POLICY IF EXISTS trades_delete_proposer_or_commish         ON public.trades;
DROP POLICY IF EXISTS trade_approvals_update_self               ON public.trade_approvals;
DROP POLICY IF EXISTS trade_approvals_update_owner              ON public.trade_approvals;
-- push_subscriptions: keep self_* policies that pre-existed; only drop the duplicate ones sec-p2 added.
DROP POLICY IF EXISTS push_subscriptions_update_self            ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete_self            ON public.push_subscriptions;

-- ============================================================
-- 2. Recreate the original (anon-escape) policies as captured in pre-flight
-- ============================================================

-- user_profiles
CREATE POLICY user_profiles_update_self ON public.user_profiles
  FOR UPDATE
  USING ((user_id = COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY user_profiles_insert ON public.user_profiles
  FOR INSERT
  WITH CHECK ((user_id = COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY user_profiles_delete_self ON public.user_profiles
  FOR DELETE
  USING ((user_id = COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- participants
CREATE POLICY participants_update_self ON public.participants
  FOR UPDATE
  USING ((user_id = COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY participants_delete_self_or_host ON public.participants
  FOR DELETE
  USING ((user_id = COALESCE((auth.uid())::text, ''::text)) OR is_draft_host(draft_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- drafts
CREATE POLICY drafts_update_host_only ON public.drafts
  FOR UPDATE
  USING ((host_id = COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY drafts_delete_host_only ON public.drafts
  FOR DELETE
  USING ((host_id = COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- teams
CREATE POLICY teams_update_owner_or_host ON public.teams
  FOR UPDATE
  USING ((owner_id = COALESCE((auth.uid())::text, ''::text)) OR is_team_draft_host(id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY teams_delete_host_only ON public.teams
  FOR DELETE
  USING (is_team_draft_host(id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- picks
CREATE POLICY picks_delete_host_only ON public.picks
  FOR DELETE
  USING (is_draft_host(draft_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- auctions
CREATE POLICY auctions_update ON public.auctions
  FOR UPDATE
  USING (is_draft_host(draft_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY auctions_delete_host ON public.auctions
  FOR DELETE
  USING (is_draft_host(draft_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- chat_messages: original SELECT was `qual = true`
CREATE POLICY chat_messages_select ON public.chat_messages
  FOR SELECT USING (true);

-- bid_history: original SELECT was `qual = true`
CREATE POLICY bid_history_select ON public.bid_history
  FOR SELECT USING (true);

-- draft_actions: original SELECT was `qual = true`
CREATE POLICY draft_actions_select ON public.draft_actions
  FOR SELECT USING (true);

-- pokemon_tiers
CREATE POLICY pokemon_tiers_update_host ON public.pokemon_tiers
  FOR UPDATE
  USING (is_draft_host(draft_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY pokemon_tiers_delete_host ON public.pokemon_tiers
  FOR DELETE
  USING (is_draft_host(draft_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- custom_formats
CREATE POLICY custom_formats_update_creator ON public.custom_formats
  FOR UPDATE
  USING ((created_by_user_id = COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY custom_formats_delete_creator ON public.custom_formats
  FOR DELETE
  USING ((created_by_user_id = COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- leagues
CREATE POLICY leagues_update_commissioner ON public.leagues
  FOR UPDATE
  USING (is_league_commissioner(id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY leagues_delete_commissioner ON public.leagues
  FOR DELETE
  USING (is_league_commissioner(id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- league_teams
CREATE POLICY league_teams_update_commissioner ON public.league_teams
  FOR UPDATE
  USING (is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY league_teams_delete_commissioner ON public.league_teams
  FOR DELETE
  USING (is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- matches
CREATE POLICY matches_update_participants ON public.matches
  FOR UPDATE
  USING (is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text))
         OR is_team_owner(home_team_id, COALESCE((auth.uid())::text, ''::text))
         OR is_team_owner(away_team_id, COALESCE((auth.uid())::text, ''::text))
         OR (auth.uid() IS NULL));
CREATE POLICY matches_delete_commissioner ON public.matches
  FOR DELETE
  USING (is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- match_games
CREATE POLICY match_games_update ON public.match_games
  FOR UPDATE USING (
    (EXISTS (
      SELECT 1 FROM matches m
       WHERE m.id = match_games.match_id
         AND (is_league_commissioner(m.league_id, COALESCE((auth.uid())::text, ''::text))
              OR is_team_owner(m.home_team_id, COALESCE((auth.uid())::text, ''::text))
              OR is_team_owner(m.away_team_id, COALESCE((auth.uid())::text, ''::text)))
    )) OR (auth.uid() IS NULL)
  );
CREATE POLICY match_games_delete_commissioner ON public.match_games
  FOR DELETE USING (
    (EXISTS (
      SELECT 1 FROM matches m
       WHERE m.id = match_games.match_id
         AND is_league_commissioner(m.league_id, COALESCE((auth.uid())::text, ''::text))
    )) OR (auth.uid() IS NULL)
  );

-- match_pokemon_kos
CREATE POLICY match_pokemon_kos_update ON public.match_pokemon_kos
  FOR UPDATE USING (
    (EXISTS (
      SELECT 1 FROM matches m
       WHERE m.id = match_pokemon_kos.match_id
         AND (is_league_commissioner(m.league_id, COALESCE((auth.uid())::text, ''::text))
              OR is_team_owner(m.home_team_id, COALESCE((auth.uid())::text, ''::text))
              OR is_team_owner(m.away_team_id, COALESCE((auth.uid())::text, ''::text)))
    )) OR (auth.uid() IS NULL)
  );
CREATE POLICY match_pokemon_kos_delete_commissioner ON public.match_pokemon_kos
  FOR DELETE USING (
    (EXISTS (
      SELECT 1 FROM matches m
       WHERE m.id = match_pokemon_kos.match_id
         AND is_league_commissioner(m.league_id, COALESCE((auth.uid())::text, ''::text))
    )) OR (auth.uid() IS NULL)
  );

-- standings
CREATE POLICY standings_update_commissioner ON public.standings
  FOR UPDATE
  USING (is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY standings_delete_commissioner ON public.standings
  FOR DELETE
  USING (is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- team_pokemon_status
CREATE POLICY team_pokemon_status_update ON public.team_pokemon_status
  FOR UPDATE
  USING (is_team_owner(team_id, COALESCE((auth.uid())::text, ''::text))
         OR is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text))
         OR (auth.uid() IS NULL));
CREATE POLICY team_pokemon_status_delete_commissioner ON public.team_pokemon_status
  FOR DELETE
  USING (is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- trades
CREATE POLICY trades_update_involved ON public.trades
  FOR UPDATE
  USING (is_team_owner(team_a_id, COALESCE((auth.uid())::text, ''::text))
         OR is_team_owner(team_b_id, COALESCE((auth.uid())::text, ''::text))
         OR is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text))
         OR (auth.uid() IS NULL));
CREATE POLICY trades_delete_commissioner ON public.trades
  FOR DELETE
  USING (is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- trade_approvals
CREATE POLICY trade_approvals_update_self ON public.trade_approvals
  FOR UPDATE
  USING ((approver_user_id = COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));

-- waiver_claims (restore the legacy permissive ones too)
CREATE POLICY waiver_claims_update ON public.waiver_claims
  FOR UPDATE
  USING (is_team_owner(team_id, COALESCE((auth.uid())::text, ''::text))
         OR is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text))
         OR (auth.uid() IS NULL));
CREATE POLICY waiver_claims_delete_commissioner ON public.waiver_claims
  FOR DELETE
  USING (is_league_commissioner(league_id, COALESCE((auth.uid())::text, ''::text)) OR (auth.uid() IS NULL));
CREATE POLICY "Anyone can view waiver claims" ON public.waiver_claims
  FOR SELECT USING (true);
CREATE POLICY "Team owners can update own claims" ON public.waiver_claims
  FOR UPDATE USING (true);
CREATE POLICY "Team owners can insert claims" ON public.waiver_claims
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- 3. Restore the table-level UPDATE grants that sec-p2 revoked
-- ============================================================
GRANT UPDATE ON public.user_profiles TO anon, authenticated;
GRANT UPDATE ON public.participants  TO anon, authenticated;
GRANT UPDATE ON public.drafts        TO anon, authenticated;
GRANT UPDATE ON public.teams         TO anon, authenticated;

-- ============================================================
-- 4. Remove migration records
-- ============================================================
DELETE FROM _migrations WHERE name IN (
  '025_sec_p2_close_anon_escape',
  '025a_sec_p2_low_risk_tables',
  '025b_sec_p2_league_tables',
  '025c_sec_p2_live_draft_tables'
);

COMMIT;
