-- Migration: Fix Dashboard and History Page Data Model
-- Description: Adds missing columns, views, and indexes for Dashboard and History pages
-- Date: 2025-01-14

-- ============================================================================
-- PHASE 1: Add Missing Columns
-- ============================================================================

-- Add final_placement to league_teams table (needed for History page)
ALTER TABLE league_teams
ADD COLUMN IF NOT EXISTS final_placement INTEGER;

COMMENT ON COLUMN league_teams.final_placement IS 'Final placement/rank in the league (1st, 2nd, 3rd, etc.)';

-- ============================================================================
-- PHASE 2: Create Optimized Views
-- ============================================================================

-- Drop existing views if they exist (for re-running migration)
DROP VIEW IF EXISTS user_draft_summary CASCADE;
DROP VIEW IF EXISTS user_league_history CASCADE;

-- View 1: User Draft Summary (for Dashboard page)
-- Provides all necessary data for displaying user drafts efficiently
CREATE VIEW user_draft_summary AS
SELECT
  -- Draft metadata
  d.id as draft_id,
  d.name as draft_name,
  d.status,
  d.format,
  d.ruleset,
  d.room_code,
  d.host_id,
  d.created_at,
  d.updated_at,
  d.max_teams,
  d.pokemon_per_team,
  d.current_turn,
  d.spectator_count,

  -- User's team info
  t.id as user_team_id,
  t.name as user_team_name,
  t.owner_id as user_id,
  t.budget_remaining,
  t.draft_order,

  -- Calculate if user is host
  (d.host_id = t.owner_id) as is_host,

  -- Team statistics (picks made by this team)
  (SELECT COUNT(*) FROM picks WHERE team_id = t.id) as picks_made,

  -- Draft statistics (total picks across all teams)
  (SELECT COUNT(*) FROM picks WHERE draft_id = d.id) as total_picks,

  -- Maximum possible picks for this draft
  (d.max_teams * d.pokemon_per_team) as max_possible_picks,

  -- Progress percentage
  CASE
    WHEN (d.max_teams * d.pokemon_per_team) > 0 THEN
      ROUND(
        (SELECT COUNT(*)::DECIMAL FROM picks WHERE draft_id = d.id) /
        (d.max_teams * d.pokemon_per_team) * 100
      )
    ELSE 0
  END as progress_percent,

  -- Participant count (active in last 24 hours)
  (
    SELECT COUNT(*)
    FROM participants
    WHERE draft_id = d.id
    AND last_seen >= NOW() - INTERVAL '24 hours'
  ) as active_participant_count,

  -- Total participant count
  (SELECT COUNT(*) FROM participants WHERE draft_id = d.id) as total_participant_count,

  -- League association
  (SELECT id FROM leagues WHERE draft_id = d.id LIMIT 1) as league_id,
  (SELECT status FROM leagues WHERE draft_id = d.id LIMIT 1) as league_status

FROM drafts d
JOIN teams t ON t.draft_id = d.id
WHERE d.deleted_at IS NULL;

COMMENT ON VIEW user_draft_summary IS 'Denormalized view of user drafts with team info, statistics, and progress for Dashboard page';

-- View 2: User League History (for History page)
-- Provides complete league history with standings and picks
CREATE VIEW user_league_history AS
SELECT
  -- League metadata
  l.id as league_id,
  l.name as league_name,
  l.status as league_status,
  l.start_date,
  l.end_date,
  l.total_weeks,
  l.current_week,
  l.draft_id,

  -- Team info
  t.id as team_id,
  t.name as team_name,
  t.owner_id as user_id,

  -- League team info
  lt.id as league_team_id,
  lt.seed,
  lt.final_placement,

  -- Standings data (wins, losses, rank)
  s.id as standings_id,
  COALESCE(s.wins, 0) as wins,
  COALESCE(s.losses, 0) as losses,
  COALESCE(s.draws, 0) as draws,
  COALESCE(s.points_for, 0) as points_for,
  COALESCE(s.points_against, 0) as points_against,
  COALESCE(s.rank, 0) as current_rank,
  s.current_streak,

  -- Team count in league
  (SELECT COUNT(*) FROM league_teams WHERE league_id = l.id) as total_teams,

  -- Pick count for this team
  (SELECT COUNT(*) FROM picks WHERE team_id = t.id) as total_picks

FROM leagues l
JOIN league_teams lt ON lt.league_id = l.id
JOIN teams t ON t.id = lt.team_id
LEFT JOIN standings s ON s.league_id = l.id AND s.team_id = t.id;

COMMENT ON VIEW user_league_history IS 'Complete league history with standings, team info, and statistics for History page';

-- ============================================================================
-- PHASE 3: Performance Indexes
-- ============================================================================

-- Dashboard page query optimization
CREATE INDEX IF NOT EXISTS idx_teams_owner_draft
ON teams(owner_id, draft_id);

CREATE INDEX IF NOT EXISTS idx_drafts_status_created
ON drafts(status, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_picks_team_count
ON picks(team_id);

CREATE INDEX IF NOT EXISTS idx_picks_draft_count
ON picks(draft_id);

CREATE INDEX IF NOT EXISTS idx_participants_draft_active
ON participants(draft_id, last_seen);

-- History page query optimization
CREATE INDEX IF NOT EXISTS idx_league_teams_compound
ON league_teams(team_id, league_id);

CREATE INDEX IF NOT EXISTS idx_standings_team_league
ON standings(team_id, league_id);

CREATE INDEX IF NOT EXISTS idx_standings_league_rank
ON standings(league_id, rank);

CREATE INDEX IF NOT EXISTS idx_leagues_draft
ON leagues(draft_id);

-- ============================================================================
-- PHASE 4: Update RLS Policies for Views
-- ============================================================================

-- Enable RLS on views (they inherit from base tables, but let's be explicit)
-- Note: Views automatically use RLS policies from underlying tables
-- No additional policies needed for these read-only views

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Test query for Dashboard (example for user_id)
-- SELECT * FROM user_draft_summary WHERE user_id = 'some-user-id' ORDER BY updated_at DESC;

-- Test query for History (example for user_id)
-- SELECT * FROM user_league_history WHERE user_id = 'some-user-id' ORDER BY end_date DESC NULLS LAST;

-- Check for missing data
-- SELECT COUNT(*) as drafts_without_teams FROM drafts d WHERE NOT EXISTS (SELECT 1 FROM teams WHERE draft_id = d.id);
-- SELECT COUNT(*) as leagues_without_standings FROM leagues l WHERE NOT EXISTS (SELECT 1 FROM standings WHERE league_id = l.id);
