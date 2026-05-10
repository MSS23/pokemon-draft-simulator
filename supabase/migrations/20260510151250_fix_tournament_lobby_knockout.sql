-- Migration: Allow 'knockout' as a league_type
-- Date: 2026-05-10
--
-- Symptom: KnockoutService.createLobby() throws "Failed to create tournament lobby"
-- because the production CHECK constraint on leagues.league_type only allows
-- ('single', 'split_conference_a', 'split_conference_b'). The newer code paths
-- (tournament lobbies, knockout brackets) need 'knockout' as a valid value.
--
-- Safe to re-run.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Find any CHECK constraint on leagues.league_type and drop it. Constraint
  -- names vary by environment ("leagues_league_type_check" is the typical
  -- auto-generated name, but DEPLOY_TO_PRODUCTION.sql may have produced a
  -- different one).
  FOR v_constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE cls.relname = 'leagues'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%league_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.leagues DROP CONSTRAINT %I', v_constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.leagues
  ADD CONSTRAINT leagues_league_type_check
  CHECK (league_type IN ('single', 'split_conference_a', 'split_conference_b', 'knockout'));

COMMENT ON CONSTRAINT leagues_league_type_check ON public.leagues
  IS 'Allowed league types. ''knockout'' is required for tournament lobbies created via KnockoutService.';
