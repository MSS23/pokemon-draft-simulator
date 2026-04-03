# Phase 23: Critical Fixes & Cost Safeguards - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The production environment is verifiably safe from billing surprises and the most severe infrastructure risks, with no application code changes required. Covers: Supabase spend cap verification + billing alerts (SUPA-01), Upstash Redis production confirmation replacing broken in-memory fallback (RATE-01), and x-middleware-subrequest header stripping for CVE-2025-29927 defense-in-depth (SEC-05).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key research notes:
- Run `npm ls @upstash/ratelimit @upstash/redis` before adding — packages may already be installed
- Verify production Upstash env vars are set (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)
- The x-middleware-subrequest strip is a one-line addition to src/middleware.ts header deletions
- npm audit CI gate: add to package.json scripts or CI workflow
- Supabase spend cap and billing alerts are dashboard-only changes — document verification

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
