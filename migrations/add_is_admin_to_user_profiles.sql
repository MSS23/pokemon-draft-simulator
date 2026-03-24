-- Add is_admin column to user_profiles for global admin access control
-- The middleware checks this flag to gate /admin routes
--
-- Ensures user_profiles table exists first (safe to run standalone)

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id            TEXT PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  email              TEXT,
  display_name       TEXT,
  avatar_url         TEXT,
  username           TEXT UNIQUE,
  bio                TEXT,
  twitter_profile    TEXT,
  twitch_channel     TEXT,
  is_verified        BOOLEAN DEFAULT FALSE,
  total_drafts_created        INTEGER DEFAULT 0,
  total_drafts_participated   INTEGER DEFAULT 0,
  favorite_pokemon   TEXT,
  stats              JSONB DEFAULT '{}'::jsonb,
  preferences        JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Index for fast admin lookups in middleware
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin ON user_profiles(user_id) WHERE is_admin = TRUE;
