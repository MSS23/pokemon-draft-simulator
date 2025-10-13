-- Migration: Add room_code to active_public_drafts view
-- Description: Updates the view to include room_code field for spectator navigation

-- Drop existing view
DROP VIEW IF EXISTS active_public_drafts;

-- Recreate view with room_code
CREATE VIEW active_public_drafts AS
SELECT
  d.id,
  d.room_code,
  d.name,
  d.description,
  d.format,
  d.status,
  d.max_teams,
  d.current_round,
  d.spectator_count,
  d.tags,
  d.created_at,
  d.updated_at,
  COUNT(DISTINCT t.id) as teams_joined,
  COUNT(DISTINCT p.id) as total_picks,
  COALESCE(MAX(p.created_at), d.created_at) as last_activity
FROM drafts d
LEFT JOIN teams t ON t.draft_id = d.id
LEFT JOIN picks p ON p.draft_id = d.id
WHERE d.is_public = true
  AND d.status IN ('setup', 'active', 'paused')
GROUP BY d.id, d.room_code, d.name, d.description, d.format, d.status, d.max_teams,
         d.current_round, d.spectator_count, d.tags, d.created_at, d.updated_at
ORDER BY last_activity DESC, d.created_at DESC;

-- Update comment
COMMENT ON VIEW active_public_drafts IS 'Discover active public drafts with metadata and room codes for spectator mode';
