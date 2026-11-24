-- 049: stop soft-deleted drafts that are still active/paused (handoff D-02)
--
-- 28 drafts live have deleted_at set but status 'active' or 'paused', so the
-- cron tick keeps advancing them. They are marked 'completed' with no turn
-- clock. Nothing in the database reacts to a status change to completed (the
-- only drafts triggers are updated_at, format-usage on INSERT and the 043
-- turn clock), and every client view filters deleted_at, so no results or
-- leagues are generated for them. join_draft_atomic rejects deleted drafts
-- since 041.
--
-- PRE-CHECK (expect 28 or fewer):
--   SELECT count(*) FROM drafts WHERE deleted_at IS NOT NULL AND status IN ('active','paused');
-- Idempotent.

UPDATE public.drafts
SET status = 'completed', turn_started_at = NULL
WHERE deleted_at IS NOT NULL AND status IN ('active', 'paused');

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '049_deleted_drafts_backfill',
  'Mark soft-deleted drafts still active/paused as completed so the tick stops advancing them.',
  '-- data backfill; previous statuses not recorded'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '049_deleted_drafts_backfill'
);
