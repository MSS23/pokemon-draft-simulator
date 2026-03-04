-- Execute a trade atomically: swap pick ownership between teams
CREATE OR REPLACE FUNCTION execute_trade(trade_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trade RECORD;
  v_pick_id TEXT;
BEGIN
  -- Lock the trade row
  SELECT * INTO v_trade FROM trades WHERE id = trade_uuid FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;

  IF v_trade.status != 'accepted' THEN
    RAISE EXCEPTION 'Trade must be in accepted status to execute (current: %)', v_trade.status;
  END IF;

  -- Swap team A's picks to team B
  IF v_trade.team_a_gives IS NOT NULL THEN
    FOREACH v_pick_id IN ARRAY v_trade.team_a_gives
    LOOP
      UPDATE picks SET team_id = v_trade.team_b_id, updated_at = NOW()
      WHERE id = v_pick_id::uuid AND team_id = v_trade.team_a_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pick % not found on team A', v_pick_id;
      END IF;
    END LOOP;
  END IF;

  -- Swap team B's picks to team A
  IF v_trade.team_b_gives IS NOT NULL THEN
    FOREACH v_pick_id IN ARRAY v_trade.team_b_gives
    LOOP
      UPDATE picks SET team_id = v_trade.team_a_id, updated_at = NOW()
      WHERE id = v_pick_id::uuid AND team_id = v_trade.team_b_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pick % not found on team B', v_pick_id;
      END IF;
    END LOOP;
  END IF;

  -- Mark trade as completed
  UPDATE trades SET
    status = 'completed',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = trade_uuid;
END;
$$;
