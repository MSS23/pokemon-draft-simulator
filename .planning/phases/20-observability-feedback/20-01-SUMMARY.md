---
phase: 20-observability-feedback
plan: 01
subsystem: observability
tags: [sentry, posthog, error-monitoring, analytics, production-gating]
dependency_graph:
  requires: []
  provides: [sentry-error-monitoring, posthog-analytics, hostname-gating]
  affects: [sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts, draft-service, draft-picks-service, draft-lifecycle-service]
tech_stack:
  added: []
  patterns: [hostname-gating, non-fatal-analytics, instrumentation-hook]
key_files:
  created:
    - src/app/global-error.tsx
    - src/instrumentation.ts
  modified:
    - sentry.client.config.ts
    - sentry.server.config.ts
    - sentry.edge.config.ts
    - src/lib/analytics.ts
    - src/lib/draft-service.ts
    - src/lib/draft-picks-service.ts
    - src/lib/draft-lifecycle-service.ts
decisions:
  - Hostname gating over NODE_ENV checks for production-only telemetry — prevents Vercel preview deploys from polluting dashboards
  - Server/edge use NEXT_PUBLIC_SITE_URL env var since window is unavailable
  - All analytics calls wrapped in try-catch to ensure non-fatal behavior
metrics:
  duration: ~3 minutes
  completed: 2026-04-03
---

# Phase 20 Plan 01: Sentry & PostHog Production Gating Summary

Sentry error monitoring hardened with hostname gating (client/server/edge), global error boundary, and Next.js instrumentation hook; PostHog analytics gated to draftpokemon.com with events wired at draft creation, pick, and start call sites.

## What Was Done

### Task 1: Harden Sentry configs with hostname gating and add global-error boundary + instrumentation hook
- **sentry.client.config.ts**: Replaced `beforeSend` dev filter with `enabled: isProduction` using `window.location.hostname === 'draftpokemon.com'`. Added `replaysOnErrorSampleRate: 1.0` and expanded `ignoreErrors` (ResizeObserver loop, Non-Error promise rejection).
- **sentry.server.config.ts**: Added `enabled: isProduction` gated on `NEXT_PUBLIC_SITE_URL === 'https://draftpokemon.com'`. Removed `beforeSend` filter.
- **sentry.edge.config.ts**: Same hostname gating pattern as server config.
- **src/app/global-error.tsx**: New Next.js App Router error boundary that calls `Sentry.captureException(error)` and provides a user-facing retry button.
- **src/instrumentation.ts**: New Next.js instrumentation hook that dynamically imports server/edge Sentry configs based on `NEXT_RUNTIME`, and exports `onRequestError = Sentry.captureRequestError`.

### Task 2: Add hostname gating to PostHog init and wire analytics events
- **src/lib/analytics.ts**: Added early return when `hostname !== 'draftpokemon.com'` — no PostHog noise from localhost or preview deploys.
- **src/lib/draft-service.ts**: Wired `analytics.draftCreated()` at end of `createDraft()` with format, draftType, teamCount.
- **src/lib/draft-picks-service.ts**: Wired `analytics.pickMade()` at end of `makePick()` with round calculation and cost.
- **src/lib/draft-lifecycle-service.ts**: Wired `analytics.draftStarted()` at end of `startDraft()` with participant count.
- All analytics calls wrapped in try-catch — analytics failures never break user flows.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 94cff54 | feat(20-01): harden Sentry configs with hostname gating and add global-error boundary + instrumentation hook |
| 2 | b0bb95e | feat(20-01): add PostHog hostname gating and wire analytics events at key call sites |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functionality is fully wired. Analytics events will only fire when PostHog key is set and hostname matches draftpokemon.com.

## Self-Check: PASSED

All 10 files verified present. Both commits (94cff54, b0bb95e) confirmed in git log.
