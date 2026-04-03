---
phase: 23-critical-fixes-cost-safeguards
verified: 2026-04-03T00:00:00Z
status: human_needed
score: 3/4 must-haves verified
re_verification: false
human_verification:
  - test: "Confirm Supabase spend cap is enabled in billing dashboard"
    expected: "Settings -> Billing -> Spend Cap shows a non-zero dollar cap value saved and active"
    why_human: "Supabase billing dashboard has no public API; spend cap state is not visible in the codebase and cannot be verified programmatically"
  - test: "Confirm at least one billing alert is active below the spend cap"
    expected: "Settings -> Billing -> Alerts shows at least one alert with a threshold less than the spend cap value, confirmed active after page reload"
    why_human: "Same reason as above — dashboard-only state, no code artifact to inspect"
  - test: "Confirm production Redis state persists across cold starts (Vercel)"
    expected: "Making a rate-limited API call, waiting for a Vercel cold start, then repeating — the rate counter continues from its previous value rather than resetting to 0"
    why_human: "Requires a live Vercel deployment and observing serverless instance lifecycle; cannot be tested statically"
---

# Phase 23: Critical Fixes & Cost Safeguards — Verification Report

**Phase Goal:** The production environment is verifiably safe from billing surprises and the most severe infrastructure risks, with no application code changes required
**Verified:** 2026-04-03
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                | Status          | Evidence                                                                                      |
|-----|----------------------------------------------------------------------------------------------------------------------|-----------------|-----------------------------------------------------------------------------------------------|
| 1   | Supabase billing dashboard shows a spend cap enabled and at least one billing alert configured below the cap         | ? HUMAN NEEDED  | SUPA-01 deferred by user (dashboard-only action). No code artifact to inspect.               |
| 2   | Upstash Redis is the authoritative rate limiter in production — any fallback is logged at error level, not silently  | ✓ VERIFIED      | `console.error` CRITICAL log on startup (line 41-47); `console.error` in catch block (line 150); `InMemoryRateLimiter` preserved for local dev only |
| 3   | Any HTTP request carrying `x-middleware-subrequest` has that header stripped before reaching application logic       | ✓ VERIFIED      | `requestHeaders.delete('x-middleware-subrequest')` at line 186, before `requestId` assignment at line 189; `requestHeaders` passed to `NextResponse.next()` at line 204 |
| 4   | The CI pipeline fails the build if `npm audit` reports any critical or high severity CVE                             | ✓ VERIFIED      | `Security Audit` step at line 22 of `ci.yml`, using `npm audit --audit-level=high` with `continue-on-error: false`, positioned between `npm ci` (line 20) and `Lint` (line 26) |

**Score:** 3/4 truths verified (1 deferred to human — SUPA-01)

### Required Artifacts

| Artifact                                      | Expected                                          | Status       | Details                                                                                        |
|-----------------------------------------------|---------------------------------------------------|--------------|------------------------------------------------------------------------------------------------|
| `src/middleware.ts`                           | x-middleware-subrequest strip + Upstash logging   | ✓ VERIFIED   | Strip at line 186 (first op in `clerkMiddleware`); CRITICAL log at line 41; catch log at line 150 |
| `.github/workflows/ci.yml`                    | npm audit CI gate step                            | ✓ VERIFIED   | Security Audit step present with `--audit-level=high` and `continue-on-error: false`          |
| `.planning/phases/23-critical-fixes-cost-safeguards/23-02-SUMMARY.md` | Spend cap documentation | ✗ INCOMPLETE | File exists but records deferred status only — no dollar values documented (pending SUPA-01 completion) |

### Key Link Verification

| From                    | To                     | Via                                   | Status       | Details                                                                                            |
|-------------------------|------------------------|---------------------------------------|--------------|----------------------------------------------------------------------------------------------------|
| `src/middleware.ts`     | Vercel Edge runtime    | `clerkMiddleware` wrapper             | ✓ WIRED      | `requestHeaders.delete('x-middleware-subrequest')` is the first statement in the `clerkMiddleware` async callback; stripped headers flow through `NextResponse.next({ request: { headers: requestHeaders } })` |
| `.github/workflows/ci.yml` | `npm audit`         | GitHub Actions step                   | ✓ WIRED      | `npm audit --audit-level=high` is a named step with `continue-on-error: false` in the `check` job |

### Data-Flow Trace (Level 4)

Not applicable — this phase modifies infrastructure (Edge middleware header manipulation, CI YAML, billing dashboard). No components rendering dynamic data were introduced.

### Behavioral Spot-Checks

| Behavior                                               | Command                                                                                                  | Result                             | Status  |
|--------------------------------------------------------|----------------------------------------------------------------------------------------------------------|------------------------------------|---------|
| `x-middleware-subrequest` delete exists at line 186    | `grep -n "x-middleware-subrequest" src/middleware.ts`                                                   | Line 186: `requestHeaders.delete('x-middleware-subrequest')` | ✓ PASS |
| Delete precedes `requestId` assignment                 | `grep -n "requestHeaders.delete\|requestId\s*=" src/middleware.ts`                                      | delete at line 186, requestId at line 189 | ✓ PASS |
| `requestHeaders` forwarded to `NextResponse.next()`    | `grep -n "headers: requestHeaders" src/middleware.ts`                                                   | Match at line 204                  | ✓ PASS  |
| CRITICAL startup log present                           | `grep -n "CRITICAL.*Upstash" src/middleware.ts`                                                         | Match at line 42                   | ✓ PASS  |
| Catch-block error log present                          | `grep -n "Redis call failed" src/middleware.ts`                                                         | Match at line 150                  | ✓ PASS  |
| `console.warn` replaced (not present)                  | `grep -n "console\.warn" src/middleware.ts`                                                             | No matches                         | ✓ PASS  |
| In-memory fallback preserved                           | `grep -n "InMemoryRateLimiter\|inMemoryLimiter" src/middleware.ts`                                      | 4 matches                          | ✓ PASS  |
| Security Audit step in CI                              | `grep -n "Security Audit\|npm audit\|continue-on-error" .github/workflows/ci.yml`                      | Lines 22-24                        | ✓ PASS  |
| Audit gate step order (after npm ci, before Lint)      | `grep -n "npm ci\|Security Audit\|Lint" .github/workflows/ci.yml`                                      | npm ci line 20, Security Audit line 22, Lint line 26 | ✓ PASS |
| Commits exist in git history                           | `git show --stat cda7293` and `git show --stat 1841d67`                                                 | Both commits confirmed             | ✓ PASS  |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                             | Status          | Evidence                                                                     |
|-------------|-------------|-----------------------------------------------------------------------------------------|-----------------|------------------------------------------------------------------------------|
| SEC-05      | 23-01       | `x-middleware-subrequest` header stripped at edge (CVE-2025-29927 defense-in-depth)     | ✓ SATISFIED     | Header deleted at line 186 before any auth checks; CI audit gate at line 22-24 of ci.yml |
| RATE-01     | 23-01       | Redis-backed rate limiting enforced in production (Upstash, no silent in-memory fallback) | ✓ SATISFIED   | CRITICAL error on startup when Redis absent; catch block logs error on runtime failure; in-memory fallback preserved for local dev only |
| SUPA-01     | 23-02       | Supabase spend cap verified and billing alerts configured                                | ? HUMAN NEEDED  | Deferred by user — dashboard action only; no code artifact to verify. Must be completed before beta launch per 23-02-SUMMARY.md |

**Orphaned requirements:** None. All three IDs declared in plan frontmatter are accounted for.

### Anti-Patterns Found

| File                  | Line | Pattern                                               | Severity | Impact |
|-----------------------|------|-------------------------------------------------------|----------|--------|
| `src/middleware.ts`   | 193  | `applyRateLimit(request, requestId)` passes the original `request` object (not `requestHeaders`) | Info | `applyRateLimit` reads `request.headers` internally via `getClientId`. Since the deleted header (`x-middleware-subrequest`) is not used for rate-limit key generation (only `user_id` cookie, `x-forwarded-for`, `x-real-ip` are used), this is safe and not a functional issue. The plan explicitly noted this was acceptable. |

No blockers or warnings found. The Info item above matches the plan's explicit design note.

### Human Verification Required

#### 1. Supabase Spend Cap Active (SUPA-01)

**Test:** Log into the Supabase dashboard, navigate to the draftpokemon.com project, go to Settings -> Billing. Confirm "Spend Cap" shows as enabled with a specific dollar value. Reload the page and confirm the value persists.

**Expected:** Spend cap is enabled with a non-zero dollar value (recommended: $50/month for beta).

**Why human:** Supabase billing configuration has no public API or CLI surface. The spend cap state lives entirely in the Supabase dashboard and cannot be read from the codebase.

#### 2. Supabase Billing Alert Active (SUPA-01)

**Test:** In the same Billing section, navigate to "Alerts" or "Budget Alerts". Confirm at least one alert exists with a threshold value strictly less than the spend cap value, and that a notification email is configured.

**Expected:** At least one alert active at a threshold below the cap (e.g., $25 if cap is $50), with a confirmed notification email address.

**Why human:** Same as above — dashboard-only state.

#### 3. Update 23-02-SUMMARY.md with confirmed values

**Test:** After completing the two dashboard actions above, update `.planning/phases/23-critical-fixes-cost-safeguards/23-02-SUMMARY.md` to record the exact spend cap value, alert threshold, notification email, and the date confirmed.

**Expected:** SUMMARY reflects actual configured values, not just a deferred placeholder.

**Why human:** Values are unknown until the user completes the dashboard configuration.

#### 4. Production Redis persistence across cold starts

**Test:** On the live Vercel deployment, make a rate-limited API call to `/api/drafts` (limit: 10 per hour). Then wait for or force a Vercel cold start (new function instance). Make another call and observe whether the rate limit counter continued from the previous value or reset to 0.

**Expected:** Counter persists (Upstash Redis is the source of truth, not in-memory state). If the counter resets, it indicates the in-memory fallback is active in production, meaning Redis env vars are not set.

**Why human:** Requires a live deployment and observing serverless lifecycle behaviour. The code is correctly wired to use Upstash when env vars are present, but verifying env vars are actually configured in Vercel requires dashboard access.

### Gaps Summary

No automated gaps. All code-level must-haves are verified:

- The CVE-2025-29927 defense is in place (`x-middleware-subrequest` stripped unconditionally at the edge).
- Redis misconfiguration is now loudly visible in Vercel logs (CRITICAL console.error on startup, error-level logging on catch fallback).
- The CI pipeline will block merges containing critical or high CVEs.
- All three requirement IDs (SEC-05, RATE-01, SUPA-01) are accounted for with no orphaned requirements.

The single outstanding item is SUPA-01, which was deferred by the user. This is a human-only dashboard action (Supabase billing has no API). It must be completed before public beta launch. The 23-02-SUMMARY.md should be updated once the dashboard configuration is done.

---

_Verified: 2026-04-03_
_Verifier: Claude (gsd-verifier)_
