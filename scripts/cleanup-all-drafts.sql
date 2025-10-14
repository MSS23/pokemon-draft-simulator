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

-- Disable foreign key checks temporarily (if supported)
-- SET session_replication_role = 'replica';

BEGIN;

-- Delete all wishlist items
DELETE FROM wishlist_items;
RAISE NOTICE 'Deleted all wishlist items';

-- Delete all bid history
DELETE FROM bid_history;
RAISE NOTICE 'Deleted all bid history';

-- Delete all auctions
DELETE FROM auctions;
RAISE NOTICE 'Deleted all auctions';

-- Delete all picks
DELETE FROM picks;
RAISE NOTICE 'Deleted all picks';

-- Delete all pokemon tiers
DELETE FROM pokemon_tiers;
RAISE NOTICE 'Deleted all pokemon tiers';

-- Delete all participants
DELETE FROM participants;
RAISE NOTICE 'Deleted all participants';

-- Delete all teams
DELETE FROM teams;
RAISE NOTICE 'Deleted all teams';

-- Delete all spectator events
DELETE FROM spectator_events;
RAISE NOTICE 'Deleted all spectator events';

-- Delete all drafts
DELETE FROM drafts;
RAISE NOTICE 'Deleted all drafts';

-- Commit the transaction
COMMIT;

-- Re-enable foreign key checks
-- SET session_replication_role = 'origin';

-- Verify cleanup
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
  'wishlist_items' as table_name,
  COUNT(*) as remaining_rows
FROM wishlist_items
ORDER BY table_name;

-- Expected output: All tables should show 0 rows
