-- Migration: Add current_team_id column to drafts table for server-side turn management
-- This fixes race conditions where clients calculate current team independently
-- Date: 2025-01-10
-- Author: Claude Code

-- Add current_team_id column to drafts table
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS current_team_id UUID REFERENCES teams(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_drafts_current_team
ON drafts(current_team_id);

-- Add comment explaining the column
COMMENT ON COLUMN drafts.current_team_id IS
'Server-authoritative current team ID. Calculated server-side to prevent client-side race conditions in multi-user drafts.';

-- Update existing drafts to set current_team_id based on current_turn
-- This is a one-time migration for existing drafts
DO $$
DECLARE
  draft_record RECORD;
  team_record RECORD;
  turn_index INTEGER;
  round_num INTEGER;
  position_in_round INTEGER;
  team_index INTEGER;
  total_teams INTEGER;
BEGIN
  -- Loop through all active drafts
  FOR draft_record IN
    SELECT id, current_turn, format
    FROM drafts
    WHERE status = 'active' AND format = 'snake' AND current_turn IS NOT NULL
  LOOP
    -- Get total number of teams for this draft
    SELECT COUNT(*) INTO total_teams
    FROM teams
    WHERE draft_id = draft_record.id;

    IF total_teams > 0 THEN
      -- Calculate which team should be drafting based on snake draft order
      turn_index := draft_record.current_turn - 1; -- Convert to 0-indexed
      round_num := FLOOR(turn_index / total_teams);
      position_in_round := turn_index % total_teams;

      -- Snake draft alternates direction each round
      IF MOD(round_num, 2) = 0 THEN
        -- Even round: normal order (1, 2, 3, 4)
        team_index := position_in_round + 1;
      ELSE
        -- Odd round: reverse order (4, 3, 2, 1)
        team_index := total_teams - position_in_round;
      END IF;

      -- Find the team with this draft_order
      SELECT id INTO team_record
      FROM teams
      WHERE draft_id = draft_record.id AND draft_order = team_index
      LIMIT 1;

      -- Update the draft with the calculated current_team_id
      IF team_record IS NOT NULL THEN
        UPDATE drafts
        SET current_team_id = team_record.id
        WHERE id = draft_record.id;

        RAISE NOTICE 'Updated draft % to current team %', draft_record.id, team_record.id;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Migration complete
SELECT
  COUNT(*) as total_drafts,
  COUNT(current_team_id) as drafts_with_current_team,
  COUNT(*) - COUNT(current_team_id) as drafts_without_current_team
FROM drafts;
