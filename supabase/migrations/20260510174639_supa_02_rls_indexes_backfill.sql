-- Phase 25: SUPA-02 RLS index backfill (idempotent)
-- Most already exist; this fills the three gaps.
CREATE INDEX IF NOT EXISTS idx_picks_draft_id              ON public.picks            USING btree (draft_id);
CREATE INDEX IF NOT EXISTS idx_picks_team_id               ON public.picks            USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_teams_draft_id              ON public.teams            USING btree (draft_id);
CREATE INDEX IF NOT EXISTS idx_teams_host_id_via_draft     ON public.drafts           USING btree (host_id);
CREATE INDEX IF NOT EXISTS idx_participants_draft_id       ON public.participants     USING btree (draft_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id        ON public.participants     USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_participants_draft_user     ON public.participants     USING btree (draft_id, user_id);
CREATE INDEX IF NOT EXISTS idx_auctions_draft_id           ON public.auctions         USING btree (draft_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_draft_id     ON public.wishlist_items   USING btree (draft_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_participant_id      ON public.wishlist_items USING btree (participant_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_draft_participant  ON public.wishlist_items USING btree (draft_id, participant_id);
CREATE INDEX IF NOT EXISTS idx_drafts_host_id              ON public.drafts           USING btree (host_id);

INSERT INTO _migrations (name, description, rollback_sql) VALUES (
  '022_supa_02_rls_indexes',
  'btree indexes on RLS-scanned columns to avoid sequential scans during policy evaluation.',
  'See supabase/migrations/20260403_rls_indexes.sql for column list to drop.'
) ON CONFLICT (name) DO NOTHING;