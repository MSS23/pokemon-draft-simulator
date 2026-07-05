-- Migration: sec-p2b — close anon-escape on league tables (chunk B of 3).
-- Tables: leagues, league_teams, matches, match_games, standings,
--         team_pokemon_status, match_pokemon_kos, trades, trade_approvals,
--         waiver_claims
--
-- Mirrors section 6 of sec-p2-close-anon-escape-DRAFT.sql.
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
    RAISE EXCEPTION 'public.clerk_user_id() must exist before applying this migration.';
  END IF;
END
$verify$;

-- =====================================================================
-- leagues — commissioner-or-host
-- =====================================================================
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

-- =====================================================================
-- league_teams — commissioner-or-host
-- =====================================================================
DROP POLICY IF EXISTS league_teams_update                  ON public.league_teams;
DROP POLICY IF EXISTS league_teams_delete                  ON public.league_teams;
DROP POLICY IF EXISTS league_teams_update_commissioner     ON public.league_teams;
DROP POLICY IF EXISTS league_teams_delete_commissioner     ON public.league_teams;
DROP POLICY IF EXISTS league_teams_update_commish          ON public.league_teams;

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

-- =====================================================================
-- matches — commissioner OR participating team owner
-- =====================================================================
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

-- =====================================================================
-- match_games / match_pokemon_kos / standings / team_pokemon_status —
-- service-role-only writes (computed by RPCs).
-- =====================================================================
DROP POLICY IF EXISTS match_games_update                  ON public.match_games;
DROP POLICY IF EXISTS match_games_delete                  ON public.match_games;
DROP POLICY IF EXISTS match_games_delete_commissioner     ON public.match_games;
DROP POLICY IF EXISTS match_pokemon_kos_update              ON public.match_pokemon_kos;
DROP POLICY IF EXISTS match_pokemon_kos_delete              ON public.match_pokemon_kos;
DROP POLICY IF EXISTS match_pokemon_kos_delete_commissioner ON public.match_pokemon_kos;
DROP POLICY IF EXISTS standings_update                  ON public.standings;
DROP POLICY IF EXISTS standings_delete                  ON public.standings;
DROP POLICY IF EXISTS standings_insert                  ON public.standings;
DROP POLICY IF EXISTS standings_update_commissioner     ON public.standings;
DROP POLICY IF EXISTS standings_delete_commissioner     ON public.standings;
DROP POLICY IF EXISTS team_pokemon_status_update              ON public.team_pokemon_status;
DROP POLICY IF EXISTS team_pokemon_status_delete              ON public.team_pokemon_status;
DROP POLICY IF EXISTS team_pokemon_status_delete_commissioner ON public.team_pokemon_status;

-- =====================================================================
-- trades / trade_approvals
-- =====================================================================
DROP POLICY IF EXISTS trades_update                  ON public.trades;
DROP POLICY IF EXISTS trades_delete                  ON public.trades;
DROP POLICY IF EXISTS trades_update_involved         ON public.trades;
DROP POLICY IF EXISTS trades_delete_commissioner     ON public.trades;
DROP POLICY IF EXISTS trades_update_owner_or_commish      ON public.trades;
DROP POLICY IF EXISTS trades_delete_proposer_or_commish   ON public.trades;
DROP POLICY IF EXISTS trade_approvals_update         ON public.trade_approvals;
DROP POLICY IF EXISTS trade_approvals_delete         ON public.trade_approvals;
DROP POLICY IF EXISTS trade_approvals_update_self    ON public.trade_approvals;

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

CREATE POLICY trade_approvals_update_self ON public.trade_approvals
  FOR UPDATE
  USING      (approver_user_id = public.clerk_user_id())
  WITH CHECK (approver_user_id = public.clerk_user_id());

-- =====================================================================
-- waiver_claims
-- =====================================================================
DROP POLICY IF EXISTS "Anyone can view waiver claims"       ON public.waiver_claims;
DROP POLICY IF EXISTS "Team owners can insert claims"       ON public.waiver_claims;
DROP POLICY IF EXISTS "Team owners can update own claims"   ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_update                  ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_delete                  ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_delete_commissioner     ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_select_in_league        ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_insert_owner            ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_update_owner            ON public.waiver_claims;
DROP POLICY IF EXISTS waiver_claims_delete_owner            ON public.waiver_claims;

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

-- =====================================================================
-- Record migration
-- =====================================================================
INSERT INTO _migrations (name, description) VALUES (
  '025b_sec_p2_league_tables',
  'sec-p2 chunk B: anon-escape removed from leagues, league_teams, matches, match_games, match_pokemon_kos, standings, team_pokemon_status, trades, trade_approvals, waiver_claims; legacy permissive waiver policies dropped.'
) ON CONFLICT (name) DO NOTHING;

COMMIT;
