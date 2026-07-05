/**
 * CLEAR ALL DRAFTS AND LEAGUES - Keep User Accounts
 *
 * Run this in the Supabase SQL Editor to wipe all draft and league data
 * while preserving user_profiles and auth.users.
 *
 * Safe to run multiple times (uses TRUNCATE ... RESTART IDENTITY CASCADE
 * or DELETE to handle FK constraints properly).
 */

-- ============================================
-- TRADES (must go before leagues/drafts)
-- ============================================
DELETE FROM trade_approvals;
DELETE FROM trades;

-- ============================================
-- WAIVER CLAIMS (if table exists)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'waiver_claims') THEN
    DELETE FROM waiver_claims;
  END IF;
END $$;

-- ============================================
-- LEAGUE DATA
-- ============================================
DELETE FROM match_pokemon_kos;
DELETE FROM team_pokemon_status;
DELETE FROM match_games;
DELETE FROM standings;
DELETE FROM matches;
DELETE FROM league_teams;
DELETE FROM leagues;

-- ============================================
-- DRAFT DATA
-- ============================================
DELETE FROM spectator_events;
DELETE FROM chat_messages;
DELETE FROM draft_result_teams;
DELETE FROM draft_results;
DELETE FROM draft_actions;
DELETE FROM wishlist_items;
DELETE FROM wishlists;
DELETE FROM bid_history;
DELETE FROM auctions;
DELETE FROM pokemon_tiers;
DELETE FROM participants;
DELETE FROM picks;
DELETE FROM teams;
DELETE FROM drafts;

-- ============================================
-- RESULT
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✓ All drafts and leagues cleared.';
  RAISE NOTICE '✓ User profiles and auth accounts preserved.';
  RAISE NOTICE '';
END $$;
