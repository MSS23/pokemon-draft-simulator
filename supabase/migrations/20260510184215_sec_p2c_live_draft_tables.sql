-- Migration: sec-p2c — close anon-escape on live-draft tables (chunk C of 3).
-- Tables: participants, drafts, teams, picks, auctions, bid_history, chat_messages
--
-- THIS IS THE HIGHEST-RISK CHUNK. Every active draft session is mediated by
-- these tables. Apply only after sec-p2a and sec-p2b are stable in prod and
-- after a final smoke pass against the Clerk-bridged client paths.
--
-- Mirrors sections 2-5 + 7 of sec-p2-close-anon-escape-DRAFT.sql.
-- Verified against pre-flight snapshot 2026-05-10.

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '10s';

-- 0. Verify clerk_user_id() exists.
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'clerk_user_id'
  ) THEN
    RAISE EXCEPTION 'public.clerk_user_id() must exist before applying this migration.';
  END IF;
END
$verify$;

-- =====================================================================
-- participants
-- =====================================================================
DROP POLICY IF EXISTS participants_update_self          ON public.participants;
DROP POLICY IF EXISTS participants_delete_self_or_host  ON public.participants;
DROP POLICY IF EXISTS participants_update_self_or_host  ON public.participants;
DROP POLICY IF EXISTS participants_delete_host_only     ON public.participants;

CREATE POLICY participants_update_self_or_host ON public.participants
  FOR UPDATE
  USING (
    user_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = participants.draft_id
         AND d.host_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    user_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = participants.draft_id
         AND d.host_id = public.clerk_user_id()
    )
  );

CREATE POLICY participants_delete_host_only ON public.participants
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = participants.draft_id
         AND d.host_id = public.clerk_user_id()
    )
  );

-- Verified columns 2026-05-10: only display_name and last_seen are client-writable.
REVOKE UPDATE ON public.participants FROM anon, authenticated;
GRANT  UPDATE (display_name, last_seen)
       ON public.participants TO authenticated;

-- =====================================================================
-- drafts
-- =====================================================================
DROP POLICY IF EXISTS drafts_update_host_only ON public.drafts;
DROP POLICY IF EXISTS drafts_delete_host_only ON public.drafts;

CREATE POLICY drafts_update_host_only ON public.drafts
  FOR UPDATE
  USING      (host_id = public.clerk_user_id())
  WITH CHECK (host_id = public.clerk_user_id());

CREATE POLICY drafts_delete_host_only ON public.drafts
  FOR DELETE
  USING (host_id = public.clerk_user_id());

REVOKE UPDATE ON public.drafts FROM anon, authenticated;
GRANT  UPDATE (status, current_turn, current_round, turn_started_at,
               settings, name, description, max_teams, allow_undos,
               max_undos_per_team, deleted_at, updated_at)
       ON public.drafts TO authenticated;

-- =====================================================================
-- teams
-- =====================================================================
DROP POLICY IF EXISTS teams_update_owner_or_host ON public.teams;
DROP POLICY IF EXISTS teams_delete_host_only     ON public.teams;

CREATE POLICY teams_update_owner_or_host ON public.teams
  FOR UPDATE
  USING (
    owner_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = teams.draft_id AND d.host_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    owner_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = teams.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

CREATE POLICY teams_delete_host_only ON public.teams
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = teams.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

REVOKE UPDATE ON public.teams FROM anon, authenticated;
-- Verified columns 2026-05-10: client-writable = cosmetic + draft_order.
GRANT  UPDATE (name, draft_order, undos_remaining, updated_at,
               logo_url, abbreviation, coach_display_name,
               discord_handle, division_name)
       ON public.teams TO authenticated;

-- =====================================================================
-- picks
-- =====================================================================
DROP POLICY IF EXISTS picks_update_host_only       ON public.picks;
DROP POLICY IF EXISTS picks_delete_owner_or_host   ON public.picks;
DROP POLICY IF EXISTS picks_delete_host_only       ON public.picks;

CREATE POLICY picks_update_host_only ON public.picks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = picks.draft_id AND d.host_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = picks.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

CREATE POLICY picks_delete_owner_or_host ON public.picks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = picks.team_id AND t.owner_id = public.clerk_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = picks.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

-- =====================================================================
-- auctions
-- =====================================================================
DROP POLICY IF EXISTS auctions_update      ON public.auctions;
DROP POLICY IF EXISTS auctions_delete      ON public.auctions;
DROP POLICY IF EXISTS auctions_delete_host ON public.auctions;
DROP POLICY IF EXISTS auctions_update_host ON public.auctions;

CREATE POLICY auctions_update_host ON public.auctions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = auctions.draft_id AND d.host_id = public.clerk_user_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = auctions.draft_id AND d.host_id = public.clerk_user_id()
    )
  );
CREATE POLICY auctions_delete_host ON public.auctions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = auctions.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

-- =====================================================================
-- bid_history — append-only (service role for any cleanup); SELECT tightened.
-- =====================================================================
DROP POLICY IF EXISTS bid_history_update    ON public.bid_history;
DROP POLICY IF EXISTS bid_history_delete    ON public.bid_history;

DROP POLICY IF EXISTS bid_history_select         ON public.bid_history;
DROP POLICY IF EXISTS bid_history_select_in_draft ON public.bid_history;
-- bid_history has no draft_id; join through auctions.
CREATE POLICY bid_history_select_in_draft ON public.bid_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM auctions a
        JOIN participants p ON p.draft_id = a.draft_id
       WHERE a.id = bid_history.auction_id
         AND p.user_id = public.clerk_user_id()
    )
  );

-- =====================================================================
-- chat_messages — sender owns; host moderates; SELECT scoped to participants.
-- =====================================================================
DROP POLICY IF EXISTS chat_messages_update          ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_delete          ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_update_self     ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_delete_self_or_host ON public.chat_messages;

CREATE POLICY chat_messages_update_self ON public.chat_messages
  FOR UPDATE USING (sender_id = public.clerk_user_id())
              WITH CHECK (sender_id = public.clerk_user_id());
CREATE POLICY chat_messages_delete_self_or_host ON public.chat_messages
  FOR DELETE USING (
    sender_id = public.clerk_user_id()
    OR EXISTS (
      SELECT 1 FROM drafts d
       WHERE d.id = chat_messages.draft_id AND d.host_id = public.clerk_user_id()
    )
  );

DROP POLICY IF EXISTS chat_messages_select          ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_select_in_draft ON public.chat_messages;
CREATE POLICY chat_messages_select_in_draft ON public.chat_messages
  FOR SELECT USING (
    public.clerk_user_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM participants p
       WHERE p.draft_id = chat_messages.draft_id
         AND p.user_id  = public.clerk_user_id()
    )
  );

-- =====================================================================
-- Record migration
-- =====================================================================
INSERT INTO _migrations (name, description) VALUES (
  '025c_sec_p2_live_draft_tables',
  'sec-p2 chunk C: anon-escape removed from participants, drafts, teams, picks, auctions, bid_history, chat_messages; table-level UPDATE revoked for participants/drafts/teams + column grants reissued; SELECT tightened on chat_messages and bid_history.'
) ON CONFLICT (name) DO NOTHING;

COMMIT;
