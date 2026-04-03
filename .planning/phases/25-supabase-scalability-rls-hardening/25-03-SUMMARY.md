---
phase: 25-supabase-scalability-rls-hardening
plan: "03"
subsystem: realtime
tags: [broadcast, supabase, scalability, picks, auction, rls]
dependency_graph:
  requires: [25-02]
  provides: [broadcast-pick-delivery, broadcast-bid-delivery]
  affects: [draft-picks-service, auction-service, draft-realtime]
tech_stack:
  added: []
  patterns: [supabase-broadcast, fire-and-forget-channel, belt-and-suspenders]
key_files:
  created: []
  modified:
    - src/lib/draft-picks-service.ts
    - src/lib/auction-service.ts
    - src/lib/draft-realtime.ts
decisions:
  - "Belt-and-suspenders: postgres_changes retained as fallback for picks — broadcast is additive, not a replacement"
  - "sendPickBroadcast and sendBidBroadcast use fire-and-forget channels with removeChannel() in finally block to prevent accumulation"
  - "DraftRealtimeManager.handleBroadcast maps pick_made/bid_placed payloads to DraftEvent shape matching postgres_changes output — no changes needed in useDraftRealtime hook"
metrics:
  duration_minutes: 18
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_modified: 3
---

# Phase 25 Plan 03: Broadcast Migration for Picks and Bids Summary

Migrated pick and bid real-time delivery from postgres_changes (O(N) RLS evaluation per subscriber) to Supabase broadcast channels (O(1) server-side fan-out). For an 8-player draft, this reduces RLS evaluations per pick from 8 to 1.

## What Was Built

### Task 1: Pick broadcast sender + DraftRealtimeManager listener

**`src/lib/draft-picks-service.ts`** — Added `sendPickBroadcast()` module-level helper:
- Sends a `pick_made` broadcast event on channel `draft:{draftId}` after each successful pick RPC
- Uses a fire-and-forget channel with `removeChannel()` in `finally` block (no accumulation)
- Called non-fatally via `.catch()` after `make_draft_pick` RPC succeeds — broadcast failure does not break the pick

**`src/lib/draft-realtime.ts`** — Extended `DraftRealtimeManager`:
- Added `.on('broadcast', { event: 'pick_made' }, ...)` and `.on('broadcast', { event: 'bid_placed' }, ...)` listeners in `subscribe()`
- Extended `handleBroadcast()` to map `pick_made` payload → `DraftEvent { table: 'picks', eventType: 'INSERT' }` and `bid_placed` payload → `DraftEvent { table: 'auctions', eventType: 'UPDATE' }`
- Payload shape matches what postgres_changes emits (snake_case field names) so `useDraftRealtime` hook handles it identically with no changes needed downstream

### Task 2: Bid broadcast sender in auction-service

**`src/lib/auction-service.ts`** — Added `sendBidBroadcast()` module-level helper:
- Sends a `bid_placed` broadcast event on channel `draft:{draftId}` after each successful bid insert + auction update
- Fire-and-forget channel with `removeChannel()` in `finally` block
- Called non-fatally via `.catch()` inside `placeBid()` after the auction update succeeds
- Reviewed existing subscription channels (`subscribeToBidHistory`, `subscribeToAuctionUpdates`) — both already have proper `removeChannel()` cleanup in their returned unsubscribe functions; no fix needed

## Architecture

```
makePick() ─── RPC make_draft_pick succeeds ───► sendPickBroadcast()
                                                      │
                                              supabase.channel(`draft:${draftId}`)
                                              .send({ event: 'pick_made', payload })
                                              supabase.removeChannel(channel)  ← fire-and-forget
                                                      │
                                              All subscribers on `draft:${draftId}`
                                                      │
                                          DraftRealtimeManager.handleBroadcast('pick_made', ...)
                                                      │
                                          callbacks.onDraftEvent({ table: 'picks', eventType: 'INSERT', ... })
                                                      │
                                          useDraftRealtime → same path as postgres_changes
```

Same pattern for `placeBid()` → `sendBidBroadcast()` → `bid_placed` → `handleBroadcast` → `{ table: 'auctions', eventType: 'UPDATE' }`.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Note on "one-shot channels at lines 247 and 301":** The plan mentioned checking these lines for missing `removeChannel()`. After reading the actual code, lines 246 and 300 are long-lived subscription channels (`subscribeToBidHistory` and `subscribeToAuctionUpdates`) — not one-shot sends. Both already return proper cleanup functions calling `supabase.removeChannel(channel)`. No fix was required.

## Known Stubs

None — all broadcast paths wire to real Supabase channels.

## Self-Check: PASSED

- FOUND: src/lib/draft-picks-service.ts
- FOUND: src/lib/auction-service.ts
- FOUND: src/lib/draft-realtime.ts
- FOUND: 25-03-SUMMARY.md
- FOUND commit: 5a3c148 (Task 1)
- FOUND commit: a740538 (Task 2)
