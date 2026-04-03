# Phase 24: Application Security Hardening - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Authenticated routes enforce Clerk identity at the handler level, CSP removes unsafe directives, all mutation inputs are validated server-side, and CORS is locked to production domains. Covers: Clerk authorizedParties enforcement (SEC-01), CSP nonce migration (SEC-02), guest write-path server validation (SEC-03), CORS restriction (SEC-04), input sanitization audit (SEC-07), per-endpoint rate limits (RATE-02), rate limit bypass prevention (RATE-03), IP-based fallback rate limiting (RATE-04).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — security infrastructure phase. Use ROADMAP success criteria and research findings to guide decisions.

Key research notes:
- CSP: Run `grep -r "eval(" node_modules/framer-motion/dist/` before committing to unsafe-eval removal. Use Content-Security-Policy-Report-Only first. Derive Clerk FAPI URL from env var.
- Auth: Audit every `auth()` call site across all API routes. Middleware-only auth is the current gap.
- Input sanitization: Run `grep -r "dangerouslySetInnerHTML" src/` to scope XSS work. Install isomorphic-dompurify (not plain DOMPurify).
- CORS: Lock to production domain(s) only in API route headers.
- Rate limiting: Key by Clerk userId for authenticated, IP for unauthenticated. Tune per-endpoint limits.
- Guest validation: Verify guest ID exists in database before allowing mutations.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — security infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
