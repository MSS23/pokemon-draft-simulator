# Database integration tests

## Schema contract (implemented: `schema-contract.test.ts`)

Checks that every table/view column in the `Database` type of
`src/lib/supabase.ts`, and every literal `.rpc('name', {...})` call in `src/`,
exists in a real database with a compatible type / parameter names. It reads
PostgREST's OpenAPI document (`GET /rest/v1/`), so it needs no `pg` driver.
The parser is unit-tested offline in the normal `vitest run`; the live checks
skip unless these are set:

| Env | Enables |
| --- | --- |
| `SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY` | contract check (read-only, safe on any project) |
| `SUPABASE_TEST_URL` + `SUPABASE_TEST_ANON_KEY` | anon cannot EXECUTE `make_draft_pick` / `system_*` (refused on prod) |

Local stack: `supabase start`, then take `API_URL`, `SERVICE_ROLE_KEY` and
`ANON_KEY` from `supabase status -o env` and run
`node node_modules/vitest/vitest.mjs run tests/db`.

## Draft engine concurrency (cases A-H below: not implemented yet)

The unit suite (`tests/draft-tick.test.ts`, `tests/draft-service.test.ts`,
`tests/auction-service.test.ts`) mocks Supabase and cannot exercise the
**atomicity and concurrency** guarantees that actually live in Postgres. Those
guarantees are the whole point of the Tier-1 fixes, so they need a real database.

Run these against a **throwaway/staging** Supabase project (never production)
that has the `supabase/migrations/` tree applied, including:

- `20260705120000_sec_p3_pick_authz_and_global_uniqueness.sql`
- `20260705120100_auction_resolve_and_system_rpcs.sql`

## Test cases to implement (each must pass)

### A. Auction resolution is idempotent under concurrency (fix 1.1)
1. Seed: active auction, `status='active'`, `auction_end` in the past,
   `current_bidder` = team A, `current_bid` = 20, team A budget = 100.
2. Call `resolve_auction(draft, auction)` **N times concurrently** (e.g. 10
   parallel connections).
3. Assert:
   - `picks` gains **exactly one** row for that pokemon (not N).
   - team A `budget_remaining` = 80 (deducted **once**).
   - `auctions.status = 'completed'`.
   - `drafts.current_turn` advanced by exactly one step.

### B. Auction cannot resolve before expiry (griefing guard)
1. Seed an auction with `auction_end` 30s in the future.
2. `resolve_auction(...)` → returns `{resolved:false, reason:'Auction not yet expired'}`.
3. Assert no pick was created and status is still `active`.

### C. Global Pokémon uniqueness (fix 1.2)
1. Seed a draft where team A already has pokemon `"25"`.
2. `system_make_pick(draft, teamB, "25", ...)` on team B's turn →
   `{success:false, error:'Pokemon already drafted in this draft'}`.
3. Direct `INSERT INTO picks (draft_id, team_id='B', pokemon_id='25', ...)` →
   raises `unique_violation` on constraint `unique_draft_pokemon`.

### D. make_draft_pick rejects anon / cross-user (fix 1.4)
1. Call `make_draft_pick(...)` with **no JWT** (raw anon key) →
   `{success:false, error:'Authentication required'}`.
2. Call with a JWT whose `sub` ≠ `p_user_id` →
   `{success:false, error:'Authentication mismatch...'}`.
3. Confirm `anon` has **no** EXECUTE grant:
   `SELECT has_function_privilege('anon', 'make_draft_pick(uuid,uuid,text,text,text,integer,integer)', 'execute')` → false.

### E. system_* functions are service-role only
`SELECT has_function_privilege('authenticated', 'system_make_pick(...)', 'execute')` → false;
same for `anon`; true only for `service_role`.

### F. Snake auto-skip / auto-pick via the tick (fix 1.3)
Drive `processDraftTick(draftId)` (or the `/api/draft/[id]/tick` route) against a
seeded draft whose `turn_started_at` is older than `timeLimit`:
- with an affordable, undrafted wishlist mon for the current team → a pick is
  created for that team and the turn advances (`auto_picked`);
- with no eligible wishlist mon → the turn advances with no pick (`skipped`);
- calling it twice concurrently advances the turn **once** (idempotent on
  `p_expected_turn`).

## Suggested harness

A Node script using `createServiceRoleClient()` (see `src/lib/supabase-server.ts`)
pointed at `SUPABASE_TEST_DB_URL` / `SUPABASE_TEST_SERVICE_ROLE_KEY`, using
`Promise.all([...])` to fire the concurrent calls in cases A and F. Gate it with
`describe.skipIf(!process.env.SUPABASE_TEST_DB_URL)` so it is inert in the normal
unit run and only executes in a dedicated CI job with test-DB secrets.

> Do NOT point this at production. It creates and mutates drafts.

### G. No pokemon_tiers row means no pick (migration 20261029120000)
1. Seed a built-in-format draft (no `custom_format_id`) with `allowedPokemonIds = ["25"]` and **no** `pokemon_tiers` rows.
2. `resolve_draft_pick_rule(draft, '25', 'Pikachu', 0)` returns **no row**; `make_draft_pick` fails.
3. Seed `pokemon_tiers` (`'150','Mewtwo',20`) and (`'25','Pikachu',3`): `resolve_draft_pick_rule(draft,'150','Pikachu',0)` returns `source_cost = 20` (id wins, name ignored).

### H. Auction opening bid cannot undercut the server cost
1. Same draft as G with tier rows, `format='auction'`, caller owns the nominating team.
2. `nominate_auction(draft,'150','Mewtwo',1)` → `{success:false, error:'Starting bid must be at least 20'}`.
3. `nominate_auction(draft,'150','Mewtwo',20)` → `success:true`.
