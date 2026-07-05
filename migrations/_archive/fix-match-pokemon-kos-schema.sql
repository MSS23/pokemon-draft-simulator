-- Migration: Add missing columns to match_pokemon_kos
-- The TypeScript code expects pick_id, ko_count, is_death, and updated_at
-- but the original schema only has pokemon_id, pokemon_name, team_id.
--
-- Run this in your Supabase SQL Editor.

-- Add missing columns
ALTER TABLE match_pokemon_kos
  ADD COLUMN IF NOT EXISTS pick_id UUID REFERENCES picks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ko_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_death BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add index on pick_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_pick ON match_pokemon_kos(pick_id);

-- Backfill pick_id from existing pokemon_id + team_id data
-- (matches pokemon_id text to picks.pokemon_id for the same team)
UPDATE match_pokemon_kos kos
SET pick_id = p.id
FROM picks p
WHERE kos.pick_id IS NULL
  AND kos.team_id = p.team_id
  AND kos.pokemon_id = p.pokemon_id;
