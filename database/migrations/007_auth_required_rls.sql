-- =====================================================
-- AUTHENTICATION REQUIRED RLS POLICIES
-- Updated to require authentication for draft/team ownership
-- Removes guest user support for better security
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Draft host can update their draft" ON drafts;
DROP POLICY IF EXISTS "Draft host can delete their draft" ON drafts;
DROP POLICY IF EXISTS "Team owners can update their teams" ON teams;
DROP POLICY IF EXISTS "Team owners can delete their teams" ON teams;

-- =====================================================
-- DRAFTS TABLE POLICIES - AUTHENTICATION REQUIRED
-- =====================================================

-- Only authenticated draft hosts can update their draft
CREATE POLICY "Draft host can update their draft"
  ON drafts FOR UPDATE
  USING (
    host_id = auth.uid()::text
  );

-- Only authenticated draft hosts can delete their draft
CREATE POLICY "Draft host can delete their draft"
  ON drafts FOR DELETE
  USING (
    host_id = auth.uid()::text
  );

-- =====================================================
-- TEAMS TABLE POLICIES - AUTHENTICATION REQUIRED
-- =====================================================

-- Only authenticated team owners can update their teams
CREATE POLICY "Team owners can update their teams"
  ON teams FOR UPDATE
  USING (
    owner_id = auth.uid()::text
  );

-- Only authenticated team owners and draft hosts can delete teams
CREATE POLICY "Team owners can delete their teams"
  ON teams FOR DELETE
  USING (
    owner_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM drafts
      WHERE drafts.id = teams.draft_id
      AND drafts.host_id = auth.uid()::text
    )
  );

-- =====================================================
-- NOTES
-- =====================================================

-- After applying this migration:
-- 1. All draft creation/modification requires authentication
-- 2. Guest users can no longer create or own drafts
-- 3. Only authenticated users who created a draft can delete it
-- 4. This prevents unauthorized deletion of drafts
