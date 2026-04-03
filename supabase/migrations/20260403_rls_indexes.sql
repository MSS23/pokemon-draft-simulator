-- Phase 25: SUPA-02 — RLS indexes for policy-scanned columns
-- Adds btree indexes on columns that appear in RLS USING clauses.
-- These prevent sequential scans when Supabase evaluates policies per row.
-- Use IF NOT EXISTS to make the migration re-runnable.

-- picks table: draft_id used in most RLS SELECT/INSERT policies
CREATE INDEX IF NOT EXISTS idx_picks_draft_id
  ON public.picks USING btree (draft_id);

-- picks table: team_id used for team-scoped INSERT policies
CREATE INDEX IF NOT EXISTS idx_picks_team_id
  ON public.picks USING btree (team_id);

-- teams table: draft_id is the primary policy filter
CREATE INDEX IF NOT EXISTS idx_teams_draft_id
  ON public.teams USING btree (draft_id);

-- teams table: host_id used to check host-only mutations
CREATE INDEX IF NOT EXISTS idx_teams_host_id_via_draft
  ON public.drafts USING btree (host_id);

-- participants table: draft_id + user_id composite for participant lookups
CREATE INDEX IF NOT EXISTS idx_participants_draft_id
  ON public.participants USING btree (draft_id);

CREATE INDEX IF NOT EXISTS idx_participants_user_id
  ON public.participants USING btree (user_id);

-- Composite index for the common "is this user in this draft" policy check
CREATE INDEX IF NOT EXISTS idx_participants_draft_user
  ON public.participants USING btree (draft_id, user_id);

-- auctions table: draft_id used in RLS filters
CREATE INDEX IF NOT EXISTS idx_auctions_draft_id
  ON public.auctions USING btree (draft_id);

-- wishlist_items: draft_id + participant_id (private per-user data)
CREATE INDEX IF NOT EXISTS idx_wishlist_items_draft_id
  ON public.wishlist_items USING btree (draft_id);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_participant_id
  ON public.wishlist_items USING btree (participant_id);

-- Composite for "my wishlist items in this draft" queries
CREATE INDEX IF NOT EXISTS idx_wishlist_items_draft_participant
  ON public.wishlist_items USING btree (draft_id, participant_id);

-- drafts table: host_id for admin-only policy checks
CREATE INDEX IF NOT EXISTS idx_drafts_host_id
  ON public.drafts USING btree (host_id);
