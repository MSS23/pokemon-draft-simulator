-- Migration: Implement Proper RLS Policies
-- Description: Replaces permissive "allow all" policies with secure, role-based access control
-- WARNING: This will restrict access. Ensure you have authentication set up before applying!

-- ============================================================================
-- DRAFTS TABLE
-- ============================================================================

-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow all operations on drafts" ON drafts;

-- Users can read drafts they're participating in
CREATE POLICY "Users can view drafts they participate in"
  ON drafts FOR SELECT
  USING (
    id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
    )
    OR is_public = true
  );

-- Only hosts can create drafts
CREATE POLICY "Authenticated users can create drafts"
  ON drafts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Only hosts can update their drafts
CREATE POLICY "Hosts can update their drafts"
  ON drafts FOR UPDATE
  USING (
    host_id = auth.uid()::text
    OR id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- Only hosts can delete their drafts
CREATE POLICY "Hosts can delete their drafts"
  ON drafts FOR DELETE
  USING (
    host_id = auth.uid()::text
    OR id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- ============================================================================
-- TEAMS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Allow all operations on teams" ON teams;

-- Anyone can view teams in drafts they participate in
CREATE POLICY "Users can view teams in their drafts"
  ON teams FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
    )
    OR draft_id IN (
      SELECT id FROM drafts WHERE is_public = true
    )
  );

-- Users can create teams when joining a draft
CREATE POLICY "Users can create teams"
  ON teams FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()::text
  );

-- Teams can only be updated by their owners or draft host
CREATE POLICY "Owners and hosts can update teams"
  ON teams FOR UPDATE
  USING (
    owner_id = auth.uid()::text
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- Teams can only be deleted by their owners or draft host
CREATE POLICY "Owners and hosts can delete teams"
  ON teams FOR DELETE
  USING (
    owner_id = auth.uid()::text
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- ============================================================================
-- PARTICIPANTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Allow all operations on participants" ON participants;

-- Anyone can view participants in drafts they're in
CREATE POLICY "Users can view participants in their drafts"
  ON participants FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
    )
    OR draft_id IN (
      SELECT id FROM drafts WHERE is_public = true
    )
  );

-- Users can create participant records for themselves
CREATE POLICY "Users can join drafts"
  ON participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()::text
  );

-- Users can update their own participant records
-- Hosts can update any participant in their draft
CREATE POLICY "Users and hosts can update participants"
  ON participants FOR UPDATE
  USING (
    user_id = auth.uid()::text
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- Users can remove themselves, hosts can remove anyone
CREATE POLICY "Users and hosts can remove participants"
  ON participants FOR DELETE
  USING (
    user_id = auth.uid()::text
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- ============================================================================
-- PICKS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Allow all operations on picks" ON picks;

-- Anyone can view picks in drafts they're in
CREATE POLICY "Users can view picks in their drafts"
  ON picks FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
    )
    OR draft_id IN (
      SELECT id FROM drafts WHERE is_public = true
    )
  );

-- Only team owners can create picks for their team
CREATE POLICY "Team owners can create picks"
  ON picks FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams
      WHERE owner_id = auth.uid()::text
    )
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- Only hosts can delete picks (for undo functionality)
CREATE POLICY "Hosts can delete picks"
  ON picks FOR DELETE
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- ============================================================================
-- AUCTIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Allow all operations on auctions" ON auctions;

-- Anyone can view auctions in their drafts
CREATE POLICY "Users can view auctions in their drafts"
  ON auctions FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
    )
    OR draft_id IN (
      SELECT id FROM drafts WHERE is_public = true
    )
  );

-- Participants can create auctions (nominations)
CREATE POLICY "Participants can create auctions"
  ON auctions FOR INSERT
  WITH CHECK (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
    )
  );

-- System can update auctions (for bid updates)
CREATE POLICY "Participants can update auctions"
  ON auctions FOR UPDATE
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
    )
  );

-- Hosts can delete auctions
CREATE POLICY "Hosts can delete auctions"
  ON auctions FOR DELETE
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- ============================================================================
-- BID_HISTORY TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Allow all operations on bid_history" ON bid_history;

-- Anyone can view bid history in their drafts
CREATE POLICY "Users can view bid history in their drafts"
  ON bid_history FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
    )
    OR draft_id IN (
      SELECT id FROM drafts WHERE is_public = true
    )
  );

-- Team owners can create bids
CREATE POLICY "Team owners can create bids"
  ON bid_history FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams
      WHERE owner_id = auth.uid()::text
    )
  );

-- ============================================================================
-- DRAFT_RESULTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Allow all operations on draft_results" ON draft_results;

-- Anyone can view results from drafts they participated in
CREATE POLICY "Users can view results from their drafts"
  ON draft_results FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
    )
    OR draft_id IN (
      SELECT id FROM drafts WHERE is_public = true
    )
  );

-- System creates results automatically via trigger
CREATE POLICY "System can create draft results"
  ON draft_results FOR INSERT
  WITH CHECK (true);

-- Hosts can delete results
CREATE POLICY "Hosts can delete draft results"
  ON draft_results FOR DELETE
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = auth.uid()::text
      AND is_host = true
    )
  );

-- ============================================================================
-- DRAFT_RESULT_TEAMS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Allow all operations on draft_result_teams" ON draft_result_teams;

-- Anyone can view team results
CREATE POLICY "Users can view team results"
  ON draft_result_teams FOR SELECT
  USING (
    draft_result_id IN (
      SELECT id FROM draft_results
      WHERE draft_id IN (
        SELECT draft_id FROM participants
        WHERE user_id = auth.uid()::text
      )
      OR draft_id IN (
        SELECT id FROM drafts WHERE is_public = true
      )
    )
  );

-- System creates team results automatically
CREATE POLICY "System can create team results"
  ON draft_result_teams FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- NOTES AND WARNINGS
-- ============================================================================

-- 1. These policies assume you're using Supabase Auth with auth.uid()
-- 2. Guest access uses string-based user_id (e.g., "guest-123")
-- 3. For guest support, you may need to adjust policies to check user_id patterns
-- 4. Public drafts are viewable by anyone (is_public = true)
-- 5. Consider implementing rate limiting for INSERT operations
-- 6. Test thoroughly before deploying to production!

-- To support guest users (no auth.uid()), consider adding:
-- COMMENT: OR user_id LIKE 'guest-%' OR user_id LIKE 'spectator-%'
-- to appropriate SELECT policies

COMMENT ON POLICY "Users can view drafts they participate in" ON drafts IS
  'Allows users to view drafts they are participating in, plus all public drafts';

COMMENT ON POLICY "Hosts can update their drafts" ON drafts IS
  'Only draft hosts can modify draft settings and status';
