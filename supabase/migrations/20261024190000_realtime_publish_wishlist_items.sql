-- Wishlist sync (src/hooks/useWishlistSync.ts) subscribes to postgres_changes
-- on public.wishlist_items. Realtime rejects the subscription with
-- "Unable to subscribe to changes with given parameters" when the table is not
-- part of the supabase_realtime publication. The bootstrap migration tried to
-- add it, but the live project does not have it. Idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'wishlist_items'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wishlist_items;
  END IF;
END $$;

-- The hook filters on draft_id for UPDATE/DELETE events too; without a full
-- replica identity the old row carries only the primary key, so filtered
-- DELETE events would never be delivered.
ALTER TABLE public.wishlist_items REPLICA IDENTITY FULL;
