# Migration ledger: repair before any `db push`

The `Migrate` workflow (`.github/workflows/migrate.yml`) runs
`supabase db push --linked`. That command applies every file in
`supabase/migrations/` whose version is missing from the target's
`supabase_migrations.schema_migrations` table.

Production was built partly by hand (SQL editor / MCP `apply_migration`), so its
ledger lists only some of the repo versions (21 of 46 at the 2026-11 audit).
Missing versions include `00000000000000_bootstrap` and most of
`20260324114022`..`20260510163223`. A plain `db push` would replay them. Some
run `DROP TABLE IF EXISTS trades / trade_approvals CASCADE` and rewrite RLS
from older definitions.

## Rules

- Do not add the `SUPABASE_ACCESS_TOKEN` / `PROD_*` secrets, or run the
  workflow against production, until the steps below are done.
- Never use `supabase migration repair --status reverted` on a remote-only
  version to make `db push` stop complaining. That is what triggers the replay.
- Always run the workflow with `dry_run: true` first (the default) and read
  the "Dry run" step output. It must list only the migrations you mean to apply.

## Steps

1. Fix the duplicate version first (bucket B, migration files):
   `20260403000000_rls_indexes.sql` and `20260403000100_rls_security_definer.sql` share
   version `20260403`. Rename them to unique 14-digit versions. Do the ledger
   repair after the rename, because the rename changes the version keys.
2. Compare the two sides:
   ```sh
   supabase link --project-ref "$PROD_PROJECT_REF" --password "$PROD_DB_PASSWORD"
   supabase migration list --linked
   ```
3. For every local version whose changes are already live, mark it applied:
   ```sh
   supabase migration repair --status applied <version> [<version> ...]
   ```
   Include versions applied by hand outside `main` (for example the
   `20261124*` hotfix files from PR #6) once they are merged.
4. For remote-only versions (in the ledger, not in the repo), add the missing
   file to `supabase/migrations/` (`supabase migration fetch` or `db dump`). Do
   not revert them.
5. Re-run `supabase migration list --linked`. Every row needs both a local and
   a remote version. Then run `supabase db push --linked --dry-run`. It must
   report the remote database is up to date.
6. Only now add the repo/environment secrets. In Settings > Environments >
   production, add a required reviewer.

Repeat the same steps for staging if its ledger was not built by this workflow.
