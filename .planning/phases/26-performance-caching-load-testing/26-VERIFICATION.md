---
phase: 26-performance-caching-load-testing
verified: 2026-04-03T10:07:19Z
status: gaps_found
score: 8/9 must-haves verified
re_verification: false
gaps:
  - truth: "A PokeAPI response for any Pokemon served through the app includes CDN-cacheable headers on repeat requests"
    status: partial
    reason: "The proxy route src/app/api/pokemon/[id]/route.ts exists with correct s-maxage=86400 and stale-while-revalidate=3600 headers, but no client-side code routes through it. fetchPokemon() in pokemon-api.ts still calls pokeapi.co directly. The CDN layer exists but is bypassed by all real app traffic. The plan's own NOTE explicitly deferred client wiring to future work, but the stated truth and PERF-01 requirement claim the app serves CDN-cached responses — which is not true for current traffic."
    artifacts:
      - path: "src/app/api/pokemon/[id]/route.ts"
        issue: "Route exists and is correctly implemented, but is not called from anywhere in the codebase"
      - path: "src/lib/pokemon-api.ts"
        issue: "fetchPokemon() still fetches directly from pokeapi.co/api/v2 — not routed through the proxy"
    missing:
      - "Wire fetchPokemon() in pokemon-api.ts (or the usePokemon hooks) to call /api/pokemon/{id} instead of pokeapi.co directly so Vercel Edge Network actually caches responses for real app traffic"
human_verification:
  - test: "Verify CDN cache HIT on repeat request"
    expected: "Second request to GET /api/pokemon/pikachu returns X-Vercel-Cache: HIT header on Vercel deployment"
    why_human: "Cannot verify Vercel Edge Network caching behavior without a live Vercel deployment — requires network inspection in a browser against draftpokemon.com"
  - test: "Confirm k6 load test passes p95 < 500ms threshold against staging"
    expected: "k6 run output shows all three thresholds PASSED: pick_latency p95<500, http_req_failed rate<0.01, http_req_duration p95<500"
    why_human: "Requires a running Supabase instance with an active test draft — cannot execute k6 binary in this environment"
---

# Phase 26: Performance, Caching & Load Testing Verification Report

**Phase Goal:** Static Pokemon data is served from CDN cache, TanStack Query stale times reflect actual data volatility, and a k6 load test confirms the hardened stack handles concurrent draft traffic
**Verified:** 2026-04-03T10:07:19Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A PokeAPI response for any Pokemon served through the app includes CDN-cacheable headers on repeat requests | PARTIAL | Proxy route has correct headers but is not called by any app code — traffic bypasses it |
| 2 | The draft page does not trigger a PokeAPI network fetch if Pokemon data was loaded within the last 30 minutes | VERIFIED | All 5 Pokemon hooks in usePokemon.ts have staleTime: 30 * 60 * 1000 with PERF-02 comment |
| 3 | The format Pokemon list (usePokemonListByFormat) does not re-fetch within a 30-minute window | VERIFIED | usePokemonListByFormat has staleTime: 30 * 60 * 1000 confirmed at line 60 |
| 4 | The global TanStack Query default staleTime remains unchanged (5 min) so draft state queries are unaffected | VERIFIED | QueryProvider.tsx staleTime: 5 * 60 * 1000 unchanged, confirmed at line 16 |
| 5 | The about, privacy, and terms pages are served from ISR cache on repeat Vercel requests (no SSR re-render) | VERIFIED | All three pages export revalidate = 86400 with PERF-03 comment, no 'use client' on any |
| 6 | GET /api/monitoring returns active Supabase Realtime connection count and average DB query latency | VERIFIED | monitoring/route.ts implements getChannels().length and 3-probe SELECT latency measurement |
| 7 | The monitoring endpoint is accessible without authentication (read-only infrastructure metrics) | VERIFIED | No auth on monitoring route; returns 200 for both ok and degraded states |
| 8 | A k6 load test script exists that simulates 8 concurrent players making draft picks | VERIFIED | tests/load/draft-load-test.js: vus: 8, constant-vus executor, 60s duration |
| 9 | The test script validates p95 pick latency under 500ms and tracks failed pick requests | VERIFIED | Thresholds: pick_latency p(95)<500, http_req_failed rate<0.01, custom Trend metric |

**Score:** 8/9 truths verified (1 partial)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/pokemon/[id]/route.ts` | CDN proxy with s-maxage=86400 | ORPHANED | File exists (67 lines), substantive, correct headers — but zero call sites in codebase |
| `src/hooks/usePokemon.ts` | All 5 hooks with staleTime 30 min | VERIFIED | All 5 hooks confirmed: usePokemon, usePokemonList, usePokemonListByFormat, usePokemonByType, usePokemonByIds |
| `src/components/providers/QueryProvider.tsx` | Global default stays at 5 min | VERIFIED | staleTime: 5 * 60 * 1000 at line 16, unchanged |
| `src/app/about/page.tsx` | export const revalidate = 86400 | VERIFIED | Line 24, server component confirmed (no 'use client') |
| `src/app/privacy/page.tsx` | export const revalidate = 86400 | VERIFIED | Line 4, server component confirmed |
| `src/app/terms/page.tsx` | export const revalidate = 86400 | VERIFIED | Line 4, server component confirmed |
| `src/app/api/monitoring/route.ts` | GET returning realtimeConnections + avgQueryLatencyMs | VERIFIED | Implements getChannels(), 3-probe latency, Cache-Control: no-store, null guard, exported type |
| `tests/load/draft-load-test.js` | k6 script: 8 VUs, pick_latency Trend, p95<500ms | VERIFIED | All acceptance criteria met — 207 lines, all patterns present |
| `tests/load/README.md` | k6 install instructions + run commands | VERIFIED | Covers macOS/Windows/Linux install, env vars table, run commands, PERF-04 criteria |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/hooks/usePokemon.ts` | `src/app/api/pokemon/[id]/route.ts` | fetch call to /api/pokemon/{id} | NOT_WIRED | usePokemon.ts imports from pokemon-api.ts which calls pokeapi.co directly; proxy has zero import or fetch references in the entire src/ tree |
| `src/app/api/monitoring/route.ts` | supabase | getChannels() + SELECT probe | WIRED | Line 31: getChannels().length; Lines 40-44: 3-iteration SELECT probe with timing |
| `tests/load/draft-load-test.js` | Supabase REST API | POST to make_draft_pick RPC | WIRED | Line 159: http.post to /rest/v1/rpc/make_draft_pick using __ENV vars |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `src/app/api/monitoring/route.ts` | realtimeConnections | supabase.getChannels().length | Yes — live channel count from Supabase client | FLOWING |
| `src/app/api/monitoring/route.ts` | avgQueryLatencyMs | 3x SELECT from drafts table via Supabase | Yes — real DB round-trip timing | FLOWING |
| `src/app/api/pokemon/[id]/route.ts` | response body | upstream fetch to pokeapi.co | Yes — passes through raw PokeAPI JSON | FLOWING (but unreachable from app) |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Proxy route file exists with CDN headers | grep -c "s-maxage=86400" src/app/api/pokemon/[id]/route.ts | 1 match | PASS |
| All 5 Pokemon hooks have 30-min staleTime | grep -c "30 \* 60 \* 1000" src/hooks/usePokemon.ts | 5 matches (lines 22, 33, 60, 73, 150) | PASS |
| QueryProvider unchanged at 5 min | grep "staleTime" src/components/providers/QueryProvider.tsx | 5 * 60 * 1000 | PASS |
| k6 script has all required patterns | grep -c "make_draft_pick\|pick_latency\|p(95)<500\|vus: 8" | All present | PASS |
| k6 not in package.json | grep "k6" package.json | No match | PASS |
| TypeScript compiles clean | npx tsc --noEmit | Zero errors | PASS |
| All 6 commits exist in git | git log --oneline | c19bace, a4f8477, 9a1b8c1, 98f12b9, c27f489, 5ca1ca5 | PASS |
| Proxy has no call sites in codebase | grep -r "api/pokemon" src/ | Zero results | FAIL — proxy unreachable |
| k6 run against Supabase | requires live deployment | Cannot execute | SKIP (needs human) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PERF-01 | 26-01 | PokeAPI responses served with CDN cache headers (long TTL for static data) | PARTIAL | Proxy route created with correct headers but no app code routes through it — CDN headers only reachable if the proxy URL is called |
| PERF-02 | 26-01 | TanStack Query staleTime optimized per query type (static data 30min+, draft state 0) | SATISFIED | All 5 Pokemon hooks at 30 min; QueryProvider global default at 5 min for draft state |
| PERF-03 | 26-02 | Static/semi-static pages converted to ISR where applicable | SATISFIED | about, privacy, terms all export revalidate = 86400; confirmed server components |
| PERF-04 | 26-03 | k6 load testing suite covering draft creation, picks, realtime subscriptions, and concurrent users | SATISFIED | tests/load/draft-load-test.js with 8 VUs, p95<500ms, error rate<1% thresholds |
| PERF-05 | 26-02 | Connection pool monitoring dashboard (active Realtime connections, DB query latency) | SATISFIED | GET /api/monitoring returns realtimeConnections and avgQueryLatencyMs with no-store cache; no auth required |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/load/draft-load-test.js` | 148 | `p_team_id: 'team-slot-${teamSlot}'` — placeholder team ID strings | Info | Documented in SUMMARY and README as intentional. Test measures HTTP latency, not turn-order acceptance. Real test requires actual UUIDs — clearly stated. |

No blockers or warnings. The placeholder team IDs are a known, documented limitation of the load test design.

---

### Human Verification Required

#### 1. CDN Cache HIT Verification

**Test:** Deploy to Vercel and make two consecutive GET requests to `/api/pokemon/pikachu`
**Expected:** Second response has `X-Vercel-Cache: HIT` header (or equivalent CDN cache indicator)
**Why human:** Vercel Edge Network caching is only observable on a live Vercel deployment — cannot verify locally or programmatically without a deployed environment

#### 2. k6 Load Test Execution

**Test:** Install k6 binary, create a test draft with 8 teams in active status, run `k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e DRAFT_ID=... tests/load/draft-load-test.js`
**Expected:** k6 summary shows all three thresholds PASSED: `pick_latency p(95)<500`, `http_req_failed rate<0.01`, `http_req_duration{scenario:draft_picks} p(95)<500`
**Why human:** Requires a running k6 binary, a live Supabase instance, and a pre-configured active draft — cannot execute in static code analysis

---

### Gaps Summary

**1 gap found: PERF-01 proxy route is orphaned (not wired to app traffic)**

The `/api/pokemon/[id]` proxy route is correctly implemented with all required CDN headers (`s-maxage=86400`, `stale-while-revalidate=3600`). However, `fetchPokemon()` in `pokemon-api.ts` continues to call `https://pokeapi.co/api/v2/pokemon/{id}` directly, bypassing the proxy entirely. A grep of the entire `src/` tree finds zero references to `/api/pokemon`.

The 26-01-PLAN.md NOTE at line 122 explicitly states: "The existing `fetchPokemon` in `pokemon-api.ts` calls PokeAPI directly (client-side) and is NOT modified in this task... This proxy is the server-side caching layer for future use." This means the executor deliberately deferred the wiring — but the stated truth ("PokeAPI responses served through the app include CDN-cacheable headers") and PERF-01 requirement ("PokeAPI responses served with CDN cache headers") cannot be fully satisfied until the wiring is completed.

The fix is straightforward: update `fetchPokemon()` in `pokemon-api.ts` to call `/api/pokemon/${identifier}` (relative URL for server-side, or the app's base URL client-side) instead of `https://pokeapi.co/api/v2/pokemon/${identifier}`. Alternatively, update the usePokemon hooks' queryFns to call the proxy URL directly.

All other truths (PERF-02 through PERF-05) are fully satisfied with substantive, wired, and data-flowing implementations.

---

_Verified: 2026-04-03T10:07:19Z_
_Verifier: Claude (gsd-verifier)_
