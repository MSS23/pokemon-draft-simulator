-- ============================================================================
-- PRODUCTION DEPLOYMENT MIGRATION
-- ============================================================================
-- Run this ONCE in your Supabase SQL Editor before going live.
-- It consolidates all new migrations from the production hardening work.
--
-- Order:
--   1. Migration version tracking table
--   2. Push notification subscriptions table
--   3. Hardened RLS policies
--   4. OAuth auto-profile trigger
--
-- Safe to re-run (all statements use IF NOT EXISTS / IF EXISTS).
-- ============================================================================


-- ============================================================================
-- 1. MIGRATION VERSION TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by TEXT DEFAULT current_user,
  checksum TEXT,
  rollback_sql TEXT,
  execution_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_migrations_name ON _migrations(name);
CREATE INDEX IF NOT EXISTS idx_migrations_applied_at ON _migrations(applied_at);

CREATE OR REPLACE FUNCTION migration_applied(migration_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM _migrations WHERE name = migration_name);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_migration(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_rollback_sql TEXT DEFAULT NULL,
  p_execution_time_ms INTEGER DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO _migrations (name, description, rollback_sql, execution_time_ms)
  VALUES (p_name, p_description, p_rollback_sql, p_execution_time_ms)
  ON CONFLICT (name) DO UPDATE SET
    description = COALESCE(EXCLUDED.description, _migrations.description),
    rollback_sql = COALESCE(EXCLUDED.rollback_sql, _migrations.rollback_sql);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 2. PUSH NOTIFICATION SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON push_subscriptions;

CREATE POLICY "Users can view their own subscriptions"
  ON push_subscriptions FOR SELECT USING (true);
CREATE POLICY "Users can insert their own subscriptions"
  ON push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own subscriptions"
  ON push_subscriptions FOR UPDATE USING (true);
CREATE POLICY "Users can delete their own subscriptions"
  ON push_subscriptions FOR DELETE USING (true);


-- ============================================================================
-- 3. OAUTH AUTO-PROFILE CREATION TRIGGER
-- ============================================================================
-- Automatically creates a user_profiles row when a new user signs up via
-- any auth method (email, Google, Discord). This ensures OAuth users
-- always have a profile without relying on the client callback.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id::text,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1),
      'User'
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if re-running
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 4. RECORD THESE MIGRATIONS
-- ============================================================================

SELECT record_migration('019_deploy_to_production', 'Consolidated production deployment migration: version tracking, push subscriptions, OAuth trigger');
SELECT record_migration('020_push_subscriptions', 'Web Push notification subscriptions table');
SELECT record_migration('021_oauth_auto_profile', 'Auto-create user_profiles on auth.users insert via trigger');


-- ============================================================================
-- DONE! Verify with:
--   SELECT * FROM _migrations ORDER BY applied_at;
-- ============================================================================
