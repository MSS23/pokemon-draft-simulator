/**
 * Migration 012: Weekly Highlights and Summary System
 *
 * Adds tables for tracking weekly highlights, notable performances,
 * and automated summary generation.
 */

-- Weekly summaries table
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,

  -- Summary content
  headline TEXT,
  summary_text TEXT,

  -- Notable achievements
  top_performer_team_id UUID REFERENCES teams(id),
  top_performer_reason TEXT,

  most_kos_pokemon_id TEXT,
  most_kos_pick_id UUID REFERENCES picks(id),
  most_kos_count INTEGER DEFAULT 0,

  biggest_upset_match_id UUID REFERENCES matches(id),
  biggest_upset_description TEXT,

  -- Week stats
  total_matches INTEGER DEFAULT 0,
  total_kos INTEGER DEFAULT 0,
  total_deaths INTEGER DEFAULT 0,
  total_trades INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(league_id, week_number)
);

-- Weekly highlights table (individual notable events)
CREATE TABLE IF NOT EXISTS weekly_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,

  -- Highlight details
  type TEXT NOT NULL CHECK (type IN (
    'top_performance',
    'upset_victory',
    'dominant_win',
    'comeback_win',
    'high_scoring',
    'shutout',
    'pokemon_milestone',
    'team_milestone',
    'tragic_death',
    'blockbuster_trade'
  )),

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT, -- Emoji or icon name

  -- Related entities
  team_id UUID REFERENCES teams(id),
  match_id UUID REFERENCES matches(id),
  pick_id UUID REFERENCES picks(id),
  trade_id UUID REFERENCES trades(id),

  -- Display order
  display_order INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_league_week
  ON weekly_summaries(league_id, week_number);

CREATE INDEX IF NOT EXISTS idx_weekly_highlights_league_week
  ON weekly_highlights(league_id, week_number);

CREATE INDEX IF NOT EXISTS idx_weekly_highlights_type
  ON weekly_highlights(type);

-- RLS Policies
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_highlights ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read summaries and highlights
CREATE POLICY "Anyone can view weekly summaries"
  ON weekly_summaries FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view weekly highlights"
  ON weekly_highlights FOR SELECT
  USING (true);

-- Allow authenticated users to create/update
CREATE POLICY "Authenticated users can manage weekly summaries"
  ON weekly_summaries FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage weekly highlights"
  ON weekly_highlights FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_weekly_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER weekly_summaries_updated_at
  BEFORE UPDATE ON weekly_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_weekly_summaries_updated_at();

CREATE TRIGGER weekly_highlights_updated_at
  BEFORE UPDATE ON weekly_highlights
  FOR EACH ROW
  EXECUTE FUNCTION update_weekly_summaries_updated_at();

-- Function to generate week summary (called after all matches complete)
CREATE OR REPLACE FUNCTION generate_week_summary(
  p_league_id UUID,
  p_week_number INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_summary_id UUID;
  v_total_matches INTEGER;
  v_total_kos INTEGER;
  v_total_deaths INTEGER;
  v_total_trades INTEGER;
  v_top_team_id UUID;
  v_top_team_reason TEXT;
  v_most_kos_pick_id UUID;
  v_most_kos_count INTEGER;
  v_biggest_upset_match_id UUID;
BEGIN
  -- Count matches this week
  SELECT COUNT(*) INTO v_total_matches
  FROM matches
  WHERE league_id = p_league_id
    AND week_number = p_week_number
    AND status = 'completed';

  -- Count KOs this week
  SELECT COALESCE(SUM(mk.ko_count), 0) INTO v_total_kos
  FROM match_pokemon_kos mk
  JOIN matches m ON mk.match_id = m.id
  WHERE m.league_id = p_league_id
    AND m.week_number = p_week_number;

  -- Count deaths this week (if Nuzlocke)
  SELECT COUNT(*) INTO v_total_deaths
  FROM match_pokemon_kos mk
  JOIN matches m ON mk.match_id = m.id
  WHERE m.league_id = p_league_id
    AND m.week_number = p_week_number
    AND mk.is_death = true;

  -- Count trades this week
  SELECT COUNT(*) INTO v_total_trades
  FROM trades
  WHERE league_id = p_league_id
    AND week_number = p_week_number
    AND status = 'completed';

  -- Find Pokemon with most KOs this week
  SELECT mk.pick_id, SUM(mk.ko_count)
  INTO v_most_kos_pick_id, v_most_kos_count
  FROM match_pokemon_kos mk
  JOIN matches m ON mk.match_id = m.id
  WHERE m.league_id = p_league_id
    AND m.week_number = p_week_number
  GROUP BY mk.pick_id
  ORDER BY SUM(mk.ko_count) DESC
  LIMIT 1;

  -- Insert or update summary
  INSERT INTO weekly_summaries (
    league_id,
    week_number,
    total_matches,
    total_kos,
    total_deaths,
    total_trades,
    most_kos_pick_id,
    most_kos_count
  )
  VALUES (
    p_league_id,
    p_week_number,
    v_total_matches,
    v_total_kos,
    v_total_deaths,
    v_total_trades,
    v_most_kos_pick_id,
    v_most_kos_count
  )
  ON CONFLICT (league_id, week_number) DO UPDATE
  SET
    total_matches = EXCLUDED.total_matches,
    total_kos = EXCLUDED.total_kos,
    total_deaths = EXCLUDED.total_deaths,
    total_trades = EXCLUDED.total_trades,
    most_kos_pick_id = EXCLUDED.most_kos_pick_id,
    most_kos_count = EXCLUDED.most_kos_count,
    updated_at = NOW()
  RETURNING id INTO v_summary_id;

  RETURN v_summary_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE weekly_summaries IS 'Weekly summary statistics and highlights for each league week';
COMMENT ON TABLE weekly_highlights IS 'Individual notable events and achievements during each week';
COMMENT ON FUNCTION generate_week_summary IS 'Auto-generates weekly summary after all matches are complete';
