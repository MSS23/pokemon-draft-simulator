-- Migration: Add Performance Indexes
-- Description: Comprehensive indexing strategy for optimal query performance
-- Run this after initial schema setup to improve query speed

-- ============================================================================
-- DRAFTS TABLE INDEXES
-- ============================================================================

-- Index for looking up drafts by host
CREATE INDEX IF NOT EXISTS idx_drafts_host_id
  ON drafts(host_id);

-- Index for filtering by status (common query)
CREATE INDEX IF NOT EXISTS idx_drafts_status
  ON drafts(status);

-- Composite index for active public drafts discovery
CREATE INDEX IF NOT EXISTS idx_drafts_public_active
  ON drafts(is_public, status, created_at DESC)
  WHERE is_public = true AND status IN ('setup', 'active');

-- Index for recent drafts (ordering)
CREATE INDEX IF NOT EXISTS idx_drafts_created_at
  ON drafts(created_at DESC);

-- Index for draft updates (real-time sync)
CREATE INDEX IF NOT EXISTS idx_drafts_updated_at
  ON drafts(updated_at DESC);

-- Format filtering
CREATE INDEX IF NOT EXISTS idx_drafts_format
  ON drafts(format);

-- ============================================================================
-- TEAMS TABLE INDEXES
-- ============================================================================

-- Primary foreign key lookup
CREATE INDEX IF NOT EXISTS idx_teams_draft_id
  ON teams(draft_id);

-- Owner lookup
CREATE INDEX IF NOT EXISTS idx_teams_owner_id
  ON teams(owner_id);

-- Draft order sorting (critical for turn calculation)
CREATE INDEX IF NOT EXISTS idx_teams_draft_order
  ON teams(draft_id, draft_order);

-- Budget queries
CREATE INDEX IF NOT EXISTS idx_teams_budget
  ON teams(draft_id, budget_remaining);

-- ============================================================================
-- PARTICIPANTS TABLE INDEXES
-- ============================================================================

-- Draft lookup
CREATE INDEX IF NOT EXISTS idx_participants_draft_id
  ON participants(draft_id);

-- User lookup across all drafts
CREATE INDEX IF NOT EXISTS idx_participants_user_id
  ON participants(user_id);

-- Team assignment
CREATE INDEX IF NOT EXISTS idx_participants_team_id
  ON participants(team_id);

-- Host identification
CREATE INDEX IF NOT EXISTS idx_participants_is_host
  ON participants(draft_id, is_host)
  WHERE is_host = true;

-- Activity tracking
CREATE INDEX IF NOT EXISTS idx_participants_last_seen
  ON participants(last_seen DESC);

-- Composite for user's drafts
CREATE INDEX IF NOT EXISTS idx_participants_user_draft
  ON participants(user_id, draft_id);

-- ============================================================================
-- PICKS TABLE INDEXES
-- ============================================================================

-- Draft picks lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_picks_draft_id
  ON picks(draft_id);

-- Team picks lookup
CREATE INDEX IF NOT EXISTS idx_picks_team_id
  ON picks(team_id);

-- Pick order (for sequencing)
CREATE INDEX IF NOT EXISTS idx_picks_order
  ON picks(draft_id, pick_order);

-- Round filtering
CREATE INDEX IF NOT EXISTS idx_picks_round
  ON picks(draft_id, round);

-- Pokemon tracking (which Pokemon have been picked)
CREATE INDEX IF NOT EXISTS idx_picks_pokemon_id
  ON picks(pokemon_id);

-- Composite for team picks in order
CREATE INDEX IF NOT EXISTS idx_picks_team_order
  ON picks(team_id, pick_order);

-- Timestamp for activity feed
CREATE INDEX IF NOT EXISTS idx_picks_created_at
  ON picks(created_at DESC);

-- Composite for draft timeline
CREATE INDEX IF NOT EXISTS idx_picks_draft_timeline
  ON picks(draft_id, created_at DESC);

-- ============================================================================
-- AUCTIONS TABLE INDEXES
-- ============================================================================

-- Draft auctions
CREATE INDEX IF NOT EXISTS idx_auctions_draft_id
  ON auctions(draft_id);

-- Active auctions only (frequent query)
CREATE INDEX IF NOT EXISTS idx_auctions_active
  ON auctions(draft_id, status, auction_end)
  WHERE status = 'active';

-- Pokemon in auction
CREATE INDEX IF NOT EXISTS idx_auctions_pokemon_id
  ON auctions(pokemon_id);

-- Nominated by team
CREATE INDEX IF NOT EXISTS idx_auctions_nominated_by
  ON auctions(nominated_by);

-- Current bidder
CREATE INDEX IF NOT EXISTS idx_auctions_current_bidder
  ON auctions(current_bidder);

-- Auction end time (for timer queries)
CREATE INDEX IF NOT EXISTS idx_auctions_end_time
  ON auctions(auction_end)
  WHERE status = 'active';

-- ============================================================================
-- BID_HISTORY TABLE INDEXES (already has some indexes)
-- ============================================================================

-- These were created in 001_add_bid_history.sql
-- Verify they exist:
-- idx_bid_history_auction_id
-- idx_bid_history_draft_id
-- idx_bid_history_team_id
-- idx_bid_history_created_at

-- Additional useful index for team's bid history
CREATE INDEX IF NOT EXISTS idx_bid_history_team_timestamp
  ON bid_history(team_id, created_at DESC);

-- ============================================================================
-- SPECTATOR_EVENTS TABLE INDEXES (from 002_spectator_mode.sql)
-- ============================================================================

-- These were created in migration 002
-- Verify they exist:
-- idx_spectator_events_draft_id
-- idx_spectator_events_created_at

-- Additional index for event type filtering
CREATE INDEX IF NOT EXISTS idx_spectator_events_type
  ON spectator_events(draft_id, event_type, created_at DESC);

-- ============================================================================
-- DRAFT_RESULTS INDEXES (from 003_draft_history.sql)
-- ============================================================================

-- These were created in migration 003
-- Verify they exist:
-- idx_draft_results_draft_id
-- idx_draft_results_completed_at
-- idx_draft_results_format
-- idx_draft_result_teams_draft_result_id

-- Additional index for format-based history browsing
CREATE INDEX IF NOT EXISTS idx_draft_results_format_date
  ON draft_results(format, completed_at DESC);

-- Duration analysis
CREATE INDEX IF NOT EXISTS idx_draft_results_duration
  ON draft_results(duration_seconds);

-- ============================================================================
-- PARTIAL INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Active drafts only
CREATE INDEX IF NOT EXISTS idx_drafts_active_only
  ON drafts(created_at DESC)
  WHERE status = 'active';

-- Completed drafts only
CREATE INDEX IF NOT EXISTS idx_drafts_completed
  ON drafts(updated_at DESC)
  WHERE status = 'completed';

-- Snake drafts
CREATE INDEX IF NOT EXISTS idx_drafts_snake
  ON drafts(created_at DESC)
  WHERE format = 'snake';

-- Auction drafts
CREATE INDEX IF NOT EXISTS idx_drafts_auction
  ON drafts(created_at DESC)
  WHERE format = 'auction';

-- ============================================================================
-- COVERING INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Draft list with essential info (reduces table lookups)
CREATE INDEX IF NOT EXISTS idx_drafts_list_view
  ON drafts(status, is_public, created_at DESC)
  INCLUDE (id, name, format, max_teams, current_round);

-- Team roster query optimization
CREATE INDEX IF NOT EXISTS idx_teams_roster
  ON teams(draft_id)
  INCLUDE (name, draft_order, budget_remaining);

-- ============================================================================
-- TEXT SEARCH INDEXES (for future search features)
-- ============================================================================

-- Full-text search on draft names
CREATE INDEX IF NOT EXISTS idx_drafts_name_trgm
  ON drafts USING gin(name gin_trgm_ops);

-- Enable trigram extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- STATISTICS AND MAINTENANCE
-- ============================================================================

-- Update table statistics for query planner
ANALYZE drafts;
ANALYZE teams;
ANALYZE participants;
ANALYZE picks;
ANALYZE auctions;
ANALYZE bid_history;
ANALYZE spectator_events;
ANALYZE draft_results;
ANALYZE draft_result_teams;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_drafts_public_active IS
  'Optimizes public draft discovery page - only active/setup public drafts';

COMMENT ON INDEX idx_picks_draft_timeline IS
  'Optimizes draft activity feed and pick history views';

COMMENT ON INDEX idx_auctions_active IS
  'Critical for finding current active auction in a draft - partial index for performance';

COMMENT ON INDEX idx_drafts_list_view IS
  'Covering index reduces table lookups for draft list pages';

-- ============================================================================
-- PERFORMANCE MONITORING QUERIES
-- ============================================================================

-- To check index usage:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- To find unused indexes:
-- SELECT schemaname, tablename, indexname
-- FROM pg_stat_user_indexes
-- WHERE idx_scan = 0
-- AND indexname NOT LIKE 'pg_toast%';

-- To check table bloat:
-- SELECT schemaname, tablename,
--        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
