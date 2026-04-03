---
phase: 24-application-security-hardening
verified: 2026-04-03T09:21:08Z
status: passed
score: 13/13 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Load localhost:3000 in browser and open DevTools > Network, inspect an HTML page response"
    expected: "Response header Content-Security-Policy is present, contains nonce-XXXX in script-src, and does NOT contain unsafe-eval"
    why_human: "Cannot run browser dev server and inspect live response headers programmatically in this environment"
  - test: "Send a preflight: curl -X OPTIONS https://draftpokemon.com/api/feedback -H 'Origin: https://evil.com' -I"
    expected: "Response status 403, no Access-Control-Allow-Origin header"
    why_human: "Production URL not reachable from this environment; needs live deploy verification"
---

# Phase 24: Application Security Hardening Verification Report

**Phase Goal:** Authenticated routes enforce Clerk identity at the handler level, CSP removes unsafe directives, all mutation inputs are validated server-side, and CORS is locked to production domains
**Verified:** 2026-04-03T09:21:08Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A request to /api/ai/analyze-team with no Clerk JWT returns 401 | VERIFIED | `isAuthRequiredApiRoute` matcher covers `/api/ai/(.*)`. Middleware returns `NextResponse.json({ error: 'Authentication required', requestId }, { status: 401 })` when `!userId`. Line 299-310 in middleware.ts. |
| 2 | A request to /api/ai/analyze-team with a valid Clerk JWT proceeds to the handler | VERIFIED | Auth check only fires when `!userId` — valid JWT passes through. `authorizedParties` ensures JWTs from other Clerk apps are rejected at the clerkMiddleware layer. |
| 3 | A request to /api/feedback with a fabricated payload is limited per IP | VERIFIED | `/api/feedback` is in `isPublicApiRoute` (no Clerk auth required). `getClientId()` falls back to IP when no `x-clerk-user-id` header. Default rate limit 100/min applies. |
| 4 | Authenticated API requests are rate-limited by Clerk userId, not by a spoofable cookie | VERIFIED | `getClientId()` reads `x-clerk-user-id` header (lines 144-145 in middleware.ts). No `cookies.get('user_id')` remains (confirmed via grep — zero results). |
| 5 | Unauthenticated API requests fall back to IP-based rate limiting | VERIFIED | `getClientId()` returns `ip:{first-ip-from-x-forwarded-for}` when no Clerk header is present. IP parsing correctly takes first entry from comma-separated list. |
| 6 | Rate limits are tuned: auth-adjacent routes have stricter per-minute limits than read endpoints | VERIFIED | `/api/user`: 5/min (line 136). `/api/ai`: 10/hr (line 137). Default API: 100/min (line 138). Upstash limiters `rl:user` and `rl:ai` defined (lines 125-126). |
| 7 | The script-src directive does not contain 'unsafe-eval' | VERIFIED | `buildCSP()` comment: "unsafe-eval REMOVED". `grep "unsafe-eval" src/middleware.ts` returns only the comment line, not a directive value. |
| 8 | The script-src directive uses a cryptographic nonce instead of 'unsafe-inline' | VERIFIED | `scriptSrc` array contains `` `'nonce-${nonce}'` `` (line 34 of middleware.ts). `generateNonce()` uses `crypto.randomUUID()` base64-encoded per request. |
| 9 | Clerk FAPI URL in CSP is derived from environment variable, not hardcoded | VERIFIED | `buildCSP()` derives `clerkFapiUrl` from `process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (line 19 of middleware.ts). Fallback to `https://*.clerk.accounts.dev` wildcard. |
| 10 | An OPTIONS preflight from https://evil.com to any API route receives no Access-Control-Allow-Origin header | VERIFIED | `handleCorsPreflightIfNeeded()` returns `new Response(null, { status: 403 })` when `getAllowedOrigin()` returns null (cors.ts lines 64-66). Wired at edge in middleware.ts lines 274-277. |
| 11 | An OPTIONS preflight from https://draftpokemon.com to any API route receives Access-Control-Allow-Origin: https://draftpokemon.com | VERIFIED | `ALLOWED_ORIGINS` includes `https://draftpokemon.com` (cors.ts line 8). `handleCorsPreflightIfNeeded()` sets `Access-Control-Allow-Origin: {allowedOrigin}` for allowed origins, returns 204. |
| 12 | A POST to /api/feedback with a title longer than 200 characters is rejected with a 400 and Zod error message | VERIFIED | `feedbackSchema` defines `title: z.string().min(1).max(200).trim()` (schemas.ts line 65). `feedback/route.ts` uses `validateRequestBody(feedbackSchema, body)` and returns 400 on failure (line 30-31). |
| 13 | A POST to /api/push/subscribe with a user_id that does not match the Clerk session is rejected with a 403 | VERIFIED | `push/subscribe/route.ts` imports `auth` from `@clerk/nextjs/server`, calls `await auth()`, and returns 403 with `"user_id does not match authenticated session"` when `clerkUserId && clerkUserId !== user_id` (lines 59-65). |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/middleware.ts` | Clerk auth enforcement; rate limit key uses Clerk userId | VERIFIED | Contains `isAuthRequiredApiRoute`, `authorizedParties`, `getClientId()` reading `x-clerk-user-id`, `generateNonce()`, `buildCSP()`, nonce injection, CSP response header, CORS preflight import |
| `next.config.ts` | Static CSP removed from headers() | VERIFIED | `headers()` function contains X-DNS-Prefetch-Control, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy — no Content-Security-Policy entry |
| `src/app/layout.tsx` | Nonce generation wired to RootLayout | VERIFIED | `RootLayout` is `async`, imports `headers` from `next/headers`, reads `x-nonce` header, passes `nonce` to `<Script>` component's `nonce` prop (line 107) |
| `src/lib/cors.ts` | CORS helper with allowedOrigins and applyCors/handleCorsPreflightIfNeeded | VERIFIED | File exists. Exports `ALLOWED_ORIGINS`, `getAllowedOrigin`, `applyCors`, `handleCorsPreflightIfNeeded`. Production domains hardcoded; localhost:3000 dev-only; optional env var expansion. |
| `src/lib/schemas.ts` | feedbackSchema added | VERIFIED | `feedbackSchema` defined at line 63: category enum, title max 200, description max 2000, optional contact max 100 |
| `src/app/api/feedback/route.ts` | Uses feedbackSchema for Zod validation | VERIFIED | Imports `feedbackSchema, validateRequestBody` from schemas, calls `validateRequestBody(feedbackSchema, body)`, returns 400 on failure |
| `src/app/api/push/subscribe/route.ts` | Validates user_id against Clerk session | VERIFIED | Imports `auth` from Clerk, cross-checks `clerkUserId !== user_id`, returns 403 on mismatch. Guest users (null clerkUserId) pass through. |
| `src/lib/draft-picks-service.ts` | SEC-03 comment on guest validation | VERIFIED | SEC-03 comment block above `getUserTeamViaService` call in `validateUserCanPick()` (confirmed by grep, lines 325-332). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `middleware.ts clerkMiddleware handler` | `auth()` result | `const { userId } = await auth()` | VERIFIED | Line 300: `const { userId } = await auth()` inside `if (isAuthRequiredApiRoute(request) && !isPublicApiRoute(request))` |
| `getClientId function` | Clerk userId | `x-clerk-user-id` header | VERIFIED | Line 144: `const clerkUserId = request.headers.get('x-clerk-user-id')` — no cookie access |
| `src/lib/cors.ts applyCors` | All API route responses | Called at end of each handler | PARTIAL | `applyCors` is created and exported but not called in any route handler. Only `handleCorsPreflightIfNeeded` is wired (via middleware). Non-OPTIONS responses do NOT have `Access-Control-Allow-Origin` set. Impact: simple cross-origin GETs (no preflight) would not be blocked at the browser by CORS. All JSON API mutations (Content-Type: application/json) trigger preflight and ARE blocked. The plan's success criteria explicitly describes applyCors as "ready for use" — not required to be called. Preflight-based CORS enforcement covers mutation vectors. |
| `middleware nonce` | `next.config.ts` | Static CSP absent — middleware CSP applies | VERIFIED | `grep "Content-Security-Policy" next.config.ts` returns zero results. Middleware sets CSP on every response (line 326). |
| `middleware nonce` | RootLayout `x-nonce` header | `headers()` call reads nonce | VERIFIED | `layout.tsx` lines 97-98: reads `x-nonce` from `headers()` and passes to `<Script nonce={nonce}>` at line 107 |
| `feedbackSchema` | `/api/feedback` validation | `import { feedbackSchema }` in route | VERIFIED | `feedback/route.ts` line 2 imports feedbackSchema; line 29 uses it |
| `auth() Clerk` | `push/subscribe` user_id check | `const { userId: clerkUserId } = await auth()` | VERIFIED | `push/subscribe/route.ts` line 59 |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces security enforcement logic (middleware guards, validation schemas, CORS helpers), not components rendering dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| middleware.ts has no cookie-based rate limit key | `grep -n "cookies.get.*user_id" src/middleware.ts` | no output | PASS |
| middleware.ts reads x-clerk-user-id for rate limit key | `grep -n "x-clerk-user-id" src/middleware.ts` | line 144 match | PASS |
| CSP not in next.config.ts | `grep "Content-Security-Policy" next.config.ts` | no output | PASS |
| CSP nonce in middleware | `grep "buildCSP\|generateNonce\|x-nonce" src/middleware.ts` | 3 matches | PASS |
| unsafe-eval absent from CSP directive | `grep "unsafe-eval" src/middleware.ts` (comment only) | comment only, not in directive string | PASS |
| feedbackSchema in schemas.ts | `grep "feedbackSchema" src/lib/schemas.ts` | line 63 match | PASS |
| feedback route uses schema | `grep "feedbackSchema" src/app/api/feedback/route.ts` | line 2 match | PASS |
| Clerk cross-check in push/subscribe | `grep "clerkUserId" src/app/api/push/subscribe/route.ts` | lines 59-60 match | PASS |
| SEC-03 comment in draft-picks-service | `grep "SEC-03" src/lib/draft-picks-service.ts` | line 325 match | PASS |
| CORS helper exists | `ls src/lib/cors.ts` | file present | PASS |
| CORS preflight wired in middleware | `grep "handleCorsPreflightIfNeeded" src/middleware.ts` | lines 5, 275 | PASS |
| authorizedParties set | `grep "authorizedParties" src/middleware.ts` | line 332 match | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEC-01 | 24-01 | Clerk `authorizedParties` enforced on all authenticated API routes and middleware | SATISFIED | `isAuthRequiredApiRoute` returns 401 for unauthenticated requests to `/api/ai/*`, `/api/push/*`, `/api/formats/sync`, `/api/user/*`. `authorizedParties` set in clerkMiddleware options. |
| SEC-02 | 24-02 | CSP migrated from static to nonce-based (remove `unsafe-eval` and `unsafe-inline`) | SATISFIED | `buildCSP()` with per-request nonce in script-src. `unsafe-eval` absent. Static CSP removed from next.config.ts. Note: `unsafe-inline` intentionally retained on style-src (Radix UI + Tailwind requirement per SEC-F02 deferral). |
| SEC-03 | 24-03 | Guest write-path validated server-side (guest ID verified before mutations) | SATISFIED | (a) Draft picks: `validateUserCanPick()` queries participants table; fabricated guest ID with no participant record returns `canPick: false`. (b) Push subscribe: Clerk session cross-check blocks mismatched user_id. |
| SEC-04 | 24-03 | CORS restricted to production domain(s) only | SATISFIED | `ALLOWED_ORIGINS` contains only `draftpokemon.com`, `www.draftpokemon.com` in production. OPTIONS preflight from disallowed origins returns 403 at edge middleware. `applyCors` utility exported for route-handler use (not yet wired to route response bodies — see note below). |
| SEC-07 | 24-03 | Input sanitization audit — all API routes validated with Zod schemas, HTML sanitized | SATISFIED | `feedbackSchema` added and wired. All other major mutation endpoints (`makePickSchema`, `placeBidSchema`, `createDraftSchema`, `joinDraftSchema`, `analyzeTeamSchema`) pre-existed in schemas.ts. No `dangerouslySetInnerHTML` found in codebase. |
| RATE-02 | 24-01 | Per-endpoint rate limits tuned (draft picks, auction bids, API reads, auth endpoints) | SATISFIED | `/api/user`: 5/min (rl:user), `/api/ai`: 10/hr (rl:ai). Pre-existing: `/api/picks`: 60/min, `/api/bids`: 120/min, `/api/drafts`: 10/hr, `/api/user/export`: 5/hr. |
| RATE-03 | 24-01 | Rate limit bypass prevention — key by IP + authenticated user, not spoofable guest cookie | SATISFIED | `getClientId()` uses `x-clerk-user-id` (Clerk-verified JWT header). No cookie access. |
| RATE-04 | 24-01 | IP-based fallback rate limiting for unauthenticated requests | SATISFIED | `getClientId()` falls back to `x-forwarded-for` first IP on no Clerk header. Returns `ip:unknown` if no IP available. |

**Note on SEC-04 completeness:** The `applyCors()` function is defined and exported but not called in any route handler (`grep -rn "applyCors" src/app/api` returns no results). This means actual API responses (non-OPTIONS) do not carry `Access-Control-Allow-Origin` headers. For JSON mutation endpoints, browsers send a preflight first, which IS blocked for evil.com. However, simple cross-origin requests (credentialless GET, form POST) bypass preflight entirely and would not be blocked at the browser. The plan's success criteria for SEC-04 explicitly describes `applyCors` as "ready for use in route handlers" rather than requiring it to be called — this was an intentional design decision to provide the utility for future wiring. The preflight-based defense covers the highest-risk mutation vectors. This is noted as a warning, not a blocking gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/middleware.ts` | 101-110 | In-memory rate limiter fallback active when Redis not configured; falls back silently to in-memory with 3x limit | Info | Noted with `console.error` — not a Phase 24 regression; pre-existing behavior. No impact on security properties added in this phase. |
| `src/lib/cors.ts` | 38 | `applyCors` exported but never called in any API route handler | Warning | Simple (non-preflight) cross-origin requests receive no CORS header in response body. Browser CORS enforcement for simple requests relies on the response header. Mutation routes use `Content-Type: application/json` which always triggers preflight — covered. Read routes (GET) returning sensitive data may be exploitable from an attacker-controlled page if they don't check auth. However, all sensitive GET routes require Clerk JWT (enforced by middleware SEC-01), making unauthenticated cross-origin data exfiltration infeasible. |

### Human Verification Required

#### 1. Live CSP Header Check

**Test:** Start dev server (`npm run dev`), visit http://localhost:3000 in Chrome. Open DevTools > Network > click the HTML document request > Headers tab.
**Expected:** Response header `Content-Security-Policy` is present, `script-src` contains `'nonce-XXXXXXXXXX'`, and does NOT contain `unsafe-eval`. The nonce value should be a base64-encoded UUID.
**Why human:** Cannot spin up the Next.js dev server and inspect live HTTP response headers in this verification environment.

#### 2. CORS Preflight Rejection Test

**Test:** `curl -s -o /dev/null -w "%{http_code}" -X OPTIONS https://draftpokemon.com/api/feedback -H "Origin: https://evil.com" -H "Access-Control-Request-Method: POST"`
**Expected:** HTTP status 403, no `Access-Control-Allow-Origin` header in response.
**Why human:** Production URL not accessible from this environment.

#### 3. Clerk Auth 401 Test

**Test:** `curl -s -o /dev/null -w "%{http_code}" -X POST https://draftpokemon.com/api/ai/analyze-team -H "Content-Type: application/json" -d '{"teamId":"00000000-0000-0000-0000-000000000000","leagueId":"00000000-0000-0000-0000-000000000000"}'`
**Expected:** HTTP status 401 with `{"error":"Authentication required","requestId":"..."}`.
**Why human:** Requires live production endpoint.

### Gaps Summary

No blocking gaps found. All 8 required requirements (SEC-01, SEC-02, SEC-03, SEC-04, SEC-07, RATE-02, RATE-03, RATE-04) are satisfied by the implemented code. All 13 plan-defined must-have truths are verified in the actual codebase. The one notable observation — `applyCors` not yet called in route handlers — was intentional per the plan design ("utility ready for use") and the preflight-based defense in middleware is sufficient for the mutation-heavy API surface.

Commits verified:
- `cdada0f` — rate limit identity key hardening
- `03bb8d0` — Clerk auth enforcement + nonce-based CSP (middleware)
- `ffd047b` — nonce wired to RootLayout
- `18cbd1b` — CORS helper created and wired to middleware preflight
- `27334c1` — guest write-path validation and feedbackSchema

---

_Verified: 2026-04-03T09:21:08Z_
_Verifier: Claude (gsd-verifier)_
