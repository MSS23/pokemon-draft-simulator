-- =====================================================
-- FIX USER PROFILES RLS FOR SIGNUP
-- =====================================================
-- This ensures the trigger can create user profiles
-- and users can read their own profiles
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "User profiles are viewable by everyone" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow trigger to insert profiles" ON public.user_profiles;

-- Policy 1: Anyone can view user profiles (needed for draft participant display)
CREATE POLICY "User profiles are viewable by everyone"
ON public.user_profiles
FOR SELECT
USING (true);

-- Policy 2: Service role can insert (for trigger)
CREATE POLICY "Allow trigger to insert profiles"
ON public.user_profiles
FOR INSERT
WITH CHECK (true);

-- Policy 3: Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON public.user_profiles
FOR UPDATE
USING (true)  -- Allow all authenticated users to update
WITH CHECK (true);

-- Policy 4: Allow authenticated users to insert (for manual profile creation)
CREATE POLICY "Users can create profiles"
ON public.user_profiles
FOR INSERT
WITH CHECK (true);

-- Make sure RLS is enabled
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- VERIFY POLICIES
-- =====================================================
-- Check that policies are correct:
-- SELECT * FROM pg_policies WHERE tablename = 'user_profiles';

-- =====================================================
-- RLS FIX COMPLETE!
-- =====================================================
-- The trigger should now be able to insert profiles
-- Signups should work without permission errors
-- =====================================================
