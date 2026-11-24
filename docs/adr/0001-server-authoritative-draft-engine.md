# 0001: Server-authoritative draft engine

Status: accepted (recorded 2026-11-24; the decision dates from the
2026-05 to 2026-07 security migrations).

## Context

Early versions ran the draft in the browser and wrote `picks`, `teams` and
budgets with direct table writes under permissive RLS. Any participant could
pick out of turn, overspend or price a pick at 0.

## Decision

- Postgres RPCs own every state change: `make_draft_pick` for interactive
  picks, `nominate_auction` / `place_bid` / `resolve_auction` for auctions,
  and service-role-only `system_make_pick` / `system_advance_turn` for absent
  players, driven by `src/lib/draft-tick.ts`.
- Costs for built-in formats come from `pokemon_tiers` rows written at draft
  creation, not from the client.
- Identity is the Clerk `sub` read by `public.clerk_user_id()`; guests use a
  server-issued httpOnly cookie.
- Clients keep optimistic UI only, and get no INSERT/UPDATE grant on the
  engine tables.

## Consequences

- New write paths need an RPC or a server route plus a migration
  (see `docs/MIGRATIONS.md`), not a client `.from(...).insert(...)`.
- A broken JWT bridge stops all signed-in writes, so `/api/health/bridge` is
  a production health signal.
