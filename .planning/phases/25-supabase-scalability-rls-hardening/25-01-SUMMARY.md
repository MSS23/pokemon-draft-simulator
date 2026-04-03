---
phase: 25-supabase-scalability-rls-hardening
plan: 01
subsystem: database
tags: [supabase, rls, postgres, security, performance, clerk, jwt]

# Dependency graph
requires: []
provides:
  - btree indexes on all RLS policy-scanned columns (picks, teams, participants, auctions, wishlist_items, drafts)
  - security-definer helper functions: requesting_user_id(), is_draft_accessible(), is_draft_host(), user_owns_team()
  - Clerk-compatible JWT user ID extraction via auth.jwt() ->> 'sub'
affects: [all RLS policy definitions, Supabase performance advisor, draft real-time subscriptions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER SQL functions to cache auth checks per query instead of per-subscriber"
    - "Clerk JWT compatibility: use auth.jwt() ->> 'sub' instead of auth.uid() (which returns NULL for Clerk)"
    - "Draft-scoped SELECT policies (spectator visibility) vs user-scoped for private data (wishlist)"

key-files:
  created:
    - supabase/migrations/20260403_rls_indexes.sql
    - supabase/migrations/20260403_rls_security_definer.sql
  modified: []

key-decisions:
  - "Never use auth.uid() in RLS policies — it returns NULL for Clerk string user IDs; use auth.jwt() ->> 'sub' via requesting_user_id()"
  - "SELECT policies on picks/teams/auctions are draft-scoped (not user-scoped) to preserve spectator visibility"
  - "wishlist_items SELECT remains user-scoped via participant_id = requesting_user_id() (private per-user data)"
  - "SECURITY DEFINER functions execute once per query not once per subscriber, eliminating O(N) RLS fan-out for N watchers"

patterns-established:
  - "Pattern: requesting_user_id() — canonical way to get current user ID in all future RLS policies"
  - "Pattern: is_draft_accessible() — draft-scoped visibility check for broadcast data"
  - "Pattern: is_draft_host() + user_owns_team() — permission tier checks for mutations"

requirements-completed: [SUPA-02, SUPA-05]

# Metrics
duration: 8min
completed: 2026-04-03
---

# Phase 25 Plan 01: RLS Indexes and Security-Definer Functions Summary

**12 btree indexes on RLS-scanned columns + 4 SECURITY DEFINER functions eliminate O(N) sequential scan fan-out for N-subscriber drafts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-03T09:32:56Z
- **Completed:** 2026-04-03T09:40:00Z
- **Tasks:** 2 of 2
- **Files modified:** 2

## Accomplishments

- Created `supabase/migrations/20260403_rls_indexes.sql` with 12 btree indexes covering all RLS USING clause columns across picks, teams, participants, auctions, wishlist_items, and drafts tables
- Created `supabase/migrations/20260403_rls_security_definer.sql` with 4 SECURITY DEFINER helper functions that cache auth checks per query (not per subscriber), eliminating the O(N) fan-out where N = number of draft watchers
- Established Clerk-compatible user ID pattern: `requesting_user_id()` reads from `auth.jwt() ->> 'sub'` with COALESCE fallback — corrects the silent NULL return from `auth.uid()` which breaks all Clerk-based auth checks

## Task Commits

1. **Task 1: Create RLS index migration** - `f62fe32` (chore)
2. **Task 2: Create security-definer RLS wrapper migration** - `a73b7a8` (chore)

## Files Created/Modified

- `supabase/migrations/20260403_rls_indexes.sql` - 12 btree indexes on draft_id, team_id, user_id, host_id, participant_id columns; includes composites for common "is this user in this draft" lookups
- `supabase/migrations/20260403_rls_security_definer.sql` - 4 SECURITY DEFINER functions (requesting_user_id, is_draft_accessible, is_draft_host, user_owns_team) + GRANT statements + audit query for finding remaining auth.uid() policy usages

## Decisions Made

- Used `auth.jwt() ->> 'sub'` (not `auth.uid()`) because Clerk stores user IDs as strings in the JWT sub claim; `auth.uid()` silently returns NULL for all Clerk users, breaking every RLS policy that uses it
- `is_draft_accessible()` is intentionally draft-scoped (checks `drafts.id` only) so spectators can see picks/teams — not filtered to current user
- `wishlist_items` policies should remain user-scoped via `participant_id = requesting_user_id()` because wishlists are private auto-pick data

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — these are pure SQL migration files with no UI or runtime stubs.

## Self-Check: PASSED

- `supabase/migrations/20260403_rls_indexes.sql` — EXISTS, 12 CREATE INDEX statements
- `supabase/migrations/20260403_rls_security_definer.sql` — EXISTS, 6 SECURITY DEFINER occurrences (4 function definitions + 2 in comments), 0 functional auth.uid() usage
- Commits f62fe32 and a73b7a8 — verified in git log
