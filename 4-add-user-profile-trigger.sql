-- =====================================================
-- POKEMON DRAFT - ADD USER PROFILE AUTO-CREATION TRIGGER
-- =====================================================
-- Run this if you already set up the database and users
-- can't join drafts because profiles aren't being created
-- This fixes the "User profile not found" error on signup
-- =====================================================

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id::text,  -- Cast UUID to text
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile already exists, ignore
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Trigger to create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- BACKFILL EXISTING USERS
-- =====================================================
-- This creates profiles for users who signed up before
-- the trigger was added

INSERT INTO public.user_profiles (user_id, display_name, avatar_url)
SELECT
  id::text,  -- Cast UUID to text
  COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1)),
  raw_user_meta_data->>'avatar_url'
FROM auth.users
WHERE id::text NOT IN (SELECT user_id FROM public.user_profiles)
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- TRIGGER SETUP COMPLETE!
-- =====================================================
-- All existing users now have profiles
-- New signups will automatically get profiles
-- =====================================================
