-- Migration: Fix Missing Tables and RLS Policies
-- Description: Create missing tables (wishlists, draft_results) and add user_profiles RLS policies
-- This addresses 404 and 406 errors in the application

-- ============================================================================
-- CREATE WISHLISTS TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Can be auth user or guest ID
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0,
  CONSTRAINT wishlists_unique_user_draft UNIQUE (draft_id, user_id)
);

-- Enable RLS
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_wishlists_draft_id ON wishlists(draft_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_participant_id ON wishlists(participant_id);

-- ============================================================================
-- CREATE DRAFT_RESULTS TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS draft_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE UNIQUE,
  total_picks INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  winner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE draft_results ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_draft_results_draft_id ON draft_results(draft_id);

-- ============================================================================
-- CREATE DRAFT_RESULT_TEAMS TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS draft_result_teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  draft_result_id UUID NOT NULL REFERENCES draft_results(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  final_budget_remaining INTEGER DEFAULT 0,
  total_cost INTEGER DEFAULT 0,
  pokemon_count INTEGER DEFAULT 0,
  rank INTEGER,
  CONSTRAINT draft_result_teams_unique UNIQUE (draft_result_id, team_id)
);

-- Enable RLS
ALTER TABLE draft_result_teams ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_draft_result_teams_result_id ON draft_result_teams(draft_result_id);
CREATE INDEX IF NOT EXISTS idx_draft_result_teams_team_id ON draft_result_teams(team_id);

-- ============================================================================
-- USER_PROFILES TABLE FIX
-- ============================================================================

-- Ensure user_profiles table has proper structure and defaults
DO $$
BEGIN
  -- Check if id column has proper default
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_profiles'
    AND column_name = 'id'
    AND column_default LIKE '%gen_random_uuid%'
  ) THEN
    -- Add or update default for id column
    ALTER TABLE user_profiles
      ALTER COLUMN id SET DEFAULT gen_random_uuid();

    RAISE NOTICE 'Added gen_random_uuid() default to user_profiles.id';
  END IF;
END$$;

-- Ensure id column is properly set up
ALTER TABLE user_profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE user_profiles ALTER COLUMN id SET NOT NULL;

-- ============================================================================
-- USER_PROFILES RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON user_profiles;

-- Anyone can view user profiles (for display names in drafts)
CREATE POLICY "Anyone can view profiles"
  ON user_profiles FOR SELECT
  USING (true);

-- Users can create their own profile (id will auto-generate)
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (user_id = auth.uid()::text);

-- ============================================================================
-- WISHLISTS RLS POLICIES (Reapply from migration 006)
-- ============================================================================

DROP POLICY IF EXISTS "View wishlists in accessible drafts" ON wishlists;
DROP POLICY IF EXISTS "Users can manage their wishlists" ON wishlists;
DROP POLICY IF EXISTS "Users can update their wishlists" ON wishlists;
DROP POLICY IF EXISTS "Users can delete their wishlists" ON wishlists;

-- Users can view wishlists in their drafts
CREATE POLICY "View wishlists in accessible drafts"
  ON wishlists FOR SELECT
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = COALESCE(auth.uid()::text, user_id)
      OR user_id LIKE 'guest-%'
      OR user_id LIKE 'spectator-%'
    )
    OR draft_id IN (
      SELECT id FROM drafts WHERE is_public = true
    )
  );

-- Users can manage their own wishlists
CREATE POLICY "Users can manage their wishlists"
  ON wishlists FOR INSERT
  WITH CHECK (
    user_id = COALESCE(auth.uid()::text, user_id)
    OR user_id LIKE 'guest-%'
  );

CREATE POLICY "Users can update their wishlists"
  ON wishlists FOR UPDATE
  USING (
    user_id = COALESCE(auth.uid()::text, user_id)
    OR user_id LIKE 'guest-%'
  );

CREATE POLICY "Users can delete their wishlists"
  ON wishlists FOR DELETE
  USING (
    user_id = COALESCE(auth.uid()::text, user_id)
    OR user_id LIKE 'guest-%'
  );

-- ============================================================================
-- DRAFT_RESULTS RLS POLICIES (Reapply from migration 006)
-- ============================================================================

DROP POLICY IF EXISTS "View results from accessible drafts" ON draft_results;
DROP POLICY IF EXISTS "System can create draft results" ON draft_results;
DROP POLICY IF EXISTS "Hosts can delete draft results" ON draft_results;

-- Anyone can view results from accessible drafts
CREATE POLICY "View results from accessible drafts"
  ON draft_results FOR SELECT
  USING (
    draft_id IN (
      SELECT id FROM drafts WHERE is_public = true
    )
    OR draft_id IN (
      SELECT draft_id FROM participants
      WHERE user_id = COALESCE(auth.uid()::text, user_id)
      OR user_id LIKE 'guest-%'
      OR user_id LIKE 'spectator-%'
    )
  );

-- System/triggers can create results
CREATE POLICY "System can create draft results"
  ON draft_results FOR INSERT
  WITH CHECK (true);

-- Hosts can delete results
CREATE POLICY "Hosts can delete draft results"
  ON draft_results FOR DELETE
  USING (
    draft_id IN (
      SELECT draft_id FROM participants
      WHERE (user_id = COALESCE(auth.uid()::text, user_id) OR user_id LIKE 'guest-%')
      AND is_host = true
    )
  );

-- ============================================================================
-- DRAFT_RESULT_TEAMS RLS POLICIES (Reapply from migration 006)
-- ============================================================================

DROP POLICY IF EXISTS "View team results from accessible drafts" ON draft_result_teams;
DROP POLICY IF EXISTS "System can create team results" ON draft_result_teams;

-- Anyone can view team results from accessible drafts
CREATE POLICY "View team results from accessible drafts"
  ON draft_result_teams FOR SELECT
  USING (
    draft_result_id IN (
      SELECT id FROM draft_results
      WHERE draft_id IN (
        SELECT id FROM drafts WHERE is_public = true
      )
      OR draft_id IN (
        SELECT draft_id FROM participants
        WHERE user_id = COALESCE(auth.uid()::text, user_id)
        OR user_id LIKE 'guest-%'
        OR user_id LIKE 'spectator-%'
      )
    )
  );

-- System/triggers can create team results
CREATE POLICY "System can create team results"
  ON draft_result_teams FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Update wishlists updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_wishlists_updated_at ON wishlists;
CREATE TRIGGER update_wishlists_updated_at
  BEFORE UPDATE ON wishlists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE wishlists IS 'User wishlist for auto-pick functionality';
COMMENT ON TABLE draft_results IS 'Summary data for completed drafts';
COMMENT ON TABLE draft_result_teams IS 'Final team standings for completed drafts';

COMMENT ON POLICY "Anyone can view profiles" ON user_profiles IS
  'Allows everyone to view user profiles for displaying names in drafts';

COMMENT ON POLICY "Users can insert own profile" ON user_profiles IS
  'Users can only create their own profile';

COMMENT ON POLICY "Users can update own profile" ON user_profiles IS
  'Users can only update their own profile';
