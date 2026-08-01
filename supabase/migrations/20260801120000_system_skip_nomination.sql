-- Auction nomination timeout backstop.
--
-- nominate_auction derives whose turn it is from COUNT(completed auctions) %
-- total_teams, and resolve_auction advances current_turn even for unsold lots.
-- But when the team on the clock never nominates, nothing advanced either
-- counter, deadlocking the draft (draft-tick's auction branch had no skip path).
--
-- system_skip_nomination advances both counters the same way an unsold auction
-- does: insert a completed marker auction (bumps the completed count that
-- nominate_auction reads) and increment current_turn / restart turn_started_at.
-- Service-role only; invoked from src/lib/draft-tick.ts.

CREATE OR REPLACE FUNCTION public.system_skip_nomination(
  p_draft_id UUID,
  p_expected_turn INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
  v_total_teams INTEGER;
  v_completed INTEGER;
  v_skipped_team_id UUID;
  v_next_turn INTEGER;
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

  v_next_turn := COALESCE(v_draft.current_turn, 1) + 1;
  UPDATE public.drafts SET
    current_turn = v_next_turn,
    current_round = ((v_next_turn - 1) / v_total_teams) + 1,
    turn_started_at = NOW(),
    updated_at = NOW()
  WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'skipped', true, 'team', v_skipped_team_id, 'newTurn', v_next_turn
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.system_skip_nomination(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_skip_nomination(UUID, INTEGER) TO service_role;
