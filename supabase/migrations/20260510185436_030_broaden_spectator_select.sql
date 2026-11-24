-- 030_broaden_spectator_select
-- Broaden SELECT policies on chat_messages, bid_history, draft_actions so that
-- spectators of public (is_public=TRUE, deleted_at IS NULL) drafts can read them,
-- while preserving participant access for private drafts.

-- chat_messages
DROP POLICY IF EXISTS chat_messages_select_in_draft ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_select_visible ON public.chat_messages;
CREATE POLICY chat_messages_select_visible ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.drafts d
       WHERE d.id = chat_messages.draft_id
         AND d.is_public = TRUE
         AND d.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.participants p
       WHERE p.draft_id = chat_messages.draft_id
         AND p.user_id  = public.clerk_user_id()
    )
  );

-- draft_actions
DROP POLICY IF EXISTS draft_actions_select_in_draft ON public.draft_actions;
DROP POLICY IF EXISTS draft_actions_select_visible ON public.draft_actions;
CREATE POLICY draft_actions_select_visible ON public.draft_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.drafts d
       WHERE d.id = draft_actions.draft_id
         AND d.is_public = TRUE
         AND d.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.participants p
       WHERE p.draft_id = draft_actions.draft_id
         AND p.user_id  = public.clerk_user_id()
    )
  );

-- bid_history (no draft_id column — join through auctions)
DROP POLICY IF EXISTS bid_history_select_in_draft ON public.bid_history;
DROP POLICY IF EXISTS bid_history_select_visible ON public.bid_history;
CREATE POLICY bid_history_select_visible ON public.bid_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.auctions a
        JOIN public.drafts d ON d.id = a.draft_id
       WHERE a.id = bid_history.auction_id
         AND d.is_public = TRUE
         AND d.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.auctions a
        JOIN public.participants p ON p.draft_id = a.draft_id
       WHERE a.id = bid_history.auction_id
         AND p.user_id = public.clerk_user_id()
    )
  );

-- Record migration
INSERT INTO public._migrations (name, description, applied_by, rollback_sql)
VALUES (
  '030_broaden_spectator_select',
  'Broaden SELECT on chat_messages, bid_history, draft_actions to allow spectators of public, non-deleted drafts (in addition to participants).',
  'mcp-agent',
  $rb$
DROP POLICY IF EXISTS chat_messages_select_visible ON public.chat_messages;
CREATE POLICY chat_messages_select_in_draft ON public.chat_messages
  FOR SELECT USING (
    (public.clerk_user_id() IS NOT NULL) AND EXISTS (
      SELECT 1 FROM public.participants p
       WHERE p.draft_id = chat_messages.draft_id
         AND p.user_id = public.clerk_user_id()
    )
  );
DROP POLICY IF EXISTS draft_actions_select_visible ON public.draft_actions;
CREATE POLICY draft_actions_select_in_draft ON public.draft_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.participants p
       WHERE p.draft_id = draft_actions.draft_id
         AND p.user_id = public.clerk_user_id()
    )
  );
DROP POLICY IF EXISTS bid_history_select_visible ON public.bid_history;
CREATE POLICY bid_history_select_in_draft ON public.bid_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.auctions a
        JOIN public.participants p ON p.draft_id = a.draft_id
       WHERE a.id = bid_history.auction_id
         AND p.user_id = public.clerk_user_id()
    )
  );
  $rb$
)
ON CONFLICT (name) DO NOTHING;