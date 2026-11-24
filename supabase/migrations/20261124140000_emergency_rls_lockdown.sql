-- Hotfix, part 5: emergency RLS lockdown (audit clusters B-02, B-03, B-04,
-- B-06, B-13, B-14, verified live 2026-11-24).
-- Every legitimate client write to these tables already goes through
-- SECURITY DEFINER RPCs or service-role API routes (/api/draft/create,
-- /api/draft/join -> join_draft_atomic, make_draft_pick, resolve_auction,
-- system_*). The remaining table grants plus "any signed-in user" policies let
-- a Clerk-authenticated caller:
--   participants   attach to any team or claim is_host, then pick/undo for it
--   picks          insert picks at any cost, bypassing turn/budget/legality
--   teams          create teams with arbitrary budget_remaining / owner_id
--   pokemon_tiers  re-price or legalise Pokemon in any draft
--   user_profiles  self-insert is_admin / is_verified
--   trades         insert pre-accepted trades that move other teams' picks
-- The client fallbacks in src/lib/draft-service.ts that insert teams and
-- participants run only when the API route is unreachable and already fail on
-- draft_passwords, so production users are unaffected. Idempotent.

REVOKE INSERT, UPDATE ON public.picks FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS picks_insert ON public.picks;
DROP POLICY IF EXISTS picks_update_host_only ON public.picks;

REVOKE INSERT ON public.participants FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS participants_insert ON public.participants;

REVOKE INSERT ON public.teams FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS teams_insert ON public.teams;

REVOKE INSERT, UPDATE, DELETE ON public.pokemon_tiers FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS pokemon_tiers_insert ON public.pokemon_tiers;

-- Profiles are still created client-side (settings page, first draft), so the
-- insert stays but may not grant itself admin or verified status.
DROP POLICY IF EXISTS user_profiles_insert ON public.user_profiles;
CREATE POLICY user_profiles_insert ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.clerk_user_id()
    AND COALESCE(is_admin, false) = false
    AND COALESCE(is_verified, false) = false
  );

-- Trades are still proposed client-side (trade-service.ts proposeTrade); the
-- row must start life as a plain proposal by the caller for teams in the
-- league's own draft. Responses/approval/execution go through RPCs.
DROP POLICY IF EXISTS trades_insert ON public.trades;
CREATE POLICY trades_insert ON public.trades
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'proposed'
    AND proposed_by = public.clerk_user_id()
    AND responded_by IS NULL AND responded_at IS NULL AND completed_at IS NULL
    AND commissioner_approved IS NULL AND commissioner_id IS NULL AND commissioner_notes IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.teams t
              WHERE t.id IN (team_a_id, team_b_id) AND t.owner_id = public.clerk_user_id())
      OR EXISTS (SELECT 1 FROM public.leagues l
                 WHERE l.id = league_id AND (l.settings ->> 'commissionerId') = public.clerk_user_id())
    )
    AND EXISTS (SELECT 1 FROM public.leagues l
                JOIN public.teams ta ON ta.id = team_a_id
                JOIN public.teams tb ON tb.id = team_b_id
                WHERE l.id = league_id AND ta.draft_id = l.draft_id AND tb.draft_id = l.draft_id)
  );

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '035_emergency_rls_lockdown',
  'Revoke client INSERT/UPDATE on picks, INSERT on participants/teams, INSERT/UPDATE/DELETE on pokemon_tiers; restrict user_profiles and trades INSERT policies to non-privileged, self-owned proposals.',
  'GRANT INSERT, UPDATE ON public.picks TO anon, authenticated; GRANT INSERT ON public.participants, public.teams TO anon, authenticated; GRANT INSERT, UPDATE, DELETE ON public.pokemon_tiers TO anon, authenticated; -- then recreate the previous *_insert policies from 20260324114038 / 20260824120000'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '035_emergency_rls_lockdown'
);
