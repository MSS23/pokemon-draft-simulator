-- Hotfix, part 3. Live bid_history has the bootstrap / COMPLETE_SCHEMA shape
-- (auction_id, team_id, amount, bidder_name) while place_bid (since
-- 20260510174552), the Database types in src/lib/supabase.ts and
-- auction-service.ts all use (auction_id, draft_id, team_id, team_name,
-- bid_amount), the PRODUCTION_MIGRATION shape. The first live bid would fail:
--   column "draft_id" of relation "bid_history" does not exist
-- Reshape to the repo contract. Idempotent: each step checks the column.
-- Policies reference only auction_id, so they are unaffected.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bid_history' AND column_name = 'draft_id'
  ) THEN
    ALTER TABLE public.bid_history
      ADD COLUMN draft_id UUID REFERENCES public.drafts(id) ON DELETE CASCADE;
    -- Backfill from the auction when rows exist (live has none today).
    UPDATE public.bid_history b SET draft_id = a.draft_id
      FROM public.auctions a WHERE a.id = b.auction_id AND b.draft_id IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bid_history' AND column_name = 'amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bid_history' AND column_name = 'bid_amount'
  ) THEN
    ALTER TABLE public.bid_history RENAME COLUMN amount TO bid_amount;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bid_history' AND column_name = 'bidder_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bid_history' AND column_name = 'team_name'
  ) THEN
    ALTER TABLE public.bid_history RENAME COLUMN bidder_name TO team_name;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bid_history_draft_id ON public.bid_history(draft_id);

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '033_bid_history_repo_shape',
  'bid_history: add draft_id, rename amount->bid_amount and bidder_name->team_name to match place_bid and the client types.',
  'DROP INDEX IF EXISTS public.idx_bid_history_draft_id; ALTER TABLE public.bid_history RENAME COLUMN bid_amount TO amount; ALTER TABLE public.bid_history RENAME COLUMN team_name TO bidder_name; ALTER TABLE public.bid_history DROP COLUMN draft_id;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '033_bid_history_repo_shape'
);
