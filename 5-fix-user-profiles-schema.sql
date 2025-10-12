-- =====================================================
-- FIX USER PROFILES TABLE SCHEMA
-- =====================================================
-- This migration fixes the user_profiles table to add
-- the missing user_id column if it doesn't exist
-- Run this BEFORE running 4-add-user-profile-trigger.sql
-- =====================================================

-- Check current table structure and add user_id if missing
DO $$
BEGIN
  -- Check if user_id column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'user_id'
  ) THEN
    -- Add user_id column
    ALTER TABLE public.user_profiles
    ADD COLUMN user_id TEXT;

    -- Make it UNIQUE and NOT NULL after adding
    -- (can't do in one step if table has data)
    ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_unique UNIQUE (user_id);

    -- Backfill user_id from id for existing rows (if any)
    UPDATE public.user_profiles
    SET user_id = id::text
    WHERE user_id IS NULL;

    -- Now make it NOT NULL
    ALTER TABLE public.user_profiles
    ALTER COLUMN user_id SET NOT NULL;

    RAISE NOTICE 'Added user_id column to user_profiles table';
  ELSE
    RAISE NOTICE 'user_id column already exists in user_profiles table';
  END IF;
END $$;

-- Create index on user_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);

-- =====================================================
-- SCHEMA FIX COMPLETE!
-- =====================================================
-- Now run 4-add-user-profile-trigger.sql to add the
-- automatic profile creation trigger
-- =====================================================
