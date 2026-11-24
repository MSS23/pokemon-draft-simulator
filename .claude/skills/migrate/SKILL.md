---
name: migrate
description: Ship a Supabase schema change for this repo end to end. Use when adding a table, column, RPC, policy, grant, index or any other SQL change, when asked to "apply this migration", "push the schema", or when a migration is merged but not live. Covers authoring the file, the PR dry run, the merge-time push, and the MCP hotfix path with the ledger repair it requires.
---

# Migrate

Production project: `dwqlxyeefzcclqdzteez`. Source of truth: `supabase/migrations/`.
Remote ledger: `supabase_migrations.schema_migrations` (version + name per file).
`supabase db push` applies every local file whose version is missing from
that ledger, so the ledger must always match the folder one to one.

## Default path (CI applies, you never push by hand)

1. **Author one new file** `supabase/migrations/YYYYMMDDHHMMSS_slug.sql`
   (UTC, later than every existing file; `date -u +%Y%m%d%H%M%S`).
   - Idempotent: `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` before
     `CREATE POLICY`, `ADD COLUMN IF NOT EXISTS`, `DO $$ ... $$` guards.
   - Grants are part of the change: new RPCs get
     `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` then a `GRANT` to the
     intended role.
   - End with the app ledger row:
     ```sql
     INSERT INTO public._migrations (name, description, rollback_sql)
     SELECT 'slug', 'What and why.', 'How to undo.'
     WHERE NOT EXISTS (SELECT 1 FROM public._migrations WHERE name = 'slug');
     ```
   - Never edit a file that is already in the remote ledger. Fix forward.
2. **Prove fresh replay.** If `supabase` (CLI) and Docker are available:
   `supabase start -x studio,imgproxy,edge-runtime,logflare,vector` must reach
   the new file with no error; then `supabase stop --no-backup`. Otherwise rely
   on the `db-contract` job in CI.
3. **Open a PR.** Two checks matter:
   - `db-contract` (ci.yml): fresh replay + contract SQL + `tests/db`, all steps
     success (the job is `continue-on-error`, so read the steps, not the job).
   - `Migrate` (migrate.yml): the dry-run log must list exactly the file(s) the
     PR adds and nothing else. Anything else pending means the ledger drifted;
     stop and repair it (below) before merging.
4. **Merge.** The push-to-main `Migrate` run applies the file. Confirm:
   - Its "Verify remote is up to date" step passed.
   - MCP `list_migrations` on `dwqlxyeefzcclqdzteez` shows the new version.
   - A probe `SELECT` proves the change (column exists, policy exists,
     `has_function_privilege(...)`).

## Hotfix path (only when explicitly asked to apply now)

The MCP `apply_migration` tool writes the ledger row with the current
timestamp as its version, not the filename version. Without the repair below
the next CI push replays the file.

1. Write and commit the file exactly as in step 1 above.
2. MCP `apply_migration` with `name` = the file slug and `query` = the whole
   file.
3. Repair the ledger row to the filename, via MCP `execute_sql`:
   ```sql
   UPDATE supabase_migrations.schema_migrations
      SET version = '<YYYYMMDDHHMMSS from filename>', name = '<slug>'
    WHERE name = '<slug>' AND version <> '<YYYYMMDDHHMMSS from filename>';
   ```
4. Verify: `list_migrations` shows `<filename version> <slug>`, and
   `SELECT 1 FROM public._migrations WHERE name = '<slug>'` returns a row.
5. Push the file to `main` (PR or direct, per repo rules). The `Migrate` run
   must then report nothing pending.

## Never

- `supabase migration repair --status reverted` on a remote-only version.
- Pasting a file into the dashboard SQL editor (no CLI ledger row).
- Running `00000000000000_bootstrap.sql` against an existing project.
- Adding a file whose version sorts before the newest remote version
  (`db push` refuses it without `--include-all`).

## Ledger drift

If `Migrate` dry run or `list_migrations` disagrees with the folder, follow
`docs/ops/migration-ledger.md`: fetch remote-only rows into files verbatim
(`array_to_string(statements, E'\n')`), and insert missing rows for files
that are already live with `created_by = 'repair <date>'`.
