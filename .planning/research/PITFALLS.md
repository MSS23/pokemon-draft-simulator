# Domain Pitfalls: Security Hardening & Scalability Audit

**Domain:** Adding security hardening, rate limiting, cost optimization, and scalability to an existing Next.js 15 + Supabase + Clerk real-time draft platform
**Researched:** 2026-04-03
**Overall Confidence:** HIGH for Supabase/Clerk integration issues (official docs verified); MEDIUM for scalability thresholds (community-verified)

---

## Severity Rankings

| Severity | Definition |
|----------|-----------|
| CRITICAL | Causes production outage, data breach, or complete auth bypass |
| HIGH | Breaks core functionality for a class of users, or exposes real data |
| MODERATE | Degrades experience, incorrect security assumptions, or causes billing surprises |
| LOW | Wasted work, security theater, or minor friction |

---

## Critical Pitfalls

### Pitfall 1: RLS Policy Breaks Realtime Subscriptions (Supabase-Specific)

**Severity:** CRITICAL
**Phase:** Security Audit / RLS Audit

**What goes wrong:** You audit existing RLS policies and tighten them. Realtime subscriptions stop delivering events to some or all participants. Picks no longer propagate. The draft room appears frozen.

**Why it happens:** Supabase Realtime enforces RLS at the subscription layer. When a `postgres_changes` subscription is active, Supabase checks whether the connected user's JWT passes the SELECT policy for the affected row before broadcasting the event. Tightening a SELECT policy that was previously permissive (e.g., `USING (true)`) to require a specific user ID match will cause the Realtime server to silently drop events for rows the user "can't see" according to the new policy — even if the client already has that data on screen.

**The specific trap for this codebase:** The `drafts`, `teams`, `picks`, and `participants` tables are all subscribed via `DraftRealtimeManager` (`src/lib/draft-realtime.ts`). If you add a row-scoped SELECT policy to `picks` that requires `team_id IN (SELECT id FROM teams WHERE draft_id = $draft_id AND user_id = auth.uid())`, spectators and non-team participants will stop receiving pick events entirely — because those rows do not match their user.

**Consequences:** Silent data freeze in draft rooms. All participants still see the UI as connected (WebSocket is alive), but events stop arriving. This is the hardest category of bug to diagnose because there is no error thrown.

**Prevention:**
- Keep SELECT policies on broadcast tables (picks, teams, drafts) permissive for rows within the same draft (`USING (draft_id = $draft_id)` not `USING (user_id = auth.uid())`)
- Use INSERT/UPDATE/DELETE policies for mutation control; use SELECT policies only to control visibility, not participation
- After tightening any RLS policy, run the full subscription test: open two browser tabs as different users, make a pick, confirm both tabs update
- Check the Supabase dashboard "Realtime" logs for "Policy check failed" entries after any RLS migration

**Detection:** Pick events not received by spectators or non-picking participants; Supabase Realtime inspector shows messages sent from server but not delivered to client.

**Sources:** [Supabase Realtime RLS Issue #35195](https://github.com/supabase/supabase/issues/35195), [Supabase RLS + Realtime Fix (Medium)](https://medium.com/@kidane10g/supabase-realtime-stops-working-when-rls-is-enabled-heres-the-fix-154f0b43c69a)

---

### Pitfall 2: Clerk JWT Claims Do Not Satisfy Supabase auth.uid() in RLS

**Severity:** CRITICAL
**Phase:** Security Audit / RLS Audit

**What goes wrong:** You write new RLS policies using `auth.uid()` for per-user row access. Policies silently pass or fail incorrectly because Clerk user IDs are strings (`user_abc123`) while Supabase's `auth.uid()` function returns a UUID. The mismatch causes every RLS check to fail, returning empty result sets instead of an error.

**Why it happens:** As of April 2025, Clerk uses its own JWT template for Supabase integration (deprecated as of April 1 2025 in favor of native Supabase integration). The `sub` claim in a Clerk-issued JWT is a Clerk user ID string, not a UUID. Supabase's `auth.uid()` function casts `sub` to `uuid` type. Any Clerk user ID will fail that cast silently. New RLS policies written with `auth.uid()` look correct but always return `NULL`, causing every policy check to evaluate to false.

**The specific trap for this codebase:** `FIX-RLS-POLICIES.md` in the codebase already documents a Clerk/Supabase JWT mismatch. Adding new policies during the security audit without checking whether the existing workaround (custom `requesting_user_id()` SQL function or `auth.jwt() -> 'sub'`) is consistently applied will create a split: some tables use the workaround correctly, newly-audited tables use `auth.uid()` and silently break.

**Consequences:** All INSERT/UPDATE operations on newly-secured tables fail. Users cannot make picks. Draft creation fails silently. No error appears in the browser because the RLS policy returns empty, not an error.

**Prevention:**
- Audit every existing RLS policy in `FIX-RLS-POLICIES.md` before writing new ones — identify which function is currently used instead of `auth.uid()`
- Create a single SQL helper function (e.g., `current_user_id()`) that correctly extracts the user identifier from the Clerk JWT, and use only that function in every RLS policy
- Never mix `auth.uid()` and custom claims functions across tables
- After the migration to Supabase's native Clerk integration (recommended by Clerk as of April 2025), retest every policy

**Detection:** INSERT queries return empty rows instead of error; `SELECT auth.uid()` from a Clerk-authenticated session returns NULL; RLS policies appear correct but block all mutations.

**Sources:** [Clerk Supabase Integration Docs](https://clerk.com/docs/guides/development/integrations/databases/supabase), [Supabase Clerk Third-Party Auth](https://supabase.com/docs/guides/auth/third-party/clerk), [Supabase Discussion #33091](https://github.com/orgs/supabase/discussions/33091)

---

### Pitfall 3: CSP `connect-src` Missing Clerk FAPI Hostname

**Severity:** CRITICAL
**Phase:** Security Hardening / CSP Implementation

**What goes wrong:** You add a Content-Security-Policy header (or tighten the existing one in `next.config.ts`). Clerk authentication stops working. The sign-in modal loads but token refresh silently fails. Sessions expire and users cannot re-authenticate without a page reload.

**Why it happens:** The existing CSP in `next.config.ts` (line 125) includes `connect-src 'self' https://*.supabase.co wss://*.supabase.co ...` but does NOT include Clerk's Frontend API (FAPI) hostname. Every Clerk request (session refresh, token validation, OAuth handshake) is a `fetch()` call to your Clerk FAPI URL (e.g., `https://clerk.your-domain.com` in production or `https://aware-skunk-42.clerk.accounts.dev` in development). CSP blocks these as violations. The browser shows no network error in normal mode — CSP violations silently fail in production.

**Required CSP additions for Clerk + Supabase + existing services:**

| Directive | Required Values |
|-----------|----------------|
| `connect-src` | `https://[your-fapi-hostname]` |
| `script-src` | `https://[your-fapi-hostname]` `https://challenges.cloudflare.com` |
| `img-src` | `https://img.clerk.com` |
| `frame-src` | `https://challenges.cloudflare.com` (existing `https://discord.com` and `https://accounts.google.com` may already be present) |
| `worker-src` | `'self' blob:` |

**The specific trap:** The existing CSP uses a static string in `next.config.ts` (`headers()` function). The Clerk FAPI hostname is different between development and production instances. A hardcoded production FAPI domain breaks development, and hardcoding the development domain breaks production. The correct pattern is to build the CSP dynamically from an environment variable (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` can be parsed to derive the FAPI URL, or set `NEXT_PUBLIC_CLERK_FAPI_URL` explicitly).

**Additional trap — `unsafe-eval` in `script-src`:** The existing CSP includes `'unsafe-eval'` in `script-src`, which was likely added to satisfy a Supabase or build dependency. Removing it as part of "tightening" will break Clerk's Cloudflare bot-protection challenge script.

**Consequences:** Clerk authentication silently fails in production after CSP update. Users are logged out and cannot log back in. Guest users are unaffected, but authenticated features (dashboard, settings) are dead.

**Prevention:**
- Make CSP generation dynamic: derive Clerk FAPI URL from environment variable, not hardcode
- Validate CSP with Clerk's official domains list before deploying (see Clerk CSP docs linked in sources)
- Test the full auth flow (sign in, token refresh after 60 seconds, OAuth) after any CSP change
- Use `Content-Security-Policy-Report-Only` header in staging to catch violations before shipping

**Detection:** Browser console CSP violation reports after login attempts; `clerk.loaded` never fires; `auth.protect()` calls in middleware redirect users on every request.

**Sources:** [Clerk CSP Headers Guide](https://clerk.com/docs/guides/secure/best-practices/csp-headers), [Next.js CSP Guide](https://nextjs.org/docs/pages/guides/content-security-policy)

---

### Pitfall 4: Next.js CVE-2025-29927 Middleware Bypass (If Unpatched)

**Severity:** CRITICAL
**Phase:** Security Audit (immediate check)

**What goes wrong:** Any attacker can send `x-middleware-subrequest: pages/_middleware` header to any protected route and bypass all middleware-based auth checks. The entire `isProtectedRoute` matcher in `src/middleware.ts` is skipped.

**Why it happens:** CVE-2025-29927 (CVSS 9.1, disclosed March 2025) allows complete bypass of Next.js middleware via a crafted internal header. Affected versions: 11.1.4 through 15.2.2. Fixed in 15.2.3+.

**The specific trap for this codebase:** The middleware in `src/middleware.ts` is the PRIMARY auth enforcement mechanism for protected routes (`/dashboard`, `/admin`, `/settings`). If the Next.js version is below 15.2.3, this check is completely bypassable by any external request with the forged header.

**Consequences:** Unauthenticated users access `/admin`, `/dashboard`, and `/settings` routes. League commissioner tools, user data exports, and admin panels are exposed.

**Prevention:**
- Run `npm ls next` to check current version immediately
- Upgrade to `next@15.2.3` or higher before shipping any security work
- Even after patching, do NOT rely solely on middleware for auth — each server component and API route must independently verify auth using Clerk's `auth()` server-side function (defense in depth)
- Vercel's WAF can block the `x-middleware-subrequest` header as an additional layer if you cannot upgrade immediately

**Detection:** `curl -H 'x-middleware-subrequest: middleware' https://draftpokemon.com/dashboard` — if this returns 200 instead of redirect to sign-in, the system is vulnerable.

**Sources:** [Next.js CVE-2025-29927 Advisory](https://nextjs.org/blog/cve-2025-29927), [Clerk Analysis of CVE-2025-29927](https://clerk.com/blog/cve-2025-29927), [Datadog Security Labs Analysis](https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/)

---

### Pitfall 5: Supabase Service Role Key Leaked Via `NEXT_PUBLIC_` Prefix or `'use client'` Import

**Severity:** CRITICAL
**Phase:** Security Audit

**What goes wrong:** During the security audit, you add admin-level operations (e.g., bulk deleting a draft, system-level fixes) and create a Supabase admin client using the service role key. The file gets a `'use client'` directive added later, or the key is named `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, causing it to be bundled into client-side JavaScript.

**Why it happens:** Next.js prefixes all `NEXT_PUBLIC_*` environment variables into the client bundle at build time. Any variable with this prefix is visible in browser DevTools → Sources → _next/static. The service role key bypasses ALL RLS policies — it is a root-level database credential.

**Consequences:** Any visitor to the site can extract the service role key from the JS bundle, perform full CRUD on every table, delete all draft data, extract all user IDs, and inject malicious picks.

**Prevention:**
- Name the key `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix) — server-side only
- Add `import 'server-only'` at the top of any file that creates the service-role Supabase client
- Never use the service role client in React components, even Server Components that will later be refactored to Client Components
- Periodically grep the client bundle: `grep -r "service_role" .next/static/` — if it returns results, a key is exposed

**Detection:** Check `.next/static/chunks/` for the string `service_role` after a production build.

**Sources:** [Supabase Understanding API Keys](https://supabase.com/docs/guides/api/api-keys), [Supabase Securing Your API](https://supabase.com/docs/guides/api/securing-your-api)

---

## High Severity Pitfalls

### Pitfall 6: Rate Limiting Blocks Legitimate Auction Bidders During Live Draft

**Severity:** HIGH
**Phase:** Rate Limiting Implementation

**What goes wrong:** The `bids` rate limiter is configured at `120 requests/minute` (per the existing `src/middleware.ts`). In a competitive auction draft with 6 teams and a 30-second auction window, each team will submit 5-10 bids in rapid succession when the clock runs down. During a peak bidding moment, a single user can fire 8-12 bids in under 10 seconds, followed by a second burst when the next Pokemon goes to auction. With 6 teams, the shared IP rate limit (from `x-forwarded-for`) may be hit if multiple players are on the same network (e.g., a tournament venue's WiFi).

**Why it happens:** Two specific problems with the current implementation:
1. `getClientId()` in middleware falls back to IP address for unauthenticated users. Guest users from the same network (tournament venue, household) share one rate limit bucket. Burst bids from different people at a venue can cross-block.
2. The in-memory fallback (3x limit) resets on every cold start. Vercel spins a new Lambda per request under high load — the in-memory limiter has zero cross-instance state. A user can hit 60 bids/minute from one Lambda instance and another 60 from the next cold start.

**Consequences:** Real auction participants get 429 errors during the most critical moment of a draft. The user sees "Too many requests" and cannot complete their bid. They lose the auction despite being present and active.

**Prevention:**
- Use user ID (from Clerk JWT or guest ID cookie) as the rate limit key, not IP — this prevents shared-network collisions
- For the `bids` limiter specifically, use a token bucket algorithm (not sliding window) with burst capacity: `Ratelimit.tokenBucket(10, '10 s', 30)` — allows 30 bids in bursts, refills at 10/10s
- Upstash Redis is already integrated (`src/middleware.ts` lines 44-49) — ensure it is configured in the production Vercel environment or the fallback void applies
- Never block bid API calls with a 429 that does not include a `Retry-After` header with a short value (2-5 seconds) so the client can auto-retry

**Detection:** Monitor 429 rate on `/api/bids` during a test auction with 4+ active bidders. Any 429 during a live auction is a UX failure.

---

### Pitfall 7: In-Memory Rate Limiter Silently Reverts Under Vercel Serverless Scaling

**Severity:** HIGH
**Phase:** Rate Limiting Implementation

**What goes wrong:** Upstash Redis is not configured in the production environment. The `InMemoryRateLimiter` fallback in `src/middleware.ts` (lines 12-33) is used instead. Under Vercel's default serverless scaling, each concurrent request may spawn a new Lambda function instance, each with its own empty in-memory state. The effective rate limit is `limit * 3 * (number of concurrent Lambda instances)` — functionally unlimited.

**Why it happens:** Vercel serverless functions are stateless by design. Each invocation is an independent process. The `inMemoryRateLimiter` Map is scoped to the Node.js process — it is not shared across instances. Under a moderate load spike (20 concurrent requests), Vercel may have 20 separate Lambda instances each with their own fresh rate limit counters. The comment in the code (`// Use 3x the limit since in-memory state resets between serverless invocations`) acknowledges this but does not solve it.

**Consequences:** Malicious users can bypass rate limits entirely without Redis by sending concurrent requests that hit different Lambda instances. DoS protection is illusory. The codebase has a warning log but no monitoring alert when Redis is missing.

**Prevention:**
- Treat Redis configuration as a hard deployment requirement, not optional: block deployment (in CI or Vercel build settings) if `UPSTASH_REDIS_REST_URL` is not set for production
- Add a `/api/health` check that explicitly reports whether Redis is connected, separate from the current health endpoint
- Configure Upstash Redis via the Vercel integration (one-click in Vercel marketplace) so env vars are injected automatically into production

**Detection:** Check Vercel → Environment Variables for production scope — if `UPSTASH_REDIS_REST_URL` is absent, rate limiting is degraded. The console warning `[RateLimit] Upstash Redis not configured` will appear in Vercel function logs.

---

### Pitfall 8: RLS Policy Performance Degradation From Missing Indexes on `auth.uid()` Columns

**Severity:** HIGH
**Phase:** RLS Audit / Performance at Scale

**What goes wrong:** Adding or tightening RLS policies that filter by user ID works correctly in testing with a small dataset, then causes timeouts at scale because the columns referenced in the policy's `USING` clause are not indexed.

**Why it happens:** A policy like `USING (host_id = requesting_user_id())` on the `drafts` table causes Postgres to evaluate `requesting_user_id()` once per row scanned. Without an index on `host_id`, every SELECT on `drafts` performs a full sequential scan. On the Free tier (limited compute), a table with 10,000 draft rows scanned by 50 concurrent users produces timeouts.

**The specific trap:** The pattern `auth.uid()` (or a custom equivalent) in RLS policies triggers what Postgres calls an `initPlan` — the function is cached per-statement but still causes the planner to disable index-only scans for certain query shapes. Supabase's own documentation flags this as a common performance killer.

**Consequences:** Draft creation timeouts at scale. Picks API slows from 2ms to 50ms+. Supabase's auto-pausing triggers on excessive compute usage.

**Prevention:**
- Index every column used in RLS `USING` clauses: `host_id`, `user_id`, `draft_id`, `team_id` on all tables
- Wrap `auth.uid()` calls in a `(select auth.uid())` subquery to enable Postgres initPlan caching: `USING (host_id = (select auth.uid()))` — this tells the planner the value is stable for the statement
- Use Supabase's Performance Advisor (Dashboard → Database → Performance) to detect missing indexes flagged by RLS policies
- Test query performance with `EXPLAIN ANALYZE` before and after adding policies, using a dataset of at least 10,000 rows

**Detection:** Supabase Dashboard → Performance Advisor shows `auth_rls_initplan` lint warning. Query times increase by 10x+ after adding new policies in a staging environment with realistic data volume.

**Sources:** [Supabase RLS Performance Troubleshooting](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv), [Supabase Performance Advisor](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0003_auth_rls_initplan)

---

### Pitfall 9: Guest User IDs as Rate Limit Keys Are Trivially Spoofable

**Severity:** HIGH
**Phase:** Rate Limiting / Guest User Security

**What goes wrong:** The rate limiter in `src/middleware.ts` reads `request.cookies.get('user_id')` to identify guest users. A malicious user can send requests with arbitrary `user_id` cookie values, effectively rotating their identity with each request and bypassing per-user rate limits entirely.

**Why it happens:** Guest user IDs are generated client-side (`guest-{timestamp}-{random}`) and stored in localStorage. They're not cryptographically bound to any server-side session. The cookie-based fallback in middleware is unverified — any string passes as a user ID.

**The additional attack vector:** A malicious actor can enumerate other guest users' IDs (they follow a predictable pattern if `Date.now()` is used) or fabricate IDs that collide with authenticated user IDs (`user_abc123` format). This can exhaust another user's rate limit bucket.

**Consequences:**
- Rate limiting is bypassable by any motivated attacker with guest access
- An attacker can DoS specific users by burning their rate limit quota using their predictable guest ID
- Bulk draft creation (10 drafts/hour limit) can be bypassed by rotating cookies

**Prevention:**
- Fall back to IP-based limiting (not cookie-based) when no authenticated Clerk session is present — IP is harder to rotate than a cookie value
- If guest sessions need separate tracking, issue a signed cookie server-side (using `crypto.createHmac` with a server secret) and verify the signature in middleware
- Do not use the guest ID cookie value directly as a rate limit key without signature verification
- Consider requiring Clerk authentication to create drafts (not just join them) — this eliminates guest abuse of creation endpoints while preserving the guest join experience

**Detection:** Automated test: send 11 `POST /api/drafts` requests with different `user_id` cookie values from the same IP. If all succeed (no 429), the guest ID bypass is active.

---

### Pitfall 10: Supabase Realtime Connection Count Multiplies During React StrictMode and Navigation

**Severity:** HIGH
**Phase:** Supabase Connection Optimization

**What goes wrong:** The Pro tier limit of 500 concurrent connections is consumed faster than expected because:
1. React StrictMode (enabled in `next.config.ts` line 133: `reactStrictMode: true`) mounts and unmounts components twice in development, creating double subscriptions
2. Client-side navigation in Next.js 15 App Router does not always trigger the full `useEffect` cleanup for page-level subscriptions before the new page mounts
3. The `DraftRealtimeManager` in `src/lib/draft-realtime.ts` creates a channel per `draftId`. If a user navigates away and back (common during draft setup), the old channel may not be cleaned up before the new one is created

**Why it happens:** Supabase's `supabase.channel()` creates a new WebSocket channel each time it is called, even if a channel with the same name exists. If the previous channel was not explicitly unsubscribed, it remains open and counts against the connection limit. The documented fix (checking `supabase.getChannels()` before creating a new one) is not currently implemented.

**Real connection count for this app:** With 6 participants in a draft room, each connecting to channels for `drafts`, `teams`, `picks`, `participants`, and `auctions` tables, plus presence — that is approximately 6 channels per participant. 6 people × 6 channels = 36 connections per draft room. 14 concurrent draft rooms = 504 connections, exceeding the Pro tier limit. With StrictMode double-mounting in development, this doubles to 72 channels per room in dev.

**Consequences:** New joiners cannot establish Realtime connections. Draft rooms silently degrade. Supabase project is suspended if over-quota on a sustained basis.

**Prevention:**
- The existing `DraftRealtimeManager` already uses a single-channel design for all draft events — confirm this is consistently used and not bypassed by older subscription code in the hooks that predate the refactor
- Check `src/app/draft/[id]/page.tsx`, `src/lib/trade-service.ts`, and `src/app/league/[id]/trades/page.tsx` (all identified as using `supabase.channel()`) for channel cleanup on unmount
- Add connection monitoring: log `supabase.getChannels().length` on mount in the draft page to detect accumulation
- Use `supabase.removeAllChannels()` on page unload (`beforeunload` event) as a safety net for navigation-based leaks

**Detection:** Open the draft page, navigate away, navigate back 5 times. Check `supabase.getChannels().length` — if it is greater than expected (should be ~1), channels are leaking.

**Sources:** [Supabase Realtime TooManyChannels Fix](https://supabase.com/docs/guides/troubleshooting/realtime-too-many-channels-error), [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)

---

## Moderate Pitfalls

### Pitfall 11: CSP `unsafe-eval` Prevents Tightening Without Breaking Supabase

**Severity:** MODERATE
**Phase:** CSP Hardening

**What goes wrong:** The security audit identifies `'unsafe-eval'` in `script-src` as a CSP weakness (it allows dynamic code execution from injected strings). Removing it to pass a security scan breaks Supabase's realtime client, which uses `eval()` internally for WebSocket protocol negotiation in some environments.

**Why it happens:** `@supabase/realtime-js` versions prior to 2.10 use `eval()` for Phoenix socket protocol handling. The current version may or may not require it depending on build target. Removing `'unsafe-eval'` without testing against a real Supabase connection produces a CSP violation that silently prevents the WebSocket from upgrading.

**Prevention:**
- Test with `Content-Security-Policy-Report-Only` header first — capture violations without blocking
- Check whether the current `@supabase/supabase-js` version requires `eval()`: `grep -r "eval(" node_modules/@supabase/realtime-js/dist/`
- If `unsafe-eval` can be removed, replace with nonce-based `script-src` for Next.js (requires dynamic rendering; not compatible with static export)
- Accept `'unsafe-eval'` if removal breaks Supabase until a Supabase package update removes the dependency

**Detection:** Remove `unsafe-eval`, load the app, check browser console for CSP violations and WebSocket connection errors.

---

### Pitfall 12: Security Theater — HTTPS-Only Header on Vercel Is Already Enforced

**Severity:** MODERATE (wasted effort risk)

**What goes wrong:** The security audit adds HSTS headers (`Strict-Transport-Security`) and redirects HTTP to HTTPS as security work. These are already enforced by Vercel at the infrastructure layer for all production deployments. The code in `next.config.ts` already includes HSTS headers (line 116-119). Adding redirect middleware for HTTP→HTTPS consumes development time but provides zero additional security.

**Why it happens:** Security checklists include "enforce HTTPS" generically. On Vercel, this is a platform feature, not an application concern. Writing middleware to redirect HTTP traffic is security theater — that traffic never reaches Next.js on Vercel.

**Other security theater items to skip:**
- Adding `X-Powered-By: remove` (already `poweredByHeader: false` in next.config.ts line 136)
- Adding IP allowlists for "internal" API routes that use Clerk auth — Clerk auth is already sufficient
- Encrypting Pokemon data at rest — Pokemon data is public; encrypting it adds complexity with zero security benefit
- Adding CSRF tokens to server actions — Next.js 15 server actions already include Origin header validation and use POST-only with SameSite=Lax cookies by default

**Prevention:**
- Before implementing any security measure, ask: "What is the attack vector this prevents?" If the answer is "I'm not sure" or "Vercel/Next.js/Clerk already handles this," skip it
- Focus security work on the actual vectors: RLS policies, auth bypass, rate limit bypasses, and injection attacks in user-controlled fields (team names, draft names)

---

### Pitfall 13: Input Sanitization Gaps in User-Controlled Text Fields

**Severity:** MODERATE
**Phase:** Security Hardening

**What goes wrong:** Draft names, team names, league names, and announcement text are stored in Supabase and rendered in other users' browsers. If not sanitized, these fields are XSS vectors.

**Why it happens:** React escapes JSX-rendered strings automatically, preventing most XSS. However, there are three specific gaps:
1. Fields rendered with `dangerouslySetInnerHTML` (if any exist) bypass React's escaping
2. Metadata fields (OG tags, page titles) use `{draft.name}` in `generateMetadata()` — if a draft name contains `<script>`, it appears in `<meta>` tags as a string, which is safe, but can confuse social crawlers
3. PostgreSQL `text` columns accept any Unicode including null bytes and overlong sequences. Without length limits, a user can store 1MB of text in a `name` field, causing frontend rendering lag

**For this specific codebase:** Team names are displayed with team color-coding and in the activity sidebar. Draft names appear in page titles. League announcement fields likely render rich text. Any of these that use `dangerouslySetInnerHTML` are immediate XSS vectors.

**Prevention:**
- Grep for `dangerouslySetInnerHTML` across the codebase: `grep -r "dangerouslySetInnerHTML" src/` — any occurrence requires manual review
- Add database-level length constraints: `name VARCHAR(100)`, `description VARCHAR(500)` — stop oversize inputs at the DB layer
- Add Zod validation on all API routes that accept user text: minimum 1 char, maximum reasonable length, strip leading/trailing whitespace
- For any rich text fields (announcements), use DOMPurify server-side before storage, not just client-side

**Detection:** Enter `<img src=x onerror=alert(1)>` as a team name. If an alert fires anywhere in the application, XSS is present. If it renders as text, React's escaping is working.

---

### Pitfall 14: Supabase Free Tier Concurrent Connection Math Is Per-Project, Not Per-Room

**Severity:** MODERATE
**Phase:** Supabase Cost Optimization

**What goes wrong:** You plan for "500 concurrent connections on Pro" assuming 500 users can use the app simultaneously. In practice, each user opens multiple Realtime channels, so 500 connections supports far fewer than 500 simultaneous users.

**Actual math for this application:**
- Each draft participant connects to ~1 channel (if using the consolidated `DraftRealtimeManager`)
- Each spectator connects to ~1 channel
- Each league page may open additional channels (trades, waiver broadcasts)
- At peak: 50 active drafts × 8 participants + 100 spectators = 500 connections exactly at Pro tier limit

**Consequences:** Billing surprise. If you hit 500 concurrent connections, Supabase begins rejecting new connections. The platform becomes unusable for new joiners during popular events (e.g., a scheduled community tournament).

**Prevention:**
- Audit the actual channel count in production using `supabase.getChannels().length` across a real session
- Plan to upgrade to the Team tier ($599/month, 10,000 connections) before any organized tournament event
- Implement connection sharing: if two spectators are watching the same draft, consider using a single broadcast channel that re-broadcasts server events to all clients via the app tier (Supabase Broadcast, not Postgres CDC) — this dramatically reduces per-user connection cost

**Sources:** [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits), [Supabase Pricing](https://supabase.com/docs/guides/realtime/pricing)

---

### Pitfall 15: Over-Engineering for Scale That Does Not Exist Yet

**Severity:** MODERATE (wasted effort)
**Phase:** Architecture Cost Analysis

**What goes wrong:** The security hardening milestone adds database connection pooling, read replicas, CDN configuration, horizontal scaling patterns, and Redis clustering — all before having a single production user. The time spent on infra engineering delays the actual security work (RLS audit, rate limiting, CSP) that would protect real users.

**Specific over-engineering temptations for this stack:**
- PgBouncer connection pooling: Supabase Pro already includes PgBouncer. You do not need to configure it manually.
- Database read replicas: Not available until Supabase Enterprise. This is not a relevant optimization for a beta platform.
- Redis cluster for rate limiting: Upstash Redis (already integrated) handles rate limiting at scale without manual clustering. The current single-instance Upstash configuration is sufficient for 10,000 req/minute.
- Custom Supabase Realtime infrastructure: Supabase Realtime is managed infrastructure. You cannot horizontally scale it independently — only upgrade plans.
- CDN cache headers for API responses: Vercel's Edge Network already caches GET responses with `Cache-Control` headers. Adding Cloudflare in front of Vercel creates double-caching complexity for no measurable benefit at beta scale.

**The right scale threshold:** Optimize infrastructure when you have evidence of bottlenecks (Supabase dashboard alerts, Vercel analytics showing p99 >500ms), not before.

**Prevention:**
- Time-box infrastructure work: spend no more than 10% of this milestone on infra that isn't measurably needed
- Use the Supabase dashboard's built-in metrics as the trigger for scaling decisions, not hypothetical load projections

---

## Low Severity Pitfalls

### Pitfall 16: Dependency Audit Produces False Urgency

**Severity:** LOW
**Phase:** Security Audit

**What goes wrong:** `npm audit` reports dozens of vulnerabilities. The team stops feature work to patch all of them, including transitive dependencies in dev tools that never reach production.

**Why it happens:** `npm audit` reports ALL vulnerabilities in the dependency tree, including:
- Dev dependencies that are not bundled (test runners, linters)
- Vulnerabilities with no known exploit path
- Vulnerabilities in packages that are only used at build time (Webpack plugins, type generators)

**Prevention:**
- Use `npm audit --omit=dev` for production-relevant vulnerabilities only
- Prioritize: CRITICAL/HIGH in `dependencies` (not `devDependencies`) with direct exploit paths
- `next` itself should be on the latest minor version (vulnerability from CVE-2025-29927 was fixed in 15.2.3)
- Accept LOW/MODERATE vulnerabilities in dev tooling without patching if no exploit path exists

---

### Pitfall 17: Logging User Data in Vercel Function Logs

**Severity:** LOW
**Phase:** Security Audit

**What goes wrong:** During debugging, `console.log(user)` calls left in production code emit full Clerk user objects (email, IP, browser) to Vercel's function logs. These logs are retained and accessible to anyone with Vercel dashboard access.

**Prevention:**
- The existing `createLogger` in `src/lib/logger.ts` should be the only logging mechanism — audit for raw `console.log` calls with user objects
- Log user IDs only, never email addresses, names, or session tokens
- Vercel function logs are not encrypted at rest on the free tier; treat them as semi-public

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|-----------|
| RLS audit | Tightened SELECT policy silences Realtime events | CRITICAL | Test subscription delivery after every policy change |
| RLS audit | New policies use `auth.uid()` instead of Clerk-compatible claim | CRITICAL | Audit existing workaround in FIX-RLS-POLICIES.md first |
| RLS audit | Missing index on policy column causes full table scan | HIGH | Index all RLS-referenced columns before deploying new policies |
| CSP headers | Missing Clerk FAPI domain in `connect-src` | CRITICAL | Build CSP dynamically from env vars; test full auth flow after any CSP change |
| CSP headers | Removing `unsafe-eval` breaks Supabase Realtime | MODERATE | Use Report-Only mode to audit before blocking |
| Rate limiting | Bid rate limits block legitimate auction participants | HIGH | Use token bucket for bids; key on user ID not IP |
| Rate limiting | In-memory fallback has no cross-Lambda state | HIGH | Require Redis in production CI gate; monitor for missing config |
| Rate limiting | Guest user cookie is spoofable as rate limit key | HIGH | Fall back to IP for unauthenticated users |
| Connection optimization | React StrictMode doubles subscription count in dev | HIGH | Confirm cleanup in all 7 files using `supabase.channel()` |
| Connection optimization | Pro tier 500 connections exhausted at tournament scale | MODERATE | Audit actual channel count per session before any organized event |
| Security audit | Patching middleware CVE-2025-29927 | CRITICAL | Check `npm ls next` — must be ≥15.2.3 |
| Security audit | Service role key in `NEXT_PUBLIC_` variable | CRITICAL | Grep `.next/static/` for `service_role` after every build |
| Security audit | `dangerouslySetInnerHTML` XSS in team/draft names | MODERATE | Grep codebase; add Zod length validation on all text inputs |
| Input validation | User text fields lack length constraints | MODERATE | Add DB-level VARCHAR constraints and Zod schema validation |
| Dependency audit | `npm audit` creates false urgency on dev deps | LOW | Use `--omit=dev` flag; prioritize CRITICAL/HIGH in production deps only |

---

## Integration Pitfalls (Stack-Specific)

### Clerk + Supabase JWT: Deprecated Template vs Native Integration

As of April 1, 2025, Clerk's JWT template for Supabase is deprecated. The native Supabase integration (configured in Clerk Dashboard → Integrations → Supabase) is now the recommended path. If the current integration uses the old JWT template, this migration should happen during the security milestone — not because the old method stops working immediately, but because it will eventually stop being maintained and the new path is more secure (uses Supabase's own JWT validation rather than a shared secret).

**Migration risk:** The JWT claim structure changes between the two methods. Any RLS policies using `auth.jwt() -> 'sub'` or custom `requesting_user_id()` functions must be retested after migration.

### Rate Limiting + Supabase Realtime: Don't Rate-Limit the WebSocket Upgrade

Supabase Realtime connections are established via WebSocket upgrade (HTTP → WS). The upgrade request hits the Next.js middleware. The rate limiter in `src/middleware.ts` checks `pathname.startsWith('/api/')` only, so Realtime WebSocket upgrades are NOT rate-limited. This is correct behavior — do not add rate limiting to the WebSocket upgrade path. Supabase handles connection limiting at the infrastructure layer.

However, broadcast events sent via the Realtime channel (user presence updates, draft events) are not gated by the application's rate limiter. A malicious user could spam presence updates. This is handled by Supabase's per-connection message rate limits (500 messages/second on Pro) and does not require application-level mitigation.

### CSP + Supabase Realtime: `wss://` Must Match `connect-src`

The existing CSP in `next.config.ts` correctly includes `wss://*.supabase.co` in `connect-src`. Any change to Supabase project URL (e.g., migrating from free to pro with a different project ID) must be reflected in the CSP. Wildcard `wss://*.supabase.co` handles this correctly and should not be narrowed to a specific project URL.

---

## "Looks Secure But Isn't" Checklist

- [ ] RLS SELECT policies tested with Supabase Realtime subscriptions active (not just REST queries)
- [ ] `auth.uid()` usage audited against Clerk JWT format — confirmed all policies use Clerk-compatible claim extractor
- [ ] CSP `connect-src` includes Clerk FAPI hostname (both dev and prod instances)
- [ ] `next` version confirmed ≥15.2.3 (`npm ls next`)
- [ ] `.next/static/` does not contain `service_role` string after production build
- [ ] Rate limit keys use authenticated user ID, not spoofable guest cookie
- [ ] Upstash Redis is configured in Vercel Production environment variables (not just local .env)
- [ ] No `dangerouslySetInnerHTML` on user-controlled text fields (team names, draft names, announcements)
- [ ] Supabase channel cleanup confirmed in all 7 files using `supabase.channel()`
- [ ] `npm audit --omit=dev` run and CRITICAL/HIGH production CVEs addressed

---

## Sources

- Supabase RLS + Realtime issue: [GitHub Issue #35195](https://github.com/supabase/supabase/issues/35195), [GitHub Issue #35282](https://github.com/supabase/supabase/issues/35282) — HIGH confidence
- Supabase RLS performance: [RLS Performance Troubleshooting](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv), [Database Performance Advisors](https://supabase.com/docs/guides/database/database-advisors) — HIGH confidence
- Clerk + Supabase auth.uid() mismatch: [Clerk Supabase Integration](https://clerk.com/docs/guides/development/integrations/databases/supabase), [Supabase Clerk Docs](https://supabase.com/docs/guides/auth/third-party/clerk), [Discussion #33091](https://github.com/orgs/supabase/discussions/33091) — HIGH confidence
- Clerk CSP requirements: [Clerk CSP Headers Guide](https://clerk.com/docs/guides/secure/best-practices/csp-headers) — HIGH confidence
- Next.js CVE-2025-29927: [Next.js Advisory](https://nextjs.org/blog/cve-2025-29927), [Clerk Analysis](https://clerk.com/blog/cve-2025-29927) — HIGH confidence
- Supabase Realtime limits: [Realtime Limits](https://supabase.com/docs/guides/realtime/limits), [TooManyChannels Fix](https://supabase.com/docs/guides/troubleshooting/realtime-too-many-channels-error) — HIGH confidence
- Next.js Server Action CSRF: [Next.js Data Security Guide](https://nextjs.org/docs/app/guides/data-security) — HIGH confidence
- React StrictMode + Supabase realtime double-subscribe: [realtime-js Issue #169](https://github.com/supabase/realtime-js/issues/169) — MEDIUM confidence
- Vercel serverless rate limiting: [Upstash Ratelimit Blog](https://upstash.com/blog/upstash-ratelimit), [Vercel Rate Limiting Discussion](https://github.com/vercel/vercel/discussions/5325) — HIGH confidence
- Supabase service role key exposure: [Supabase API Keys](https://supabase.com/docs/guides/api/api-keys), [Supabase Securing API](https://supabase.com/docs/guides/api/securing-your-api) — HIGH confidence
