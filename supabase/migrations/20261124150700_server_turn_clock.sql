-- 043: turn_started_at always uses the database clock (audit B-25)
--
-- startDraft / unpauseDraft / advanceTurn wrote turn_started_at from the host
-- browser's clock, while draft-tick and the cron compare it with NOW(). A slow
-- host clock caused instant auto-picks/skips, a fast one stalled timeouts.
-- This trigger replaces any non-NULL turn_started_at a write sets (or changes)
-- with NOW(). NULL (completion, pause, reset) is kept. RPCs already write
-- NOW(), so they are unaffected. Idempotent.

CREATE OR REPLACE FUNCTION public.drafts_server_turn_clock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.turn_started_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.turn_started_at IS DISTINCT FROM OLD.turn_started_at) THEN
    NEW.turn_started_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.drafts_server_turn_clock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drafts_server_turn_clock ON public.drafts;
CREATE TRIGGER drafts_server_turn_clock
  BEFORE INSERT OR UPDATE OF turn_started_at ON public.drafts
  FOR EACH ROW EXECUTE FUNCTION public.drafts_server_turn_clock();

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '043_server_turn_clock',
  'BEFORE INSERT/UPDATE trigger forces non-NULL drafts.turn_started_at to NOW().',
  'DROP TRIGGER drafts_server_turn_clock ON public.drafts; DROP FUNCTION public.drafts_server_turn_clock();'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '043_server_turn_clock'
);
