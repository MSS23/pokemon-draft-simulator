-- Fix team_pokemon_status table to match application code expectations
-- The code uses pick_id, matches_played, matches_won, etc. but the original
-- schema only had pokemon_id/pokemon_name without these columns.

-- Add missing columns
ALTER TABLE team_pokemon_status
  ADD COLUMN IF NOT EXISTS pick_id UUID REFERENCES picks(id),
  ADD COLUMN IF NOT EXISTS matches_played INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matches_won INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS death_match_id UUID REFERENCES matches(id),
  ADD COLUMN IF NOT EXISTS death_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS death_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update the unique constraint to use pick_id (code upserts on pick_id,league_id)
ALTER TABLE team_pokemon_status DROP CONSTRAINT IF EXISTS team_pokemon_status_league_id_team_id_pokemon_id_key;
ALTER TABLE team_pokemon_status DROP CONSTRAINT IF EXISTS team_pokemon_status_pick_id_league_id_key;
ALTER TABLE team_pokemon_status ADD CONSTRAINT team_pokemon_status_pick_id_league_id_key UNIQUE (pick_id, league_id);

-- Update status check to include 'alive' and 'fainted' values used by application code
ALTER TABLE team_pokemon_status DROP CONSTRAINT IF EXISTS team_pokemon_status_status_check;
ALTER TABLE team_pokemon_status ADD CONSTRAINT team_pokemon_status_status_check
  CHECK (status IN ('alive', 'healthy', 'injured', 'fainted', 'dead'));
