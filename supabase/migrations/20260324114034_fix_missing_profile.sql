-- Fix missing user profile for authenticated user
-- This creates a profile record for user who signed up before trigger was active

INSERT INTO user_profiles (user_id, display_name)
VALUES ('1edaffa5-e683-435b-b725-252575b6dd1b', 'User')
ON CONFLICT (user_id) DO NOTHING;

-- Note: Run this in your Supabase SQL editor
-- The display_name will be 'User' by default, user can change it in settings
