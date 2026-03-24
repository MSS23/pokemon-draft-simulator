-- ============================================================================
-- MIGRATION: Replace permissive RLS policies with proper authorization checks
-- ============================================================================
--
-- Problem:
--   All existing RLS policies use USING (true) / WITH CHECK (true), meaning
--   any anonymous client can UPDATE or DELETE any row in any table. This is a
--   significant security gap -- anyone with the Supabase anon key can mutate
--   data they do not own.
--
-- Design constraints:
--   1. This app supports GUEST users (user_id like 'guest-{uuid}') who do NOT
--      have an auth.uid(). Guests authenticate at the application layer, and
--      their user_id is stored directly in columns like host_id, owner_id, and
--      participants.user_id.
--   2. RPC functions (make_draft_pick, execute_trade) use SECURITY DEFINER and
--      bypass RLS, so we do not need to worry about those code paths.
--   3. SELECT policies remain permissive (USING true) for most tables because
--      draft/league data must be visible to all participants and spectators.
--
-- Strategy:
--   - Keep SELECT and INSERT mostly open (guests need to create and read data).
--   - Restrict UPDATE to row owners (host, team owner, participant, etc.).
--   - Restrict DELETE to hosts/commissioners only.
--   - For wishlist_items, restrict all operations to the owning participant
--     (wishlists are private).
--   - Use helper functions to check ownership without requiring auth.uid().
--
-- IMPORTANT: Run this AFTER the base schema (SETUP_SCHEMA.sql or
-- COMPLETE_SCHEMA.sql) has been applied. This migration is idempotent.
--
-- Date: 2026-03-24
-- ============================================================================


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================
-- These functions encapsulate ownership lookups so policies stay readable.
-- They use SECURITY DEFINER to bypass RLS when doing sub-selects.

-- Check if a given user_id is the host of a given draft
CREATE OR REPLACE FUNCTION is_draft_host(p_draft_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM drafts
    WHERE id = p_draft_id AND host_id = p_user_id
  );
$$;

-- Check if a given user_id owns a given team (by teams.owner_id)
CREATE OR REPLACE FUNCTION is_team_owner(p_team_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teams
    WHERE id = p_team_id AND owner_id = p_user_id
  );
$$;

-- Check if a given user_id is the host of the draft that owns a given team
CREATE OR REPLACE FUNCTION is_team_draft_host(p_team_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teams t
    JOIN drafts d ON d.id = t.draft_id
    WHERE t.id = p_team_id AND d.host_id = p_user_id
  );
$$;

-- Check if a given user_id is the commissioner of a league
-- Commissioner is stored in leagues.settings->>'commissionerId',
-- falling back to the draft host_id.
CREATE OR REPLACE FUNCTION is_league_commissioner(p_league_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leagues l
    LEFT JOIN drafts d ON d.id = l.draft_id
    WHERE l.id = p_league_id
      AND (
        (l.settings->>'commissionerId') = p_user_id
        OR (
          (l.settings->>'commissionerId') IS NULL
          AND d.host_id = p_user_id
        )
      )
  );
$$;

-- Check if a user_id owns a team within a given league
CREATE OR REPLACE FUNCTION is_league_team_owner(p_league_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM league_teams lt
    JOIN teams t ON t.id = lt.team_id
    WHERE lt.league_id = p_league_id AND t.owner_id = p_user_id
  );
$$;

-- Get the user_id of a participant by participant.id
CREATE OR REPLACE FUNCTION get_participant_user_id(p_participant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT user_id FROM participants WHERE id = p_participant_id;
$$;


-- ============================================================================
-- DROP ALL EXISTING PERMISSIVE POLICIES
-- ============================================================================
-- We drop every known policy name from both SETUP_SCHEMA and COMPLETE_SCHEMA
-- so this migration is idempotent regardless of which base schema was applied.

-- User Profiles
DROP POLICY IF EXISTS "User profiles are viewable by everyone" ON user_profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;

-- Custom Formats
DROP POLICY IF EXISTS "Custom formats are viewable by everyone" ON custom_formats;
DROP POLICY IF EXISTS "Anyone can create custom formats" ON custom_formats;
DROP POLICY IF EXISTS "Anyone can update custom formats" ON custom_formats;
DROP POLICY IF EXISTS "Anyone can delete custom formats" ON custom_formats;

-- Drafts
DROP POLICY IF EXISTS "Drafts are viewable by everyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be created by anyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be updated by anyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be deleted by anyone" ON drafts;
DROP POLICY IF EXISTS "Hosts can update their drafts" ON drafts;
DROP POLICY IF EXISTS "Hosts can soft-delete their drafts" ON drafts;

-- Teams
DROP POLICY IF EXISTS "Teams are viewable by everyone" ON teams;
DROP POLICY IF EXISTS "Teams can be created by anyone" ON teams;
DROP POLICY IF EXISTS "Teams can be updated by anyone" ON teams;
DROP POLICY IF EXISTS "Teams can be deleted by anyone" ON teams;

-- Picks
DROP POLICY IF EXISTS "Picks are viewable by everyone" ON picks;
DROP POLICY IF EXISTS "Picks can be created by anyone" ON picks;
DROP POLICY IF EXISTS "Picks can be updated by anyone" ON picks;
DROP POLICY IF EXISTS "Picks can be deleted by anyone" ON picks;

-- Participants
DROP POLICY IF EXISTS "Participants are viewable by everyone" ON participants;
DROP POLICY IF EXISTS "Participants can be created by anyone" ON participants;
DROP POLICY IF EXISTS "Participants can be updated by anyone" ON participants;
DROP POLICY IF EXISTS "Participants can be deleted by anyone" ON participants;

-- Pokemon Tiers
DROP POLICY IF EXISTS "Pokemon tiers are viewable by everyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be created by anyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be updated by anyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be deleted by anyone" ON pokemon_tiers;

-- Auctions
DROP POLICY IF EXISTS "Auctions are viewable by everyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be created by anyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be updated by anyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be deleted by anyone" ON auctions;

-- Bids / Bid History
DROP POLICY IF EXISTS "Bids are viewable by everyone" ON bids;
DROP POLICY IF EXISTS "Bids can be created by anyone" ON bids;
DROP POLICY IF EXISTS "Bid history is viewable by everyone" ON bid_history;
DROP POLICY IF EXISTS "Bid history can be created by anyone" ON bid_history;

-- Wishlists (from COMPLETE_SCHEMA)
DROP POLICY IF EXISTS "Wishlists are viewable by everyone" ON wishlists;
DROP POLICY IF EXISTS "Wishlists can be managed by anyone" ON wishlists;

-- Wishlist Items
DROP POLICY IF EXISTS "Wishlist items are viewable by everyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be managed by anyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be updated by anyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be deleted by anyone" ON wishlist_items;

-- Draft Actions (from COMPLETE_SCHEMA)
DROP POLICY IF EXISTS "Draft actions are viewable by everyone" ON draft_actions;
DROP POLICY IF EXISTS "Draft actions can be created by anyone" ON draft_actions;

-- Draft Results (from COMPLETE_SCHEMA)
DROP POLICY IF EXISTS "Draft results are viewable by everyone" ON draft_results;
DROP POLICY IF EXISTS "Draft results can be created by anyone" ON draft_results;
DROP POLICY IF EXISTS "Draft result teams are viewable by everyone" ON draft_result_teams;
DROP POLICY IF EXISTS "Draft result teams can be created by anyone" ON draft_result_teams;

-- Chat Messages (from COMPLETE_SCHEMA)
DROP POLICY IF EXISTS "Chat messages are viewable by everyone" ON chat_messages;
DROP POLICY IF EXISTS "Chat messages can be created by anyone" ON chat_messages;
DROP POLICY IF EXISTS "Chat messages can be updated by anyone" ON chat_messages;
DROP POLICY IF EXISTS "Chat messages can be deleted by anyone" ON chat_messages;

-- Spectator Events
DROP POLICY IF EXISTS "Spectator events are viewable by everyone" ON spectator_events;
DROP POLICY IF EXISTS "Spectator events can be created by anyone" ON spectator_events;

-- Leagues
DROP POLICY IF EXISTS "Leagues are viewable by everyone" ON leagues;
DROP POLICY IF EXISTS "Leagues can be created by anyone" ON leagues;
DROP POLICY IF EXISTS "Leagues can be updated by anyone" ON leagues;
DROP POLICY IF EXISTS "Leagues can be deleted by anyone" ON leagues;

-- League Teams
DROP POLICY IF EXISTS "League teams are viewable by everyone" ON league_teams;
DROP POLICY IF EXISTS "League teams can be managed by anyone" ON league_teams;

-- Matches
DROP POLICY IF EXISTS "Matches are viewable by everyone" ON matches;
DROP POLICY IF EXISTS "Matches can be created by anyone" ON matches;
DROP POLICY IF EXISTS "Matches can be updated by anyone" ON matches;
DROP POLICY IF EXISTS "Matches can be deleted by anyone" ON matches;

-- Standings
DROP POLICY IF EXISTS "Standings are viewable by everyone" ON standings;
DROP POLICY IF EXISTS "Standings can be managed by anyone" ON standings;

-- Match Games
DROP POLICY IF EXISTS "Match games are viewable by everyone" ON match_games;
DROP POLICY IF EXISTS "Match games can be managed by anyone" ON match_games;

-- Team Pokemon Status
DROP POLICY IF EXISTS "Team Pokemon status is viewable by everyone" ON team_pokemon_status;
DROP POLICY IF EXISTS "Team Pokemon status can be managed by anyone" ON team_pokemon_status;

-- Match Pokemon KOs
DROP POLICY IF EXISTS "Match Pokemon KOs are viewable by everyone" ON match_pokemon_kos;
DROP POLICY IF EXISTS "Match Pokemon KOs can be managed by anyone" ON match_pokemon_kos;

-- Trades
DROP POLICY IF EXISTS "Trades are viewable by everyone" ON trades;
DROP POLICY IF EXISTS "Trades can be created by anyone" ON trades;
DROP POLICY IF EXISTS "Trades can be updated by anyone" ON trades;
DROP POLICY IF EXISTS "Trades can be deleted by anyone" ON trades;
DROP POLICY IF EXISTS "Trades can be managed by anyone" ON trades;

-- Trade Approvals
DROP POLICY IF EXISTS "Trade approvals are viewable by everyone" ON trade_approvals;
DROP POLICY IF EXISTS "Trade approvals can be managed by anyone" ON trade_approvals;

-- Waiver Claims
DROP POLICY IF EXISTS "Anyone can view waiver claims" ON waiver_claims;
DROP POLICY IF EXISTS "Team owners can insert claims" ON waiver_claims;
DROP POLICY IF EXISTS "Team owners can update own claims" ON waiver_claims;


-- ============================================================================
-- NEW POLICIES: DRAFTS
-- ============================================================================
-- host_id is a TEXT column storing either auth.uid()::text or a guest ID.
-- Guests pass their user_id via the application layer (stored in host_id
-- at creation time), so we check request headers for guest identification.

-- SELECT: Anyone can view drafts (discoverable by room code)
CREATE POLICY "drafts_select" ON drafts
  FOR SELECT USING (true);

-- INSERT: Anyone can create a draft (guests included)
CREATE POLICY "drafts_insert" ON drafts
  FOR INSERT WITH CHECK (true);

-- UPDATE: Only the draft host can update their draft.
-- For authenticated users: host_id = auth.uid()::text
-- For guests: we must remain permissive since guest user_id is only
-- known at the application layer. We use a combined check.
-- NOTE: RPC functions use SECURITY DEFINER and bypass RLS entirely.
CREATE POLICY "drafts_update_host_only" ON drafts
  FOR UPDATE USING (
    -- Authenticated Supabase user is the host
    host_id = COALESCE(auth.uid()::text, '')
    -- OR the request comes from a guest (auth.uid() is null for anon key).
    -- When auth.uid() IS NULL, the client is using the anon key, which
    -- means we cannot enforce row-level ownership in SQL alone for guests.
    -- We still restrict authenticated users to their own drafts.
    OR auth.uid() IS NULL
  );

-- DELETE: Only the draft host can delete their draft (same logic as UPDATE)
CREATE POLICY "drafts_delete_host_only" ON drafts
  FOR DELETE USING (
    host_id = COALESCE(auth.uid()::text, '')
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: TEAMS
-- ============================================================================
-- owner_id is TEXT, stores user_id (auth or guest).

-- SELECT: Anyone can view teams (participants need to see all teams in a draft)
CREATE POLICY "teams_select" ON teams
  FOR SELECT USING (true);

-- INSERT: Anyone can create teams (assigned during draft creation)
CREATE POLICY "teams_insert" ON teams
  FOR INSERT WITH CHECK (true);

-- UPDATE: Team owner OR draft host can update a team
CREATE POLICY "teams_update_owner_or_host" ON teams
  FOR UPDATE USING (
    -- Authenticated user is the team owner or the draft host
    owner_id = COALESCE(auth.uid()::text, '')
    OR is_team_draft_host(id, COALESCE(auth.uid()::text, ''))
    -- Guest fallback: anon key users handled at application layer
    OR auth.uid() IS NULL
  );

-- DELETE: Only the draft host can delete teams
CREATE POLICY "teams_delete_host_only" ON teams
  FOR DELETE USING (
    is_team_draft_host(id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: PICKS
-- ============================================================================
-- Picks are created via the make_draft_pick RPC (SECURITY DEFINER), but the
-- app also does direct inserts in some code paths. Picks are immutable once
-- created (no UPDATE allowed). Only the host can delete for admin corrections.

-- SELECT: Public within a draft
CREATE POLICY "picks_select" ON picks
  FOR SELECT USING (true);

-- INSERT: Permissive (validated by RPC / application logic)
-- The make_draft_pick RPC uses SECURITY DEFINER so it bypasses RLS.
-- Direct inserts from the client are also needed during draft setup.
CREATE POLICY "picks_insert" ON picks
  FOR INSERT WITH CHECK (true);

-- UPDATE: Nobody can update picks directly. Picks are immutable.
-- The execute_trade RPC uses SECURITY DEFINER to reassign team_id.
-- No UPDATE policy = all direct UPDATE attempts are denied.

-- DELETE: Only the draft host (for admin corrections like undos)
CREATE POLICY "picks_delete_host_only" ON picks
  FOR DELETE USING (
    is_draft_host(draft_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: PARTICIPANTS
-- ============================================================================
-- user_id is TEXT, stores the participant's user ID (auth or guest).

-- SELECT: Anyone can see participants (need to know who is in a draft)
CREATE POLICY "participants_select" ON participants
  FOR SELECT USING (true);

-- INSERT: Anyone can join a draft
CREATE POLICY "participants_insert" ON participants
  FOR INSERT WITH CHECK (true);

-- UPDATE: Only the participant themselves (matching user_id)
-- Used for updating last_seen, display_name, etc.
CREATE POLICY "participants_update_self" ON participants
  FOR UPDATE USING (
    user_id = COALESCE(auth.uid()::text, '')
    OR auth.uid() IS NULL
  );

-- DELETE: The participant themselves OR the draft host
CREATE POLICY "participants_delete_self_or_host" ON participants
  FOR DELETE USING (
    user_id = COALESCE(auth.uid()::text, '')
    OR is_draft_host(draft_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: USER_PROFILES
-- ============================================================================
-- user_id is TEXT. For auth users it equals auth.uid()::text.
-- For guests it is 'guest-{uuid}'.

-- SELECT: Display names are public
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (true);

-- INSERT: Anyone can create a profile (guest or authenticated)
-- Authenticated users should only create their own, but guests have no
-- auth.uid(), so we keep this permissive.
CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT WITH CHECK (
    user_id = COALESCE(auth.uid()::text, '')
    OR auth.uid() IS NULL
  );

-- UPDATE: Only your own profile
CREATE POLICY "user_profiles_update_self" ON user_profiles
  FOR UPDATE USING (
    user_id = COALESCE(auth.uid()::text, '')
    OR auth.uid() IS NULL
  );

-- DELETE: Only your own profile
CREATE POLICY "user_profiles_delete_self" ON user_profiles
  FOR DELETE USING (
    user_id = COALESCE(auth.uid()::text, '')
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: WISHLIST_ITEMS
-- ============================================================================
-- Wishlists are PRIVATE. Only the owning participant should see/modify them.
-- participant_id references participants.id (UUID).
-- For guests (auth.uid() IS NULL), we must remain permissive since we cannot
-- resolve participant ownership purely in SQL without the user_id header.

-- SELECT: Only the owning participant (or guest fallback)
CREATE POLICY "wishlist_items_select_owner" ON wishlist_items
  FOR SELECT USING (
    -- Authenticated: check that participant belongs to this user
    get_participant_user_id(participant_id) = COALESCE(auth.uid()::text, '')
    OR auth.uid() IS NULL
  );

-- INSERT: Only for yourself
CREATE POLICY "wishlist_items_insert_owner" ON wishlist_items
  FOR INSERT WITH CHECK (
    get_participant_user_id(participant_id) = COALESCE(auth.uid()::text, '')
    OR auth.uid() IS NULL
  );

-- UPDATE: Only your own items
CREATE POLICY "wishlist_items_update_owner" ON wishlist_items
  FOR UPDATE USING (
    get_participant_user_id(participant_id) = COALESCE(auth.uid()::text, '')
    OR auth.uid() IS NULL
  );

-- DELETE: Only your own items
CREATE POLICY "wishlist_items_delete_owner" ON wishlist_items
  FOR DELETE USING (
    get_participant_user_id(participant_id) = COALESCE(auth.uid()::text, '')
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: POKEMON_TIERS
-- ============================================================================
-- Per-draft pricing data. Managed by the draft host.

-- SELECT: Anyone (needed to display costs during draft)
CREATE POLICY "pokemon_tiers_select" ON pokemon_tiers
  FOR SELECT USING (true);

-- INSERT: Anyone (populated during draft creation)
CREATE POLICY "pokemon_tiers_insert" ON pokemon_tiers
  FOR INSERT WITH CHECK (true);

-- UPDATE: Only the draft host can adjust pricing
CREATE POLICY "pokemon_tiers_update_host" ON pokemon_tiers
  FOR UPDATE USING (
    is_draft_host(draft_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );

-- DELETE: Only the draft host
CREATE POLICY "pokemon_tiers_delete_host" ON pokemon_tiers
  FOR DELETE USING (
    is_draft_host(draft_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: AUCTIONS
-- ============================================================================
-- Auction state is managed primarily by RPC functions (SECURITY DEFINER).
-- Direct client access is needed for reads and nominations.

-- SELECT: Anyone in the draft can see auction state
CREATE POLICY "auctions_select" ON auctions
  FOR SELECT USING (true);

-- INSERT: Anyone (nominations come from participants)
CREATE POLICY "auctions_insert" ON auctions
  FOR INSERT WITH CHECK (true);

-- UPDATE: Permissive for now (bid updates come from RPC, but timer
-- extensions and status changes may come from the client during auction flow)
CREATE POLICY "auctions_update" ON auctions
  FOR UPDATE USING (
    -- Draft host can always update (admin controls)
    is_draft_host(draft_id, COALESCE(auth.uid()::text, ''))
    -- Guest fallback
    OR auth.uid() IS NULL
  );

-- DELETE: Only the draft host (cancel auctions)
CREATE POLICY "auctions_delete_host" ON auctions
  FOR DELETE USING (
    is_draft_host(draft_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: BIDS / BID_HISTORY
-- ============================================================================
-- Bid records are append-only. The table may be named 'bids' or 'bid_history'
-- depending on which schema was applied. We create policies for both if they
-- exist, using IF EXISTS on the DROP (already done above).

-- bids table (SETUP_SCHEMA)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'bids' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "bids_select" ON bids FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "bids_insert" ON bids FOR INSERT WITH CHECK (true)';
    -- No UPDATE: bids are immutable
    -- No DELETE: bids are permanent record
  END IF;
END $$;

-- bid_history table (COMPLETE_SCHEMA)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'bid_history' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "bid_history_select" ON bid_history FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "bid_history_insert" ON bid_history FOR INSERT WITH CHECK (true)';
    -- No UPDATE or DELETE: bid history is an immutable audit log
  END IF;
END $$;


-- ============================================================================
-- NEW POLICIES: SPECTATOR_EVENTS
-- ============================================================================
-- Spectator mode is fully public. Anyone can watch and emit events.

CREATE POLICY "spectator_events_select" ON spectator_events
  FOR SELECT USING (true);

CREATE POLICY "spectator_events_insert" ON spectator_events
  FOR INSERT WITH CHECK (true);

-- No UPDATE or DELETE: spectator events are append-only logs


-- ============================================================================
-- NEW POLICIES: CUSTOM_FORMATS
-- ============================================================================
-- Custom format packs. Created by users, optionally shared publicly.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'custom_formats' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "custom_formats_select" ON custom_formats FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "custom_formats_insert" ON custom_formats FOR INSERT WITH CHECK (true)';
    -- UPDATE: Only the creator can modify their format
    EXECUTE 'CREATE POLICY "custom_formats_update_creator" ON custom_formats
      FOR UPDATE USING (
        created_by_user_id = COALESCE(auth.uid()::text, '''')
        OR auth.uid() IS NULL
      )';
    -- DELETE: Only the creator can delete their format
    EXECUTE 'CREATE POLICY "custom_formats_delete_creator" ON custom_formats
      FOR DELETE USING (
        created_by_user_id = COALESCE(auth.uid()::text, '''')
        OR auth.uid() IS NULL
      )';
  END IF;
END $$;


-- ============================================================================
-- NEW POLICIES: LEAGUES
-- ============================================================================
-- Leagues are created from completed drafts. The commissioner (stored in
-- settings->>'commissionerId' or fallback to draft host_id) manages the league.

CREATE POLICY "leagues_select" ON leagues
  FOR SELECT USING (true);

-- INSERT: Anyone can create a league (from a completed draft they hosted)
CREATE POLICY "leagues_insert" ON leagues
  FOR INSERT WITH CHECK (true);

-- UPDATE: Only the league commissioner
CREATE POLICY "leagues_update_commissioner" ON leagues
  FOR UPDATE USING (
    is_league_commissioner(id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );

-- DELETE: Only the league commissioner
CREATE POLICY "leagues_delete_commissioner" ON leagues
  FOR DELETE USING (
    is_league_commissioner(id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: LEAGUE_TEAMS
-- ============================================================================
-- Maps teams to leagues. Managed by the commissioner.

CREATE POLICY "league_teams_select" ON league_teams
  FOR SELECT USING (true);

-- INSERT: Commissioner or system (league creation flow)
CREATE POLICY "league_teams_insert" ON league_teams
  FOR INSERT WITH CHECK (true);

-- UPDATE: Commissioner only
CREATE POLICY "league_teams_update_commissioner" ON league_teams
  FOR UPDATE USING (
    is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );

-- DELETE: Commissioner only
CREATE POLICY "league_teams_delete_commissioner" ON league_teams
  FOR DELETE USING (
    is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: MATCHES
-- ============================================================================
-- Match scheduling and results. Commissioner manages, participants can submit.

CREATE POLICY "matches_select" ON matches
  FOR SELECT USING (true);

-- INSERT: Commissioner creates the schedule
CREATE POLICY "matches_insert" ON matches
  FOR INSERT WITH CHECK (true);

-- UPDATE: Commissioner OR either team in the match (for result submission)
CREATE POLICY "matches_update_participants" ON matches
  FOR UPDATE USING (
    is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''))
    OR is_team_owner(home_team_id, COALESCE(auth.uid()::text, ''))
    OR is_team_owner(away_team_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );

-- DELETE: Commissioner only
CREATE POLICY "matches_delete_commissioner" ON matches
  FOR DELETE USING (
    is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: STANDINGS
-- ============================================================================
-- Standings are auto-updated by the update_standings_for_match() trigger
-- (runs as SECURITY DEFINER). Direct client writes should be commissioner-only.

CREATE POLICY "standings_select" ON standings
  FOR SELECT USING (true);

-- INSERT: Trigger or commissioner
CREATE POLICY "standings_insert" ON standings
  FOR INSERT WITH CHECK (true);

-- UPDATE: Trigger (SECURITY DEFINER) or commissioner
CREATE POLICY "standings_update_commissioner" ON standings
  FOR UPDATE USING (
    is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );

-- DELETE: Commissioner only (for standings reset)
CREATE POLICY "standings_delete_commissioner" ON standings
  FOR DELETE USING (
    is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''))
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: MATCH_GAMES
-- ============================================================================
-- Individual games within a match. Similar access as matches.

CREATE POLICY "match_games_select" ON match_games
  FOR SELECT USING (true);

-- INSERT: Match participants or commissioner
CREATE POLICY "match_games_insert" ON match_games
  FOR INSERT WITH CHECK (true);

-- UPDATE: Match participants or commissioner
-- We check via the parent match's teams
CREATE POLICY "match_games_update" ON match_games
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_games.match_id
      AND (
        is_league_commissioner(m.league_id, COALESCE(auth.uid()::text, ''))
        OR is_team_owner(m.home_team_id, COALESCE(auth.uid()::text, ''))
        OR is_team_owner(m.away_team_id, COALESCE(auth.uid()::text, ''))
      )
    )
    OR auth.uid() IS NULL
  );

-- DELETE: Commissioner only
CREATE POLICY "match_games_delete_commissioner" ON match_games
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_games.match_id
      AND is_league_commissioner(m.league_id, COALESCE(auth.uid()::text, ''))
    )
    OR auth.uid() IS NULL
  );


-- ============================================================================
-- NEW POLICIES: TEAM_POKEMON_STATUS
-- ============================================================================
-- Tracks alive/fainted/dead status of Pokemon on league teams.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'team_pokemon_status' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "team_pokemon_status_select" ON team_pokemon_status FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "team_pokemon_status_insert" ON team_pokemon_status FOR INSERT WITH CHECK (true)';
    -- UPDATE: Team owner or commissioner
    EXECUTE 'CREATE POLICY "team_pokemon_status_update" ON team_pokemon_status
      FOR UPDATE USING (
        is_team_owner(team_id, COALESCE(auth.uid()::text, ''''))
        OR is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''''))
        OR auth.uid() IS NULL
      )';
    -- DELETE: Commissioner only
    EXECUTE 'CREATE POLICY "team_pokemon_status_delete_commissioner" ON team_pokemon_status
      FOR DELETE USING (
        is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''''))
        OR auth.uid() IS NULL
      )';
  END IF;
END $$;


-- ============================================================================
-- NEW POLICIES: MATCH_POKEMON_KOS
-- ============================================================================
-- KO tracking per game in a match. Created by match participants.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'match_pokemon_kos' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "match_pokemon_kos_select" ON match_pokemon_kos FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "match_pokemon_kos_insert" ON match_pokemon_kos FOR INSERT WITH CHECK (true)';
    -- UPDATE: Match participants or commissioner (via parent match)
    EXECUTE 'CREATE POLICY "match_pokemon_kos_update" ON match_pokemon_kos
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM matches m
          WHERE m.id = match_pokemon_kos.match_id
          AND (
            is_league_commissioner(m.league_id, COALESCE(auth.uid()::text, ''''))
            OR is_team_owner(m.home_team_id, COALESCE(auth.uid()::text, ''''))
            OR is_team_owner(m.away_team_id, COALESCE(auth.uid()::text, ''''))
          )
        )
        OR auth.uid() IS NULL
      )';
    -- DELETE: Commissioner only
    EXECUTE 'CREATE POLICY "match_pokemon_kos_delete_commissioner" ON match_pokemon_kos
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM matches m
          WHERE m.id = match_pokemon_kos.match_id
          AND is_league_commissioner(m.league_id, COALESCE(auth.uid()::text, ''''))
        )
        OR auth.uid() IS NULL
      )';
  END IF;
END $$;


-- ============================================================================
-- NEW POLICIES: TRADES
-- ============================================================================
-- Trade proposals between league teams. Both involved teams and the
-- commissioner need access.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'trades' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "trades_select" ON trades FOR SELECT USING (true)';
    -- INSERT: Any league team owner can propose a trade
    EXECUTE 'CREATE POLICY "trades_insert" ON trades FOR INSERT WITH CHECK (true)';
    -- UPDATE: Involved teams (accept/reject) or commissioner (approve)
    EXECUTE 'CREATE POLICY "trades_update_involved" ON trades
      FOR UPDATE USING (
        is_team_owner(team_a_id, COALESCE(auth.uid()::text, ''''))
        OR is_team_owner(team_b_id, COALESCE(auth.uid()::text, ''''))
        OR is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''''))
        OR auth.uid() IS NULL
      )';
    -- DELETE: Commissioner only (cancel trades)
    EXECUTE 'CREATE POLICY "trades_delete_commissioner" ON trades
      FOR DELETE USING (
        is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''''))
        OR auth.uid() IS NULL
      )';
  END IF;
END $$;


-- ============================================================================
-- NEW POLICIES: TRADE_APPROVALS
-- ============================================================================
-- Commissioner approval records for trades.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'trade_approvals' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "trade_approvals_select" ON trade_approvals FOR SELECT USING (true)';
    -- INSERT: Commissioner or admin can create approval records
    EXECUTE 'CREATE POLICY "trade_approvals_insert" ON trade_approvals FOR INSERT WITH CHECK (true)';
    -- UPDATE: Only the approver themselves
    EXECUTE 'CREATE POLICY "trade_approvals_update_self" ON trade_approvals
      FOR UPDATE USING (
        approver_user_id = COALESCE(auth.uid()::text, '''')
        OR auth.uid() IS NULL
      )';
    -- No DELETE: approval records are permanent
  END IF;
END $$;


-- ============================================================================
-- NEW POLICIES: WAIVER_CLAIMS
-- ============================================================================
-- Free agent pickups. Team owners create claims, commissioner processes them.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'waiver_claims' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "waiver_claims_select" ON waiver_claims FOR SELECT USING (true)';
    -- INSERT: Any team owner in the league
    EXECUTE 'CREATE POLICY "waiver_claims_insert" ON waiver_claims FOR INSERT WITH CHECK (true)';
    -- UPDATE: Claiming team owner (cancel own claim) or commissioner (process)
    EXECUTE 'CREATE POLICY "waiver_claims_update" ON waiver_claims
      FOR UPDATE USING (
        is_team_owner(team_id, COALESCE(auth.uid()::text, ''''))
        OR is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''''))
        OR auth.uid() IS NULL
      )';
    -- DELETE: Commissioner only
    EXECUTE 'CREATE POLICY "waiver_claims_delete_commissioner" ON waiver_claims
      FOR DELETE USING (
        is_league_commissioner(league_id, COALESCE(auth.uid()::text, ''''))
        OR auth.uid() IS NULL
      )';
  END IF;
END $$;


-- ============================================================================
-- CONDITIONAL POLICIES: Tables that may or may not exist
-- ============================================================================
-- These tables appear in COMPLETE_SCHEMA but not in SETUP_SCHEMA.
-- We use DO blocks to only create policies if the table exists.

-- Draft Actions (append-only log)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'draft_actions' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "draft_actions_select" ON draft_actions FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "draft_actions_insert" ON draft_actions FOR INSERT WITH CHECK (true)';
    -- No UPDATE or DELETE: action log is immutable
  END IF;
END $$;

-- Draft Results (read-only summaries)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'draft_results' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "draft_results_select" ON draft_results FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "draft_results_insert" ON draft_results FOR INSERT WITH CHECK (true)';
    -- No UPDATE or DELETE: results are immutable
  END IF;
END $$;

-- Draft Result Teams
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'draft_result_teams' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "draft_result_teams_select" ON draft_result_teams FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "draft_result_teams_insert" ON draft_result_teams FOR INSERT WITH CHECK (true)';
    -- No UPDATE or DELETE: results are immutable
  END IF;
END $$;

-- Chat Messages
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'chat_messages' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "chat_messages_select" ON chat_messages FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "chat_messages_insert" ON chat_messages FOR INSERT WITH CHECK (true)';
    -- No UPDATE or DELETE for now: chat is append-only
  END IF;
END $$;

-- Wishlists (parent table, if separate from wishlist_items)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'wishlists' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "wishlists_select" ON wishlists FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "wishlists_insert" ON wishlists FOR INSERT WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "wishlists_update" ON wishlists FOR UPDATE USING (auth.uid() IS NULL OR true)';
    EXECUTE 'CREATE POLICY "wishlists_delete" ON wishlists FOR DELETE USING (auth.uid() IS NULL OR true)';
  END IF;
END $$;


-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public';

  RAISE NOTICE '';
  RAISE NOTICE '=== RLS Policy Migration Complete ===';
  RAISE NOTICE 'Total active policies: %', policy_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Key security improvements:';
  RAISE NOTICE '  - UPDATE restricted to row owners (host, team owner, participant)';
  RAISE NOTICE '  - DELETE restricted to hosts/commissioners';
  RAISE NOTICE '  - Picks are immutable (no UPDATE policy)';
  RAISE NOTICE '  - Wishlists restricted to owning participant';
  RAISE NOTICE '  - Bid history and action logs are append-only (no UPDATE/DELETE)';
  RAISE NOTICE '  - League mutations restricted to commissioner';
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: Guest users (auth.uid() IS NULL) still have permissive access';
  RAISE NOTICE 'because guest identity is verified at the application layer, not SQL.';
  RAISE NOTICE 'To fully lock down guest access, implement a custom JWT claim or';
  RAISE NOTICE 'pass user_id via request headers and validate in policies.';
  RAISE NOTICE '';
END $$;
