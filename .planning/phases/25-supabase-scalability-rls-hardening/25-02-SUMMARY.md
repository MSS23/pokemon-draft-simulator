---
phase: 25-supabase-scalability-rls-hardening
plan: "02"
subsystem: realtime
tags: [channel-leak, rate-limiting, websocket, supabase-realtime, supa-03, rate-05]
dependency_graph:
  requires: []
  provides: [channel-leak-fix, beforeunload-safety-net, ws-rate-limit]
  affects: [src/hooks/useSupabase.ts, src/lib/draft-realtime.ts, src/middleware.ts]
tech_stack:
  added: []
  patterns: [beforeunload-cleanup, channel-count-guard, upstash-ratelimit]
key_files:
  created: []
  modified:
    - src/hooks/useSupabase.ts
    - src/lib/draft-realtime.ts
    - src/middleware.ts
decisions:
  - "Mark useRealtimeDraft @deprecated rather than delete — no callers found outside its own file but safe to preserve for compatibility"
  - "wsConnect rate limiter guards /api/drafts/join as indirect channel-creation gate since Supabase WS upgrades bypass Next.js middleware entirely"
  - "RATE-05 channel count guard threshold set to 5 (5 draft+wishlist channels is abnormal for a single page session)"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-03T09:35:33Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 25 Plan 02: Realtime Channel Leak Fix & WebSocket Rate Limiting Summary

**One-liner:** Eliminate duplicate `draft:` channel subscriptions via `@deprecated` marker, add `beforeunload` cleanup safety net to `DraftRealtimeManager`, and add RATE-05 channel accumulation guard with application-level WS rate limiting.

## What Was Built

### Task 1: Fix useRealtimeDraft Duplicate Channel + beforeunload Safety Net

**`src/hooks/useSupabase.ts`** — `useRealtimeDraft` marked `@deprecated` with SUPA-03 explanation. The hook creates a `supabase.channel('draft:${draftId}')` subscription that directly conflicts with `DraftRealtimeManager`'s channel of the same name, causing every postgres_changes event to be processed twice. No active callers were found outside the file itself; marking deprecated prevents future re-introduction.

**`src/lib/draft-realtime.ts`** — Three additions:
1. `private beforeUnloadHandler: (() => void) | null = null` class field
2. In `subscribe()`: registers a `beforeunload` listener after channel subscription that calls `channel.unsubscribe()` + `supabase.removeChannel()` synchronously (best-effort) — guards against hard navigation bypassing React's `useEffect` cleanup
3. In `cleanup()`: removes the `beforeunload` listener before channel teardown to prevent memory leaks

All `window` accesses are guarded with `typeof window !== 'undefined'` for SSR safety.

### Task 2: WebSocket Connection Rate Limiting

**`src/lib/draft-realtime.ts`** — RATE-05 channel accumulation guard added at the top of `subscribe()`: reads `supabase.getChannels()`, filters for `draft:` and `wishlist_` channels, and if count >= 5, identifies and removes stale channels (those not matching current `draftId`) before proceeding. Logs `[SUPA-03] Active channels after subscribe: N` for observability.

**`src/middleware.ts`** — Two additions:
- `wsConnect` Upstash rate limiter: `Ratelimit.slidingWindow(10, '1 m')` with prefix `rl:ws-connect`
- `/api/drafts/join` route in `RATE_LIMITS` mapped to `wsConnect` key

Note: Supabase Realtime WebSocket upgrades go directly from browser to `wss://*.supabase.co` and cannot be intercepted by Next.js middleware. The `wsConnect` limiter covers the application-level join action that triggers channel creation, providing indirect protection.

## Decisions Made

1. **`useRealtimeDraft` deprecated, not deleted** — No callers found in the codebase, but deleting a publicly exported hook may break external consumers. Deprecation with a clear migration path (`useDraftRealtime`) is safer.

2. **Application-level WS rate limit via `/api/drafts/join`** — Since Supabase WS upgrades bypass middleware, rate-limiting the join action is the correct approach for RATE-05.

3. **Channel count threshold of 5** — A normal single-page session uses 1 draft channel + optional wishlist channels. Five is a conservative threshold that catches accumulation from re-navigation without false positives.

## Deviations from Plan

None — plan executed exactly as written. The RATE-05 channel guard was added to `draft-realtime.ts` (subscribe method) and the middleware changes matched the plan specification.

## Verification

```
grep -n "deprecated" src/hooks/useSupabase.ts        # ✅ @deprecated on useRealtimeDraft
grep -n "beforeunload" src/lib/draft-realtime.ts     # ✅ addEventListener + removeEventListener
grep -n "getChannels" src/lib/draft-realtime.ts      # ✅ RATE-05 channel count guard
grep -n "wsConnect\|rl:ws" src/middleware.ts          # ✅ wsConnect limiter + rl:ws-connect prefix
npm run build                                         # ✅ Clean build, no TypeScript errors
```

## Commits

- `e08be59` — fix(25-02): fix useRealtimeDraft duplicate channel + add beforeunload safety net
- `294311d` — feat(25-02): add WebSocket connection rate limiting to middleware

## Self-Check: PASSED
