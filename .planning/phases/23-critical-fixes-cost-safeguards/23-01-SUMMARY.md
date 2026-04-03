---
phase: 23-critical-fixes-cost-safeguards
plan: "01"
subsystem: security
tags: [security, middleware, rate-limiting, ci, cve]
dependency_graph:
  requires: []
  provides: [CVE-2025-29927-defense, redis-error-visibility, ci-audit-gate]
  affects: [src/middleware.ts, .github/workflows/ci.yml]
tech_stack:
  added: []
  patterns: [edge-header-strip, console-error-telemetry, npm-audit-ci-gate]
key_files:
  created: []
  modified:
    - src/middleware.ts
    - .github/workflows/ci.yml
    - src/app/league/[id]/schedule/page.tsx
decisions:
  - Strip x-middleware-subrequest unconditionally at edge before any auth checks
  - Upgrade Redis missing-config warning to console.error CRITICAL so it surfaces in Vercel logs
  - Use --audit-level=high for CI gate (moderate/low non-blocking, high/critical blocking)
  - Keep in-memory fallback for local dev; make production fallbacks visible via error logs
metrics:
  duration: "~12 minutes"
  completed: "2026-04-03"
  tasks_completed: 3
  files_modified: 3
---

# Phase 23 Plan 01: CVE Defense, Rate Limiter Hardening, CI Audit Gate Summary

Zero-risk CVE defense-in-depth: edge header strip for CVE-2025-29927, Redis misconfiguration surfaced as CRITICAL error logs, and a non-optional CI gate blocking builds with high/critical npm audit findings.

## What Was Built

### Task 1: Strip x-middleware-subrequest header (SEC-05)

Added header stripping as the very first operation inside `clerkMiddleware`. A mutable `requestHeaders` copy is created from `request.headers`, the `x-middleware-subrequest` header is deleted unconditionally, and the stripped copy is passed through to `NextResponse.next()` and used for `requestId` extraction. This closes the CVE-2025-29927 middleware bypass vector at the edge before any auth checks.

### Task 2: Harden Upstash Redis enforcement (RATE-01)

Replaced `console.warn` with `console.error` for the missing Redis config message, including a CRITICAL label and explicit instruction to set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Also added a `console.error` in the Redis catch block so any runtime Redis failure surfaces in Vercel function logs rather than being swallowed silently.

### Task 3: npm audit CI gate (SEC-05 defense-in-depth)

Added a "Security Audit" step to `.github/workflows/ci.yml` between `npm ci` and `Lint`, running `npm audit --audit-level=high` with `continue-on-error: false`. The build fails on critical or high severity CVEs; moderate and low findings are reported but non-blocking.

## Key Files Modified

- `/src/middleware.ts` — header strip + Redis error logging hardening
- `/.github/workflows/ci.yml` — Security Audit step added (position: after npm ci, before Lint)
- `/src/app/league/[id]/schedule/page.tsx` — prefix unused `totalWeeks` with `_` to unblock build

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing lint error prevented build from completing**
- **Found during:** Build verification after Task 2
- **Issue:** `'totalWeeks' is assigned a value but never used` in `src/app/league/[id]/schedule/page.tsx:137`. The variable was declared but `league.totalWeeks` was used directly in the JSX below.
- **Fix:** Renamed `totalWeeks` to `_totalWeeks` to satisfy the `@typescript-eslint/no-unused-vars` rule (allowed pattern for intentionally unused vars).
- **Files modified:** `src/app/league/[id]/schedule/page.tsx`
- **Commit:** cda7293

## Known Stubs

None.

## Self-Check

### Created files exist
- No new files created — N/A

### Commits exist
- cda7293: feat(23-01): strip x-middleware-subrequest header + harden Redis error logging
- 1841d67: feat(23-01): add npm audit CI gate blocking critical/high CVEs

### Build verification
- `npm run build` exits 0 after clearing `.next` cache
- All lint issues are warnings only (pre-existing, not introduced by this plan)
- Remaining warnings are out-of-scope pre-existing issues (img vs Image, useEffect deps)

## Self-Check: PASSED
