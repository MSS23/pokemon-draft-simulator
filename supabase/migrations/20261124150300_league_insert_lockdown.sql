-- 039: league / league_teams / matches INSERT lockdown (audit B-09, handoff F-04)
--
-- leagues_insert, league_teams_insert and matches_insert were
-- `clerk_user_id() IS NOT NULL`: anyone could bind a fake league to someone
-- else's draft with themselves as commissioner, then run waivers/trades
-- against it, block the real host's knockout creation, or insert fixtures.
--   * leagues: only the draft host may create a league for the draft, and the
--     league may only name the caller (or nobody) as commissioner.
--   * leagues.draft_id is immutable for clients (a trigger), so a
--     commissioner cannot re-point a league at another draft.
--   * league_teams / matches: only the parent league's commissioner or the
--     draft host may insert.
--   * one knockout league per draft (partial unique index). split_conference
--     a/b create two leagues per draft, so the index is knockout-only.
-- Service-role routes (/api/tournament/*) bypass RLS and are unaffected.
--
-- PRE-CHECK (must return 0 rows, else the index build fails):
--   SELECT draft_id, count(*) FROM leagues WHERE league_type = 'knockout'
--   GROUP BY 1 HAVING count(*) > 1;
-- Idempotent.

DROP POLICY IF EXISTS leagues_insert ON public.leagues;
CREATE POLICY leagues_insert ON public.leagues
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.drafts d
            WHERE d.id = draft_id AND d.host_id = public.clerk_user_id())
    AND (settings ->> 'commissionerId' IS NULL
         OR settings ->> 'commissionerId' = public.clerk_user_id())
  );

DROP POLICY IF EXISTS league_teams_insert ON public.league_teams;
CREATE POLICY league_teams_insert ON public.league_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
      LEFT JOIN public.drafts d ON d.id = l.draft_id
      WHERE l.id = league_id
        AND ((l.settings ->> 'commissionerId') = public.clerk_user_id()
             OR d.host_id = public.clerk_user_id())
    )
  );

DROP POLICY IF EXISTS matches_insert ON public.matches;
CREATE POLICY matches_insert ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
      LEFT JOIN public.drafts d ON d.id = l.draft_id
      WHERE l.id = league_id
        AND ((l.settings ->> 'commissionerId') = public.clerk_user_id()
             OR d.host_id = public.clerk_user_id())
    )
  );

CREATE OR REPLACE FUNCTION public.leagues_draft_id_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.draft_id IS DISTINCT FROM OLD.draft_id AND public.clerk_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'A league cannot be moved to another draft' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.leagues_draft_id_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leagues_draft_id_immutable ON public.leagues;
CREATE TRIGGER leagues_draft_id_immutable
  BEFORE UPDATE OF draft_id ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.leagues_draft_id_immutable();

CREATE UNIQUE INDEX IF NOT EXISTS leagues_one_knockout_per_draft
  ON public.leagues (draft_id) WHERE league_type = 'knockout';

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '039_league_insert_lockdown',
  'leagues insert limited to the draft host (commissionerId self or null); league_teams/matches insert limited to commissioner or host; leagues.draft_id immutable for clients; one knockout league per draft.',
  'DROP INDEX public.leagues_one_knockout_per_draft; DROP TRIGGER leagues_draft_id_immutable ON public.leagues; recreate leagues_insert/league_teams_insert/matches_insert WITH CHECK (clerk_user_id() IS NOT NULL);'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '039_league_insert_lockdown'
);
