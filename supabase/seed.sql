-- Pokemon Draft - Staging Seed Data
--
-- Loaded by `supabase db reset` (local stack) and the `make seed` Makefile
-- target (staging remote). Populates:
--   * 3 Clerk-format test users (user_test1, user_test2, user_test3)
--   * 2 fixture drafts (one snake VGC Reg H, one auction)
--   * 6 teams across both drafts
--
-- Participants and picks are intentionally left empty — the Playwright e2e
-- suite creates those during each run so we exercise the live join/pick
-- code paths.
--
-- Idempotent: every INSERT uses ON CONFLICT to make re-seeding a no-op.

BEGIN;

-- =====================================================================
-- Test users (Clerk-format IDs: user_<alnum>)
-- =====================================================================

INSERT INTO public.user_profiles (user_id, display_name, avatar_url, preferences)
VALUES
  ('user_test1', 'Test User 1 (Host)',  NULL, '{"theme":"dark"}'::jsonb),
  ('user_test2', 'Test User 2',         NULL, '{"theme":"dark"}'::jsonb),
  ('user_test3', 'Test User 3',         NULL, '{"theme":"light"}'::jsonb)
ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      preferences  = EXCLUDED.preferences,
      updated_at   = NOW();

-- =====================================================================
-- Fixture draft 1: Snake / VGC Reg H / 4 teams / 100 budget
-- =====================================================================

INSERT INTO public.drafts (
  id,
  name,
  host_id,
  format,
  ruleset,
  budget_per_team,
  max_teams,
  pokemon_per_team,
  status,
  current_turn,
  current_round,
  room_code,
  is_public,
  description,
  tags
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Staging Snake Fixture',
  'user_test1',
  'snake',
  'regulation-h',
  100,
  4,
  6,
  'setup',
  1,
  1,
  'STAGE1',
  TRUE,
  'Snake/Reg H fixture used by Playwright e2e tests. Do not delete.',
  ARRAY['e2e','staging','snake']
)
ON CONFLICT (id) DO UPDATE
  SET name        = EXCLUDED.name,
      host_id     = EXCLUDED.host_id,
      status      = 'setup',
      updated_at  = NOW();

INSERT INTO public.teams (id, draft_id, name, owner_id, budget_remaining, draft_order, undos_remaining)
VALUES
  ('11111111-2222-2222-2222-000000000001', '11111111-1111-1111-1111-111111111111', 'Snake Team Alpha', 'user_test1', 100, 1, 3),
  ('11111111-2222-2222-2222-000000000002', '11111111-1111-1111-1111-111111111111', 'Snake Team Bravo', 'user_test2', 100, 2, 3),
  ('11111111-2222-2222-2222-000000000003', '11111111-1111-1111-1111-111111111111', 'Snake Team Cobra', 'user_test3', 100, 3, 3),
  ('11111111-2222-2222-2222-000000000004', '11111111-1111-1111-1111-111111111111', 'Snake Team Delta', NULL,         100, 4, 3)
ON CONFLICT (id) DO UPDATE
  SET name             = EXCLUDED.name,
      owner_id         = EXCLUDED.owner_id,
      budget_remaining = EXCLUDED.budget_remaining;

-- =====================================================================
-- Fixture draft 2: Auction / Reg H / 8 teams / 200 budget
-- =====================================================================

INSERT INTO public.drafts (
  id,
  name,
  host_id,
  format,
  ruleset,
  budget_per_team,
  max_teams,
  pokemon_per_team,
  status,
  current_turn,
  current_round,
  room_code,
  is_public,
  description,
  tags
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Staging Auction Fixture',
  'user_test1',
  'auction',
  'regulation-h',
  200,
  8,
  6,
  'setup',
  NULL,
  1,
  'STAGE2',
  TRUE,
  'Auction/Reg H fixture used by Playwright e2e tests. Do not delete.',
  ARRAY['e2e','staging','auction']
)
ON CONFLICT (id) DO UPDATE
  SET name       = EXCLUDED.name,
      host_id    = EXCLUDED.host_id,
      status     = 'setup',
      updated_at = NOW();

INSERT INTO public.teams (id, draft_id, name, owner_id, budget_remaining, draft_order, undos_remaining)
VALUES
  ('22222222-3333-3333-3333-000000000001', '22222222-2222-2222-2222-222222222222', 'Auction Team Aerodactyl', 'user_test1', 200, 1, 3),
  ('22222222-3333-3333-3333-000000000002', '22222222-2222-2222-2222-222222222222', 'Auction Team Bulbasaur',  'user_test2', 200, 2, 3)
ON CONFLICT (id) DO UPDATE
  SET name             = EXCLUDED.name,
      owner_id         = EXCLUDED.owner_id,
      budget_remaining = EXCLUDED.budget_remaining;

-- The other 6 auction teams stay empty so the e2e suite can join into them.

COMMIT;
