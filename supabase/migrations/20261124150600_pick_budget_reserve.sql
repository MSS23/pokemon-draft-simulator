-- 042: snake budget reserve in make_draft_pick (audit B-27, snake half)
--
-- make_draft_pick only checked budget_remaining >= cost, so a direct RPC call
-- or a stale client could spend so much that the team could never fill its
-- roster. A points-draft pick must now leave 1 point for each other empty
-- slot. If the pool has a 0-cost legal Pokemon the reserve is 0, so the
-- server is never stricter than the client's isPickSafe. Tiered drafts skip
-- budget entirely, as before. The auction half is in 20261124150000.
-- system_make_pick (auto-pick) is left as is: it only picks from wishlists and
-- a short roster there just auto-skips later turns.
--
-- Body is the live make_draft_pick plus the reserve block. Signature and
-- return keys unchanged. Idempotent.

CREATE OR REPLACE FUNCTION public.make_draft_pick(
  p_draft_id uuid, p_team_id uuid, p_user_id text, p_pokemon_id text,
  p_pokemon_name text, p_cost integer, p_expected_turn integer
)
RETURNS jsonb
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
  v_reserve INTEGER;
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

  -- Budget reserve (B-27): 1 point per other empty slot, 0 if a free mon exists.
  IF NOT v_rule.is_tiered AND v_max_picks - v_current_picks > 1 THEN
    v_reserve := CASE
      WHEN EXISTS (SELECT 1 FROM public.pokemon_tiers WHERE draft_id = p_draft_id AND is_legal AND cost <= 0)
        OR EXISTS (SELECT 1 FROM public.custom_formats f, LATERAL jsonb_each_text(f.pokemon_pricing) e
                   WHERE f.id = v_draft.custom_format_id AND e.value ~ '^-?[0-9]+$' AND e.value::INTEGER <= 0)
      THEN 0
      ELSE v_max_picks - v_current_picks - 1
    END;
    IF v_team.budget_remaining - v_rule.source_cost < v_reserve THEN
      RETURN jsonb_build_object('success', false,
        'error', format('Budget reserve: keep at least %s points for your remaining slots', v_reserve),
        'budgetRemaining', v_team.budget_remaining, 'cost', v_rule.source_cost);
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.make_draft_pick(uuid, uuid, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.make_draft_pick(uuid, uuid, text, text, text, integer, integer) TO authenticated, service_role;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '042_pick_budget_reserve',
  'make_draft_pick keeps 1 point per remaining empty slot in points drafts (0 when a free legal Pokemon exists).',
  'Re-apply make_draft_pick from 20261029120000;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '042_pick_budget_reserve'
);
