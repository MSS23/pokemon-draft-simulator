-- Hotfix: live auctions table has current_bidder_id UUID (bootstrap /
-- COMPLETE_SCHEMA shape) but every auction RPC since 20260510174552 reads
-- and writes current_bidder TEXT. nominate_auction, place_bid,
-- resolve_auction and system_skip_nomination all fail at call time with:
--   column "current_bidder" of relation "auctions" does not exist
-- Rename + retype so the table matches the RPC contract. Idempotent: safe on
-- a DB that already has current_bidder (fresh projects after this file, or a
-- re-run). The teams(id) FK is dropped by the retype; team ownership is
-- enforced inside place_bid / nominate_auction via user_owns_team().

DO $$
DECLARE
  v_fk TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'auctions'
      AND column_name = 'current_bidder'
  ) THEN
    RAISE NOTICE 'auctions.current_bidder already present; nothing to do';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'auctions'
      AND column_name = 'current_bidder_id'
  ) THEN
    FOR v_fk IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE con.conrelid = 'public.auctions'::regclass
        AND con.contype = 'f'
        AND att.attname = 'current_bidder_id'
    LOOP
      EXECUTE format('ALTER TABLE public.auctions DROP CONSTRAINT %I', v_fk);
    END LOOP;

    ALTER TABLE public.auctions RENAME COLUMN current_bidder_id TO current_bidder;
    ALTER TABLE public.auctions
      ALTER COLUMN current_bidder TYPE TEXT USING current_bidder::text;
  ELSE
    ALTER TABLE public.auctions ADD COLUMN current_bidder TEXT;
  END IF;
END $$;

INSERT INTO public._migrations (name, description, rollback_sql)
SELECT
  '031_auctions_current_bidder_column',
  'Rename auctions.current_bidder_id (UUID) to current_bidder (TEXT) to match the auction RPC contract; unblocks nominate_auction, place_bid, resolve_auction, system_skip_nomination.',
  'ALTER TABLE public.auctions ALTER COLUMN current_bidder TYPE UUID USING current_bidder::uuid; ALTER TABLE public.auctions RENAME COLUMN current_bidder TO current_bidder_id; ALTER TABLE public.auctions ADD CONSTRAINT auctions_current_bidder_id_fkey FOREIGN KEY (current_bidder_id) REFERENCES public.teams(id);'
WHERE NOT EXISTS (
  SELECT 1 FROM public._migrations WHERE name = '031_auctions_current_bidder_column'
);
