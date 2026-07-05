-- Migration: P0 — close the auth.uid() IS NULL RLS escape hatch
-- Date: 2026-05-10
-- Source: vibe-security audit (2026-05-10)
--
-- ════════════════════════════════════════════════════════════════════
--   ⚠️  DO NOT APPLY THIS MIGRATION UNTIL THE CLERK → SUPABASE JWT
--       BRIDGE IS WORKING IN PRODUCTION.
-- ════════════════════════════════════════════════════════════════════
--
-- How to verify the bridge is working:
--   1. Open https://draftpokemon.com signed in as any Clerk user.
--   2. In the browser network panel, look for any request to
--      `<project>.supabase.co/rest/v1/...`. Inspect the `Authorization`
--      header — it should be `Bearer <a JWT>`.
--   3. Decode the JWT (jwt.io). The `sub` claim must equal the Clerk
--      user id (something like `user_2abc...`). If `sub` is missing or
--      the request is sent with the anon key only, the bridge is OFF.
--   4. Run in Supabase SQL editor while signed in:
--        select public.clerk_user_id();
--      This must return your Clerk user id, NOT NULL.
--
-- If the bridge is OFF and you apply this migration anyway, every
-- legitimate UPDATE/DELETE from the browser will fail and the app will
-- appear broken to all users. The fix is to either:
--   (a) Configure the "supabase" JWT template in your Clerk dashboard
--       (HS256, secret = your Supabase JWT secret, claim sub = {{user.id}}),
--   (b) Or enable Supabase's native Clerk third-party auth integration in
--       the Supabase dashboard, then change `getClerkSupabaseToken` in
--       src/lib/supabase.ts to call getToken() with no template arg.
--
-- ════════════════════════════════════════════════════════════════════
--
-- Issue: existing UPDATE/DELETE policies use predicates like
--   USING (host_id = auth.uid()::text OR auth.uid() IS NULL)
-- which evaluate to TRUE for any anonymous request (anon-key, no JWT).
-- That means anyone with the public anon key can update or delete any
-- row in drafts / teams / picks / participants / leagues / matches.
--
-- Fix: replace `auth.uid()` with `public.clerk_user_id()` and DROP the
-- `OR ... IS NULL` escape. After this migration, every write must come
-- from a request that carries a valid Clerk-signed JWT.
--
-- Idempotent — safe to re-run.

-- ─────────────────────────────────────────────────────────────────────
-- DRAFTS
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "drafts_update"  ON public.drafts;
DROP POLICY IF EXISTS "drafts_delete"  ON public.drafts;
DROP POLICY IF EXISTS "Hosts can update their drafts" ON public.drafts;
DROP POLICY IF EXISTS "Hosts can soft-delete their drafts" ON public.drafts;

CREATE POLICY "drafts_update_host_only"
  ON public.drafts FOR UPDATE
  USING (host_id = public.clerk_user_id())
  WITH CHECK (host_id = public.clerk_user_id());

CREATE POLICY "drafts_delete_host_only"
  ON public.drafts FOR DELETE
  USING (host_id = public.clerk_user_id());

-- ─────────────────────────────────────────────────────────────────────
-- TEAMS — owner can edit their own team; host can edit any team
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "teams_update" ON public.teams;
DROP POLICY IF EXISTS "teams_delete" ON public.teams;

CREATE POLICY "teams_update_owner_or_host"
  ON public.teams FOR UPDATE
  USING (
    owner_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = teams.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    owner_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = teams.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  );

CREATE POLICY "teams_delete_host_only"
  ON public.teams FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = teams.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- PARTICIPANTS — self-edit; host can manage all
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "participants_update" ON public.participants;
DROP POLICY IF EXISTS "participants_delete" ON public.participants;

CREATE POLICY "participants_update_self_or_host"
  ON public.participants FOR UPDATE
  USING (
    user_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = participants.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    user_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = participants.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  );

CREATE POLICY "participants_delete_host_only"
  ON public.participants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = participants.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- PICKS — undo allowed by team owner or host; no client-side updates
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "picks_update" ON public.picks;
DROP POLICY IF EXISTS "picks_delete" ON public.picks;

-- Picks aren't typically client-mutated; they go through make_draft_pick
-- (SECURITY DEFINER, bypasses RLS). Lock direct UPDATE/DELETE to host.
CREATE POLICY "picks_update_host_only"
  ON public.picks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = picks.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = picks.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  );

CREATE POLICY "picks_delete_owner_or_host"
  ON public.picks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = picks.team_id
        AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = picks.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- LEAGUES — only the commissioner (stored in settings.commissionerId)
-- or the underlying draft host can mutate.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leagues_update" ON public.leagues;
DROP POLICY IF EXISTS "leagues_delete" ON public.leagues;

CREATE POLICY "leagues_update_host_or_commish"
  ON public.leagues FOR UPDATE
  USING (
    public.clerk_user_id() IS NOT NULL
    AND (
      (settings ->> 'commissionerId') = public.clerk_user_id()
      OR EXISTS (
        SELECT 1 FROM drafts d
        WHERE d.id = leagues.draft_id
          AND d.host_id = public.clerk_user_id()
      )
    )
  )
  WITH CHECK (
    public.clerk_user_id() IS NOT NULL
    AND (
      (settings ->> 'commissionerId') = public.clerk_user_id()
      OR EXISTS (
        SELECT 1 FROM drafts d
        WHERE d.id = leagues.draft_id
          AND d.host_id = public.clerk_user_id()
      )
    )
  );

CREATE POLICY "leagues_delete_host_only"
  ON public.leagues FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
      WHERE d.id = leagues.draft_id
        AND d.host_id = public.clerk_user_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- MATCHES — commissioner can update; nobody can delete via RLS
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "matches_update" ON public.matches;
DROP POLICY IF EXISTS "matches_delete" ON public.matches;

CREATE POLICY "matches_update_commish_or_participant"
  ON public.matches FOR UPDATE
  USING (
    public.clerk_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM leagues l
        WHERE l.id = matches.league_id
          AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
      )
      OR EXISTS (
        SELECT 1 FROM teams t
        WHERE t.id IN (matches.home_team_id, matches.away_team_id)
          AND t.owner_id = public.clerk_user_id()
      )
    )
  )
  WITH CHECK (
    public.clerk_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM leagues l
        WHERE l.id = matches.league_id
          AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
      )
      OR EXISTS (
        SELECT 1 FROM teams t
        WHERE t.id IN (matches.home_team_id, matches.away_team_id)
          AND t.owner_id = public.clerk_user_id()
      )
    )
  );

-- DELETE is host/commissioner only — same predicate would apply but
-- we forbid client-side delete entirely. Use the service role for
-- match cancellation if needed.
CREATE POLICY "matches_delete_commish_only"
  ON public.matches FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM leagues l
      WHERE l.id = matches.league_id
        AND ((l.settings ->> 'commissionerId') = public.clerk_user_id())
    )
  );
