/**
 * POKEMON DRAFT - DATABASE RESET SCRIPT
 *
 * This script will completely clean up your existing database before running
 * the COMPLETE_SCHEMA.sql file.
 *
 * USAGE:
 * 1. Run THIS file first in Supabase SQL Editor
 * 2. Then run COMPLETE_SCHEMA.sql
 *
 * WARNING: This will DROP ALL existing tables, functions, triggers, and policies!
 * Only use this if you want a completely clean database.
 *
 * Last Updated: 2025-01-11
 */

-- ============================================
-- DROP ALL TABLES (in correct order due to foreign keys)
-- ============================================

DROP TABLE IF EXISTS trade_approvals CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS match_pokemon_kos CASCADE;
DROP TABLE IF EXISTS team_pokemon_status CASCADE;
DROP TABLE IF EXISTS match_games CASCADE;
DROP TABLE IF EXISTS standings CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS league_teams CASCADE;
DROP TABLE IF EXISTS leagues CASCADE;
DROP TABLE IF EXISTS spectator_events CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS draft_result_teams CASCADE;
DROP TABLE IF EXISTS draft_results CASCADE;
DROP TABLE IF EXISTS draft_actions CASCADE;
DROP TABLE IF EXISTS wishlist_items CASCADE;
DROP TABLE IF EXISTS wishlists CASCADE;
DROP TABLE IF EXISTS bid_history CASCADE;
DROP TABLE IF EXISTS auctions CASCADE;
DROP TABLE IF EXISTS pokemon_tiers CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS picks CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS drafts CASCADE;
DROP TABLE IF EXISTS custom_formats CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- ============================================
-- DROP ALL FUNCTIONS
-- ============================================

DROP FUNCTION IF EXISTS update_standings_for_match() CASCADE;
DROP FUNCTION IF EXISTS update_custom_format_timestamp() CASCADE;
DROP FUNCTION IF EXISTS increment_format_usage() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- ============================================
-- DROP OLD FUNCTIONS (from previous schemas)
-- ============================================

-- These might exist from older schema versions
DROP FUNCTION IF EXISTS calculate_standings() CASCADE;
DROP FUNCTION IF EXISTS validate_pick() CASCADE;
DROP FUNCTION IF EXISTS process_auction_end() CASCADE;
DROP FUNCTION IF EXISTS update_draft_status() CASCADE;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '   Database Cleanup Complete!';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Dropped:';
  RAISE NOTICE '  ✓ All 25 tables';
  RAISE NOTICE '  ✓ All functions';
  RAISE NOTICE '  ✓ All triggers (automatically via CASCADE)';
  RAISE NOTICE '  ✓ All policies (automatically via CASCADE)';
  RAISE NOTICE '  ✓ All indexes (automatically via CASCADE)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next step:';
  RAISE NOTICE '  → Run COMPLETE_SCHEMA.sql to create fresh database';
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════';
END $$;
