-- Server-authoritative costs, part 2 (docs/REVIEW-2026-10-10.md #2 and #3).
--
-- 1. resolve_draft_pick_rule no longer trusts the client-submitted cost when a
--    built-in-format draft has no pokemon_tiers row: the pick is rejected.
--    /api/draft/create has written these rows for every built-in draft since
--    2026-10-10. Drafts created before that and still in 'setup' have no rows
--    and will not be able to pick once this applies (host must recreate).
--    Check before applying:
--      SELECT count(*) FROM drafts d
--      WHERE d.status IN ('setup','active') AND d.deleted_at IS NULL
--        AND d.custom_format_id IS NULL
--        AND COALESCE(d.settings->>'tournamentOnly','') <> 'true'
--        AND NOT EXISTS (SELECT 1 FROM pokemon_tiers t WHERE t.draft_id = d.id);
-- 2. nominate_auction checked only p_starting_bid >= 1, so a nominator could
--    open any Pokemon at 1 and win it uncontested below its cost. The opening
--    bid now has to be at least the server-resolved cost (the same floor the
--    UI already shows). place_bid / resolve_auction only accept bids above the
--    current bid, so the floor carries through to the final price.

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
    -- Built-in formats: /api/draft/create writes one pokemon_tiers row per
    -- species. No row means not pickable; never fall back to the client cost.
    -- Match on id only so a cheap species' name cannot price an expensive id.
    SELECT cost, is_legal INTO v_cost, v_is_legal
    FROM public.pokemon_tiers
    WHERE draft_id = p_draft_id AND pokemon_id = p_pokemon_id
    LIMIT 1;
    IF NOT FOUND OR NOT COALESCE(v_is_legal, FALSE) OR v_cost IS NULL THEN RETURN; END IF;
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

CREATE OR REPLACE FUNCTION public.nominate_auction(
  p_draft_id UUID,
  p_pokemon_id TEXT,
  p_pokemon_name TEXT,
  p_starting_bid INTEGER,
  p_duration_seconds INTEGER DEFAULT 60
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT := public.clerk_user_id();
  v_draft RECORD;
  v_team RECORD;
  v_nominating_team_id UUID;
  v_total_teams INTEGER;
  v_completed_auctions INTEGER;
  v_auction_id UUID;
  v_auction_end TIMESTAMPTZ;
  v_floor INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF p_pokemon_id IS NULL OR length(trim(p_pokemon_id)) = 0 OR
     p_pokemon_name IS NULL OR length(trim(p_pokemon_name)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon is required');
  END IF;
  IF p_starting_bid < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Starting bid must be at least 1');
  END IF;
  IF p_duration_seconds < 10 OR p_duration_seconds > 600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auction duration must be between 10 and 600 seconds');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 1));
  SELECT * INTO v_draft FROM public.drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Draft not found'); END IF;
  IF v_draft.status <> 'active' OR v_draft.format <> 'auction' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auction draft is not active');
  END IF;
  IF v_draft.custom_format_id IS NULL
     AND jsonb_typeof(v_draft.settings->'allowedPokemonIds') = 'array'
     AND jsonb_array_length(v_draft.settings->'allowedPokemonIds') > 0
     AND NOT ((v_draft.settings->'allowedPokemonIds') ? p_pokemon_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon is not in this draft pool');
  END IF;
  -- The opening bid is client-supplied; it may not undercut the server cost.
  SELECT source_cost INTO v_floor
  FROM public.resolve_draft_pick_rule(p_draft_id, p_pokemon_id, p_pokemon_name, p_starting_bid);
  IF v_floor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon is not in this draft pool');
  END IF;
  IF p_starting_bid < v_floor THEN
    RETURN jsonb_build_object('success', false, 'error', format('Starting bid must be at least %s', v_floor));
  END IF;

  IF EXISTS (SELECT 1 FROM public.auctions WHERE draft_id = p_draft_id AND status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'There is already an active auction');
  END IF;
  IF EXISTS (SELECT 1 FROM public.picks WHERE draft_id = p_draft_id AND pokemon_id = p_pokemon_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon has already been drafted');
  END IF;

  SELECT * INTO v_team FROM public.teams
  WHERE draft_id = p_draft_id AND owner_id = v_caller
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'You do not own a team in this draft'); END IF;
  IF v_team.budget_remaining < p_starting_bid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Starting bid exceeds your budget');
  END IF;

  SELECT COUNT(*) INTO v_total_teams FROM public.teams WHERE draft_id = p_draft_id;
  SELECT COUNT(*) INTO v_completed_auctions FROM public.auctions
  WHERE draft_id = p_draft_id AND status = 'completed';

  SELECT id INTO v_nominating_team_id
  FROM public.teams
  WHERE draft_id = p_draft_id
  ORDER BY draft_order, created_at, id
  OFFSET (v_completed_auctions % NULLIF(v_total_teams, 0)) LIMIT 1;

  IF v_nominating_team_id IS DISTINCT FROM v_team.id THEN
    RETURN jsonb_build_object('success', false, 'error', 'It is not your turn to nominate');
  END IF;

  v_auction_end := clock_timestamp() + make_interval(secs => p_duration_seconds);
  INSERT INTO public.auctions (
    draft_id, pokemon_id, pokemon_name, nominated_by, current_bid,
    current_bidder, auction_end, status
  ) VALUES (
    p_draft_id, p_pokemon_id, p_pokemon_name, v_team.id, p_starting_bid,
    NULL, v_auction_end, 'active'
  ) RETURNING id INTO v_auction_id;

  RETURN jsonb_build_object(
    'success', true,
    'auctionId', v_auction_id,
    'auctionEnd', v_auction_end
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.nominate_auction(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nominate_auction(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
