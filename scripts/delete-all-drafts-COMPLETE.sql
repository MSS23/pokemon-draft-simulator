-- ============================================================================
-- DELETE ALL DRAFTS - COMPLETE DATABASE CLEANUP
-- ============================================================================
-- This script will DELETE ALL draft data from your database
-- ⚠️ WARNING: This action CANNOT be undone!
--
-- What this deletes:
-- - All draft rooms (past, present, future)
-- - All teams and their picks
-- - All participants
-- - All wishlist data
-- - All auction data
-- - All spectator data
-- - Everything related to drafts
--
-- What this KEEPS:
-- - User profiles (if you have authentication)
-- - Format configurations
-- - Application settings
--
-- TO USE:
-- 1. Go to: https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "SQL Editor" in left sidebar
-- 4. Click "New Query"
-- 5. Copy this ENTIRE script
-- 6. Click "Run" or press Ctrl+Enter
-- ============================================================================

-- Show what we're about to delete
SELECT
  'BEFORE DELETION' as status,
  'drafts' as table_name,
  COUNT(*) as count
FROM drafts
UNION ALL
SELECT 'BEFORE DELETION', 'teams', COUNT(*) FROM teams
UNION ALL
SELECT 'BEFORE DELETION', 'participants', COUNT(*) FROM participants
UNION ALL
SELECT 'BEFORE DELETION', 'picks', COUNT(*) FROM picks
UNION ALL
SELECT 'BEFORE DELETION', 'auctions', COUNT(*) FROM auctions
UNION ALL
SELECT 'BEFORE DELETION', 'bid_history', COUNT(*) FROM bid_history
UNION ALL
SELECT 'BEFORE DELETION', 'wishlist_items', COUNT(*) FROM wishlist_items
UNION ALL
SELECT 'BEFORE DELETION', 'spectator_events', COUNT(*) FROM spectator_events
UNION ALL
SELECT 'BEFORE DELETION', 'pokemon_tiers', COUNT(*) FROM pokemon_tiers
ORDER BY table_name;

-- ============================================================================
-- DELETE ALL DATA (in correct dependency order)
-- ============================================================================

-- Delete children first (tables that reference other tables)

-- Level 1: Tables that depend on multiple parents
DELETE FROM wishlist_items;          -- Depends on: participants, drafts
DELETE FROM bid_history;             -- Depends on: auctions, teams

-- Level 2: Tables that depend on teams/drafts
DELETE FROM auctions;                -- Depends on: drafts, teams
DELETE FROM picks;                   -- Depends on: teams, drafts
DELETE FROM pokemon_tiers;           -- Depends on: drafts
DELETE FROM spectator_events;        -- Depends on: drafts
DELETE FROM participants;            -- Depends on: teams, drafts

-- Level 3: Tables that depend on drafts
DELETE FROM teams;                   -- Depends on: drafts

-- Level 4: Parent tables (no dependencies)
DELETE FROM drafts;                  -- Top-level table

-- ============================================================================
-- VERIFY DELETION - All counts should be 0
-- ============================================================================

SELECT
  'AFTER DELETION' as status,
  'drafts' as table_name,
  COUNT(*) as count
FROM drafts
UNION ALL
SELECT 'AFTER DELETION', 'teams', COUNT(*) FROM teams
UNION ALL
SELECT 'AFTER DELETION', 'participants', COUNT(*) FROM participants
UNION ALL
SELECT 'AFTER DELETION', 'picks', COUNT(*) FROM picks
UNION ALL
SELECT 'AFTER DELETION', 'auctions', COUNT(*) FROM auctions
UNION ALL
SELECT 'AFTER DELETION', 'bid_history', COUNT(*) FROM bid_history
UNION ALL
SELECT 'AFTER DELETION', 'wishlist_items', COUNT(*) FROM wishlist_items
UNION ALL
SELECT 'AFTER DELETION', 'spectator_events', COUNT(*) FROM spectator_events
UNION ALL
SELECT 'AFTER DELETION', 'pokemon_tiers', COUNT(*) FROM pokemon_tiers
ORDER BY table_name;

-- ============================================================================
-- SUCCESS! All draft data has been deleted.
-- You can now create fresh drafts for testing.
-- ============================================================================
