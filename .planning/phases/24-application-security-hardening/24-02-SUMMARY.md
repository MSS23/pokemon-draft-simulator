---
phase: 24-application-security-hardening
plan: "02"
subsystem: security
tags: [csp, nonce, middleware, xss-defense]
dependency_graph:
  requires: [24-01]
  provides: [nonce-based-csp]
  affects: [src/middleware.ts, next.config.ts, src/app/layout.tsx]
tech_stack:
  added: []
  patterns: [per-request-nonce-csp, edge-middleware-security-headers]
key_files:
  created: []
  modified:
    - src/middleware.ts
    - next.config.ts
    - src/app/layout.tsx
decisions:
  - unsafe-eval removed from script-src (framer-motion confirmed not using eval())
  - unsafe-inline kept on style-src (Radix UI + Tailwind requirement, deferred to SEC-F02)
  - Clerk FAPI URL derived from NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY env var (not hardcoded)
  - RootLayout made async to read x-nonce header from middleware
metrics:
  duration: "269s (~4.5 min)"
  completed: "2026-04-03T09:10:56Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 24 Plan 02: Nonce-Based CSP Migration Summary

**One-liner:** Per-request cryptographic nonce replaces static unsafe-eval CSP via Next.js edge middleware.

## What Was Built

Migrated Content-Security-Policy from a static string in `next.config.ts` to a per-request nonce-based policy generated in Next.js middleware. Each request now receives a unique crypto nonce that inline scripts must present to execute — attackers who inject script tags cannot guess the nonce.

Key changes:
- `generateNonce()` — uses `crypto.randomUUID()` (Edge runtime native), base64-encoded
- `buildCSP(nonce)` — constructs full CSP string with nonce in `script-src`, Clerk FAPI URL derived from env var
- `unsafe-eval` removed from `script-src` (framer-motion confirmed to not use `eval()`)
- `x-nonce` request header forwarded to Next.js RSC layer for consumption by `<Script>` components
- `Content-Security-Policy` response header set on every HTML response via middleware
- `RootLayout` made async to read `x-nonce` from `headers()`, passes nonce to beforeInteractive `<Script>` component

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `03bb8d0` | feat(24-02): nonce-based CSP in middleware, remove static CSP from next.config |
| Task 2 | `ffd047b` | feat(24-02): wire nonce to RootLayout for CSP script compliance |

## Verification Results

1. `grep "Content-Security-Policy" next.config.ts` — no results (static CSP removed)
2. `grep "buildCSP\|generateNonce\|x-nonce" src/middleware.ts` — all three present
3. `grep "unsafe-eval" src/middleware.ts` — only in comment, not in directive
4. `grep "nonce-" src/middleware.ts` — `'nonce-${nonce}'` present in scriptSrc
5. `grep "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" src/middleware.ts` — env var derivation confirmed
6. `npm run build` — passes with no TypeScript errors

## Deviations from Plan

None - plan executed exactly as written.

The middleware had already been extended by Plan 01 (auth enforcement, additional rate limit routes for `/api/ai/` and `/api/user/`). The nonce injection code was added to the updated middleware without conflict.

**Note on route rendering:** Making `RootLayout` async causes most pages to switch from `○` (static) to `ƒ` (dynamic) in the build output. This is expected — pages that were purely static can no longer be pre-rendered because the root layout now reads per-request headers. This is the correct behavior for nonce-based CSP (nonces must be unique per request).

## Known Stubs

None. All nonce wiring is fully functional — middleware generates the nonce, sets `x-nonce` request header, `RootLayout` reads it and passes it to the `<Script>` component.

## Self-Check: PASSED

Files exist:
- `src/middleware.ts` — FOUND, contains generateNonce, buildCSP, x-nonce injection
- `next.config.ts` — FOUND, Content-Security-Policy entry removed
- `src/app/layout.tsx` — FOUND, async RootLayout with nonce wired to Script component

Commits exist:
- `03bb8d0` — FOUND
- `ffd047b` — FOUND
