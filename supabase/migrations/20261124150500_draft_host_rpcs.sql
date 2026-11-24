-- 041: host-only draft lifecycle RPCs
-- Audit B-15 (reset_draft), B-12 (extend_auction), B-26 (shuffle_draft_order),
-- handoffs C-04 (remove_team), C-07/C-08 (start_draft), D-02
-- (join_draft_atomic rejects soft-deleted drafts).
--
-- All new RPCs check drafts.host_id = clerk_user_id(), lock the draft row and
-- take the draft advisory lock (key 1, same as nominate_auction /
-- system_skip_nomination / resolve_auction), so they serialize with picks,
-- ticks and each other. They are additive: the TS keeps working on its current
-- direct writes until it switches to these, and 20261124151400 then revokes
-- the direct writes.
--
--   reset_draft(p_draft_id uuid) -> jsonb {success, error?}
--     one transaction: delete bid_history/auctions/picks, reset every team's
--     budget_remaining and undos_remaining, re-enable wishlist rows, set the
--     draft to setup (current_turn NULL, current_round 1, turn_started_at NULL).
--   remove_team(p_draft_id uuid, p_team_id uuid) -> void
--     setup only; deletes the team's participants (wishlists cascade), picks,
--     nominated auctions, the team, and renumbers draft_order 1..N.
--   start_draft(p_draft_id uuid, p_shuffle boolean DEFAULT true) -> jsonb
--     {started, reason?}; idempotent on an active draft; validates >= 2 teams,
--     every team has a participant, draft_order is 1..N after the optional
--     shuffle; sets active, current_turn 1, turn_started_at now(),
--     settings.draftOrderShuffled = true.
--   shuffle_draft_order(p_draft_id uuid) -> jsonb {success, order}
--     setup only; rewrites every seat in one statement.
--   extend_auction(p_draft_id uuid, p_auction_id uuid, p_seconds integer)
--     -> jsonb {success, auctionEnd | error}; active, unexpired lot, 1..300s,
--     auction_end := GREATEST(auction_end, now()) + p_seconds, capped at
--     now() + 600s.
-- Idempotent.

CREATE OR REPLACE FUNCTION public.reset_draft(p_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
BEGIN
  IF public.clerk_user_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 1));
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR v_draft.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
  END IF;
  IF v_draft.host_id IS DISTINCT FROM public.clerk_user_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the host can reset the draft');
  END IF;

  DELETE FROM bid_history WHERE draft_id = p_draft_id
     OR auction_id IN (SELECT id FROM auctions WHERE draft_id = p_draft_id);
  DELETE FROM auctions WHERE draft_id = p_draft_id;
  DELETE FROM picks WHERE draft_id = p_draft_id;
  UPDATE teams SET
    budget_remaining = COALESCE(v_draft.budget_per_team, 100),
    undos_remaining = COALESCE(v_draft.max_undos_per_team, 3),
    updated_at = NOW()
  WHERE draft_id = p_draft_id;
  UPDATE wishlist_items SET is_available = true, updated_at = NOW() WHERE draft_id = p_draft_id;
  UPDATE drafts SET
    status = 'setup', current_turn = NULL, current_round = 1,
    turn_started_at = NULL, updated_at = NOW()
  WHERE id = p_draft_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_team(p_draft_id uuid, p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
BEGIN
  IF public.clerk_user_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 1));
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.host_id IS DISTINCT FROM public.clerk_user_id() THEN
    RAISE EXCEPTION 'Only the host can remove teams' USING ERRCODE = '42501';
  END IF;
  IF v_draft.status <> 'setup' THEN
    RAISE EXCEPTION 'Teams can only be removed before the draft starts';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id AND draft_id = p_draft_id) THEN
    RAISE EXCEPTION 'Team not found in this draft';
  END IF;

  DELETE FROM participants WHERE team_id = p_team_id;
  DELETE FROM picks WHERE team_id = p_team_id;
  DELETE FROM auctions WHERE nominated_by = p_team_id;
  DELETE FROM teams WHERE id = p_team_id;

  UPDATE teams t SET draft_order = s.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY draft_order, created_at, id) AS rn
    FROM teams WHERE draft_id = p_draft_id
  ) s
  WHERE t.id = s.id AND t.draft_order IS DISTINCT FROM s.rn;
END;
$$;

CREATE OR REPLACE FUNCTION public.shuffle_draft_order(p_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
  v_order JSONB;
BEGIN
  IF public.clerk_user_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 1));
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Draft not found'); END IF;
  IF v_draft.host_id IS DISTINCT FROM public.clerk_user_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the host can shuffle the draft order');
  END IF;
  IF v_draft.status <> 'setup' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft order can only change before the draft starts');
  END IF;

  UPDATE teams t SET draft_order = s.rn
  FROM (SELECT id, row_number() OVER (ORDER BY random()) AS rn FROM teams WHERE draft_id = p_draft_id) s
  WHERE t.id = s.id;

  UPDATE drafts SET
    settings = COALESCE(settings, '{}'::jsonb) || '{"draftOrderShuffled": true}'::jsonb,
    updated_at = NOW()
  WHERE id = p_draft_id;

  SELECT jsonb_agg(jsonb_build_object('teamId', id, 'draftOrder', draft_order) ORDER BY draft_order)
  INTO v_order FROM teams WHERE draft_id = p_draft_id;
  RETURN jsonb_build_object('success', true, 'order', COALESCE(v_order, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.start_draft(p_draft_id uuid, p_shuffle boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft RECORD;
  v_total INTEGER;
BEGIN
  IF public.clerk_user_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 1));
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR v_draft.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_draft.host_id IS DISTINCT FROM public.clerk_user_id() THEN
    RAISE EXCEPTION 'Only the host can start the draft' USING ERRCODE = '42501';
  END IF;
  IF v_draft.status = 'active' THEN
    RETURN jsonb_build_object('started', false, 'reason', 'already active');
  END IF;
  IF v_draft.status <> 'setup' THEN
    RAISE EXCEPTION 'Draft cannot be started from status %', v_draft.status;
  END IF;

  SELECT COUNT(*) INTO v_total FROM teams WHERE draft_id = p_draft_id;
  IF v_total < 2 THEN
    RAISE EXCEPTION 'At least 2 teams are needed to start';
  END IF;
  IF EXISTS (
    SELECT 1 FROM teams t WHERE t.draft_id = p_draft_id
      AND NOT EXISTS (SELECT 1 FROM participants p WHERE p.team_id = t.id)
  ) THEN
    RAISE EXCEPTION 'Every team needs at least one participant';
  END IF;

  IF p_shuffle AND NOT COALESCE((v_draft.settings->>'draftOrderShuffled')::boolean, false) THEN
    UPDATE teams t SET draft_order = s.rn
    FROM (SELECT id, row_number() OVER (ORDER BY random()) AS rn FROM teams WHERE draft_id = p_draft_id) s
    WHERE t.id = s.id;
  END IF;

  IF EXISTS (
    SELECT g FROM generate_series(1, v_total) g
    EXCEPT SELECT draft_order FROM teams WHERE draft_id = p_draft_id
  ) THEN
    RAISE EXCEPTION 'Draft order must be 1..% with no gaps or duplicates', v_total;
  END IF;

  UPDATE drafts SET
    status = 'active', current_turn = 1, current_round = 1,
    turn_started_at = NOW(),
    settings = COALESCE(settings, '{}'::jsonb) || '{"draftOrderShuffled": true}'::jsonb,
    updated_at = NOW()
  WHERE id = p_draft_id;

  RETURN jsonb_build_object('started', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_auction(p_draft_id uuid, p_auction_id uuid, p_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auction RECORD;
  v_end TIMESTAMPTZ;
BEGIN
  IF public.clerk_user_id() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF p_seconds IS NULL OR p_seconds < 1 OR p_seconds > 300 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Extension must be between 1 and 300 seconds');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM drafts WHERE id = p_draft_id AND host_id = public.clerk_user_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the host can extend an auction');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_draft_id::TEXT, 1));

  SELECT * INTO v_auction FROM auctions
  WHERE id = p_auction_id AND draft_id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Auction not found'); END IF;
  IF v_auction.status <> 'active' OR clock_timestamp() >= v_auction.auction_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auction is no longer active');
  END IF;

  v_end := LEAST(GREATEST(v_auction.auction_end, clock_timestamp()) + make_interval(secs => p_seconds),
                 clock_timestamp() + interval '600 seconds');
  UPDATE auctions SET auction_end = v_end, updated_at = NOW() WHERE id = p_auction_id;
  RETURN jsonb_build_object('success', true, 'auctionEnd', v_end);
END;
$$;

-- join_draft_atomic: live body plus the soft-delete guard (D-02).
CREATE OR REPLACE FUNCTION public.join_draft_atomic(
  p_draft_id uuid, p_user_id text, p_display_name text, p_team_name text,
  p_as_spectator boolean DEFAULT false
)
RETURNS jsonb
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
  IF NOT FOUND OR v_draft.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.reset_draft(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_team(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shuffle_draft_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_draft(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.extend_auction(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_draft(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_team(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shuffle_draft_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_draft(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.extend_auction(uuid, uuid, integer) TO authenticated, service_role;
-- join_draft_atomic stays service-role only (/api/draft/join).
REVOKE EXECUTE ON FUNCTION public.join_draft_atomic(uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_draft_atomic(uuid, text, text, text, boolean) TO service_role;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '041_draft_host_rpcs',
  'Host-only reset_draft, remove_team, shuffle_draft_order, start_draft, extend_auction RPCs; join_draft_atomic rejects soft-deleted drafts.',
  'DROP FUNCTION public.reset_draft(uuid), public.remove_team(uuid, uuid), public.shuffle_draft_order(uuid), public.start_draft(uuid, boolean), public.extend_auction(uuid, uuid, integer); re-apply join_draft_atomic from 20260717120000;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '041_draft_host_rpcs'
);
