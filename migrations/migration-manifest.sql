-- ============================================================================
-- Migration Version Tracking System
-- ============================================================================
--
-- This migration creates a table to track which migrations have been applied.
-- Run this FIRST, then use the manifest below to track all future migrations.
--
-- Usage:
--   1. Run this file in Supabase SQL editor to create the tracking table
--   2. Before running any migration, check: SELECT * FROM _migrations;
--   3. After running a migration, insert a record (see examples below)
--   4. To rollback, check the rollback_sql column for the migration
-- ============================================================================

-- Create migration tracking table
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

-- Create index for quick lookup
CREATE INDEX IF NOT EXISTS idx_migrations_name ON _migrations(name);
CREATE INDEX IF NOT EXISTS idx_migrations_applied_at ON _migrations(applied_at);

-- Insert this migration as the first tracked migration
INSERT INTO _migrations (name, description, rollback_sql)
VALUES (
  '000_migration_manifest',
  'Creates migration version tracking table',
  'DROP TABLE IF EXISTS _migrations;'
) ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- MIGRATION MANIFEST
-- ============================================================================
-- Register all existing migrations that have already been applied.
-- Run these INSERT statements to backfill the history.
-- ============================================================================

INSERT INTO _migrations (name, description, rollback_sql) VALUES
  ('001_setup_schema', 'Initial database schema with all core tables', 'See RESET_DATABASE.sql'),
  ('002_atomic_pick_realtime', 'Atomic pick RPC with row-level locking', 'DROP FUNCTION IF EXISTS make_draft_pick;'),
  ('003_add_performance_indexes', 'Performance indexes on hot paths', 'See migration file for DROP INDEX statements'),
  ('004_add_soft_delete_to_drafts', 'Soft delete support for drafts', 'ALTER TABLE drafts DROP COLUMN IF EXISTS deleted_at;'),
  ('005_trades_complete', 'Complete trade system tables', 'DROP TABLE IF EXISTS trades CASCADE;'),
  ('006_fix_trades_schema', 'Trade schema corrections', NULL),
  ('007_add_trade_counter_hijack', 'Counter-offer and hijack support for trades', NULL),
  ('008_execute_trade', 'Trade execution RPC function', 'DROP FUNCTION IF EXISTS execute_trade;'),
  ('009_add_waiver_claims_table', 'Waiver wire claims table', 'DROP TABLE IF EXISTS waiver_claims;'),
  ('010_fix_team_pokemon_status_columns', 'Pokemon status tracking on teams', NULL),
  ('011_fix_match_pokemon_kos_schema', 'Match KO tracking schema', NULL),
  ('012_fix_dashboard_history_schema', 'Dashboard history view fixes', NULL),
  ('013_fix_dashboard_view', 'Dashboard view corrections', NULL),
  ('014_fix_missing_profile', 'Auto-create missing user profiles', NULL),
  ('015_fix_draft_deletion_rls', 'Draft deletion RLS policy fix', NULL),
  ('016_recalculate_standings', 'Standings recalculation RPC', NULL),
  ('017_add_is_admin_to_user_profiles', 'Admin flag on user profiles', 'ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_admin;'),
  ('018_fix_rls_policies', 'Restrict RLS policies for production security', 'See fix-rls-policies.sql for rollback')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if a migration has been applied
CREATE OR REPLACE FUNCTION migration_applied(migration_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM _migrations WHERE name = migration_name);
END;
$$ LANGUAGE plpgsql;

-- Record a new migration
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

-- View migration status
CREATE OR REPLACE VIEW migration_status AS
SELECT
  name,
  description,
  applied_at,
  applied_by,
  execution_time_ms,
  CASE WHEN rollback_sql IS NOT NULL THEN 'yes' ELSE 'no' END AS has_rollback
FROM _migrations
ORDER BY applied_at;
