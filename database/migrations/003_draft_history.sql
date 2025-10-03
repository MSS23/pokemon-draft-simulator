-- Migration: Add Draft History and Results Tracking
-- Description: Creates tables to save completed draft results and archives for historical reference

-- Create draft_results table to store completed draft snapshots
CREATE TABLE IF NOT EXISTS draft_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,

  -- Draft metadata snapshot
  draft_name TEXT NOT NULL,
  format TEXT NOT NULL,
  ruleset TEXT,
  max_teams INTEGER NOT NULL,
  budget_per_team INTEGER,

  -- Timing information
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER,

  -- Summary statistics
  total_rounds INTEGER,
  total_picks INTEGER,

  -- Full draft data snapshot (JSONB for flexibility)
  teams_data JSONB NOT NULL, -- Array of team objects with picks
  settings_data JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create draft_result_teams table for easier querying of individual teams
CREATE TABLE IF NOT EXISTS draft_result_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_result_id UUID NOT NULL REFERENCES draft_results(id) ON DELETE CASCADE,

  -- Team information
  team_name TEXT NOT NULL,
  owner_name TEXT,
  draft_order INTEGER NOT NULL,

  -- Team statistics
  total_cost INTEGER NOT NULL DEFAULT 0,
  budget_remaining INTEGER NOT NULL DEFAULT 0,
  pokemon_count INTEGER NOT NULL DEFAULT 0,

  -- Team composition data
  picks_data JSONB NOT NULL, -- Array of pick objects with pokemon details

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_draft_results_draft_id ON draft_results(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_results_completed_at ON draft_results(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_draft_results_format ON draft_results(format);
CREATE INDEX IF NOT EXISTS idx_draft_result_teams_draft_result_id ON draft_result_teams(draft_result_id);

-- Enable RLS (Row Level Security)
ALTER TABLE draft_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_result_teams ENABLE ROW LEVEL SECURITY;

-- RLS Policies (permissive for development, tighten in production)
CREATE POLICY "Allow all operations on draft_results" ON draft_results
  FOR ALL USING (true);

CREATE POLICY "Allow all operations on draft_result_teams" ON draft_result_teams
  FOR ALL USING (true);

-- Function to automatically save draft results when draft completes
CREATE OR REPLACE FUNCTION save_draft_results_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_teams_data JSONB;
  v_total_picks INTEGER;
  v_draft_result_id UUID;
  v_team RECORD;
BEGIN
  -- Only trigger when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get total picks
    SELECT COUNT(*) INTO v_total_picks
    FROM picks
    WHERE draft_id = NEW.id;

    -- Build teams data JSONB
    SELECT json_agg(
      json_build_object(
        'id', t.id,
        'name', t.name,
        'owner_id', t.owner_id,
        'draft_order', t.draft_order,
        'budget_remaining', t.budget_remaining,
        'picks', (
          SELECT json_agg(
            json_build_object(
              'id', p.id,
              'pokemon_id', p.pokemon_id,
              'pokemon_name', p.pokemon_name,
              'cost', p.cost,
              'pick_order', p.pick_order,
              'round', p.round,
              'created_at', p.created_at
            ) ORDER BY p.pick_order
          )
          FROM picks p
          WHERE p.team_id = t.id
        )
      ) ORDER BY t.draft_order
    ) INTO v_teams_data
    FROM teams t
    WHERE t.draft_id = NEW.id;

    -- Insert draft result
    INSERT INTO draft_results (
      draft_id,
      draft_name,
      format,
      ruleset,
      max_teams,
      budget_per_team,
      started_at,
      completed_at,
      duration_seconds,
      total_rounds,
      total_picks,
      teams_data,
      settings_data
    ) VALUES (
      NEW.id,
      NEW.name,
      NEW.format,
      NEW.ruleset,
      NEW.max_teams,
      NEW.budget_per_team,
      NEW.created_at, -- Approximation of start time
      NOW(),
      EXTRACT(EPOCH FROM (NOW() - NEW.created_at))::INTEGER,
      NEW.current_round,
      v_total_picks,
      v_teams_data,
      to_jsonb(NEW.settings)
    )
    RETURNING id INTO v_draft_result_id;

    -- Insert individual team results for easier querying
    FOR v_team IN
      SELECT
        t.id,
        t.name,
        (SELECT p.display_name FROM participants p WHERE p.team_id = t.id LIMIT 1) as owner_name,
        t.draft_order,
        t.budget_remaining,
        NEW.budget_per_team - t.budget_remaining as total_cost,
        (SELECT COUNT(*) FROM picks p WHERE p.team_id = t.id) as pokemon_count,
        (
          SELECT json_agg(
            json_build_object(
              'pokemon_id', p.pokemon_id,
              'pokemon_name', p.pokemon_name,
              'cost', p.cost,
              'pick_order', p.pick_order,
              'round', p.round,
              'created_at', p.created_at
            ) ORDER BY p.pick_order
          )
          FROM picks p
          WHERE p.team_id = t.id
        ) as picks_data
      FROM teams t
      WHERE t.draft_id = NEW.id
    LOOP
      INSERT INTO draft_result_teams (
        draft_result_id,
        team_name,
        owner_name,
        draft_order,
        total_cost,
        budget_remaining,
        pokemon_count,
        picks_data
      ) VALUES (
        v_draft_result_id,
        v_team.name,
        v_team.owner_name,
        v_team.draft_order,
        v_team.total_cost,
        v_team.budget_remaining,
        v_team.pokemon_count,
        v_team.picks_data
      );
    END LOOP;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically save results when draft completes
CREATE TRIGGER save_draft_results_trigger
  AFTER UPDATE ON drafts
  FOR EACH ROW
  EXECUTE FUNCTION save_draft_results_on_completion();

-- View for browsing draft history with summary stats
CREATE OR REPLACE VIEW draft_history AS
SELECT
  dr.id,
  dr.draft_id,
  dr.draft_name,
  dr.format,
  dr.max_teams,
  dr.budget_per_team,
  dr.completed_at,
  dr.duration_seconds,
  dr.total_rounds,
  dr.total_picks,
  COUNT(DISTINCT drt.id) as team_count,
  AVG(drt.total_cost) as avg_team_cost,
  MAX(drt.total_cost) as max_team_cost,
  MIN(drt.total_cost) as min_team_cost
FROM draft_results dr
LEFT JOIN draft_result_teams drt ON drt.draft_result_id = dr.id
GROUP BY dr.id, dr.draft_id, dr.draft_name, dr.format, dr.max_teams,
         dr.budget_per_team, dr.completed_at, dr.duration_seconds,
         dr.total_rounds, dr.total_picks
ORDER BY dr.completed_at DESC;

-- Comments for documentation
COMMENT ON TABLE draft_results IS 'Archived results of completed drafts for historical reference';
COMMENT ON TABLE draft_result_teams IS 'Individual team results from completed drafts';
COMMENT ON COLUMN draft_results.teams_data IS 'Full snapshot of all teams and their picks in JSONB format';
COMMENT ON COLUMN draft_results.duration_seconds IS 'Total time from draft start to completion in seconds';
COMMENT ON VIEW draft_history IS 'Browse completed drafts with summary statistics';
