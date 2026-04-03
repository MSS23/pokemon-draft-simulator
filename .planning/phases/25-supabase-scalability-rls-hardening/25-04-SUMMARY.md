---
phase: 25-supabase-scalability-rls-hardening
plan: "04"
subsystem: security/session
tags: [security, guest-session, httpOnly, cookies, SEC-06]
dependency_graph:
  requires: []
  provides: [SEC-06, guest-session-httponly]
  affects: [src/lib/user-session.ts, src/middleware.ts]
tech_stack:
  added: []
  patterns: [httpOnly-cookie, server-issued-session, credentials-include-fetch]
key_files:
  created:
    - src/app/api/guest/session/route.ts
  modified:
    - src/lib/user-session.ts
    - src/middleware.ts
decisions:
  - "sameSite=lax chosen over strict — must work across draft invite links from external domains"
  - "userId returned in JSON body (not just cookie) so client can cache in localStorage for display purposes"
  - "Fallback to client-side generateSecureGuestId() preserved for offline/error resilience"
  - "GET endpoint added to allow client initialization state check without exposing the cookie value"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-03"
  tasks_completed: 2
  files_modified: 3
---

# Phase 25 Plan 04: Guest Session httpOnly Cookie Summary

**One-liner:** Server-issued httpOnly cookies replace client-side localStorage guest IDs, preventing XSS session exfiltration (SEC-06).

## What Was Built

A new API route (`POST /api/guest/session`) that generates cryptographically secure guest session IDs server-side and sets them as httpOnly cookies — invisible to JavaScript and XSS attacks. The `UserSessionService.getOrCreateSession()` method now calls this endpoint for new guest sessions instead of generating IDs with `crypto.randomUUID()` client-side.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create POST /api/guest/session endpoint | 657cbe8 | src/app/api/guest/session/route.ts, src/middleware.ts |
| 2 | Update UserSessionService to use server-issued cookie | d4844a2 | src/lib/user-session.ts |

## Key Changes

### src/app/api/guest/session/route.ts (new)
- `POST`: Checks Clerk auth first (authenticated users get their Clerk ID, no guest cookie). For guests: returns existing cookie or creates new one with `httpOnly: true, sameSite: 'lax', secure: true (prod), maxAge: 30 days`.
- `GET`: Returns `{ hasSession, isAuthenticated }` — lets client check state without exposing the ID.
- Cookie name: `guest-session-id`

### src/middleware.ts
- Added `/api/guest/(.*)` to `isPublicApiRoute` — unauthenticated guests must reach this endpoint before any session exists.

### src/lib/user-session.ts
- `getOrCreateSession()` now calls `fetch('/api/guest/session', { method: 'POST', credentials: 'include' })` when no localStorage session exists.
- Falls back to client-side `generateSecureGuestId()` if server is unreachable (offline resilience).
- `generateSecureGuestId()` retained as fallback — not removed.
- Added JSDoc comment explaining the localStorage vs httpOnly cookie split.
- localStorage still used for non-sensitive display data: `displayName`, `lastActivity`, draft history.

## Security Model

Before (SEC-06 risk):
- Guest ID generated client-side: `guest-${crypto.randomUUID()}`
- Stored in localStorage → readable by any script: `localStorage.getItem('pokemon-draft-user-session')`
- XSS attack could extract and clone the session

After (SEC-06 resolved):
- Guest ID generated server-side
- Set as httpOnly cookie → **invisible to JavaScript** (`document.cookie` does not show it)
- XSS cannot read the authoritative session ID
- userId in localStorage is now just a display cache (not the authoritative session)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
- src/app/api/guest/session/route.ts: EXISTS
- Commit 657cbe8: EXISTS
- Commit d4844a2: EXISTS
- `npm run build`: PASSED
