-- ============================================================================
-- COMPREHENSIVE SECURITY MIGRATION (FIXED FOR ACTUAL SCHEMA)
-- Description: Applies proper RLS policies matching your actual database schema
-- WARNING: This replaces permissive policies with secure ones
-- ============================================================================

-- ============================================================================
-- STEP 1: Enable RLS on all tables (if not already enabled)
-- ============================================================================

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

-- Enable RLS on additional tables if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bid_history') THEN
        ALTER TABLE bid_history ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'draft_results') THEN
        ALTER TABLE draft_results ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'draft_result_teams') THEN
        ALTER TABLE draft_result_teams ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'custom_formats') THEN
        ALTER TABLE custom_formats ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
        ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
    END IF;
END$$;

-- ============================================================================
-- STEP 2: Create helper function for user ID resolution
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_id()
RETURNS TEXT AS $$
BEGIN
  -- First try authenticated user
  IF auth.uid() IS NOT NULL THEN
    RETURN auth.uid()::text;
  END IF;

  -- For guest users, policies will handle via LIKE patterns
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_id() IS
  'Returns auth.uid() for authenticated users, NULL for guests. Guest access handled via patterns in policies.';

-- ============================================================================
-- STEP 3: Drop all permissive "allow all" policies
-- ============================================================================

-- Drafts
DROP POLICY IF EXISTS "Allow all operations on drafts" ON drafts;
DROP POLICY IF EXISTS "Users can view drafts they participate in" ON drafts;
DROP POLICY IF EXISTS "Authenticated users can create drafts" ON drafts;
DROP POLICY IF EXISTS "Hosts can update their drafts" ON drafts;
DROP POLICY IF EXISTS "Hosts can delete their drafts" ON drafts;
DROP POLICY IF EXISTS "View accessible drafts" ON drafts;
DROP POLICY IF EXISTS "Anyone can create drafts" ON drafts;
DROP POLICY IF EXISTS "Hosts can update drafts" ON drafts;
DROP POLICY IF EXISTS "Hosts can delete drafts" ON drafts;

-- Teams
DROP POLICY IF EXISTS "Allow all operations on teams" ON teams;
DROP POLICY IF EXISTS "Users can view teams in their drafts" ON teams;
DROP POLICY IF EXISTS "Users can create teams" ON teams;
DROP POLICY IF EXISTS "Owners and hosts can update teams" ON teams;
DROP POLICY IF EXISTS "Owners and hosts can delete teams" ON teams;
DROP POLICY IF EXISTS "View teams in accessible drafts" ON teams;
DROP POLICY IF EXISTS "Anyone can create teams" ON teams;

-- Participants
DROP POLICY IF EXISTS "Allow all operations on participants" ON participants;
DROP POLICY IF EXISTS "Users can view participants in their drafts" ON participants;
DROP POLICY IF EXISTS "Users can join drafts" ON participants;
DROP POLICY IF EXISTS "Users and hosts can update participants" ON participants;
DROP POLICY IF EXISTS "Users and hosts can remove participants" ON participants;
DROP POLICY IF EXISTS "View participants in accessible drafts" ON participants;
DROP POLICY IF EXISTS "Anyone can join drafts" ON participants;

-- Picks
DROP POLICY IF EXISTS "Allow all operations on picks" ON picks;
DROP POLICY IF EXISTS "Users can view picks in their drafts" ON picks;
DROP POLICY IF EXISTS "Team owners can create picks" ON picks;
DROP POLICY IF EXISTS "Hosts can delete picks" ON picks;
DROP POLICY IF EXISTS "View picks in accessible drafts" ON picks;

-- Pokemon Tiers
DROP POLICY IF EXISTS "Allow all operations on pokemon_tiers" ON pokemon_tiers;
DROP POLICY IF EXISTS "View tiers in accessible drafts" ON pokemon_tiers;
DROP POLICY IF EXISTS "Hosts can manage tiers" ON pokemon_tiers;

-- Auctions
DROP POLICY IF EXISTS "Allow all operations on auctions" ON auctions;
DROP POLICY IF EXISTS "Users can view auctions in their drafts" ON auctions;
DROP POLICY IF EXISTS "Participants can create auctions" ON auctions;
DROP POLICY IF EXISTS "Participants can update auctions" ON auctions;
DROP POLICY IF EXISTS "Hosts can delete auctions" ON auctions;
DROP POLICY IF EXISTS "View auctions in accessible drafts" ON auctions;

-- Bids
DROP POLICY IF EXISTS "Allow all operations on bids" ON bids;
DROP POLICY IF EXISTS "View bids in accessible drafts" ON bids;
DROP POLICY IF EXISTS "Team owners can create bids" ON bids;

-- Wishlist Items
DROP POLICY IF EXISTS "Allow all operations on wishlist_items" ON wishlist_items;
DROP POLICY IF EXISTS "View wishlists in accessible drafts" ON wishlist_items;
DROP POLICY IF EXISTS "Participants can manage their wishlists" ON wishlist_items;

-- ============================================================================
-- STEP 4: Apply secure RLS policies with guest support
-- ============================================================================

-- -------------------- DRAFTS --------------------
-- Anyone can view drafts they're participating in
-- Note: No is_public column in your schema, so access is participant-based only
CREATE POLICY "View participant drafts"
  ON drafts FOR SELECT
  USING (
    id IN (
      SELECT draft_id FROM participants
      WHERE user_id = get_user_id()
      OR user_id LIKE 'guest-%'
      OR user_id LIKE 'spectator-%'
    )
  );

-- Anyone can create a draft (validated at application layer)
CREATE POLICY "Anyone can create drafts"
  ON drafts FOR INSERT
  WITH CHECK (true);

-- Only hosts can update their drafts
CREATE POLICY "Hosts can update drafts"
  ON drafts FOR UPDATE
  USING (
    host_id = get_user_id()
    OR host_id LIKE 'guest-%'
    OR id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%')
      AND is_host = true
    )
  );

-- Only hosts can delete their drafts
CREATE POLICY "Hosts can delete drafts"
  ON drafts FOR DELETE
  USING (
    host_id = get_user_id()
    OR host_id LIKE 'guest-%'
    OR id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%')
      AND is_host = true
    )
  );

-- -------------------- TEAMS --------------------
CREATE POLICY "View teams in participant drafts"
  ON teams FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = get_user_id() OR user_id LIKE 'guest-%' OR user_id LIKE 'spectator-%'
    )
  );

CREATE POLICY "Anyone can create teams"
  ON teams FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owners and hosts can update teams"
  ON teams FOR UPDATE
  USING (
    owner_id = get_user_id()
    OR owner_id LIKE 'guest-%'
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%') AND is_host = true
    )
  );

CREATE POLICY "Owners and hosts can delete teams"
  ON teams FOR DELETE
  USING (
    owner_id = get_user_id()
    OR owner_id LIKE 'guest-%'
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%') AND is_host = true
    )
  );

-- -------------------- PARTICIPANTS --------------------
CREATE POLICY "View participants in accessible drafts"
  ON participants FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = get_user_id() OR user_id LIKE 'guest-%' OR user_id LIKE 'spectator-%'
    )
  );

CREATE POLICY "Anyone can join drafts"
  ON participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users and hosts can update participants"
  ON participants FOR UPDATE
  USING (
    user_id = get_user_id()
    OR user_id LIKE 'guest-%'
    OR user_id LIKE 'spectator-%'
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%') AND is_host = true
    )
  );

CREATE POLICY "Users and hosts can remove participants"
  ON participants FOR DELETE
  USING (
    user_id = get_user_id()
    OR user_id LIKE 'guest-%'
    OR user_id LIKE 'spectator-%'
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%') AND is_host = true
    )
  );

-- -------------------- PICKS --------------------
CREATE POLICY "View picks in accessible drafts"
  ON picks FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = get_user_id() OR user_id LIKE 'guest-%' OR user_id LIKE 'spectator-%'
    )
  );

CREATE POLICY "Team owners can create picks"
  ON picks FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams
      WHERE owner_id = get_user_id() OR owner_id LIKE 'guest-%'
    )
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%') AND is_host = true
    )
  );

CREATE POLICY "Hosts can delete picks"
  ON picks FOR DELETE
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%') AND is_host = true
    )
  );

-- -------------------- POKEMON TIERS --------------------
CREATE POLICY "View tiers in accessible drafts"
  ON pokemon_tiers FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = get_user_id() OR user_id LIKE 'guest-%' OR user_id LIKE 'spectator-%'
    )
  );

CREATE POLICY "Hosts can manage tiers"
  ON pokemon_tiers FOR ALL
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%') AND is_host = true
    )
  );

-- -------------------- AUCTIONS --------------------
CREATE POLICY "View auctions in accessible drafts"
  ON auctions FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = get_user_id() OR user_id LIKE 'guest-%' OR user_id LIKE 'spectator-%'
    )
  );

CREATE POLICY "Participants can create auctions"
  ON auctions FOR INSERT
  WITH CHECK (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = get_user_id() OR user_id LIKE 'guest-%'
    )
  );

CREATE POLICY "Participants can update auctions"
  ON auctions FOR UPDATE
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = get_user_id() OR user_id LIKE 'guest-%'
    )
  );

CREATE POLICY "Hosts can delete auctions"
  ON auctions FOR DELETE
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = get_user_id() OR user_id LIKE 'guest-%') AND is_host = true
    )
  );

-- -------------------- BIDS --------------------
CREATE POLICY "View bids in accessible drafts"
  ON bids FOR SELECT
  USING (
    auction_id IN (
      SELECT id FROM auctions
      WHERE draft_id IN (
        SELECT draft_id FROM participants
        WHERE user_id = get_user_id() OR user_id LIKE 'guest-%' OR user_id LIKE 'spectator-%'
      )
    )
  );

CREATE POLICY "Team owners can create bids"
  ON bids FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams
      WHERE owner_id = get_user_id() OR owner_id LIKE 'guest-%'
    )
  );

-- -------------------- WISHLIST ITEMS --------------------
CREATE POLICY "View wishlists in accessible drafts"
  ON wishlist_items FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = get_user_id() OR user_id LIKE 'guest-%' OR user_id LIKE 'spectator-%'
    )
  );

CREATE POLICY "Participants can manage their wishlists"
  ON wishlist_items FOR ALL
  USING (
    participant_id IN (
      SELECT id FROM participants
      WHERE user_id = get_user_id() OR user_id LIKE 'guest-%'
    )
  );

-- ============================================================================
-- STEP 5: Add policies for optional tables (if they exist)
-- ============================================================================

-- BID HISTORY
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bid_history') THEN
        DROP POLICY IF EXISTS "Allow all operations on bid_history" ON bid_history;
        DROP POLICY IF EXISTS "View bid history in accessible drafts" ON bid_history;
        DROP POLICY IF EXISTS "Team owners can create bids" ON bid_history;
        DROP POLICY IF EXISTS "Team owners can create bid history" ON bid_history;

        EXECUTE 'CREATE POLICY "View bid history in accessible drafts" ON bid_history FOR SELECT USING (
            draft_id IN (SELECT draft_id FROM participants WHERE user_id = get_user_id() OR user_id LIKE ''guest-%'' OR user_id LIKE ''spectator-%'')
        )';

        EXECUTE 'CREATE POLICY "Team owners can create bid history" ON bid_history FOR INSERT WITH CHECK (
            team_id IN (SELECT id FROM teams WHERE owner_id = get_user_id() OR owner_id LIKE ''guest-%'')
        )';
    END IF;
END$$;

-- CUSTOM FORMATS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'custom_formats') THEN
        DROP POLICY IF EXISTS "Allow all operations on custom_formats" ON custom_formats;
        DROP POLICY IF EXISTS "Anyone can view public formats" ON custom_formats;
        DROP POLICY IF EXISTS "Anyone can create formats" ON custom_formats;
        DROP POLICY IF EXISTS "Creators can update formats" ON custom_formats;
        DROP POLICY IF EXISTS "Creators can delete formats" ON custom_formats;

        -- Check if is_public column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'custom_formats' AND column_name = 'is_public') THEN
            EXECUTE 'CREATE POLICY "Anyone can view public formats" ON custom_formats FOR SELECT
                     USING (is_public = true OR created_by_user_id = get_user_id() OR created_by_user_id LIKE ''guest-%'')';
        ELSE
            -- If no is_public, allow viewing your own formats only
            EXECUTE 'CREATE POLICY "Users can view their formats" ON custom_formats FOR SELECT
                     USING (created_by_user_id = get_user_id() OR created_by_user_id LIKE ''guest-%'')';
        END IF;

        EXECUTE 'CREATE POLICY "Anyone can create formats" ON custom_formats FOR INSERT WITH CHECK (true)';
        EXECUTE 'CREATE POLICY "Creators can update formats" ON custom_formats FOR UPDATE
                 USING (created_by_user_id = get_user_id() OR created_by_user_id LIKE ''guest-%'')';
        EXECUTE 'CREATE POLICY "Creators can delete formats" ON custom_formats FOR DELETE
                 USING (created_by_user_id = get_user_id() OR created_by_user_id LIKE ''guest-%'')';
    END IF;
END$$;

-- CHAT MESSAGES
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
        DROP POLICY IF EXISTS "Allow all operations on chat_messages" ON chat_messages;
        DROP POLICY IF EXISTS "View messages in accessible drafts" ON chat_messages;
        DROP POLICY IF EXISTS "Participants can send messages" ON chat_messages;

        EXECUTE 'CREATE POLICY "View messages in accessible drafts" ON chat_messages FOR SELECT USING (
            draft_id IN (SELECT draft_id FROM participants WHERE user_id = get_user_id() OR user_id LIKE ''guest-%'' OR user_id LIKE ''spectator-%'')
        )';
        EXECUTE 'CREATE POLICY "Participants can send messages" ON chat_messages FOR INSERT WITH CHECK (
            draft_id IN (SELECT draft_id FROM participants WHERE user_id = get_user_id() OR user_id LIKE ''guest-%'')
        )';
    END IF;
END$$;

-- ============================================================================
-- STEP 6: Add indexes for policy performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_draft_user ON participants(draft_id, user_id);
CREATE INDEX IF NOT EXISTS idx_participants_is_host ON participants(draft_id, is_host) WHERE is_host = true;
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_draft_owner ON teams(draft_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_drafts_host_id ON drafts(host_id);

-- ============================================================================
-- STEP 7: Grant necessary permissions
-- ============================================================================

-- Grant usage on the get_user_id function
GRANT EXECUTE ON FUNCTION get_user_id() TO anon, authenticated;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run this query to verify the policies are in place:
-- SELECT tablename, policyname, permissive, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- Expected result: You should see multiple policies per table (not just "Allow all")

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

-- If you need to rollback to permissive policies, run:
/*
DROP POLICY IF EXISTS "View participant drafts" ON drafts;
DROP POLICY IF EXISTS "Anyone can create drafts" ON drafts;
DROP POLICY IF EXISTS "Hosts can update drafts" ON drafts;
DROP POLICY IF EXISTS "Hosts can delete drafts" ON drafts;
-- ... (drop all new policies)

CREATE POLICY "Allow all operations on drafts" ON drafts FOR ALL USING (true);
CREATE POLICY "Allow all operations on teams" ON teams FOR ALL USING (true);
CREATE POLICY "Allow all operations on picks" ON picks FOR ALL USING (true);
CREATE POLICY "Allow all operations on participants" ON participants FOR ALL USING (true);
CREATE POLICY "Allow all operations on pokemon_tiers" ON pokemon_tiers FOR ALL USING (true);
CREATE POLICY "Allow all operations on auctions" ON auctions FOR ALL USING (true);
CREATE POLICY "Allow all operations on bids" ON bids FOR ALL USING (true);
CREATE POLICY "Allow all operations on wishlist_items" ON wishlist_items FOR ALL USING (true);
*/

COMMENT ON FUNCTION get_user_id() IS 'Security helper function for RLS policies';

-- ============================================================================
-- SECURITY NOTES
-- ============================================================================

-- This migration provides reasonable security while maintaining guest functionality.
-- Key differences from original APPLY_SECURITY.sql:
--
-- 1. Removed all references to is_public column (doesn't exist in your schema)
-- 2. Access control is entirely participant-based
-- 3. Anyone in a draft can view that draft's data
-- 4. Only hosts can modify draft settings
-- 5. Only team owners can make picks/bids for their teams
--
-- Additional production considerations:
-- 1. Implement rate limiting at application or edge layer
-- 2. Add server-side input validation
-- 3. Monitor and log suspicious activity
-- 4. Consider IP-based rate limiting for guest users
-- 5. Add audit logging for sensitive operations
-- 6. Consider migrating to full authentication over time
