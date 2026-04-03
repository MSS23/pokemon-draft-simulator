# Phase 26: Performance, Caching & Load Testing - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Static Pokemon data is served from CDN cache, TanStack Query stale times reflect actual data volatility, and a k6 load test confirms the hardened stack handles concurrent draft traffic. Covers: PokeAPI CDN cache headers (PERF-01), TanStack Query staleTime optimization (PERF-02), ISR for static pages (PERF-03), k6 load testing suite (PERF-04), connection pool monitoring (PERF-05).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — performance optimization phase. Use ROADMAP success criteria and research findings to guide decisions.

Key research notes:
- PokeAPI responses: Add Cache-Control: s-maxage=86400 for CDN caching (Pokemon data is static)
- TanStack Query: Static data (Pokemon, formats) get staleTime 30min+. Draft state stays at 0.
- ISR: Landing page, format explainers, and other marketing pages convert to ISR
- k6: Standalone binary, not npm. Scripts go in tests/load/. Test after broadcast migration.
- Monitoring: Expose active Realtime connection count and DB query latency without Supabase dashboard

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — performance optimization phase.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
