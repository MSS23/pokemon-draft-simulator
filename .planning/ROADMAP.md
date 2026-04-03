# ROADMAP.md — Milestone 5: Security Hardening & Scalability Audit

**Milestone:** Security Hardening & Scalability Audit
**Phases:** 4 (Phases 23–26, continuing from Milestone 4)
**Coverage:** 22/22 requirements mapped

---

## Phases

- [x] **Phase 23: Critical Fixes & Cost Safeguards** — Production environment verified safe, billing guarded, CVE defense-in-depth applied with zero app code changes (completed 2026-04-03)
- [x] **Phase 24: Application Security Hardening** — Auth enforcement, CSP nonce migration, input sanitization, and CORS close concrete exploit vectors (completed 2026-04-03)
- [ ] **Phase 25: Supabase Scalability & RLS Hardening** — RLS indexes, broadcast migration for picks/bids, and channel cleanup eliminate per-subscriber fan-out cost
- [ ] **Phase 26: Performance, Caching & Load Testing** — CDN caching, query staleTime optimization, monitoring dashboard, and k6 load tests validate the hardened stack

---

## Phase Details

### Phase 23: Critical Fixes & Cost Safeguards
**Goal**: The production environment is verifiably safe from billing surprises and the most severe infrastructure risks, with no application code changes required
**Depends on**: Nothing (first phase of this milestone)
**Requirements**: SEC-05, RATE-01, SUPA-01
**Success Criteria** (what must be TRUE):
  1. Supabase billing dashboard shows a spend cap enabled and at least one billing alert configured at a threshold below the cap
  2. Production Upstash Redis rate limiter is confirmed active (not the in-memory fallback) — verified by checking that rate limit state persists across a Vercel cold start cycle
  3. Any HTTP request containing the `x-middleware-subrequest` header is stripped at the edge before reaching application middleware
  4. `npm audit` returns zero critical or high CVEs, or all findings are documented with accepted-risk justification
**Plans**: 2 plans

Plans:
- [x] 23-01-PLAN.md — Middleware CVE strip, Upstash Redis logging hardening, npm audit CI gate
- [x] 23-02-PLAN.md — Supabase spend cap and billing alert (dashboard checkpoint)

### Phase 24: Application Security Hardening
**Goal**: Authenticated routes enforce Clerk identity at the handler level, CSP removes unsafe directives, all mutation inputs are validated server-side, and CORS is locked to production domains
**Depends on**: Phase 23 (production baseline verified before touching auth and CSP)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-07, RATE-02, RATE-03, RATE-04
**Success Criteria** (what must be TRUE):
  1. A forged request to any mutating API route with a missing or invalid Clerk JWT returns 401 — even if middleware is bypassed
  2. The browser console shows no CSP violations during a full auth flow (sign-in, token refresh, draft pick) on draftpokemon.com
  3. A guest user who submits a pick request with a fabricated guest ID that does not match their server-issued session receives a 403 error
  4. An OPTIONS preflight from a non-production origin to any API route receives a non-permissive CORS response (no `Access-Control-Allow-Origin: *`)
  5. A draft name or team name containing an XSS payload is stored and displayed without script execution in any browser
**Plans**: 3 plans

Plans:
- [x] 24-01-PLAN.md — Clerk auth enforcement on mutating API routes + rate limit key hardening (SEC-01, RATE-02, RATE-03, RATE-04)
- [x] 24-02-PLAN.md — CSP nonce migration, unsafe-eval removal (SEC-02)
- [x] 24-03-PLAN.md — CORS restriction, guest write-path validation, input sanitization (SEC-03, SEC-04, SEC-07)

### Phase 25: Supabase Scalability & RLS Hardening
**Goal**: Real-time draft events flow through broadcast channels instead of postgres_changes fan-out, RLS policies execute without per-subscriber index scans, and connection leaks are eliminated
**Depends on**: Phase 24 (server-side auth must be correct before pick/bid services send authenticated broadcast events; CSP must be stable before guest httpOnly cookie endpoint is added to allowlist)
**Requirements**: SEC-06, RATE-05, SUPA-02, SUPA-03, SUPA-04, SUPA-05
**Success Criteria** (what must be TRUE):
  1. An 8-player draft with all players actively picking shows no RLS fan-out queries in the Supabase query performance advisor — pick INSERTs trigger one DB write, not N per-subscriber RLS evaluations
  2. Guest sessions are issued as httpOnly cookies from the server — a guest user's session ID is not readable from `document.cookie` or `localStorage` in the browser console
  3. Navigating away from and back to the draft page shows the same channel count in `supabase.getChannels()` — no channel accumulation across navigation cycles
  4. WebSocket connection attempts beyond the per-user limit receive an explicit rate-limit rejection rather than silently queuing
  5. The Supabase Performance Advisor shows no RLS-related lint warnings for the `user_id`, `draft_id`, and `team_id` indexed columns
**Plans**: TBD

### Phase 26: Performance, Caching & Load Testing
**Goal**: Static Pokemon data is served from CDN cache, TanStack Query stale times reflect actual data volatility, and a k6 load test confirms the hardened stack handles concurrent draft traffic
**Depends on**: Phase 25 (load test must run against the broadcast model — testing before broadcast migration measures the wrong architecture)
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, PERF-05
**Success Criteria** (what must be TRUE):
  1. A PokeAPI response for any Pokemon served through the application includes `Cache-Control: s-maxage=86400` headers — verified in browser Network tab showing a CDN cache hit on second request
  2. Opening the draft room does not trigger a PokeAPI fetch if the data was loaded within the last 30 minutes — TanStack Query returns cached data without a network request
  3. The `/` landing page loads from ISR cache on repeat visits — Vercel deployment logs show `Cache: HIT` on static page requests
  4. A k6 load test simulating 8 concurrent players drafting (all making picks, real-time subscriptions active) completes with p95 pick latency under 500ms and zero failed pick requests
  5. A monitoring view shows current active Realtime connection count and average DB query latency — accessible without querying the Supabase dashboard directly
**Plans**: TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 23. Critical Fixes & Cost Safeguards | 2/2 | Complete    | 2026-04-03 |
| 24. Application Security Hardening | 3/3 | Complete   | 2026-04-03 |
| 25. Supabase Scalability & RLS Hardening | 0/? | Not started | - |
| 26. Performance, Caching & Load Testing | 0/? | Not started | - |

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| SEC-01 | Phase 24 |
| SEC-02 | Phase 24 |
| SEC-03 | Phase 24 |
| SEC-04 | Phase 24 |
| SEC-05 | Phase 23 |
| SEC-06 | Phase 25 |
| SEC-07 | Phase 24 |
| RATE-01 | Phase 23 |
| RATE-02 | Phase 24 |
| RATE-03 | Phase 24 |
| RATE-04 | Phase 24 |
| RATE-05 | Phase 25 |
| SUPA-01 | Phase 23 |
| SUPA-02 | Phase 25 |
| SUPA-03 | Phase 25 |
| SUPA-04 | Phase 25 |
| SUPA-05 | Phase 25 |
| PERF-01 | Phase 26 |
| PERF-02 | Phase 26 |
| PERF-03 | Phase 26 |
| PERF-04 | Phase 26 |
| PERF-05 | Phase 26 |

**Coverage:** 22/22 requirements mapped. No orphans.

---

## Research Flags (Implementation Notes)

- **Phase 23**: Run `npm ls @upstash/ratelimit @upstash/redis` before touching rate limiter — packages may already be installed. Verify production Upstash env vars are set in Vercel dashboard (not just .env.local). The `x-middleware-subrequest` strip is a one-line addition to `src/middleware.ts` header deletions — zero risk, do it first.
- **Phase 24 (CSP)**: Run `grep -r "eval(" node_modules/framer-motion/dist/` before committing to `unsafe-eval` removal — Framer Motion may require it. Use `Content-Security-Policy-Report-Only` in staging first to surface violations without blocking. Derive Clerk FAPI URL from environment variable, never hardcode. Test full auth flow including 60-second token refresh after any CSP change.
- **Phase 24 (Auth)**: Audit every `auth()` call site across all API routes — grep `src/app/api` for files that call Supabase mutations without a preceding `auth()` check. Middleware-only auth is the current gap.
- **Phase 24 (Input sanitization)**: Run `grep -r "dangerouslySetInnerHTML" src/` at phase start to scope XSS work accurately. Install `isomorphic-dompurify` (not plain DOMPurify — plain throws in SSR via Next.js issue #46893).
- **Phase 25 (RLS/Clerk)**: Confirm which JWT integration path is active (legacy Clerk template vs. native Supabase integration) by reviewing `FIX-RLS-POLICIES.md` before writing any new RLS policies. Never mix `auth.uid()` and the custom Clerk JWT helper — `auth.uid()` silently returns NULL for Clerk string user IDs. Always use the existing custom function.
- **Phase 25 (RLS Realtime)**: Keep SELECT policies draft-scoped (`USING (draft_id = $draft_id)`), not user-scoped — user-scoped SELECT policies silently drop events for spectators with no error thrown. Test every RLS migration by opening two browser tabs as different users.
- **Phase 25 (Broadcast migration)**: Map which tables must stay on `postgres_changes` (private per-user data like `wishlist_items`) before implementation. The blast radius covers `DraftRealtimeManager`, `draft-picks-service`, `auction-service`, and potentially `useWishlistSync`. Instrument `supabase.getChannels().length` in staging before starting to establish baseline.
- **Phase 26 (k6)**: Keep load test scripts in `tests/load/`. k6 is a standalone binary — not an npm package. Run load tests after Phase 25 broadcast migration is deployed; testing before migration measures the wrong architecture.
