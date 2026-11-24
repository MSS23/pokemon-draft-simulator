-- 038: league results, standings and waivers
-- Audit clusters B-05, B-11, the RPC half of B-10, and handoffs G (standings
-- grant, force_advance_week) and F (confirm_match_side).
--
-- B-05  Completing a match failed in prod: trigger_update_standings ran as the
--       invoker and standings has only a SELECT policy, and
--       recalculate_league_standings was service_role-only while the client
--       calls it. Now:
--         * recalculate_league_standings checks the caller (commissioner,
--           draft host or a team owner in the league; service role / direct
--           DB allowed) and is granted to authenticated.
--         * update_standings_for_match is SECURITY DEFINER and simply
--           recalculates the league (and its split-conference sibling) when a
--           completed result changes, so it never double-counts and ignores
--           knockout rows like the recalc does.
--         * generate_week_summary gets the same caller check and the
--           authenticated grant (weekly-highlights-service.ts calls it).
-- B-10  confirm_match_side(p_match_id, p_side, p_submission): server-side
--       dual confirmation. It merges notes.submissions[side]; when both sides
--       agree on winnerTeamId/homeScore/awayScore it completes the match in
--       the same statement. Participant direct UPDATE on matches is removed
--       later, in 20261124151400, once the TS switches to this RPC.
--       submit_match_side had a silent bug: jsonb_set does not create the
--       missing 'submissions' parent, so a first report on a match with empty
--       notes was dropped. Both RPCs now merge instead.
-- G     force_advance_week(p_league_id): commissioner-only, atomically
--       advances (or completes) the league and cancels the old week's open
--       matches.
-- B-11  process_waiver_claim derived the claimed Pokemon's cost from the
--       client (negative cost minted budget). Cost now comes from
--       resolve_draft_pick_rule; priced drafts reject unpriced Pokemon;
--       legacy unpriced drafts fall back to the client cost bounded to
--       0..budget_per_team.
--
-- Existing signatures unchanged; two new RPCs. Idempotent.

-- ---------------------------------------------------------------------------
-- Caller check shared by league write RPCs. NULL clerk id is only accepted
-- for the service role or a direct DB session (no JWT claims at all).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_league_results(p_league_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT := public.clerk_user_id();
  v_role TEXT := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
BEGIN
  IF v_caller IS NULL THEN
    RETURN v_role IS NULL OR v_role = 'service_role';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM leagues l
    LEFT JOIN drafts d ON d.id = l.draft_id
    WHERE l.id = p_league_id
      AND (
        (l.settings->>'commissionerId') = v_caller
        OR d.host_id = v_caller
        OR EXISTS (SELECT 1 FROM teams t WHERE t.draft_id = l.draft_id AND t.owner_id = v_caller)
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_league_standings(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_team RECORD;
  v_match RECORD;
  v_rank INTEGER := 0;
  v_settings JSONB;
  v_points_per_win INTEGER;
  v_points_per_draw INTEGER;
  v_res CHAR(1);
  v_streak_char CHAR(1);
  v_streak_count INTEGER;
  v_league RECORD;
  v_sibling_id UUID;
BEGIN
  IF NOT public.can_manage_league_results(p_league_id) THEN
    RAISE EXCEPTION 'Only league members can recalculate standings' USING ERRCODE = '42501';
  END IF;

  SELECT draft_id, league_type, settings INTO v_league FROM leagues WHERE id = p_league_id;
  v_settings := v_league.settings;
  v_points_per_win := COALESCE((v_settings->>'pointsPerWin')::integer, 3);
  v_points_per_draw := COALESCE((v_settings->>'pointsPerDraw')::integer, 1);

  -- Cross-conference matches are stored in one conference's league row but
  -- involve a team from the sibling conference; include the sibling's
  -- matches too. Updates below are scoped to this league's standings rows.
  v_sibling_id := NULL;
  IF v_league.league_type IN ('split_conference_a', 'split_conference_b') THEN
    SELECT id INTO v_sibling_id FROM leagues
     WHERE draft_id = v_league.draft_id
       AND id <> p_league_id
       AND league_type IN ('split_conference_a', 'split_conference_b')
     LIMIT 1;
  END IF;

  UPDATE standings SET
    wins = 0, losses = 0, draws = 0,
    points_for = 0, points_against = 0,
    point_differential = 0, rank = 0,
    current_streak = NULL,
    updated_at = NOW()
  WHERE league_id = p_league_id;

  FOR v_match IN
    SELECT * FROM matches m
    WHERE m.league_id IN (p_league_id, v_sibling_id)
      AND m.status = 'completed'
      -- playoff/knockout rows must not pollute regular-season standings
      AND (m.notes IS NULL OR m.notes NOT LIKE '%bracketMatchId%')
    ORDER BY COALESCE(m.completed_at, m.updated_at) ASC
  LOOP
    UPDATE standings SET
      points_for = points_for + COALESCE(v_match.home_score, 0),
      points_against = points_against + COALESCE(v_match.away_score, 0),
      wins = wins + CASE WHEN v_match.winner_team_id = v_match.home_team_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_match.winner_team_id = v_match.away_team_id THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN v_match.winner_team_id IS NULL THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE league_id = p_league_id AND team_id = v_match.home_team_id;

    UPDATE standings SET
      points_for = points_for + COALESCE(v_match.away_score, 0),
      points_against = points_against + COALESCE(v_match.home_score, 0),
      wins = wins + CASE WHEN v_match.winner_team_id = v_match.away_team_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_match.winner_team_id = v_match.home_team_id THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN v_match.winner_team_id IS NULL THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE league_id = p_league_id AND team_id = v_match.away_team_id;
  END LOOP;

  UPDATE standings SET
    point_differential = points_for - points_against
  WHERE league_id = p_league_id;

  -- Streaks: walk each team's completed matches from most recent backwards
  FOR v_team IN
    SELECT team_id FROM standings WHERE league_id = p_league_id
  LOOP
    v_streak_char := NULL;
    v_streak_count := 0;
    FOR v_match IN
      SELECT winner_team_id FROM matches m
       WHERE m.league_id IN (p_league_id, v_sibling_id)
         AND m.status = 'completed'
         AND (m.notes IS NULL OR m.notes NOT LIKE '%bracketMatchId%')
         AND (m.home_team_id = v_team.team_id OR m.away_team_id = v_team.team_id)
       ORDER BY COALESCE(m.completed_at, m.updated_at) DESC
    LOOP
      v_res := CASE
        WHEN v_match.winner_team_id = v_team.team_id THEN 'W'
        WHEN v_match.winner_team_id IS NULL THEN 'D'
        ELSE 'L'
      END;
      IF v_streak_char IS NULL THEN
        v_streak_char := v_res; v_streak_count := 1;
      ELSIF v_res = v_streak_char THEN
        v_streak_count := v_streak_count + 1;
      ELSE
        EXIT;
      END IF;
    END LOOP;
    UPDATE standings
       SET current_streak = CASE WHEN v_streak_char IS NULL THEN NULL
                                 ELSE v_streak_char || v_streak_count::text END
     WHERE league_id = p_league_id AND team_id = v_team.team_id;
  END LOOP;

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

-- Trigger: recompute from scratch whenever a completed result changes.
CREATE OR REPLACE FUNCTION public.update_standings_for_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_league RECORD;
  v_other UUID;
BEGIN
  IF (NEW.status = 'completed' OR OLD.status = 'completed')
     AND (NEW.status IS DISTINCT FROM OLD.status
          OR NEW.winner_team_id IS DISTINCT FROM OLD.winner_team_id
          OR NEW.home_score IS DISTINCT FROM OLD.home_score
          OR NEW.away_score IS DISTINCT FROM OLD.away_score) THEN
    SELECT draft_id, league_type INTO v_league FROM leagues WHERE id = NEW.league_id;
    PERFORM public.initialize_league_standings(NEW.league_id);
    PERFORM public.recalculate_league_standings(NEW.league_id);
    IF v_league.league_type IN ('split_conference_a', 'split_conference_b') THEN
      FOR v_other IN
        SELECT id FROM leagues
        WHERE draft_id = v_league.draft_id AND id <> NEW.league_id
          AND league_type IN ('split_conference_a', 'split_conference_b')
      LOOP
        PERFORM public.initialize_league_standings(v_other);
        PERFORM public.recalculate_league_standings(v_other);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_standings ON public.matches;
CREATE TRIGGER trigger_update_standings
  AFTER UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.update_standings_for_match();

-- generate_week_summary: live body plus the caller check.
CREATE OR REPLACE FUNCTION public.generate_week_summary(p_league_id uuid, p_week_number integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_matches INTEGER;
  v_total_kos     INTEGER;
  v_total_deaths  INTEGER;
  v_total_trades  INTEGER;
BEGIN
  IF NOT public.can_manage_league_results(p_league_id) THEN
    RAISE EXCEPTION 'Only league members can generate a weekly summary' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_total_matches
  FROM matches
  WHERE league_id = p_league_id AND week_number = p_week_number AND status = 'completed';

  SELECT COALESCE(SUM(ko_count), 0) INTO v_total_kos
  FROM match_pokemon_kos mpk
  JOIN matches m ON m.id = mpk.match_id
  WHERE m.league_id = p_league_id AND m.week_number = p_week_number;

  SELECT COALESCE(SUM(CASE WHEN mpk.is_death THEN ko_count ELSE 0 END), 0) INTO v_total_deaths
  FROM match_pokemon_kos mpk
  JOIN matches m ON m.id = mpk.match_id
  WHERE m.league_id = p_league_id AND m.week_number = p_week_number;

  SELECT COUNT(*) INTO v_total_trades
  FROM trades
  WHERE league_id = p_league_id AND week_number = p_week_number AND status = 'completed';

  INSERT INTO weekly_summaries (
    league_id, week_number,
    total_matches, total_kos, total_deaths, total_trades
  )
  VALUES (
    p_league_id, p_week_number,
    v_total_matches, v_total_kos, v_total_deaths, v_total_trades
  )
  ON CONFLICT (league_id, week_number) DO UPDATE SET
    total_matches = EXCLUDED.total_matches,
    total_kos     = EXCLUDED.total_kos,
    total_deaths  = EXCLUDED.total_deaths,
    total_trades  = EXCLUDED.total_trades,
    updated_at    = NOW();
END;
$$;

-- ---------------------------------------------------------------------------
-- confirm_match_side: submit one side's result; complete on agreement.
-- Returns { notes, status: 'pending' | 'confirmed' | 'disputed' }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_match_side(p_match_id uuid, p_side text, p_submission jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT := public.clerk_user_id();
  v_match RECORD;
  v_team_id UUID;
  v_owner TEXT;
  v_commissioner TEXT;
  v_notes JSONB;
  v_mine JSONB;
  v_other JSONB;
  v_winner UUID;
  v_home INTEGER;
  v_away INTEGER;
  v_status TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_side NOT IN ('home', 'away') THEN
    RAISE EXCEPTION 'Invalid side %', p_side;
  END IF;
  IF p_submission IS NULL OR jsonb_typeof(p_submission) <> 'object' THEN
    RAISE EXCEPTION 'Submission must be an object';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF v_match.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Match result has already been confirmed';
  END IF;

  v_team_id := CASE WHEN p_side = 'home' THEN v_match.home_team_id ELSE v_match.away_team_id END;
  SELECT owner_id INTO v_owner FROM teams WHERE id = v_team_id;
  SELECT (settings->>'commissionerId') INTO v_commissioner FROM leagues WHERE id = v_match.league_id;
  IF v_caller IS DISTINCT FROM v_owner AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Only the % team owner or the commissioner can submit for that side', p_side
      USING ERRCODE = '42501';
  END IF;

  -- Validate the submitted result.
  BEGIN
    v_home := (p_submission->>'homeScore')::INTEGER;
    v_away := (p_submission->>'awayScore')::INTEGER;
    v_winner := NULLIF(p_submission->>'winnerTeamId', '')::UUID;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid submission';
  END;
  IF v_home IS NULL OR v_away IS NULL OR v_home < 0 OR v_away < 0 THEN
    RAISE EXCEPTION 'Scores must be non-negative integers';
  END IF;
  IF v_winner IS NOT NULL AND v_winner NOT IN (v_match.home_team_id, v_match.away_team_id) THEN
    RAISE EXCEPTION 'Winner must be one of the two teams';
  END IF;

  -- Tolerate legacy plain-text notes by demoting them to a "note" key.
  BEGIN
    v_notes := COALESCE(v_match.notes::jsonb, '{}'::jsonb);
    IF jsonb_typeof(v_notes) <> 'object' THEN
      v_notes := jsonb_build_object('note', v_match.notes);
    END IF;
  EXCEPTION WHEN others THEN
    v_notes := jsonb_build_object('note', v_match.notes);
  END;

  -- jsonb_set cannot create the missing 'submissions' parent, so merge.
  v_notes := v_notes || jsonb_build_object('submissions',
    COALESCE(v_notes->'submissions', '{}'::jsonb) || jsonb_build_object(p_side, p_submission));
  v_mine := p_submission;
  v_other := v_notes #> ARRAY['submissions', CASE WHEN p_side = 'home' THEN 'away' ELSE 'home' END];

  IF v_other IS NULL THEN
    v_status := 'pending';
  ELSIF (v_other->'homeScore') = (v_mine->'homeScore')
    AND (v_other->'awayScore') = (v_mine->'awayScore')
    AND (v_other->>'winnerTeamId') IS NOT DISTINCT FROM (v_mine->>'winnerTeamId') THEN
    v_status := 'confirmed';
  ELSE
    v_status := 'disputed';
  END IF;
  v_notes := v_notes || jsonb_build_object('confirmationStatus', v_status);

  IF v_status = 'confirmed' THEN
    UPDATE matches SET
      notes = v_notes::text,
      home_score = v_home,
      away_score = v_away,
      winner_team_id = v_winner,
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_match_id;
  ELSE
    UPDATE matches SET notes = v_notes::text, updated_at = NOW() WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object('notes', v_notes, 'status', v_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- force_advance_week: commissioner-only, one transaction.
-- Returns { currentWeek, status }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_advance_week(p_league_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT := public.clerk_user_id();
  v_league RECORD;
  v_next INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_league_commissioner(p_league_id, v_caller) THEN
    RAISE EXCEPTION 'Only the league commissioner can advance the week' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_league FROM leagues WHERE id = p_league_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'League not found'; END IF;
  IF v_league.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'League is already %', v_league.status;
  END IF;

  v_next := COALESCE(v_league.current_week, 1) + 1;
  IF v_next > v_league.total_weeks THEN
    UPDATE leagues SET status = 'completed', end_date = NOW(), updated_at = NOW() WHERE id = p_league_id;
  ELSE
    UPDATE leagues SET current_week = v_next, updated_at = NOW() WHERE id = p_league_id;
  END IF;

  UPDATE matches SET status = 'cancelled', updated_at = NOW()
  WHERE league_id = p_league_id
    AND week_number = COALESCE(v_league.current_week, 1)
    AND status IN ('scheduled', 'in_progress');

  RETURN jsonb_build_object(
    'currentWeek', CASE WHEN v_next > v_league.total_weeks THEN v_league.current_week ELSE v_next END,
    'status', CASE WHEN v_next > v_league.total_weeks THEN 'completed' ELSE v_league.status END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- process_waiver_claim: server-derived cost (B-11). Signature unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_waiver_claim(
  p_league_id uuid, p_team_id uuid, p_pokemon_id text, p_pokemon_name text,
  p_pokemon_cost integer, p_drop_pick_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
  v_team RECORD;
  v_league RECORD;
  v_draft RECORD;
  v_drop RECORD;
  v_rule RECORD;
  v_settings JSONB;
  v_max_claims INTEGER;
  v_used_claims INTEGER;
  v_cost INTEGER;
  v_net_cost INTEGER;
  v_next_order INTEGER;
  v_claim_id UUID;
  v_deadline TIMESTAMPTZ;
  v_priced BOOLEAN;
BEGIN
  v_caller := public.clerk_user_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found'; END IF;
  IF v_team.owner_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Only the team owner can claim free agents' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_league FROM leagues WHERE id = p_league_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'League not found'; END IF;
  IF v_league.draft_id IS DISTINCT FROM v_team.draft_id THEN
    RAISE EXCEPTION 'Team does not belong to this league';
  END IF;

  v_settings := COALESCE(v_league.settings, '{}'::jsonb);
  IF COALESCE((v_settings->>'enableWaivers')::boolean, true) = false THEN
    RAISE EXCEPTION 'Free agent claims are disabled for this league';
  END IF;

  IF COALESCE((v_settings->>'rosterLocked')::boolean, false) THEN
    RAISE EXCEPTION 'Rosters are currently locked by the commissioner';
  END IF;

  -- Commissioner-set deadline (ISO string; tolerate bad legacy values)
  BEGIN
    v_deadline := NULLIF(v_settings->>'waiverDeadline', '')::timestamptz;
  EXCEPTION WHEN others THEN
    v_deadline := NULL;
  END;
  IF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
    RAISE EXCEPTION 'The free agency deadline has passed';
  END IF;

  IF COALESCE((v_settings->>'allowInSeasonWaivers')::boolean, false) = false
     AND EXISTS (
       SELECT 1 FROM matches
        WHERE league_id = p_league_id AND status IN ('completed', 'in_progress')
     ) THEN
    RAISE EXCEPTION 'Free agent claims are locked once the first match has been played';
  END IF;

  v_max_claims := COALESCE(
    (v_settings->>'freeAgentPicksAllowed')::integer,
    (v_settings->>'maxWaiverClaimsPerSeason')::integer,
    3
  );
  SELECT COUNT(*) INTO v_used_claims FROM waiver_claims
   WHERE league_id = p_league_id AND team_id = p_team_id
     AND status IN ('completed', 'approved');
  IF v_used_claims >= v_max_claims THEN
    RAISE EXCEPTION 'Free agent pick limit reached (% allowed)', v_max_claims;
  END IF;

  SELECT * INTO v_drop FROM picks WHERE id = p_drop_pick_id AND team_id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dropped Pokemon is not on your roster';
  END IF;

  IF EXISTS (SELECT 1 FROM picks WHERE draft_id = v_team.draft_id AND pokemon_id = p_pokemon_id
             AND id <> p_drop_pick_id) THEN
    RAISE EXCEPTION 'Pokemon is already on a roster in this draft';
  END IF;

  -- Server-side cost (B-11). The client value is only a bounded fallback.
  SELECT budget_per_team, settings, custom_format_id INTO v_draft FROM drafts WHERE id = v_team.draft_id;
  IF p_pokemon_cost IS NULL OR p_pokemon_cost < 0 OR p_pokemon_cost > COALESCE(v_draft.budget_per_team, 0) THEN
    RAISE EXCEPTION 'Invalid Pokemon cost';
  END IF;
  SELECT * INTO v_rule FROM public.resolve_draft_pick_rule(v_team.draft_id, p_pokemon_id, p_pokemon_name, p_pokemon_cost);
  v_priced := v_draft.custom_format_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM pokemon_tiers WHERE draft_id = v_team.draft_id)
    OR (jsonb_typeof(v_draft.settings->'allowedPokemonIds') = 'array'
        AND jsonb_array_length(v_draft.settings->'allowedPokemonIds') > 0);
  IF v_rule.source_cost IS NOT NULL THEN
    v_cost := v_rule.source_cost;
  ELSIF v_priced THEN
    RAISE EXCEPTION 'Pokemon is not in this draft pool';
  ELSE
    -- shortcut: legacy drafts with no pricing rows trust the bounded client cost; drop once every league draft has pokemon_tiers
    v_cost := p_pokemon_cost;
  END IF;

  v_net_cost := v_cost - COALESCE(v_drop.cost, 0);
  IF v_net_cost > 0 AND COALESCE(v_team.budget_remaining, 0) < v_net_cost THEN
    RAISE EXCEPTION 'Insufficient budget: need % extra points', v_net_cost;
  END IF;

  INSERT INTO waiver_claims (league_id, team_id, claimed_pokemon_id, claimed_pokemon_name,
                             dropped_pick_id, status, claimed_at, processed_at, notes)
  VALUES (p_league_id, p_team_id, p_pokemon_id, p_pokemon_name,
          p_drop_pick_id, 'completed', NOW(), NOW(),
          'Dropped ' || v_drop.pokemon_name)
  RETURNING id INTO v_claim_id;

  DELETE FROM picks WHERE id = p_drop_pick_id;

  SELECT COALESCE(MAX(pick_order), 0) + 1 INTO v_next_order
    FROM picks WHERE draft_id = v_team.draft_id;

  -- unique (draft_id, pokemon_id) makes concurrent claims of the same mon
  -- fail here and roll the whole claim back
  INSERT INTO picks (draft_id, team_id, pokemon_id, pokemon_name, cost, tier_name, pick_order, round)
  VALUES (v_team.draft_id, p_team_id, p_pokemon_id, p_pokemon_name, v_cost, v_rule.tier_name, v_next_order, 0);

  UPDATE teams
     SET budget_remaining = COALESCE(budget_remaining, 0) - v_net_cost
   WHERE id = p_team_id;

  RETURN v_claim_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- submit_match_side: live body, but jsonb_set(..., '{submissions,side}', ...)
-- silently did nothing when notes had no 'submissions' key yet (jsonb_set does
-- not create missing parents), so the first side's report was dropped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_match_side(p_match_id uuid, p_side text, p_submission jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT;
  v_match RECORD;
  v_team_id UUID;
  v_owner TEXT;
  v_commissioner TEXT;
  v_notes JSONB;
BEGIN
  v_caller := public.clerk_user_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_side NOT IN ('home', 'away') THEN
    RAISE EXCEPTION 'Invalid side %', p_side;
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF v_match.status = 'completed' THEN
    RAISE EXCEPTION 'Match result has already been confirmed';
  END IF;

  v_team_id := CASE WHEN p_side = 'home' THEN v_match.home_team_id ELSE v_match.away_team_id END;
  SELECT owner_id INTO v_owner FROM teams WHERE id = v_team_id;
  SELECT (settings->>'commissionerId') INTO v_commissioner
    FROM leagues WHERE id = v_match.league_id;

  IF v_caller IS DISTINCT FROM v_owner AND v_caller IS DISTINCT FROM v_commissioner THEN
    RAISE EXCEPTION 'Only the % team owner or the commissioner can submit for that side', p_side
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_notes := COALESCE(v_match.notes::jsonb, '{}'::jsonb);
    IF jsonb_typeof(v_notes) <> 'object' THEN
      v_notes := jsonb_build_object('note', v_match.notes);
    END IF;
  EXCEPTION WHEN others THEN
    v_notes := jsonb_build_object('note', v_match.notes);
  END;

  v_notes := v_notes || jsonb_build_object('submissions',
    COALESCE(v_notes->'submissions', '{}'::jsonb) || jsonb_build_object(p_side, p_submission));

  UPDATE matches
     SET notes = v_notes::text,
         updated_at = NOW()
   WHERE id = p_match_id;

  RETURN v_notes;
END;
$$;

-- Grants
REVOKE EXECUTE ON FUNCTION public.can_manage_league_results(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_league_results(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_standings_for_match() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.recalculate_league_standings(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_week_summary(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_match_side(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.force_advance_week(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_waiver_claim(uuid, uuid, text, text, integer, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_match_side(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.initialize_league_standings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_league_standings(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_week_summary(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_match_side(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.force_advance_week(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_waiver_claim(uuid, uuid, text, text, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_match_side(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.initialize_league_standings(uuid) TO authenticated, service_role;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '038_league_results_rpcs',
  'Standings recalc callable by league members (in-body check), standings trigger is SECURITY DEFINER and recalculates; confirm_match_side and force_advance_week RPCs; process_waiver_claim derives cost server-side.',
  'DROP FUNCTION public.confirm_match_side(uuid, text, jsonb), public.force_advance_week(uuid); re-apply recalculate_league_standings/process_waiver_claim from 20260824120000 and the live update_standings_for_match body; REVOKE EXECUTE ON FUNCTION public.recalculate_league_standings(uuid) FROM authenticated;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '038_league_results_rpcs'
);
