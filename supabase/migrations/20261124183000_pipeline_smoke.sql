-- Pipeline smoke test: first migration shipped end to end through
-- .github/workflows/migrate.yml (PR dry run, merge-time db push). Changes no
-- schema; only records itself in the app ledger so the apply is observable.
-- Idempotent.

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT 'pipeline_smoke',
       'No-op. Proves the Migrate workflow applies merged files to production.',
       'DELETE FROM public._migrations WHERE name = ''pipeline_smoke'';'
WHERE NOT EXISTS (SELECT 1 FROM public._migrations WHERE name = 'pipeline_smoke');
