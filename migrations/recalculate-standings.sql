-- Recalculate league standings from completed matches
-- This function can be called to fix standings after match corrections
CREATE OR REPLACE FUNCTION recalculate_league_standings(p_league_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team RECORD;
  v_match RECORD;
  v_rank INTEGER := 0;
  v_settings JSONB;
  v_points_per_win INTEGER;
  v_points_per_draw INTEGER;
BEGIN
  -- Get league settings for point values
  SELECT settings INTO v_settings FROM leagues WHERE id = p_league_id;
  v_points_per_win := COALESCE((v_settings->>'pointsPerWin')::integer, 3);
  v_points_per_draw := COALESCE((v_settings->>'pointsPerDraw')::integer, 1);

  -- Reset all standings for this league
  UPDATE standings SET
    wins = 0,
    losses = 0,
    draws = 0,
    points_for = 0,
    points_against = 0,
    point_differential = 0,
    rank = 0,
    current_streak = NULL,
    updated_at = NOW()
  WHERE league_id = p_league_id;

  -- Recalculate from completed matches
  FOR v_match IN
    SELECT * FROM matches
    WHERE league_id = p_league_id AND status = 'completed'
    ORDER BY completed_at ASC
  LOOP
    -- Update home team stats
    UPDATE standings SET
      points_for = points_for + COALESCE(v_match.home_score, 0),
      points_against = points_against + COALESCE(v_match.away_score, 0),
      wins = wins + CASE WHEN v_match.winner_team_id = v_match.home_team_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_match.winner_team_id = v_match.away_team_id THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN v_match.winner_team_id IS NULL THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE league_id = p_league_id AND team_id = v_match.home_team_id;

    -- Update away team stats
    UPDATE standings SET
      points_for = points_for + COALESCE(v_match.away_score, 0),
      points_against = points_against + COALESCE(v_match.home_score, 0),
      wins = wins + CASE WHEN v_match.winner_team_id = v_match.away_team_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_match.winner_team_id = v_match.home_team_id THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN v_match.winner_team_id IS NULL THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE league_id = p_league_id AND team_id = v_match.away_team_id;
  END LOOP;

  -- Update point differentials
  UPDATE standings SET
    point_differential = points_for - points_against
  WHERE league_id = p_league_id;

  -- Update ranks based on total points, then differential, then wins
  v_rank := 0;
  FOR v_team IN
    SELECT id FROM standings
    WHERE league_id = p_league_id
    ORDER BY
      (wins * v_points_per_win + draws * v_points_per_draw) DESC,
      point_differential DESC,
      wins DESC
  LOOP
    v_rank := v_rank + 1;
    UPDATE standings SET rank = v_rank WHERE id = v_team.id;
  END LOOP;
END;
$$;
