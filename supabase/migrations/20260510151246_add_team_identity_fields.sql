-- Migration: League team identity fields
-- ----------------------------------------------------------------
-- Mirrors the spreadsheet "Teams" tab fields used by real draft leagues:
--   logo_url, abbreviation (3 chars), coach_display_name, discord_handle, division_name
--
-- Backwards-compatible: every column is nullable. Existing rows continue
-- to work; new league flows can populate them via the admin UI.
--
-- Run in Supabase SQL editor.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS logo_url            TEXT,
  ADD COLUMN IF NOT EXISTS abbreviation        TEXT,
  ADD COLUMN IF NOT EXISTS coach_display_name  TEXT,
  ADD COLUMN IF NOT EXISTS discord_handle      TEXT,
  ADD COLUMN IF NOT EXISTS division_name       TEXT;

-- Soft constraint: abbreviations should be 1-5 ASCII letters/digits.
-- Use a check constraint that's tolerant — leagues set their own conventions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_abbreviation_format'
  ) THEN
    ALTER TABLE teams
      ADD CONSTRAINT teams_abbreviation_format
      CHECK (abbreviation IS NULL OR abbreviation ~ '^[A-Za-z0-9]{1,5}$');
  END IF;
END $$;

-- Index division_name for grouped standings queries
CREATE INDEX IF NOT EXISTS idx_teams_draft_division
  ON teams(draft_id, division_name);

COMMENT ON COLUMN teams.logo_url           IS 'Public image URL for team logo';
COMMENT ON COLUMN teams.abbreviation       IS 'Short code (e.g. "TLT") for compact displays';
COMMENT ON COLUMN teams.coach_display_name IS 'League coach/manager display name (separate from owner_id)';
COMMENT ON COLUMN teams.discord_handle     IS 'Discord username for league communications';
COMMENT ON COLUMN teams.division_name      IS 'League division/conference name (e.g. "Intimidate Division")';
