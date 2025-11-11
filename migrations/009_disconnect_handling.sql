-- Migration: Add disconnect handling for draft rooms
-- Adds turn_started_at timestamp for server-side timeout tracking
-- Date: 2025-01-10
-- Author: Claude Code

-- Add turn_started_at column to drafts table
-- This enables server-side detection of when a turn started
-- Useful for grace periods and timeout detection
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_drafts_turn_started
ON drafts(turn_started_at)
WHERE turn_started_at IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN drafts.turn_started_at IS
'Timestamp when the current turn started. Used for disconnect grace periods and server-side timeout detection. NULL when draft is not active or between turns.';

-- Update existing active drafts to set turn_started_at
-- Use updated_at as a reasonable approximation
UPDATE drafts
SET turn_started_at = updated_at
WHERE status = 'active'
  AND current_turn IS NOT NULL
  AND turn_started_at IS NULL;

-- Add default draft settings for disconnect handling
-- This updates the settings JSONB column with new fields
UPDATE drafts
SET settings = jsonb_set(
  jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{disconnectGracePeriodSeconds}',
    '30'::jsonb,
    true
  ),
  '{enableAutoSkip}',
  'true'::jsonb,
  true
)
WHERE settings IS NULL
   OR NOT settings ? 'disconnectGracePeriodSeconds';

-- Migration summary
DO $$
DECLARE
  total_drafts INTEGER;
  active_drafts INTEGER;
  updated_drafts INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_drafts FROM drafts;
  SELECT COUNT(*) INTO active_drafts FROM drafts WHERE status = 'active';
  SELECT COUNT(*) INTO updated_drafts FROM drafts WHERE turn_started_at IS NOT NULL;

  RAISE NOTICE '';
  RAISE NOTICE '=== Disconnect Handling Migration Complete ===';
  RAISE NOTICE 'Total drafts: %', total_drafts;
  RAISE NOTICE 'Active drafts: %', active_drafts;
  RAISE NOTICE 'Drafts with turn_started_at: %', updated_drafts;
  RAISE NOTICE '';
  RAISE NOTICE 'New features enabled:';
  RAISE NOTICE '- 30-second grace period for disconnected users';
  RAISE NOTICE '- Server-side turn timeout tracking';
  RAISE NOTICE '- Auto-skip with disconnect detection';
  RAISE NOTICE '';
END $$;
