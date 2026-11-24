-- 036: auction completion, nominator opening bid, budget reserve
-- Audit clusters B-08, B-18, B-28 and the auction half of B-27.
--
-- B-08  Auction drafts never completed: a full or broke team kept getting
--       nomination turns, every timeout added a '__skipped__' row and the
--       draft looped forever (live: 4 active auction drafts, 30+ skip rows).
--       New helper auction_advance_after_lot() runs after every lot (sold,
--       unsold or skipped). It completes the draft when no team can still
--       acquire a Pokemon, auto-skips nominators that cannot acquire (a skip
--       row per ineligible team, so the COUNT(completed auctions) % teams
--       nominator rule used by nominate_auction, system_skip_nomination and
--       the client stays identical), and pauses the draft after a full
--       rotation of skips with no lot (status 'paused', turn_started_at NULL)
--       instead of completing a 0-pick draft.
-- B-18  The nominator's starting bid is now a real bid: current_bidder is the
--       nominating team and an opening bid_history row is written, so an
--       unbid lot sells to the nominator at the starting price.
-- B-28  resolve_auction's unique_violation handler completed the lot without
--       advancing current_turn. The handler is gone: the transaction aborts,
--       the lot stays active and the next resolve call retries cleanly.
--       resolve_auction also takes the same advisory lock (key 1) as
--       nominate_auction / system_skip_nomination.
-- B-27  nominate_auction, place_bid and resolve_auction keep 1 point per
--       remaining empty roster slot (the auction floor is >= 1), points
--       drafts only.
--
-- Signatures and return keys are unchanged. Idempotent.

-- ---------------------------------------------------------------------------
-- Helper: can this team still win a lot? (roster not full, >= 1 point left)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_team_can_acquire(p_team_id uuid, p_max_picks integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = p_team_id
      AND COALESCE(t.budget_remaining, 0) >= 1
      AND (SELECT COUNT(*) FROM public.picks p WHERE p.team_id = t.id AND p.draft_id = t.draft_id) < p_max_picks
  );
$$;

-- ---------------------------------------------------------------------------
-- Helper: advance an auction draft after a lot has been marked completed.
-- Caller must hold the draft advisory lock (key 1). Internal only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auction_advance_after_lot(p_draft_id uuid, p_from_skip boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
  v_total INTEGER;
  v_max INTEGER;
  v_turn INTEGER;
  v_round INTEGER;
  v_completed INTEGER;
  v_next_team UUID;
  v_auto INTEGER := 0;
  v_before INTEGER;
  v_after INTEGER;
BEGIN
  SELECT * INTO v_draft FROM public.drafts WHERE id = p_draft_id FOR UPDATE;
  SELECT COUNT(*) INTO v_total FROM public.teams WHERE draft_id = p_draft_id;
  v_max := COALESCE(
    (v_draft.settings->>'maxPokemonPerTeam')::INTEGER,
    (v_draft.settings->>'pokemonPerTeam')::INTEGER,
    10
  );
  v_turn := COALESCE(v_draft.current_turn, 1) + 1;

  -- Nobody can buy anything any more: the draft is over.
  IF v_total = 0 OR NOT EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.draft_id = p_draft_id AND public.auction_team_can_acquire(t.id, v_max)
  ) THEN
    v_round := ((v_turn - 1) / GREATEST(v_total, 1)) + 1;
    UPDATE public.drafts SET
      status = 'completed', current_turn = v_turn, current_round = v_round,
      turn_started_at = NULL, updated_at = NOW()
    WHERE id = p_draft_id;
    RETURN jsonb_build_object('status', 'completed', 'newTurn', v_turn, 'newRound', v_round, 'autoSkipped', 0);
  END IF;

  -- Trailing skips (no real lot since) before this call's own rows.
  SELECT COUNT(*) INTO v_before
  FROM public.auctions a
  WHERE a.draft_id = p_draft_id AND a.status = 'completed' AND a.pokemon_id = '__skipped__'
    AND a.created_at > COALESCE((
      SELECT MAX(created_at) FROM public.auctions
      WHERE draft_id = p_draft_id AND status = 'completed' AND pokemon_id <> '__skipped__'
    ), '-infinity'::timestamptz);
  IF p_from_skip THEN v_before := GREATEST(v_before - 1, 0); END IF;

  -- Skip nominators that cannot acquire, keeping the count-based rotation.
  LOOP
    SELECT COUNT(*) INTO v_completed FROM public.auctions
    WHERE draft_id = p_draft_id AND status = 'completed';
    SELECT id INTO v_next_team FROM public.teams
    WHERE draft_id = p_draft_id
    ORDER BY draft_order, created_at, id
    OFFSET (v_completed % v_total) LIMIT 1;

    EXIT WHEN public.auction_team_can_acquire(v_next_team, v_max) OR v_auto >= v_total;

    INSERT INTO public.auctions (
      draft_id, pokemon_id, pokemon_name, nominated_by, current_bid,
      current_bidder, auction_end, status
    ) VALUES (
      p_draft_id, '__skipped__', 'Nomination skipped (roster full or out of budget)',
      v_next_team, 0, NULL, clock_timestamp(), 'completed'
    );
    v_auto := v_auto + 1;
    v_turn := v_turn + 1;
  END LOOP;

  v_round := ((v_turn - 1) / v_total) + 1;

  SELECT COUNT(*) INTO v_after
  FROM public.auctions a
  WHERE a.draft_id = p_draft_id AND a.status = 'completed' AND a.pokemon_id = '__skipped__'
    AND a.created_at > COALESCE((
      SELECT MAX(created_at) FROM public.auctions
      WHERE draft_id = p_draft_id AND status = 'completed' AND pokemon_id <> '__skipped__'
    ), '-infinity'::timestamptz);

  -- A whole rotation passed with no lot: stop the cron loop. The host can
  -- unpause; it then takes another full idle rotation to pause again.
  IF v_after / v_total > v_before / v_total THEN
    UPDATE public.drafts SET
      status = 'paused', current_turn = v_turn, current_round = v_round,
      turn_started_at = NULL, updated_at = NOW()
    WHERE id = p_draft_id;
    RETURN jsonb_build_object('status', 'paused', 'newTurn', v_turn, 'newRound', v_round, 'autoSkipped', v_auto);
  END IF;

  UPDATE public.drafts SET
    current_turn = v_turn, current_round = v_round,
    turn_started_at = NOW(), updated_at = NOW()
  WHERE id = p_draft_id;
  RETURN jsonb_build_object('status', 'active', 'newTurn', v_turn, 'newRound', v_round, 'autoSkipped', v_auto);
END;
$$;

-- ---------------------------------------------------------------------------
-- nominate_auction: nominator is the opening bidder; roster-full and reserve
-- checks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nominate_auction(
  p_draft_id uuid, p_pokemon_id text, p_pokemon_name text,
  p_starting_bid integer, p_duration_seconds integer DEFAULT 60
)
RETURNS jsonb
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
  v_max_picks INTEGER;
  v_pick_count INTEGER;
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

  v_max_picks := COALESCE(
    (v_draft.settings->>'maxPokemonPerTeam')::INTEGER,
    (v_draft.settings->>'pokemonPerTeam')::INTEGER,
    10
  );
  SELECT COUNT(*) INTO v_pick_count FROM public.picks
  WHERE draft_id = p_draft_id AND team_id = v_team.id;
  IF v_pick_count >= v_max_picks THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your roster is already full');
  END IF;
  IF v_team.budget_remaining < p_starting_bid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Starting bid exceeds your budget');
  END IF;
  -- Keep 1 point for every other empty slot (auction floor is >= 1).
  IF COALESCE(v_draft.settings->>'scoringSystem', '') <> 'tiered'
     AND v_team.budget_remaining - p_starting_bid < (v_max_picks - v_pick_count - 1) THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Budget reserve: keep at least %s points for your remaining slots', v_max_picks - v_pick_count - 1));
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
  -- The nominator opens the bidding: an unbid lot sells to them at this price.
  INSERT INTO public.auctions (
    draft_id, pokemon_id, pokemon_name, nominated_by, current_bid,
    current_bidder, auction_end, status
  ) VALUES (
    p_draft_id, p_pokemon_id, p_pokemon_name, v_team.id, p_starting_bid,
    v_team.id::TEXT, v_auction_end, 'active'
  ) RETURNING id INTO v_auction_id;

  INSERT INTO public.bid_history (auction_id, draft_id, team_id, team_name, bid_amount)
  VALUES (v_auction_id, p_draft_id, v_team.id, v_team.name, p_starting_bid);

  RETURN jsonb_build_object(
    'success', true,
    'auctionId', v_auction_id,
    'auctionEnd', v_auction_end
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- place_bid: same as live plus the 1-point-per-slot reserve.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_bid(auction_id uuid, bidder_team_id uuid, bid_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller TEXT := public.clerk_user_id();
  v_auction RECORD;
  v_team RECORD;
  v_settings JSONB;
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

  SELECT settings INTO v_settings FROM public.drafts WHERE id = v_auction.draft_id;
  v_max_picks := COALESCE(
    (v_settings->>'maxPokemonPerTeam')::INTEGER,
    (v_settings->>'pokemonPerTeam')::INTEGER,
    10
  );
  SELECT COUNT(*) INTO v_pick_count FROM public.picks
  WHERE draft_id = v_auction.draft_id AND team_id = bidder_team_id;
  IF v_pick_count >= v_max_picks THEN RAISE EXCEPTION 'Team roster is already full'; END IF;
  IF bid_amount <= v_auction.current_bid THEN
    RAISE EXCEPTION 'Bid must be higher than current bid of %', v_auction.current_bid;
  END IF;
  IF v_team.budget_remaining < bid_amount THEN
    RAISE EXCEPTION 'Insufficient budget: % < %', v_team.budget_remaining, bid_amount;
  END IF;
  IF COALESCE(v_settings->>'scoringSystem', '') <> 'tiered'
     AND v_team.budget_remaining - bid_amount < (v_max_picks - v_pick_count - 1) THEN
    RAISE EXCEPTION 'Budget reserve: keep at least % points for your remaining slots',
      v_max_picks - v_pick_count - 1;
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

-- ---------------------------------------------------------------------------
-- resolve_auction: advisory lock, reserve re-check, shared advance helper, no
-- unique_violation handler.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_auction(p_draft_id uuid, p_auction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auction RECORD;
  v_draft RECORD;
  v_winner_team_id UUID;
  v_team RECORD;
  v_max_picks INTEGER;
  v_total_picks INTEGER;
  v_team_picks INTEGER;
  v_pick_id UUID;
  v_reserve_ok BOOLEAN;
  v_next JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 1));

  SELECT * INTO v_auction FROM public.auctions
  WHERE id = p_auction_id AND draft_id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('resolved', false, 'reason', 'Auction not found'); END IF;
  IF v_auction.status <> 'active' THEN RETURN jsonb_build_object('resolved', false, 'reason', 'Auction already resolved'); END IF;
  IF clock_timestamp() < v_auction.auction_end THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'Auction not yet expired');
  END IF;

  SELECT * INTO v_draft FROM public.drafts WHERE id = p_draft_id FOR UPDATE;
  v_max_picks := COALESCE(
    (v_draft.settings->>'maxPokemonPerTeam')::INTEGER,
    (v_draft.settings->>'pokemonPerTeam')::INTEGER,
    10
  );

  IF v_auction.current_bidder IS NOT NULL THEN
    v_winner_team_id := v_auction.current_bidder::UUID;
    SELECT * INTO v_team FROM public.teams
    WHERE id = v_winner_team_id AND draft_id = p_draft_id FOR UPDATE;
    IF FOUND THEN
      SELECT COUNT(*) INTO v_team_picks FROM public.picks
      WHERE draft_id = p_draft_id AND team_id = v_winner_team_id;
      v_reserve_ok := COALESCE(v_draft.settings->>'scoringSystem', '') = 'tiered'
        OR v_team.budget_remaining - v_auction.current_bid >= (v_max_picks - v_team_picks - 1);

      IF v_team.budget_remaining >= v_auction.current_bid AND v_reserve_ok AND
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
  END IF;

  UPDATE public.auctions SET status = 'completed', updated_at = NOW() WHERE id = p_auction_id;

  v_next := public.auction_advance_after_lot(p_draft_id, false);

  RETURN jsonb_build_object(
    'resolved', true, 'pickId', v_pick_id,
    'winner', CASE WHEN v_pick_id IS NULL THEN NULL ELSE v_winner_team_id END,
    'isComplete', v_next->>'status' = 'completed',
    'status', v_next->>'status',
    'newTurn', (v_next->>'newTurn')::INTEGER,
    'newRound', (v_next->>'newRound')::INTEGER
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- system_skip_nomination: same guards, then the shared advance helper.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.system_skip_nomination(p_draft_id uuid, p_expected_turn integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
  v_total_teams INTEGER;
  v_completed INTEGER;
  v_skipped_team_id UUID;
  v_next JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 1));
  SELECT * INTO v_draft FROM public.drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Draft not found');
  END IF;
  IF v_draft.status <> 'active' OR v_draft.format <> 'auction' THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Not an active auction draft');
  END IF;
  IF v_draft.current_turn IS DISTINCT FROM p_expected_turn THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Turn already advanced');
  END IF;
  IF EXISTS (SELECT 1 FROM public.auctions WHERE draft_id = p_draft_id AND status = 'active') THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Active auction in progress');
  END IF;

  SELECT COUNT(*) INTO v_total_teams FROM public.teams WHERE draft_id = p_draft_id;
  IF v_total_teams = 0 THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'No teams');
  END IF;

  SELECT COUNT(*) INTO v_completed FROM public.auctions
  WHERE draft_id = p_draft_id AND status = 'completed';

  SELECT id INTO v_skipped_team_id
  FROM public.teams
  WHERE draft_id = p_draft_id
  ORDER BY draft_order, created_at, id
  OFFSET (v_completed % v_total_teams) LIMIT 1;

  INSERT INTO public.auctions (
    draft_id, pokemon_id, pokemon_name, nominated_by, current_bid,
    current_bidder, auction_end, status
  ) VALUES (
    p_draft_id, '__skipped__', 'Nomination skipped', v_skipped_team_id, 0,
    NULL, clock_timestamp(), 'completed'
  );

  v_next := public.auction_advance_after_lot(p_draft_id, true);

  RETURN jsonb_build_object(
    'skipped', true, 'team', v_skipped_team_id,
    'newTurn', (v_next->>'newTurn')::INTEGER,
    'status', v_next->>'status'
  );
END;
$$;

-- Grants: helpers are internal; the public RPCs keep their existing roles.
REVOKE EXECUTE ON FUNCTION public.auction_team_can_acquire(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auction_advance_after_lot(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auction_team_can_acquire(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.auction_advance_after_lot(uuid, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.nominate_auction(uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.place_bid(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_auction(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nominate_auction(uuid, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_bid(uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_auction(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.system_skip_nomination(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_skip_nomination(uuid, integer) TO service_role;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '036_auction_completion_and_nominator_bid',
  'Auction drafts complete when no team can acquire, auto-skip ineligible nominators, pause after an idle rotation; nominator is the opening bidder; 1-point-per-slot reserve; resolve_auction takes the draft lock and drops the unique_violation handler.',
  'Re-apply nominate_auction/place_bid/resolve_auction/system_skip_nomination from 20261029120000 / 20260717130000 / 20260801120000; DROP FUNCTION public.auction_advance_after_lot(uuid, boolean), public.auction_team_can_acquire(uuid, integer);'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '036_auction_completion_and_nominator_bid'
);
