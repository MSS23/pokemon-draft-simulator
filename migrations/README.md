# ⚠️ Legacy migrations — DO NOT APPLY

The **only** source of truth for the database schema is
[`supabase/migrations/`](../supabase/migrations/) (timestamped files, applied by
`.github/workflows/migrate.yml` — staging auto, production behind manual
approval). A daily `schema-drift` workflow diffs production against that tree.

Everything under [`_archive/`](./_archive/) is **historical / superseded** and is
kept only for reference. **Never run any of it against any database.** Notable
footguns in there:

- `RESET_DATABASE.sql`, `CLEAR_DRAFTS_AND_LEAGUES.sql` — destructive; they DROP
  tables / DELETE data.
- `fix-rls-policies.sql` and other early RLS files — contain the old
  `OR auth.uid() IS NULL` **anon-escape** holes that later `sec-p*` migrations
  deliberately closed. Re-running them re-opens every write policy.
- `PRODUCTION_MIGRATION.sql` / `SETUP_SCHEMA.sql` / `COMPLETE_SCHEMA.sql` —
  full-schema snapshots from the pre-Clerk (Supabase-auth, permissive-RLS,
  guest-in-localStorage) era. That model no longer reflects the app.

The previous version of this file walked through running `RESET_DATABASE.sql` on
a live project — that guidance was wrong and has been removed.

**To change the schema:** add a new timestamped file to `supabase/migrations/`.
Do not edit or re-run anything in this directory.
