-- Server-authoritative auction nominations, bids, expiry and turn progression.
-- Direct auction inserts are removed; authenticated clients use RPCs whose
-- clocks, locks and caller identity are enforced inside PostgreSQL.

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

CREATE OR REPLACE FUNCTION public.place_bid(
  auction_id UUID,
  bidder_team_id UUID,
  bid_amount INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT := public.clerk_user_id();
  v_auction RECORD;
  v_team RECORD;
  v_max_picks INTEGER;
  v_pick_count INTEGER;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_auction FROM public.auctions WHERE id = auction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auction not found'; END IF;
  IF v_auction.status <> 'active' THEN RAISE EXCEPTION 'Auction is not active'; END IF;
  IF clock_timestamp() >= v_auction.auction_end THEN RAISE EXCEPTION 'Auction has expired'; END IF;

  SELECT * INTO v_team FROM public.teams
  WHERE id = bidder_team_id AND draft_id = v_auction.draft_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found'; END IF;
  IF v_team.owner_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Only the team owner can place bids for this team' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    (settings->>'maxPokemonPerTeam')::INTEGER,
    (settings->>'pokemonPerTeam')::INTEGER,
    10
  ) INTO v_max_picks FROM public.drafts WHERE id = v_auction.draft_id;
  SELECT COUNT(*) INTO v_pick_count FROM public.picks
  WHERE draft_id = v_auction.draft_id AND team_id = bidder_team_id;
  IF v_pick_count >= v_max_picks THEN RAISE EXCEPTION 'Team roster is already full'; END IF;
  IF bid_amount <= v_auction.current_bid THEN
    RAISE EXCEPTION 'Bid must be higher than current bid of %', v_auction.current_bid;
  END IF;
  IF v_team.budget_remaining < bid_amount THEN
    RAISE EXCEPTION 'Insufficient budget: % < %', v_team.budget_remaining, bid_amount;
  END IF;

  UPDATE public.auctions SET
    current_bid = bid_amount,
    current_bidder = bidder_team_id::TEXT,
    updated_at = NOW()
  WHERE id = auction_id;

  INSERT INTO public.bid_history (auction_id, draft_id, team_id, team_name, bid_amount)
  VALUES (auction_id, v_auction.draft_id, bidder_team_id, v_team.name, bid_amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_bid(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bid(UUID, UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_auction(
  p_draft_id UUID,
  p_auction_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auction RECORD;
  v_draft RECORD;
  v_winner_team_id UUID;
  v_team RECORD;
  v_total_teams INTEGER;
  v_max_picks INTEGER;
  v_total_picks INTEGER;
  v_team_picks INTEGER;
  v_next_turn INTEGER;
  v_next_round INTEGER;
  v_is_complete BOOLEAN;
  v_pick_id UUID;
BEGIN
  SELECT * INTO v_auction FROM public.auctions
  WHERE id = p_auction_id AND draft_id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('resolved', false, 'reason', 'Auction not found'); END IF;
  IF v_auction.status <> 'active' THEN RETURN jsonb_build_object('resolved', false, 'reason', 'Auction already resolved'); END IF;
  IF clock_timestamp() < v_auction.auction_end THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'Auction not yet expired');
  END IF;

  SELECT * INTO v_draft FROM public.drafts WHERE id = p_draft_id FOR UPDATE;
  SELECT COUNT(*) INTO v_total_teams FROM public.teams WHERE draft_id = p_draft_id;
  v_max_picks := COALESCE(
    (v_draft.settings->>'maxPokemonPerTeam')::INTEGER,
    (v_draft.settings->>'pokemonPerTeam')::INTEGER,
    10
  );

  IF v_auction.current_bidder IS NOT NULL THEN
    v_winner_team_id := v_auction.current_bidder::UUID;
    SELECT * INTO v_team FROM public.teams WHERE id = v_winner_team_id FOR UPDATE;
    SELECT COUNT(*) INTO v_team_picks FROM public.picks
    WHERE draft_id = p_draft_id AND team_id = v_winner_team_id;

    IF FOUND AND v_team.budget_remaining >= v_auction.current_bid AND
       v_team_picks < v_max_picks AND NOT EXISTS (
         SELECT 1 FROM public.picks WHERE draft_id = p_draft_id AND pokemon_id = v_auction.pokemon_id
       ) THEN
      SELECT COUNT(*) INTO v_total_picks FROM public.picks WHERE draft_id = p_draft_id;
      INSERT INTO public.picks (draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round)
      VALUES (
        p_draft_id, v_winner_team_id, v_auction.pokemon_id, v_auction.pokemon_name,
        v_auction.current_bid, v_total_picks + 1,
        GREATEST(COALESCE(v_draft.current_round, 1), 1)
      ) RETURNING id INTO v_pick_id;

      UPDATE public.teams SET
        budget_remaining = budget_remaining - v_auction.current_bid,
        updated_at = NOW()
      WHERE id = v_winner_team_id;
    END IF;
  END IF;

  UPDATE public.auctions SET status = 'completed', updated_at = NOW() WHERE id = p_auction_id;

  SELECT COUNT(*) INTO v_total_picks FROM public.picks WHERE draft_id = p_draft_id;
  v_next_turn := COALESCE(v_draft.current_turn, 1) + 1;
  v_next_round := ((v_next_turn - 1) / NULLIF(v_total_teams, 0)) + 1;
  v_is_complete := v_total_teams > 0 AND v_total_picks >= (v_total_teams * v_max_picks);

  IF v_is_complete THEN
    UPDATE public.drafts SET
      status = 'completed', current_turn = v_next_turn,
      current_round = v_next_round, turn_started_at = NULL, updated_at = NOW()
    WHERE id = p_draft_id;
  ELSE
    UPDATE public.drafts SET
      current_turn = v_next_turn, current_round = v_next_round,
      turn_started_at = NOW(), updated_at = NOW()
    WHERE id = p_draft_id;
  END IF;

  RETURN jsonb_build_object(
    'resolved', true, 'pickId', v_pick_id, 'winner', v_winner_team_id,
    'isComplete', v_is_complete, 'newTurn', v_next_turn, 'newRound', v_next_round
  );
EXCEPTION WHEN unique_violation THEN
  UPDATE public.auctions SET status = 'completed', updated_at = NOW()
  WHERE id = p_auction_id AND status = 'active';
  RETURN jsonb_build_object('resolved', false, 'reason', 'Concurrent resolution already finalized');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_auction(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_auction(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "auctions_insert" ON public.auctions;
