-- ============================================================================
-- CLEANUP ALL DRAFTS - USE WITH CAUTION
-- ============================================================================
-- This script deletes ALL draft data from the database
-- Use this to start fresh for testing
--
-- Run this in Supabase SQL Editor:
-- 1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- 2. Paste this entire script
-- 3. Click "Run"
-- ============================================================================

-- Delete in reverse dependency order (children before parents)

-- 1. Delete all wishlist items (depends on participants and drafts)
DELETE FROM wishlist_items;

-- 2. Delete all bid history (depends on auctions)
DELETE FROM bid_history;

-- 3. Delete all auctions (depends on drafts and teams)
DELETE FROM auctions;

-- 4. Delete all picks (depends on teams and drafts)
DELETE FROM picks;

-- 5. Delete all pokemon tiers (depends on drafts)
DELETE FROM pokemon_tiers;

-- 6. Delete all spectator events (depends on drafts)
DELETE FROM spectator_events;

-- 7. Delete all participants (depends on teams and drafts)
DELETE FROM participants;

-- 8. Delete all teams (depends on drafts)
DELETE FROM teams;

-- 9. Delete all drafts (parent table)
DELETE FROM drafts;

-- ============================================================================
-- Verify cleanup - All tables should show 0 rows
-- ============================================================================

SELECT
  'drafts' as table_name,
  COUNT(*) as remaining_rows
FROM drafts
UNION ALL
SELECT
  'teams' as table_name,
  COUNT(*) as remaining_rows
FROM teams
UNION ALL
SELECT
  'participants' as table_name,
  COUNT(*) as remaining_rows
FROM participants
UNION ALL
SELECT
  'picks' as table_name,
  COUNT(*) as remaining_rows
FROM picks
UNION ALL
SELECT
  'auctions' as table_name,
  COUNT(*) as remaining_rows
FROM auctions
UNION ALL
SELECT
  'bid_history' as table_name,
  COUNT(*) as remaining_rows
FROM bid_history
UNION ALL
SELECT
  'pokemon_tiers' as table_name,
  COUNT(*) as remaining_rows
FROM pokemon_tiers
UNION ALL
SELECT
  'spectator_events' as table_name,
  COUNT(*) as remaining_rows
FROM spectator_events
UNION ALL
SELECT
  'wishlist_items' as table_name,
  COUNT(*) as remaining_rows
FROM wishlist_items
ORDER BY table_name;

-- Expected output: All tables should show 0 rows
