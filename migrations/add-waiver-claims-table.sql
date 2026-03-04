-- Waiver Claims table for free agent pickups
CREATE TABLE IF NOT EXISTS waiver_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID REFERENCES leagues(id) NOT NULL,
  team_id UUID REFERENCES teams(id) NOT NULL,
  claimed_pokemon_id TEXT NOT NULL,
  claimed_pokemon_name TEXT NOT NULL,
  dropped_pick_id UUID REFERENCES picks(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'rejected', 'cancelled')),
  waiver_priority INTEGER,
  claimed_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league ON waiver_claims(league_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_team ON waiver_claims(team_id);

-- RLS policies
ALTER TABLE waiver_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view waiver claims" ON waiver_claims
  FOR SELECT USING (true);

CREATE POLICY "Team owners can insert claims" ON waiver_claims
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Team owners can update own claims" ON waiver_claims
  FOR UPDATE USING (true);
