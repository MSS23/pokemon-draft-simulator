-- sec-p1 delta: the original migration dropped SELECT/UPDATE/DELETE wishlist
-- policies but forgot the INSERT policy. The remaining INSERT policy still
-- has `OR auth.uid() IS NULL`, which lets anon insert into anyone's wishlist.

DROP POLICY IF EXISTS wishlist_items_insert        ON public.wishlist_items;
DROP POLICY IF EXISTS wishlist_items_insert_owner  ON public.wishlist_items;

CREATE POLICY wishlist_items_insert_owner ON public.wishlist_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
       WHERE p.id      = wishlist_items.participant_id
         AND p.user_id = public.clerk_user_id()
    )
  );

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '023_sec_p1_delta_wishlist_insert',
  'Closes the anon-escape gap in wishlist_items_insert_owner that the original sec-p1 migration missed.',
  'DROP POLICY IF EXISTS wishlist_items_insert_owner ON public.wishlist_items; -- then recreate prior policy from PRODUCTION_MIGRATION.sql'
) ON CONFLICT (name) DO NOTHING;