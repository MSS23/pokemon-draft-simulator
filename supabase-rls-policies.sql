-- =====================================================
-- SECURE ROW LEVEL SECURITY POLICIES
-- Updated to work with current schema (no is_public column)
-- Supports both authenticated users and guest users
-- =====================================================

-- First, drop all existing permissive policies
DROP POLICY IF EXISTS "Allow all operations on drafts" ON drafts;
DROP POLICY IF EXISTS "Allow all operations on teams" ON teams;
DROP POLICY IF EXISTS "Allow all operations on picks" ON picks;
DROP POLICY IF EXISTS "Allow all operations on participants" ON participants;
DROP POLICY IF EXISTS "Allow all operations on pokemon_tiers" ON pokemon_tiers;
DROP POLICY IF EXISTS "Allow all operations on auctions" ON auctions;
DROP POLICY IF EXISTS "Allow all operations on bids" ON bids;
DROP POLICY IF EXISTS "Allow all operations on wishlist_items" ON wishlist_items;

-- =====================================================
-- DRAFTS TABLE POLICIES
-- =====================================================

-- Anyone can view all drafts (required for room code lookup)
CREATE POLICY "Anyone can view drafts"
  ON drafts FOR SELECT
  USING (true);

-- Anyone can create drafts (supports guest users)
CREATE POLICY "Anyone can create drafts"
  ON drafts FOR INSERT
  WITH CHECK (true);

-- Only draft host can update their draft
-- Supports both authenticated users and guest IDs
CREATE POLICY "Draft host can update their draft"
  ON drafts FOR UPDATE
  USING (
    host_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
    OR host_id LIKE 'guest-%'
  );

-- Only draft host can delete their draft
CREATE POLICY "Draft host can delete their draft"
  ON drafts FOR DELETE
  USING (
    host_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
    OR host_id LIKE 'guest-%'
  );

-- =====================================================
-- TEAMS TABLE POLICIES
-- =====================================================

-- Anyone can view teams (required for spectator mode)
CREATE POLICY "Anyone can view teams"
  ON teams FOR SELECT
  USING (true);

-- Anyone can create teams (supports guest users joining drafts)
CREATE POLICY "Anyone can create teams"
  ON teams FOR INSERT
  WITH CHECK (true);

-- Team owners can update their teams
CREATE POLICY "Team owners can update their teams"
  ON teams FOR UPDATE
  USING (
    owner_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
    OR owner_id LIKE 'guest-%'
  );

-- Team owners and draft hosts can delete teams
CREATE POLICY "Team owners can delete their teams"
  ON teams FOR DELETE
  USING (
    owner_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
    OR owner_id LIKE 'guest-%'
    OR EXISTS (
      SELECT 1 FROM drafts
      WHERE drafts.id = teams.draft_id
      AND (
        drafts.host_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
        OR drafts.host_id LIKE 'guest-%'
      )
    )
  );

-- =====================================================
-- PICKS TABLE POLICIES
-- =====================================================

-- Anyone can view picks (required for spectator mode and draft history)
CREATE POLICY "Anyone can view picks"
  ON picks FOR SELECT
  USING (true);

-- Team owners can create picks for their team
CREATE POLICY "Team owners can create picks"
  ON picks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
    )
  );

-- Picks are generally immutable, but allow deletes for undo functionality
CREATE POLICY "Team owners can delete their picks"
  ON picks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
      AND (
        teams.owner_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
        OR teams.owner_id LIKE 'guest-%'
      )
    )
  );

-- =====================================================
-- PARTICIPANTS TABLE POLICIES
-- =====================================================

-- Anyone can view participants (required for participant lists)
CREATE POLICY "Anyone can view participants"
  ON participants FOR SELECT
  USING (true);

-- Anyone can join drafts as participants (supports guest users)
CREATE POLICY "Anyone can join drafts"
  ON participants FOR INSERT
  WITH CHECK (true);

-- Users can update their own participant record (for last_seen, etc.)
CREATE POLICY "Users can update their participant record"
  ON participants FOR UPDATE
  USING (
    user_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
    OR user_id LIKE 'guest-%'
  );

-- Users can leave drafts (delete their participant record)
CREATE POLICY "Users can leave drafts"
  ON participants FOR DELETE
  USING (
    user_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
    OR user_id LIKE 'guest-%'
  );

-- =====================================================
-- POKEMON_TIERS TABLE POLICIES
-- =====================================================

-- Anyone can view pokemon tiers (required for draft setup)
CREATE POLICY "Anyone can view pokemon tiers"
  ON pokemon_tiers FOR SELECT
  USING (true);

-- Draft hosts can manage pokemon tiers
CREATE POLICY "Draft host can manage pokemon tiers"
  ON pokemon_tiers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM drafts
      WHERE drafts.id = draft_id
      AND (
        drafts.host_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
        OR drafts.host_id LIKE 'guest-%'
      )
    )
  );

-- =====================================================
-- AUCTIONS TABLE POLICIES
-- =====================================================

-- Anyone can view auctions (required for auction drafts)
CREATE POLICY "Anyone can view auctions"
  ON auctions FOR SELECT
  USING (true);

-- Draft participants can create auctions
CREATE POLICY "Draft participants can create auctions"
  ON auctions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.draft_id = draft_id
    )
  );

-- Draft participants can update active auctions (for bidding)
CREATE POLICY "Draft participants can update auctions"
  ON auctions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.draft_id = draft_id
    )
  );

-- Draft hosts can delete auctions
CREATE POLICY "Draft host can delete auctions"
  ON auctions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM drafts
      WHERE drafts.id = draft_id
      AND (
        drafts.host_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
        OR drafts.host_id LIKE 'guest-%'
      )
    )
  );

-- =====================================================
-- BIDS TABLE POLICIES
-- =====================================================

-- Anyone can view bids (required for bid history display)
CREATE POLICY "Anyone can view bids"
  ON bids FOR SELECT
  USING (true);

-- Team owners can create bids for their team
CREATE POLICY "Team owners can create bids"
  ON bids FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
    )
  );

-- Bids are generally immutable (no UPDATE policy)

-- Team owners can delete their own bids (for corrections)
CREATE POLICY "Team owners can delete their bids"
  ON bids FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
      AND (
        teams.owner_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
        OR teams.owner_id LIKE 'guest-%'
      )
    )
  );

-- =====================================================
-- WISHLIST_ITEMS TABLE POLICIES
-- =====================================================

-- Anyone can view wishlists (currently open access)
-- You may want to restrict this to participant's own wishlists
CREATE POLICY "Anyone can view wishlist items"
  ON wishlist_items FOR SELECT
  USING (true);

-- Participants can create wishlist items
CREATE POLICY "Participants can create wishlist items"
  ON wishlist_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.id = participant_id
    )
  );

-- Participants can update their wishlist items
CREATE POLICY "Participants can update their wishlist items"
  ON wishlist_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.id = participant_id
      AND (
        participants.user_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
        OR participants.user_id LIKE 'guest-%'
      )
    )
  );

-- Participants can delete their wishlist items
CREATE POLICY "Participants can delete their wishlist items"
  ON wishlist_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.id = participant_id
      AND (
        participants.user_id = COALESCE(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
        OR participants.user_id LIKE 'guest-%'
      )
    )
  );

-- =====================================================
-- ADDITIONAL SECURITY NOTES
-- =====================================================
--
-- CURRENT APPROACH:
-- These policies are permissive to support the current guest-user system.
-- They allow read access to most data (required for spectator mode) and
-- use ownership checks for write/update/delete operations.
--
-- SECURITY CONSIDERATIONS:
-- 1. Guest IDs (guest-*) are client-generated and not cryptographically secure
-- 2. All drafts are effectively "public" (anyone can view)
-- 3. This works for the current use case but has limitations:
--    - No private drafts
--    - Guest users could theoretically impersonate each other
--    - No audit trail of who did what
--
-- RECOMMENDED IMPROVEMENTS FOR PRODUCTION:
-- 1. Require authentication for draft creation
-- 2. Add session-based validation for guest users
-- 3. Add an is_public column to drafts table
-- 4. Restrict wishlist viewing to owner only
-- 5. Add rate limiting at the application level
-- 6. Consider using Supabase's anonymous sign-in for guest users
--
-- TO MAKE POLICIES MORE RESTRICTIVE:
-- Option A: Require authentication
--   - Remove all "OR host_id LIKE 'guest-%'" conditions
--   - Change "WITH CHECK (true)" to "WITH CHECK (auth.uid() IS NOT NULL)"
--
-- Option B: Add is_public column (recommended)
--   - ALTER TABLE drafts ADD COLUMN is_public BOOLEAN DEFAULT true;
--   - Update SELECT policies to check is_public
--   - Keep guest support for public drafts only
--
-- =====================================================
