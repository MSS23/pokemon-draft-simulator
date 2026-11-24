-- Fresh-replay parity: views and RPCs that exist on the live database (and
-- are typed in src/lib/supabase.ts) but were created outside the migrations
-- folder. Definitions copied from live (2026-11-24). Each object is created
-- only when missing, so this is a no-op on the live database.

DO $fresh$
BEGIN
  IF to_regclass('public.active_public_drafts') IS NULL THEN
    CREATE VIEW public.active_public_drafts WITH (security_invoker = on) AS
    SELECT d.id, d.name, d.description, d.format, d.status, d.max_teams,
           d.current_round, d.spectator_count, d.tags, d.created_at, d.updated_at,
           (SELECT count(*) FROM public.teams WHERE teams.draft_id = d.id) AS teams_joined,
           (SELECT count(*) FROM public.picks WHERE picks.draft_id = d.id) AS total_picks,
           d.updated_at AS last_activity
      FROM public.drafts d
     WHERE d.is_public = true
       AND d.status = ANY (ARRAY['setup'::text, 'active'::text])
       AND d.deleted_at IS NULL;
    GRANT SELECT ON public.active_public_drafts TO anon, authenticated;
  END IF;

  IF to_regclass('public.draft_history') IS NULL THEN
    CREATE VIEW public.draft_history WITH (security_invoker = on) AS
    SELECT d.id, d.name, d.host_id, d.format, d.ruleset, d.status, d.room_code,
           d.updated_at AS completed_at, d.created_at,
           (SELECT count(*) FROM public.teams WHERE teams.draft_id = d.id) AS total_teams,
           (SELECT count(*) FROM public.picks WHERE picks.draft_id = d.id) AS total_picks
      FROM public.drafts d
     WHERE d.deleted_at IS NULL;
    GRANT SELECT ON public.draft_history TO anon, authenticated;
  END IF;

  IF to_regprocedure('public.update_team_budget(uuid, integer)') IS NULL THEN
    CREATE FUNCTION public.update_team_budget(team_id uuid, cost_to_subtract integer)
     RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
    AS $fn$
    BEGIN
      UPDATE teams
      SET budget_remaining = budget_remaining - cost_to_subtract,
          updated_at = NOW()
      WHERE id = team_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Team % not found', team_id;
      END IF;
    END;
    $fn$;
    REVOKE ALL ON FUNCTION public.update_team_budget(uuid, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.update_team_budget(uuid, integer) TO service_role;
  END IF;

  IF to_regprocedure('public.advance_draft_turn(uuid)') IS NULL THEN
    CREATE FUNCTION public.advance_draft_turn(draft_id uuid)
     RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
    AS $fn$
    DECLARE
      v_draft RECORD;
      v_total_teams INTEGER;
      v_max_picks INTEGER;
      v_next_turn INTEGER;
    BEGIN
      SELECT * INTO v_draft FROM drafts WHERE id = draft_id FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft % not found', draft_id;
      END IF;

      SELECT COUNT(*) INTO v_total_teams FROM teams WHERE teams.draft_id = advance_draft_turn.draft_id;
      v_max_picks := COALESCE((v_draft.settings->>'maxPokemonPerTeam')::INTEGER, 6);
      v_next_turn := COALESCE(v_draft.current_turn, 0) + 1;

      IF v_next_turn > (v_total_teams * v_max_picks) THEN
        UPDATE drafts
        SET status = 'completed', updated_at = NOW()
        WHERE id = draft_id;
      ELSE
        UPDATE drafts
        SET current_turn = v_next_turn,
            current_round = ((v_next_turn - 1) / NULLIF(v_total_teams, 0)) + 1,
            turn_started_at = NOW(),
            updated_at = NOW()
        WHERE id = draft_id;
      END IF;
    END;
    $fn$;
    REVOKE ALL ON FUNCTION public.advance_draft_turn(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.advance_draft_turn(uuid) TO service_role;
  END IF;

  IF to_regprocedure('public.record_draft_action(uuid, text, jsonb)') IS NULL THEN
    CREATE FUNCTION public.record_draft_action(p_draft_id uuid, p_action_type text, p_action_data jsonb)
     RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
    AS $fn$
    DECLARE
      v_team_id UUID;
      v_performed_by TEXT;
    BEGIN
      v_team_id     := (p_action_data->>'teamId')::UUID;
      v_performed_by := COALESCE(p_action_data->>'userId', 'system');

      INSERT INTO draft_actions (draft_id, team_id, action_type, action_data, performed_by, can_undo)
      VALUES (
        p_draft_id,
        v_team_id,
        p_action_type,
        p_action_data,
        v_performed_by,
        CASE WHEN p_action_type = 'pick' THEN TRUE ELSE FALSE END
      );
    END;
    $fn$;
    REVOKE ALL ON FUNCTION public.record_draft_action(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.record_draft_action(uuid, text, jsonb) TO service_role;
  END IF;
END
$fresh$;
