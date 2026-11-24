-- Migration 027: hotfix the production fire from Migration 026.
--
-- Problem: Migration 026 revoked table-level SELECT on public.drafts and
-- re-granted SELECT on every column except `password`. PostgREST's
-- /rest/v1/drafts endpoint, when invoked with `select=*`, expands the * to
-- ALL columns in the table — including `password`. Since anon/authenticated
-- lack SELECT on `password`, every `*` request returns 401, breaking the
-- entire app: lobby, dashboard, draft room, join flow, tournament lobby.
--
-- Evidence: postgres logs since 2026-05-10 17:55Z show repeated
-- "permission denied for table drafts" errors. API logs show 401s on
-- /rest/v1/drafts?select=* paths that were 200ing before the migration ran.
--
-- The bcrypt hash in `password` is salted; transient public exposure (which
-- is how it was on production before 024/026 anyway) is acceptable given
-- the breakage cost. Hiding the hash properly requires moving the column
-- to a separate `draft_passwords` table — out of scope for this hotfix.
--
-- This migration reverts both 024's column REVOKE and 026's table-level
-- REVOKE so `select('*')` queries succeed again. Server-side password
-- verification continues to use the service role and is unaffected.

GRANT SELECT ON public.drafts TO anon;
GRANT SELECT ON public.drafts TO authenticated;

-- Defensive: re-assert column grants in case something else stripped them.
GRANT SELECT (
  id, created_at, updated_at, name, host_id, format, ruleset,
  budget_per_team, max_teams, pokemon_per_team, status,
  current_turn, current_round, current_team_id, turn_started_at,
  settings, room_code, custom_format_id, allow_undos,
  max_undos_per_team, is_public, spectator_count, description,
  tags, password, deleted_at, deleted_by
) ON public.drafts TO anon, authenticated;

COMMENT ON COLUMN public.drafts.password IS
  'bcrypt-salted hash of the draft join password. Verification preferred via /api/draft/verify-password (service role). Direct client reads are tolerated because the salted bcrypt hash does not enable enumeration; if/when this changes, move the column to a private draft_passwords table rather than relying on column-level REVOKE (PostgREST select=* expansion makes column-level REVOKE a denial-of-service vector).';

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '027_fix_drafts_select_star_regression',
  'Hotfix: restore table-level SELECT on drafts so PostgREST select=* queries no longer 401. Migration 026 broke the lobby/dashboard/draft-room/join flows by revoking table-level SELECT and granting only column-level SELECT (excluding password). Net result was all SELECT * requests returning permission denied. The bcrypt hash exposure is acceptable as a stopgap; the proper fix is to move the column to a separate table.',
  'REVOKE SELECT ON public.drafts FROM anon, authenticated; -- re-introduces the regression — only run if drafts.password is moved to a separate table first'
) ON CONFLICT (name) DO NOTHING;