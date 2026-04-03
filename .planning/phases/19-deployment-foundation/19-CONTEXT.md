# Phase 19: Deployment Foundation - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Deploy the Pokemon Draft app to draftpokemon.com via Vercel with working Clerk auth, SSL, and correct CSP headers. This is pure infrastructure — no feature work.

Requirements: DEPLOY-01 (Vercel + custom domain + SSL), DEPLOY-02 (CSP headers for Clerk CDN)

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints from research:
- CSP changes must only live in `next.config.ts`, not `vercel.json` (conflict risk)
- Clerk production keys (`pk_live_*`, `sk_live_*`) must be set in Vercel Production scope — not preview scope
- DNS needs up to 48h propagation — configure early
- Re-register Discord + Google OAuth callbacks against draftpokemon.com in Clerk dashboard

</decisions>

<code_context>
## Existing Code Insights

### Relevant Files
- `next.config.ts` — CSP headers configuration
- `.env.local` — current environment variables (Supabase, Clerk keys)
- `vercel.json` — if exists, Vercel configuration
- `src/middleware.ts` — Clerk middleware

### Integration Points
- Clerk auth requires production instance keys for custom domain
- Supabase connection uses env vars that may differ in production

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Follow Vercel and Clerk production deployment docs.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
