---
phase: 24-application-security-hardening
plan: "03"
subsystem: security
tags: [cors, input-validation, guest-auth, sec-03, sec-04, sec-07]
dependency_graph:
  requires: [24-01]
  provides: [cors-helper, feedback-schema, push-subscribe-auth]
  affects: [src/middleware.ts, src/lib/cors.ts, src/lib/schemas.ts, src/app/api/feedback/route.ts, src/app/api/push/subscribe/route.ts, src/lib/draft-picks-service.ts]
tech_stack:
  added: []
  patterns: [CORS allowlist, Zod schema validation, Clerk auth cross-check]
key_files:
  created:
    - src/lib/cors.ts
  modified:
    - src/middleware.ts
    - src/lib/schemas.ts
    - src/app/api/feedback/route.ts
    - src/app/api/push/subscribe/route.ts
    - src/lib/draft-picks-service.ts
decisions:
  - Renamed `auth` WebPush key to `authToken` in push/subscribe route to avoid name collision with Clerk `auth()` import
  - CORS allowlist includes localhost:3000 in dev only (process.env.NODE_ENV !== 'production')
  - OPTIONS preflight handled at edge middleware for performance — avoids spinning up route handler
metrics:
  duration_seconds: 222
  completed_date: "2026-04-03T09:16:56Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 5
---

# Phase 24 Plan 03: CORS Hardening, Guest Validation, and Input Sanitization Summary

**One-liner:** CORS locked to production domains via edge middleware; guest pick mutations validated at DB level (documented); feedbackSchema added with Zod enum + max-length; push subscription user_id cross-checked against Clerk session.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create CORS helper and lock API routes to production domains | 18cbd1b | src/lib/cors.ts, src/middleware.ts |
| 2 | Guest write-path server validation and input sanitization | 27334c1 | src/lib/schemas.ts, src/app/api/feedback/route.ts, src/app/api/push/subscribe/route.ts, src/lib/draft-picks-service.ts |

## What Was Built

### SEC-04: CORS Helper (src/lib/cors.ts)

New module exporting:
- `ALLOWED_ORIGINS` — production domains (draftpokemon.com, www.draftpokemon.com) + localhost:3000 in dev + optional env var expansion
- `getAllowedOrigin(request)` — returns the origin if allowlisted, else null
- `applyCors(response, request)` — decorates any Response with CORS headers (no-op for non-allowlisted origins; never sets wildcard)
- `handleCorsPreflightIfNeeded(request)` — returns 204 for allowlisted OPTIONS, 403 for non-allowlisted OPTIONS, null for non-OPTIONS

OPTIONS preflight handling wired into `src/middleware.ts` at the edge before rate limiting and auth checks — rejects disallowed origins early and cheaply.

### SEC-07: Feedback Schema (src/lib/schemas.ts + src/app/api/feedback/route.ts)

`feedbackSchema` added to centralized schemas file:
- `category`: strict enum — `bug | feature | improvement | other` (blocks injection via category field)
- `title`: string min 1 max 200 trimmed
- `description`: string min 1 max 2000 trimmed
- `contact`: optional string max 100 trimmed

`/api/feedback` route migrated from manual if-checks to `validateRequestBody(feedbackSchema, body)`. Invalid JSON body returns 400 before schema parse.

### SEC-03: Push Subscribe User ID Cross-Check (src/app/api/push/subscribe/route.ts)

After successful Zod parse, `auth()` from Clerk is called. If a Clerk session exists and `clerkUserId !== user_id`, returns 403 with `"user_id does not match authenticated session"`. Guest users (no Clerk session, `clerkUserId` is null) are allowed to pass their guest ID directly — no regression for the guest flow.

Note: The existing WebPush `auth` key from the Zod-parsed body was renamed to `authToken` to avoid name collision with the `auth` function imported from `@clerk/nextjs/server`.

### SEC-03: Draft Pick Guest Validation (src/lib/draft-picks-service.ts)

No logic changes — the DB-level guard was already present. Added explicit SEC-03 comment in `validateUserCanPick` above the `getUserTeamViaService` call, documenting that a fabricated guest ID that was never registered via `joinDraft` will have no participant record and therefore `canPick` returns false, blocking the pick at the server.

## Verification Results

- `npm run build` — PASSED, zero TypeScript errors
- `npm test -- --run` — PASSED, 424 tests passing (16 test files)
- All six grep checks from the plan verification section pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Renamed WebPush `auth` key to `authToken` to prevent Clerk import collision**
- **Found during:** Task 2, Step 3
- **Issue:** `parsed.data` destructures `auth` (the WebPush VAPID auth key), which clashes with `import { auth } from '@clerk/nextjs/server'`. Using `auth` in the upsert body would call the Clerk function instead of passing the string.
- **Fix:** Renamed destructured key to `authToken`; updated upsert body to `auth: authToken`
- **Files modified:** src/app/api/push/subscribe/route.ts
- **Commit:** 27334c1

## Known Stubs

None — all changes are functional security controls with no placeholder data.

## Self-Check: PASSED

- src/lib/cors.ts: FOUND
- Commit 18cbd1b: FOUND
- Commit 27334c1: FOUND
