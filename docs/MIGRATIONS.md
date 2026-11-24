# Database migrations runbook

How schema changes reach the Supabase databases today. This is the process
that actually runs. The CI workflows described in older docs do not.

## Status of the automation (as of 2026-11-24)

- `.github/workflows/migrate.yml` and `.github/workflows/schema-drift.yml`
  exist but have **never run green**. The repo secrets they need
  (`SUPABASE_ACCESS_TOKEN`, `PROD_PROJECT_REF`, `PROD_DB_PASSWORD`, and the
  staging pair) are not configured. Nothing applies migrations automatically
  and nothing watches prod for drift.
- Every migration on prod was applied **by hand**. A merged migration file is
  not live until someone applies it. That gap is how `20261029120000` sat
  unapplied for weeks and how the `auctions.current_bidder` drift reached prod.
- Both workflows are **manual-only** (`workflow_dispatch`); no push or
  schedule trigger fires them. To re-enable: set `SUPABASE_ACCESS_TOKEN`,
  `PROD_PROJECT_REF`, `PROD_DB_PASSWORD`, `STAGING_PROJECT_REF` and
  `STAGING_DB_PASSWORD`, create a reviewer-gated `production` environment,
  then restore the push/schedule triggers as the comments at the top of each
  workflow describe, and update step 2 below. Read
  [`docs/ops/migration-ledger.md`](ops/migration-ledger.md) first.

## Rules for a migration file

1. One new file in `supabase/migrations/`, named
   `YYYYMMDDHHMMSS_short_slug.sql` (UTC, later than every existing file).
   Never edit a file that has already been applied anywhere. Fix forward with
   a new file.
2. **Idempotent.** It must be safe to run twice and safe on a database that
   already has the change: `CREATE OR REPLACE FUNCTION`,
   `DROP POLICY IF EXISTS` before `CREATE POLICY`, `ADD COLUMN IF NOT EXISTS`,
   and `DO $$ ... IF EXISTS (SELECT 1 FROM information_schema...) ... $$`
   guards for renames and retypes. See
   `20261124120000_auctions_current_bidder_column.sql` on the hotfix branch.
3. **Ledger row.** End the file with an insert into `public._migrations`
   (columns `name`, `description`, `rollback_sql`). Use the next free
   number plus the slug, and guard it so a re-run is a no-op:

   ```sql
   INSERT INTO public._migrations (name, description, rollback_sql)
   SELECT '0NN_short_slug', 'What it changes and why.', 'SQL or steps to undo it.'
   WHERE NOT EXISTS (SELECT 1 FROM public._migrations WHERE name = '0NN_short_slug');
   ```

4. Grants are part of the change. A new RPC needs explicit
   `REVOKE EXECUTE ... FROM PUBLIC, anon` and a `GRANT` to the intended role
   (`authenticated`, or `service_role` for `system_*` RPCs).
5. Never run anything in `migrations/_archive/`, and never run
   `00000000000000_bootstrap.sql` on an existing project. It refuses to run if
   `public.drafts` exists.

## Applying a migration

Apply to **staging first** when a staging project exists, then prod.

1. Get the file reviewed and merged (or at least committed on the PR branch,
   so the applied SQL matches the repo byte for byte).
2. Apply it with one of:
   - **Supabase MCP** `apply_migration` (project ref, name = the file's slug,
     query = the full file contents). This also records the migration in
     `supabase_migrations.schema_migrations`, which `list_migrations` reads.
   - **Supabase dashboard SQL editor**: paste the whole file and run it. This
     does **not** write `supabase_migrations.schema_migrations`; only the
     `_migrations` ledger row from the file records it.
   - `make staging` (`supabase db push`) against staging, with
     `STAGING_PROJECT_REF` and `STAGING_DB_PASSWORD` set.
   - The `migrate.yml` workflow, run by hand (`workflow_dispatch`), once the
     secrets above exist. It never runs on its own.
3. Verify:
   - `SELECT name, applied_at FROM public._migrations ORDER BY applied_at DESC LIMIT 5;`
     shows the new row (MCP `list_migrations` also shows it if you used MCP).
   - Run a probe that proves the change, for example
     `SELECT column_name FROM information_schema.columns WHERE table_name = 'auctions';`
     or `SELECT has_function_privilege('anon', 'public.some_rpc(uuid)', 'EXECUTE');`.
   - Signed in on the deployed app: `GET /api/health/bridge` returns
     `{"bridge":"up"}`.
4. Optional drift check: `make schema-diff` (needs `PROD_PROJECT_REF` and
   `PROD_DB_PASSWORD` in your shell and the Supabase CLI logged in). It is
   read-only.
5. Note the apply date in the PR description. Agents may only SELECT from
   prod; applying is a human (or explicitly authorized) step.

## Known divergence between prod and this tree

Prod was created long before `00000000000000_bootstrap.sql`, and the
bootstrap is a snapshot of `migrations/_archive/COMPLETE_SCHEMA.sql`, not of
prod. A fresh project built from this folder will not match prod exactly.
Objects reported as **live-only** (present on prod, created by no file here):
`draft_passwords`, `bids`, `complete_auction`, `make_pick_atomic`. This list
has **not** been re-verified against the live catalog; check it with a
`SELECT` on `pg_class` / `pg_proc` before relying on it.

No file in this tree creates `public._migrations` itself; prod has it from the
pre-tree era. A fresh project built from this folder fails at the first ledger
insert (`20260510151248_fix_supabase_linter_errors.sql`) until that table is
created. Create it by hand on a new project (id, name UNIQUE, description,
applied_at DEFAULT now(), rollback_sql) until a migration adds it.

### Pending ledger/bootstrap follow-ups (not done in the tree yet)

Recorded from the 2026-11-24 audit (bucket B handoff to M). These are ops
tasks; do them in a dedicated change, not as a side edit:

- Add `CREATE TABLE IF NOT EXISTS public._migrations (...)` (the shape above)
  to `00000000000000_bootstrap.sql`, so a fresh project no longer needs the
  manual step.
- Rename the two `20260403_rls_*.sql` files to 14-digit versions so the
  Supabase CLI orders and records them like every other file. Repair the
  remote ledger for the new names at the same time (see
  `docs/ops/migration-ledger.md`; never `--status reverted`).
- Once `20261124150000` through `20261124151400` are applied, add them to the
  migration repair list so `supabase_migrations.schema_migrations` matches
  (rows 036-049 are live as of 2026-11-24; `20261124151400` = 050 is not).
- 050 (`20261124151400_post_ts_write_lockdown.sql`) is safe to apply only
  after the deploy that switches startDraft/shuffleDraftOrder/resetDraft/
  removeTeam/extendAuctionTime and submitMatchResult to their RPCs is live.
  Run its pre-check first (duplicate `(draft_id, draft_order)` must be 0).

## History: 2026-11-24 hotfixes (applied by hand)

Branch `hotfix/auctions-current-bidder-column` (PR #6):

| File | Change |
|---|---|
| `20261124120000_auctions_current_bidder_column.sql` | `auctions.current_bidder_id UUID` renamed and retyped to `current_bidder TEXT`, the column every auction RPC uses |
| `20261124120100_auctions_starting_bid_nullable.sql` | `auctions.starting_bid` made nullable |
| `20261124120200_bid_history_repo_shape.sql` | `bid_history` reshaped to `auction_id, draft_id, team_id, team_name, bid_amount` |
| `20261124130000_revoke_legacy_unauthenticated_rpcs.sql` | `EXECUTE` revoked from anon/authenticated on `make_pick_atomic`, the 3-arg `undo_last_pick`, the chat RPCs and `record_migration` |

Also applied the same day: `20261029120000_server_costs_untiered_picks_and_auction_floor.sql`
(merged in #3 on 2026-10-31, live only from 2026-11-24).

An emergency migration was being applied on 2026-11-24 that revokes client
`INSERT`/`UPDATE` on `picks`, revokes `INSERT` on `teams` and
`pokemon_tiers`, and tightens the `participants`, `user_profiles` and `trades`
`INSERT` policies. Confirm its `_migrations` row before assuming it is live.
Client code must write those tables only through RPCs or server routes.
