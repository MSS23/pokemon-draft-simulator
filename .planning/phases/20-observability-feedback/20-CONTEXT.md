# Phase 20: Observability & Feedback - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Wire Sentry error monitoring, PostHog analytics, and a floating Discord feedback button across the app. Requirements: DEPLOY-03 (Sentry), DEPLOY-04 (PostHog), LAND-04 (feedback widget).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase with minor UI work.

Key constraints from research:
- PostHog must be initialized via `instrumentation-client.ts` (Next.js 15.3+) to avoid hydration errors
- Sentry and PostHog must be initialized in SEPARATE files
- Gate both on `NODE_ENV === 'production'` AND hostname check (no noise from localhost/preview)
- Test hydration in production build mode (`npm run build && npm start`)
- Existing `src/lib/analytics.ts` has typed event functions — wire call sites, don't rebuild
- Existing `/feedback` page uses Discord webhook — feedback widget should reuse this
- Floating feedback button on all pages (passive, not modal-on-load)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/analytics.ts` — Typed analytics event functions (already built, call sites not wired)
- `src/app/feedback/page.tsx` — Existing feedback page with Discord webhook integration
- Discord webhook already configured in env vars

### Integration Points
- Root layout (`src/app/layout.tsx`) — feedback button and analytics providers go here
- `src/middleware.ts` — Clerk middleware, may need Sentry integration
- `.env.local` has `SENTRY_DSN` stub mentioned in CLAUDE.md

</code_context>

<specifics>
## Specific Ideas

- User wants feedback to go to Discord only (not email, not Sentry feedback)
- Sentry for error monitoring, PostHog for user analytics (separate concerns)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
