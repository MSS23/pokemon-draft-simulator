-- Production hardening: exact tier roster caps + atomic draft joining.
-- Safe to apply after the 2026070512* server-authoritative draft migrations.

ALTER TABLE public.picks ADD COLUMN IF NOT EXISTS tier_name TEXT;
CREATE INDEX IF NOT EXISTS idx_picks_team_tier
  ON public.picks (draft_id, team_id, tier_name)
  WHERE tier_name IS NOT NULL;

-- Prevent future team insert races without requiring legacy duplicate rows to
-- be cleaned before this migration can apply. Draft-order reshuffles use UPDATE
-- and are intentionally unaffected.
CREATE OR REPLACE FUNCTION public.enforce_new_team_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.draft_id::TEXT, 0));
  SELECT status, max_teams INTO v_draft FROM public.drafts WHERE id = NEW.draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.status <> 'setup' THEN RAISE EXCEPTION 'Draft has already started'; END IF;
  IF (SELECT COUNT(*) FROM public.teams WHERE draft_id = NEW.draft_id) >= v_draft.max_teams THEN
    RAISE EXCEPTION 'Draft is full';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teams
    WHERE draft_id = NEW.draft_id AND draft_order = NEW.draft_order
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Draft order is already occupied';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teams
    WHERE draft_id = NEW.draft_id AND lower(name) = lower(NEW.name)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Team name is already taken';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_new_team_invariants_trigger ON public.teams;
CREATE TRIGGER enforce_new_team_invariants_trigger
  BEFORE INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.enforce_new_team_invariants();

-- Resolve authoritative custom-pool cost and tier metadata. The submitted cost
-- is only a fallback for built-in formats that have no per-draft pokemon_tiers
-- row; custom CSV prices are always read from custom_formats in Postgres.
CREATE OR REPLACE FUNCTION public.resolve_draft_pick_rule(
  p_draft_id UUID,
  p_pokemon_id TEXT,
  p_pokemon_name TEXT,
  p_submitted_cost INTEGER
) RETURNS TABLE (
  source_cost INTEGER,
  tier_name TEXT,
  tier_cap INTEGER,
  is_tiered BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
  v_tier JSONB;
  v_cost INTEGER;
  v_is_legal BOOLEAN;
  v_normalized_name TEXT;
BEGIN
  SELECT settings, custom_format_id INTO v_draft
  FROM public.drafts WHERE id = p_draft_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_submitted_cost IS NULL OR p_submitted_cost < 0 OR p_submitted_cost > 5000 THEN
    RETURN;
  END IF;
  IF v_draft.custom_format_id IS NULL
     AND jsonb_typeof(v_draft.settings->'allowedPokemonIds') = 'array'
     AND jsonb_array_length(v_draft.settings->'allowedPokemonIds') > 0
     AND NOT ((v_draft.settings->'allowedPokemonIds') ? p_pokemon_id) THEN
    RETURN;
  END IF;
  v_cost := p_submitted_cost;
  v_normalized_name := regexp_replace(
    lower(replace(replace(p_pokemon_name, '♀', 'f'), '♂', 'm')),
    '[^a-z0-9]+', '', 'g'
  );

  IF v_draft.custom_format_id IS NOT NULL THEN
    SELECT entry.value::INTEGER INTO v_cost
    FROM public.custom_formats format_row,
         LATERAL jsonb_each_text(format_row.pokemon_pricing::JSONB) entry
    WHERE format_row.id = v_draft.custom_format_id
      AND regexp_replace(
        lower(replace(replace(entry.key, '♀', 'f'), '♂', 'm')),
        '[^a-z0-9]+', '', 'g'
      ) = v_normalized_name
    LIMIT 1;
    IF v_cost IS NULL THEN RETURN; END IF;
  ELSE
    SELECT cost, is_legal INTO v_cost, v_is_legal
    FROM public.pokemon_tiers
    WHERE draft_id = p_draft_id
      AND (pokemon_id = p_pokemon_id OR lower(pokemon_name) = lower(p_pokemon_name))
    ORDER BY (pokemon_id = p_pokemon_id) DESC
    LIMIT 1;
    IF FOUND THEN
      IF NOT COALESCE(v_is_legal, FALSE) THEN RETURN; END IF;
    ELSE
      v_cost := p_submitted_cost;
    END IF;
  END IF;

  is_tiered := COALESCE(v_draft.settings->>'scoringSystem', '') = 'tiered';
  source_cost := v_cost;
  tier_name := NULL;
  tier_cap := NULL;

  IF is_tiered THEN
    SELECT tier INTO v_tier
    FROM jsonb_array_elements(COALESCE(v_draft.settings #> '{tierConfig,tiers}', '[]'::JSONB)) tier
    WHERE v_cost >= COALESCE((tier->>'minCost')::INTEGER, 0)
    ORDER BY COALESCE((tier->>'minCost')::INTEGER, 0) DESC
    LIMIT 1;
    IF v_tier IS NULL THEN RETURN; END IF;
    tier_name := upper(trim(v_tier->>'name'));
    tier_cap := CASE
      WHEN v_tier ? 'slotsPerTeam' THEN (v_tier->>'slotsPerTeam')::INTEGER
      ELSE NULL -- legacy tiered drafts remain playable
    END;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_draft_pick_rule(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_draft_pick_rule(UUID, TEXT, TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.make_draft_pick(
  p_draft_id UUID,
  p_team_id UUID,
  p_user_id TEXT,
  p_pokemon_id TEXT,
  p_pokemon_name TEXT,
  p_cost INTEGER,
  p_expected_turn INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
  v_team RECORD;
  v_rule RECORD;
  v_jwt_user TEXT;
  v_current_team_id UUID;
  v_pick_id UUID;
  v_total_teams INTEGER;
  v_max_picks INTEGER;
  v_current_picks INTEGER;
  v_tier_picks INTEGER;
  v_next_turn INTEGER;
  v_next_round INTEGER;
  v_is_complete BOOLEAN;
  v_new_budget INTEGER;
BEGIN
  v_jwt_user := public.clerk_user_id();
  IF v_jwt_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF v_jwt_user <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication mismatch');
  END IF;

  SELECT * INTO v_draft FROM public.drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Draft not found'); END IF;
  IF v_draft.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft is not active', 'status', v_draft.status);
  END IF;
  IF v_draft.current_turn IS DISTINCT FROM p_expected_turn THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your turn - turn has changed', 'currentTurn', v_draft.current_turn);
  END IF;

  SELECT COUNT(*) INTO v_total_teams FROM public.teams WHERE draft_id = p_draft_id;
  IF v_total_teams = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'No teams in draft'); END IF;
  v_current_team_id := public.get_current_team_id(p_draft_id, v_draft.current_turn, v_total_teams);
  IF v_current_team_id IS DISTINCT FROM p_team_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your turn');
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id AND draft_id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Team not found'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.participants
    WHERE draft_id = p_draft_id AND team_id = p_team_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a member of this team');
  END IF;

  SELECT * INTO v_rule FROM public.resolve_draft_pick_rule(p_draft_id, p_pokemon_id, p_pokemon_name, p_cost);
  IF NOT FOUND OR v_rule.source_cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon is not in this draft pool');
  END IF;
  IF v_rule.is_tiered AND v_rule.tier_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon does not match a configured tier');
  END IF;
  IF NOT v_rule.is_tiered AND v_team.budget_remaining < v_rule.source_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient budget', 'budgetRemaining', v_team.budget_remaining, 'cost', v_rule.source_cost);
  END IF;

  v_max_picks := COALESCE((v_draft.settings->>'maxPokemonPerTeam')::INTEGER, (v_draft.settings->>'pokemonPerTeam')::INTEGER, 6);
  SELECT COUNT(*) INTO v_current_picks FROM public.picks WHERE team_id = p_team_id AND draft_id = p_draft_id;
  IF v_current_picks >= v_max_picks THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum picks reached', 'maxPicks', v_max_picks);
  END IF;

  IF v_rule.is_tiered AND v_rule.tier_cap IS NOT NULL THEN
    SELECT COUNT(*) INTO v_tier_picks FROM public.picks
    WHERE draft_id = p_draft_id AND team_id = p_team_id AND upper(tier_name) = v_rule.tier_name;
    IF v_tier_picks >= v_rule.tier_cap THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Tier cap reached: %s is full (%s/%s)', v_rule.tier_name, v_tier_picks, v_rule.tier_cap),
        'tierName', v_rule.tier_name,
        'tierCap', v_rule.tier_cap
      );
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.picks WHERE draft_id = p_draft_id AND pokemon_id = p_pokemon_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted in this draft');
  END IF;

  INSERT INTO public.picks (draft_id, team_id, pokemon_id, pokemon_name, cost, tier_name, pick_order, round)
  VALUES (p_draft_id, p_team_id, p_pokemon_id, p_pokemon_name, v_rule.source_cost, v_rule.tier_name, v_draft.current_turn, COALESCE(v_draft.current_round, 1))
  RETURNING id INTO v_pick_id;

  v_new_budget := v_team.budget_remaining;
  IF NOT v_rule.is_tiered THEN
    v_new_budget := v_team.budget_remaining - v_rule.source_cost;
    UPDATE public.teams SET budget_remaining = v_new_budget, updated_at = NOW() WHERE id = p_team_id;
  END IF;

  v_next_turn := v_draft.current_turn + 1;
  v_next_round := COALESCE(v_draft.current_round, 1);
  IF ((v_next_turn - 1) % v_total_teams) = 0 THEN v_next_round := v_next_round + 1; END IF;
  v_is_complete := v_next_turn > (v_total_teams * v_max_picks);

  IF v_is_complete THEN
    UPDATE public.drafts SET status = 'completed', current_turn = v_next_turn, current_round = v_next_round, turn_started_at = NULL, updated_at = NOW() WHERE id = p_draft_id;
  ELSE
    UPDATE public.drafts SET current_turn = v_next_turn, current_round = v_next_round, turn_started_at = NOW(), updated_at = NOW() WHERE id = p_draft_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'pickId', v_pick_id,
    'budgetRemaining', v_new_budget, 'newBudget', v_new_budget,
    'newTurn', v_next_turn, 'nextTurn', v_next_turn,
    'newRound', v_next_round, 'tierName', v_rule.tier_name,
    'isComplete', v_is_complete
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted in this draft');
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Budget constraint violated');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.system_make_pick(
  p_draft_id UUID,
  p_team_id UUID,
  p_pokemon_id TEXT,
  p_pokemon_name TEXT,
  p_cost INTEGER,
  p_expected_turn INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
  v_team RECORD;
  v_rule RECORD;
  v_current_team_id UUID;
  v_pick_id UUID;
  v_total_teams INTEGER;
  v_max_picks INTEGER;
  v_current_picks INTEGER;
  v_tier_picks INTEGER;
  v_next_turn INTEGER;
  v_next_round INTEGER;
  v_is_complete BOOLEAN;
BEGIN
  SELECT * INTO v_draft FROM public.drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Draft not found'); END IF;
  IF v_draft.status <> 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'Draft is not active'); END IF;
  IF v_draft.current_turn IS DISTINCT FROM p_expected_turn THEN RETURN jsonb_build_object('success', false, 'error', 'Turn has changed'); END IF;

  SELECT COUNT(*) INTO v_total_teams FROM public.teams WHERE draft_id = p_draft_id;
  v_current_team_id := public.get_current_team_id(p_draft_id, v_draft.current_turn, v_total_teams);
  IF v_current_team_id IS DISTINCT FROM p_team_id THEN RETURN jsonb_build_object('success', false, 'error', 'Not this team''s turn'); END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  SELECT * INTO v_rule FROM public.resolve_draft_pick_rule(p_draft_id, p_pokemon_id, p_pokemon_name, p_cost);
  IF NOT FOUND OR v_rule.source_cost IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Pokemon is not in this draft pool'); END IF;
  IF v_rule.is_tiered AND v_rule.tier_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Pokemon does not match a configured tier'); END IF;
  IF NOT v_rule.is_tiered AND v_team.budget_remaining < v_rule.source_cost THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient budget'); END IF;

  v_max_picks := COALESCE((v_draft.settings->>'maxPokemonPerTeam')::INTEGER, (v_draft.settings->>'pokemonPerTeam')::INTEGER, 6);
  SELECT COUNT(*) INTO v_current_picks FROM public.picks WHERE draft_id = p_draft_id AND team_id = p_team_id;
  IF v_current_picks >= v_max_picks THEN RETURN jsonb_build_object('success', false, 'error', 'Maximum picks reached'); END IF;
  IF v_rule.is_tiered AND v_rule.tier_cap IS NOT NULL THEN
    SELECT COUNT(*) INTO v_tier_picks FROM public.picks WHERE draft_id = p_draft_id AND team_id = p_team_id AND upper(tier_name) = v_rule.tier_name;
    IF v_tier_picks >= v_rule.tier_cap THEN RETURN jsonb_build_object('success', false, 'error', 'Tier cap reached', 'tierName', v_rule.tier_name); END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.picks WHERE draft_id = p_draft_id AND pokemon_id = p_pokemon_id) THEN RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted in this draft'); END IF;

  INSERT INTO public.picks (draft_id, team_id, pokemon_id, pokemon_name, cost, tier_name, pick_order, round)
  VALUES (p_draft_id, p_team_id, p_pokemon_id, p_pokemon_name, v_rule.source_cost, v_rule.tier_name, v_draft.current_turn, COALESCE(v_draft.current_round, 1))
  RETURNING id INTO v_pick_id;
  IF NOT v_rule.is_tiered THEN
    UPDATE public.teams SET budget_remaining = budget_remaining - v_rule.source_cost, updated_at = NOW() WHERE id = p_team_id;
  END IF;

  v_next_turn := v_draft.current_turn + 1;
  v_next_round := COALESCE(v_draft.current_round, 1);
  IF ((v_next_turn - 1) % v_total_teams) = 0 THEN v_next_round := v_next_round + 1; END IF;
  v_is_complete := v_next_turn > (v_total_teams * v_max_picks);
  IF v_is_complete THEN
    UPDATE public.drafts SET status = 'completed', current_turn = v_next_turn, current_round = v_next_round, turn_started_at = NULL, updated_at = NOW() WHERE id = p_draft_id;
  ELSE
    UPDATE public.drafts SET current_turn = v_next_turn, current_round = v_next_round, turn_started_at = NOW(), updated_at = NOW() WHERE id = p_draft_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'pickId', v_pick_id, 'newTurn', v_next_turn, 'nextTurn', v_next_turn, 'tierName', v_rule.tier_name, 'isComplete', v_is_complete);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted in this draft');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.system_make_pick(UUID, UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_make_pick(UUID, UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- Service-role-only atomic join. Locking the draft makes capacity, order and
-- duplicate checks correct even when many users join in the same millisecond.
CREATE OR REPLACE FUNCTION public.join_draft_atomic(
  p_draft_id UUID,
  p_user_id TEXT,
  p_display_name TEXT,
  p_team_name TEXT,
  p_as_spectator BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
  v_existing RECORD;
  v_team_id UUID;
  v_team_count INTEGER;
  v_draft_order INTEGER;
  v_as_spectator BOOLEAN;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 OR length(p_display_name) > 50 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid display name'); END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 0));
  SELECT * INTO v_draft FROM public.drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Draft not found'); END IF;

  SELECT * INTO v_existing FROM public.participants
  WHERE draft_id = p_draft_id AND user_id = p_user_id
  ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    UPDATE public.participants SET last_seen = NOW() WHERE id = v_existing.id;
    RETURN jsonb_build_object('success', true, 'teamId', v_existing.team_id, 'asSpectator', v_existing.team_id IS NULL, 'rejoined', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.participants
    WHERE draft_id = p_draft_id AND lower(display_name) = lower(trim(p_display_name))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', format('Username "%s" is already in this draft', trim(p_display_name)));
  END IF;

  SELECT COUNT(*) INTO v_team_count FROM public.teams WHERE draft_id = p_draft_id;
  v_as_spectator := p_as_spectator OR v_draft.status <> 'setup' OR v_team_count >= v_draft.max_teams;
  IF v_as_spectator THEN
    INSERT INTO public.participants (draft_id, user_id, display_name, team_id, is_host, last_seen)
    VALUES (p_draft_id, p_user_id, trim(p_display_name), NULL, FALSE, NOW());
    RETURN jsonb_build_object('success', true, 'teamId', NULL, 'asSpectator', true, 'rejoined', false);
  END IF;

  IF p_team_name IS NULL OR length(trim(p_team_name)) = 0 OR length(p_team_name) > 50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid team name');
  END IF;
  IF EXISTS (SELECT 1 FROM public.teams WHERE draft_id = p_draft_id AND lower(name) = lower(trim(p_team_name))) THEN
    RETURN jsonb_build_object('success', false, 'error', format('Team name "%s" is already taken', trim(p_team_name)));
  END IF;

  SELECT position INTO v_draft_order
  FROM generate_series(1, v_draft.max_teams) AS available_slots(position)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.teams WHERE draft_id = p_draft_id AND draft_order = position
  )
  ORDER BY position LIMIT 1;
  IF v_draft_order IS NULL THEN
    INSERT INTO public.participants (draft_id, user_id, display_name, team_id, is_host, last_seen)
    VALUES (p_draft_id, p_user_id, trim(p_display_name), NULL, FALSE, NOW());
    RETURN jsonb_build_object('success', true, 'teamId', NULL, 'asSpectator', true, 'rejoined', false);
  END IF;

  INSERT INTO public.teams (draft_id, name, owner_id, budget_remaining, draft_order)
  VALUES (p_draft_id, trim(p_team_name), p_user_id, v_draft.budget_per_team, v_draft_order)
  RETURNING id INTO v_team_id;
  INSERT INTO public.participants (draft_id, user_id, display_name, team_id, is_host, last_seen)
  VALUES (p_draft_id, p_user_id, trim(p_display_name), v_team_id, FALSE, NOW());
  RETURN jsonb_build_object('success', true, 'teamId', v_team_id, 'asSpectator', false, 'rejoined', false, 'draftOrder', v_draft_order);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_draft_atomic(UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_draft_atomic(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

INSERT INTO public._migrations (name, description, rollback_sql) VALUES (
  '022_tier_caps_and_atomic_join',
  'Enforce exact per-team tier caps during interactive/system picks; add atomic capacity-safe draft joins.',
  'DROP FUNCTION IF EXISTS public.join_draft_atomic(UUID,TEXT,TEXT,TEXT,BOOLEAN); DROP FUNCTION IF EXISTS public.resolve_draft_pick_rule(UUID,TEXT,TEXT,INTEGER); DROP TRIGGER IF EXISTS enforce_new_team_invariants_trigger ON public.teams; DROP FUNCTION IF EXISTS public.enforce_new_team_invariants();'
) ON CONFLICT (name) DO NOTHING;
