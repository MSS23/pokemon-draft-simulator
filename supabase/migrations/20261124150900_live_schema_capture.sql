-- 045: capture live-only schema objects in the repo (audit B-17, handoffs
-- M-08 draft_passwords and E-04 custom_formats owner column)
--
-- These exist in prod but no repo migration creates them, so a fresh
-- `supabase db reset` lacked password drafts, custom-format pricing and the
-- weekly recap tables. Shapes copied from information_schema / pg_constraint
-- on 2026-11-24. On prod every statement is a no-op except the custom_formats
-- policy recreation (same definitions as live).
--
--   draft_passwords        (draft_id PK -> drafts ON DELETE CASCADE, password,
--                           created_at); RLS on, no policies, service role only
--   drafts.has_password    boolean NOT NULL DEFAULT false
--   teams.updated_at       timestamptz DEFAULT now()
--   custom_formats         live columns (pokemon_pricing, created_by_user_id,
--                           created_by_display_name, stats columns, deleted_at).
--                           The bootstrap's creator_id/costs are backfilled into
--                           created_by_user_id/pokemon_pricing, RLS points at
--                           created_by_user_id only, then the legacy columns are
--                           dropped (they do not exist live).
--   weekly_summaries / weekly_highlights with live columns and constraints.
--
-- Not done here: public._migrations itself. Files from 20260510151248 on
-- INSERT into it, so it must be created by a file sorted before that one
-- (bootstrap). That needs a rename/edit outside this bucket's file range.
-- Idempotent.

-- draft_passwords ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.draft_passwords (
  draft_id   uuid PRIMARY KEY REFERENCES public.drafts(id) ON DELETE CASCADE,
  password   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.draft_passwords ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.draft_passwords FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.draft_passwords TO service_role;

ALTER TABLE public.drafts ADD COLUMN IF NOT EXISTS has_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- custom_formats -------------------------------------------------------------
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS pokemon_pricing jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS total_pokemon integer DEFAULT 0;
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS min_cost integer DEFAULT 0;
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS max_cost integer DEFAULT 0;
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS avg_cost numeric DEFAULT 0;
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS created_by_user_id text;
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS created_by_display_name text NOT NULL DEFAULT 'Unknown';
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS times_used integer DEFAULT 0;
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE public.custom_formats ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $cf$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'custom_formats' AND column_name = 'creator_id') THEN
    EXECUTE 'UPDATE public.custom_formats SET created_by_user_id = creator_id WHERE created_by_user_id IS NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'custom_formats' AND column_name = 'costs') THEN
    EXECUTE 'UPDATE public.custom_formats SET pokemon_pricing = costs WHERE pokemon_pricing = ''{}''::jsonb AND costs IS NOT NULL';
  END IF;
END
$cf$;

DROP POLICY IF EXISTS custom_formats_update_creator ON public.custom_formats;
CREATE POLICY custom_formats_update_creator ON public.custom_formats
  FOR UPDATE
  USING (created_by_user_id = public.clerk_user_id())
  WITH CHECK (created_by_user_id = public.clerk_user_id());
DROP POLICY IF EXISTS custom_formats_delete_creator ON public.custom_formats;
CREATE POLICY custom_formats_delete_creator ON public.custom_formats
  FOR DELETE
  USING (created_by_user_id = public.clerk_user_id());

ALTER TABLE public.custom_formats DROP COLUMN IF EXISTS creator_id;
ALTER TABLE public.custom_formats DROP COLUMN IF EXISTS costs;

-- weekly recap tables --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  headline text,
  summary_text text,
  top_performer_team_id uuid REFERENCES public.teams(id),
  top_performer_reason text,
  most_kos_pokemon_id text,
  most_kos_pick_id uuid REFERENCES public.picks(id),
  most_kos_count integer DEFAULT 0,
  biggest_upset_match_id uuid REFERENCES public.matches(id),
  biggest_upset_description text,
  total_matches integer DEFAULT 0,
  total_kos integer DEFAULT 0,
  total_deaths integer DEFAULT 0,
  total_trades integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (league_id, week_number)
);

CREATE TABLE IF NOT EXISTS public.weekly_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  icon text,
  team_id uuid REFERENCES public.teams(id),
  match_id uuid REFERENCES public.matches(id),
  pick_id uuid REFERENCES public.picks(id),
  trade_id uuid REFERENCES public.trades(id),
  display_order integer DEFAULT 0,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_highlights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_summaries_select ON public.weekly_summaries;
CREATE POLICY weekly_summaries_select ON public.weekly_summaries FOR SELECT USING (true);
DROP POLICY IF EXISTS weekly_summaries_no_write ON public.weekly_summaries;
CREATE POLICY weekly_summaries_no_write ON public.weekly_summaries
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS weekly_highlights_select ON public.weekly_highlights;
CREATE POLICY weekly_highlights_select ON public.weekly_highlights FOR SELECT USING (true);
DROP POLICY IF EXISTS weekly_highlights_no_write ON public.weekly_highlights;
CREATE POLICY weekly_highlights_no_write ON public.weekly_highlights
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '045_live_schema_capture',
  'Capture live-only draft_passwords, drafts.has_password, teams.updated_at, custom_formats columns (drop legacy creator_id/costs), weekly_summaries/weekly_highlights.',
  '-- capture only; nothing to roll back on prod'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '045_live_schema_capture'
);
