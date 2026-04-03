---
phase: 26-performance-caching-load-testing
plan: "02"
subsystem: performance
tags: [isr, caching, monitoring, api, supabase]
dependency_graph:
  requires: []
  provides: [isr-static-pages, monitoring-endpoint]
  affects: [about, privacy, terms, api/monitoring]
tech_stack:
  added: []
  patterns: [Next.js ISR revalidation, infrastructure monitoring endpoint]
key_files:
  created:
    - src/app/api/monitoring/route.ts
  modified:
    - src/app/about/page.tsx
    - src/app/privacy/page.tsx
    - src/app/terms/page.tsx
decisions:
  - ISR revalidate = 86400 (24h) chosen for purely static pages with no user-specific or frequently-changing content
  - Monitoring endpoint returns HTTP 200 for both ok and degraded states — consumers check status field, not HTTP code
  - DB latency measured via 3 averaged SELECT probes for representative end-to-end measurement
  - No authentication on monitoring endpoint — exposes only infrastructure metrics, no user data or secrets
metrics:
  duration: "~8 minutes"
  completed: "2026-04-03"
  tasks_completed: 2
  files_changed: 4
---

# Phase 26 Plan 02: ISR Static Pages + Monitoring Endpoint Summary

ISR revalidation added to 3 purely-static pages and `/api/monitoring` GET endpoint created returning active Realtime channel count and average DB query latency.

## Tasks Completed

### Task 1: Add ISR revalidation to static pages
**Commit:** 9a1b8c1

Added `export const revalidate = 86400` to three server-component pages that have no dynamic data:
- `src/app/about/page.tsx` — added after imports, before `export const metadata`
- `src/app/privacy/page.tsx` — added before `export const metadata`
- `src/app/terms/page.tsx` — added before `export const metadata`

All three pages confirmed as server components (no `'use client'` directive) with no dynamic data fetching (no `fetch()`, no Supabase queries, no `cookies()` or `headers()` calls). On Vercel, repeat requests within 24 hours are served from the ISR edge cache.

### Task 2: Create /api/monitoring endpoint
**Commit:** 98f12b9

Created `src/app/api/monitoring/route.ts` with:
- `GET /api/monitoring` returning `MonitoringResponse` JSON
- Active Realtime channel count via `supabase.getChannels().length` (reflects current Node.js instance channels)
- Average DB query latency via 3 consecutive `SELECT id FROM drafts LIMIT 1` probes
- `Cache-Control: no-store` to ensure fresh metrics on every request
- Null check for unconfigured Supabase — returns degraded status with -1 latency
- Exported `MonitoringResponse` type for downstream consumers
- HTTP 200 for both ok and degraded; 503 only on unhandled errors

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data or stub values. The monitoring endpoint returns real measured values.

## Self-Check: PASSED

Files exist:
- src/app/about/page.tsx — FOUND, contains `export const revalidate = 86400`
- src/app/privacy/page.tsx — FOUND, contains `export const revalidate = 86400`
- src/app/terms/page.tsx — FOUND, contains `export const revalidate = 86400`
- src/app/api/monitoring/route.ts — FOUND

Commits exist:
- 9a1b8c1 — ISR revalidation — FOUND
- 98f12b9 — monitoring endpoint — FOUND

TypeScript: No errors (npx tsc --noEmit passed)
