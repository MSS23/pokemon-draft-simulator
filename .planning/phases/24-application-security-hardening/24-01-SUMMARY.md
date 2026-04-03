---
phase: 24-application-security-hardening
plan: "01"
subsystem: middleware
tags: [security, auth, rate-limiting, clerk]
dependency_graph:
  requires: []
  provides: [clerk-auth-enforcement, hardened-rate-limiting]
  affects: [src/middleware.ts]
tech_stack:
  added: []
  patterns: [clerk-middleware-auth, x-clerk-user-id-header, authorized-parties]
key_files:
  created: []
  modified:
    - src/middleware.ts
decisions:
  - "Rate limit identity key changed from spoofable user_id cookie to Clerk-injected x-clerk-user-id header"
  - "authorizedParties set to draftpokemon.com + localhost:3000 with env var override"
  - "isAuthRequiredApiRoute covers /api/ai/*, /api/push/*, /api/formats/sync, /api/user/*"
  - "Public API routes (health, feedback, sheets, formats reads) explicitly exempted from auth requirement"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-03"
  tasks_completed: 2
  files_modified: 1
---

# Phase 24 Plan 01: Clerk Auth Enforcement + Rate Limit Hardening Summary

Enforced Clerk authentication at the middleware edge for mutating API routes and replaced spoofable cookie-based rate limit keys with verified Clerk user IDs.

## Tasks Completed

### Task 1: Harden rate limit identity key (RATE-03, RATE-04)

**Commit:** cdada0f

Replaced `getClientId()` to read `x-clerk-user-id` header (injected by clerkMiddleware from the verified JWT) instead of the `user_id` cookie (which any client could forge). Added two new upstash limiters and RATE_LIMITS entries:
- `/api/user`: 5/min (`rl:user`) — tight limit for destructive operations
- `/api/ai`: 10/hr (`rl:ai`) — expensive AI analysis throttled

IP-based fallback preserved for unauthenticated/public routes, with correct first-IP extraction from comma-separated `x-forwarded-for`.

### Task 2: Enforce Clerk auth on mutating API routes (SEC-01, RATE-02)

**Commit:** 03bb8d0 (merged with 24-02 parallel agent commit)

Added two new route matchers:
- `isAuthRequiredApiRoute`: `/api/ai/*`, `/api/push/*`, `/api/formats/sync`, `/api/user/*`
- `isPublicApiRoute`: `/api/health`, `/api/feedback`, `/api/sheets`, `/api/formats`

Middleware now returns `401 { error: 'Authentication required', requestId }` for any unauthenticated request to auth-required routes — defense-in-depth layer on top of route-level `auth()` calls.

Added `authorizedParties` to `clerkMiddleware()` options to reject JWTs from other Clerk applications. Supports `NEXT_PUBLIC_CLERK_AUTHORIZED_PARTIES` env var for production override; defaults to `['https://draftpokemon.com', 'http://localhost:3000']`.

## Deviations from Plan

None - plan executed exactly as written. Note: Task 2 changes were committed as part of a parallel agent's commit (24-02) rather than as a separate commit, since both agents modified the same file in the same worktree.

## Verification Results

All plan verification checks passed:
- No `cookies.get('user_id')` references remain in middleware.ts
- `x-clerk-user-id` header read in `getClientId()`
- `isAuthRequiredApiRoute` and `authorizedParties` present
- `/api/user` and `/api/ai` RATE_LIMITS entries present
- Build passes with zero TypeScript errors

## Known Stubs

None.

## Self-Check: PASSED

- src/middleware.ts modified: FOUND
- Commit cdada0f (Task 1): FOUND
- Commit 03bb8d0 (Task 2, merged): FOUND
- Build: PASSED
