-- =====================================================
-- FIX USER PROFILES RLS POLICIES
-- Fix 406 Not Acceptable errors on user_profiles queries
-- =====================================================

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Anyone can view user profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.user_profiles;

-- Recreate RLS policies with proper permissions
-- Allow anyone to view profiles (needed for displaying user info in drafts)
CREATE POLICY "Enable read access for all users"
  ON public.user_profiles FOR SELECT
  USING (true);

-- Allow users to insert their own profile
CREATE POLICY "Enable insert for authenticated users only"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Enable update for users based on user_id"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Allow users to delete their own profile
CREATE POLICY "Enable delete for users based on user_id"
  ON public.user_profiles FOR DELETE
  USING (auth.uid() = id);

-- Grant necessary permissions
GRANT SELECT ON public.user_profiles TO anon;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;

-- Ensure the table has the correct structure
DO $$
BEGIN
  -- Check if the table exists and has the right columns
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles'
  ) THEN
    -- Add missing columns if they don't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'user_profiles' 
      AND column_name = 'email'
    ) THEN
      ALTER TABLE public.user_profiles ADD COLUMN email text;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'user_profiles' 
      AND column_name = 'is_verified'
    ) THEN
      ALTER TABLE public.user_profiles ADD COLUMN is_verified boolean DEFAULT false;
    END IF;
  END IF;
END $$;
