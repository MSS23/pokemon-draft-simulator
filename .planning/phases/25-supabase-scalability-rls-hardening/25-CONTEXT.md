# Phase 25: Supabase Scalability & RLS Hardening - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Real-time draft events flow through broadcast channels instead of postgres_changes fan-out, RLS policies execute without per-subscriber index scans, and connection leaks are eliminated. Covers: server-issued guest sessions via httpOnly cookie (SEC-06), WebSocket connection rate limiting (RATE-05), RLS indexes (SUPA-02), Realtime channel cleanup (SUPA-03), broadcast migration for picks/bids (SUPA-04), RLS SELECT policy optimization (SUPA-05).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — scalability infrastructure phase. Use ROADMAP success criteria and research findings to guide decisions.

Key research notes:
- CRITICAL: Confirm which JWT integration path is active (legacy Clerk template vs native) by reading FIX-RLS-POLICIES.md before any RLS changes
- CRITICAL: Never use auth.uid() for Clerk users — it returns NULL for string IDs. Use existing custom JWT helper function.
- CRITICAL: Keep SELECT policies draft-scoped (USING draft_id = $draft_id), NOT user-scoped — user-scoped breaks Realtime for spectators silently
- Broadcast migration: Server sends broadcast after DB write; clients listen on broadcast channel; keep postgres_changes only for drafts table and private tables like wishlist_items
- Channel cleanup: Audit supabase.getChannels().length on mount; add supabase.removeAllChannels() on beforeunload as safety net
- Guest sessions: Add /api/guest/session endpoint for server-issued httpOnly cookie; keep localStorage for display convenience only
- RLS indexes: btree on user_id, draft_id, team_id, host_id columns used in USING clauses
- Wrap auth calls in (SELECT auth.uid()) subqueries to prevent per-subscriber re-evaluation

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — scalability infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
