-- Hotfix, part 2. After 20261124120000 fixed current_bidder, the cron failed on
-- the next column: live auctions.starting_bid is NOT NULL with no default, but
-- no RPC writes it (nominate_auction stores the opening bid in current_bid;
-- system_skip_nomination inserts a completed marker row). Nothing in src/
-- reads it either. Drop the constraint so the RPC INSERTs succeed. Idempotent.

ALTER TABLE public.auctions ALTER COLUMN starting_bid DROP NOT NULL;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '032_auctions_starting_bid_nullable',
  'Drop NOT NULL on auctions.starting_bid; no RPC writes it and the cron skip path failed on it.',
  'UPDATE public.auctions SET starting_bid = current_bid WHERE starting_bid IS NULL; ALTER TABLE public.auctions ALTER COLUMN starting_bid SET NOT NULL;'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '032_auctions_starting_bid_nullable'
);
