-- Migration 026: actually hide drafts.password from anon/authenticated.
-- Migration 024 attempted `REVOKE SELECT (password)` but column-level REVOKE
-- is a no-op when table-level SELECT is granted (table-level supersedes).
-- Proper fix: revoke table SELECT, then re-grant SELECT on every column
-- EXCEPT password. The /api/draft/verify-password route uses the service
-- role which bypasses these grants, so this has zero functional impact.

REVOKE SELECT ON public.drafts FROM anon;
REVOKE SELECT ON public.drafts FROM authenticated;

GRANT SELECT (
  id, created_at, updated_at, name, host_id, format, ruleset,
  budget_per_team, max_teams, pokemon_per_team, status,
  current_turn, current_round, current_team_id, turn_started_at,
  settings, room_code, custom_format_id, allow_undos,
  max_undos_per_team, is_public, spectator_count, description,
  tags, deleted_at, deleted_by
) ON public.drafts TO anon, authenticated;

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '026_lock_drafts_password_column_select',
  'REVOKE table SELECT on drafts from anon/authenticated; GRANT SELECT on every column except password. Effective bcrypt-hash hide that the column-only REVOKE in 024 could not deliver.',
  'GRANT SELECT ON public.drafts TO anon, authenticated;'
) ON CONFLICT (name) DO NOTHING;