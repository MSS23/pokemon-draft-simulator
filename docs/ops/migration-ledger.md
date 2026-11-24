# Migration ledger: repair before any `db push`

The `Migrate` workflow (`.github/workflows/migrate.yml`) runs
`supabase db push --linked`. That command applies every file in
`supabase/migrations/` whose version is missing from the target's
`supabase_migrations.schema_migrations` table.

Production was built partly by hand (SQL editor / MCP `apply_migration`), so its
ledger does not list every repo version. A plain `db push` would replay the
missing ones. Some run `DROP TABLE IF EXISTS trades / trade_approvals CASCADE`
and rewrite RLS from older definitions.

## Status (2026-11-24)

- Fresh-DB replay of every file in `supabase/migrations/` is green (CI
  `db-contract` job, since PR #16).
- Every ledger row from `20260510174552` onward matches a repo file by version
  and name. The MCP-assigned versions were rewritten to the repo filenames,
  and the nine remote-only rows (`supa_02_rls_indexes_backfill`, `023`..`030`)
  were fetched into the repo verbatim (PR #18).
- MCP `apply_migration` stamps the ledger with the current time, not the
  filename version. After each MCP apply, repair the row:
  `UPDATE supabase_migrations.schema_migrations SET version='<file version>',
  name='<file name>' WHERE version='<mcp stamp>';`
- The 37 repo versions that had no ledger row (applied by hand before the
  ledger existed: `00000000000000_bootstrap`, `20260324114022`..`20260510163223`,
  `20260705120000`..`20260705120300`, `20260717120000`, `20260717130000`,
  `20261024190000`) were inserted as applied rows with
  `created_by = 'repair 2026-11-24'` and no `statements`. The ledger now has
  76 rows matching the 76 files one to one, so `supabase db push --linked
  --dry-run` should report up to date. Steps 2-5 below are done; keep them
  for the next time the two sides drift.

## Rules

- Do not add the `SUPABASE_ACCESS_TOKEN` / `PROD_*` secrets, or run the
  workflow against production, until the steps below are done.
- Never use `supabase migration repair --status reverted` on a remote-only
  version to make `db push` stop complaining. That is what triggers the replay.
- Always run the workflow with `dry_run: true` first (the default) and read
  the "Dry run" step output. It must list only the migrations you mean to apply.

## Steps

1. Done 2026-11-24: the duplicate version `20260403` was split into
   `20260403000000_rls_indexes.sql` and `20260403000100_rls_security_definer.sql`.
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
