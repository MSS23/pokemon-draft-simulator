# Technology Stack — Security Hardening & Scalability (Milestone 5)

**Project:** Pokemon Draft (draftpokemon.com)
**Milestone:** 5 — Security Hardening & Scalability Audit
**Researched:** 2026-04-03
**Scope:** NEW additions only. Existing stack (Next.js 15, Supabase, Clerk, Zustand, Tailwind,
Radix UI, Framer Motion, TanStack Query v5, Zod, Vitest) is validated — not re-evaluated here.

---

## Critical Prerequisite: Next.js Patch (Do This First)

**CVE-2025-29927** — CVSS 9.1 — Authorization bypass in Next.js middleware.

Attackers send a crafted `x-middleware-subrequest` HTTP header to skip all middleware-based
auth checks. On this platform, that means bypassing `clerkMiddleware()` entirely — any
protected route becomes publicly accessible.

| Channel | Patched in |
|---------|-----------|
| Next.js 15.x | 15.2.4+ (note: 15.2.3 was incomplete — must be 15.2.4 or newer) |
| Next.js 14.x | 14.2.26+ |

As of April 2026, the current 15.x line is at 15.3–15.5. Run `npm outdated next` and upgrade
before any other security work. This is the single highest-risk item in the milestone.

**Defense-in-depth (even after patching):** Configure the server/CDN to reject any request
containing the `x-middleware-subrequest` header. On Vercel Pro, this is a one-line WAF custom
rule. On the free tier, it can be added as a middleware pre-check.

---

## Stack Additions

### 1. Rate Limiting

**Recommended: `@upstash/ratelimit` + `@upstash/redis`**

| Property | Value |
|----------|-------|
| Packages | `@upstash/ratelimit@2.0.8`, `@upstash/redis` |
| Runtime | Edge-compatible (Next.js middleware, no cold starts, HTTP-based) |
| Storage backend | Upstash Redis (hosted, serverless-safe) |
| Free tier | 500K Redis commands/month — sufficient for beta traffic |
| Confidence | HIGH — official Vercel template, purpose-built for edge |

**Why not in-memory or custom solutions:**
The existing rate limiter noted as "fixed" in Milestone 2 uses in-memory state, which resets
on every serverless function cold start. On Vercel, each request may hit a fresh function
instance — in-memory rate limits offer zero protection against distributed abuse. Upstash
Redis persists counts across invocations.

**Why not `express-rate-limit`:**
Requires a persistent Node.js process and TCP connections — incompatible with the edge runtime
used by Next.js middleware.

**Integration point:** `src/middleware.ts`

Apply tiered limits before auth runs:

| Route pattern | Algorithm | Limit | Rationale |
|--------------|-----------|-------|-----------|
| `/api/draft/*/pick` | `tokenBucket(100, '1m', 10)` | 100 picks/min, burst 10 | Allows session bursts, blocks flooding |
| `/api/draft/create` | `fixedWindow(5, '60s')` | 5 per minute per IP | Prevents draft spam |
| `/join-draft` | `fixedWindow(10, '60s')` | 10 per minute per IP | Prevents room code enumeration |
| All `/api/` routes | `slidingWindow(60, '10s')` | 60 req/10s per IP | General API protection |

Include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After` headers in 429
responses so clients can back off gracefully.

```bash
npm install @upstash/ratelimit @upstash/redis
```

```env
UPSTASH_REDIS_REST_URL=your-upstash-redis-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-redis-token
```

---

### 2. XSS Sanitization

**Recommended: `isomorphic-dompurify@3.7.1`**

| Property | Value |
|----------|-------|
| Package | `isomorphic-dompurify` (wraps `dompurify`) |
| Runtime | Works in Server Components, SSR, and client components |
| Confidence | HIGH — standard solution for Next.js SSR+CSR contexts |

**Why needed:**
The platform accepts user-generated text in: draft names, team names, league announcements,
and display names. React's JSX auto-escaping handles most cases, but any `dangerouslySetInnerHTML`
usage or stored rich text (league announcements) bypasses this protection.

**Why `isomorphic-dompurify` not plain `dompurify`:**
Plain DOMPurify requires a browser DOM. It fails silently or throws in Server Components and
SSR (Next.js GitHub issue #46893). The isomorphic wrapper handles jsdom initialization
automatically for server contexts.

**Integration point:** Create `src/lib/sanitize.ts`:

```typescript
import DOMPurify from 'isomorphic-dompurify'

export const sanitizeHtml = (dirty: string): string =>
  DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })

export const sanitizeRichHtml = (dirty: string): string =>
  DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href']
  })
```

Apply at: any stored text rendered back to users (team names, draft names, league
announcements). Do NOT apply at the Zod validation layer — sanitize at the render boundary,
not the input boundary, to avoid double-encoding.

```bash
npm install isomorphic-dompurify
npm install -D @types/dompurify
```

---

### 3. Input Validation — Zod (expand existing coverage, no new install)

| Property | Value |
|----------|-------|
| Package | `zod` (already installed, `src/lib/schemas.ts` exists) |
| Action needed | Coverage audit — not a new dependency |
| Confidence | HIGH |

The existing `src/lib/schemas.ts` file exists but coverage is incomplete. Every API route
handler must validate request bodies through a Zod schema before touching the database.

**Audit checklist:**
- All `POST /api/**` route handlers — validate body with `.safeParse()` and return 400 on failure
- All Server Actions — validate inputs server-side even if client validates too
- Use `.strict()` on all schemas to reject unknown fields (prevents mass-assignment attacks)
- Room code generation: validate 6-char uppercase pattern server-side (currently validated
  in `src/lib/room-utils.ts` — confirm it rejects malformed inputs)

**No install required.** This is a code coverage task.

---

### 4. Security Headers — `next.config.ts` (no new package)

| Property | Value |
|----------|-------|
| Implementation | `next.config.ts` `headers()` async function |
| Packages needed | None — native Next.js feature |
| Confidence | HIGH — official Next.js documentation |

**Required headers:**

```typescript
// next.config.ts headers() return value
{
  key: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains; preload'
},
{
  key: 'X-Frame-Options',
  value: 'DENY'
},
{
  key: 'X-Content-Type-Options',
  value: 'nosniff'
},
{
  key: 'Referrer-Policy',
  value: 'strict-origin-when-cross-origin'
},
{
  key: 'Permissions-Policy',
  value: 'camera=(), microphone=(), geolocation=()'
},
{
  key: 'X-DNS-Prefetch-Control',
  value: 'on'
}
```

**CSP (Content Security Policy):**
Implement via middleware with per-request nonce. Clerk requires specific CSP allowances —
use the allowlist from Clerk's official CSP guide as the base:
- `connect-src` must allow `https://*.clerk.accounts.dev`
- `script-src` must allow Clerk's hosted JS
- Add Supabase's WebSocket domain to `connect-src`

Known Next.js 15 bug: CSP headers only apply in production when `await headers()` is called
in page components AND a nonce is present. Test CSP configuration with
`Report-To` in report-only mode first before enforcing.

---

### 5. Dependency Vulnerability Scanning — `npm audit` in CI (no new package)

| Property | Value |
|----------|-------|
| Tool | `npm audit --audit-level=high` (built-in npm) |
| CI integration | Add to build step / GitHub Actions |
| Confidence | HIGH |

**Immediate action:** Run `npm audit --production` now to discover current vulnerabilities.
CVE-2025-29927 may not be the only critical issue in the dependency tree.

**CI setup:** Add to GitHub Actions workflow before `npm run build`:
```yaml
- run: npm audit --audit-level=high --production
```

This fails the build on high/critical severity findings, preventing vulnerable code from
reaching production.

**Optional — Snyk (free tier):**
Snyk provides automatic fix PRs and continuous monitoring beyond point-in-time `npm audit`.
Not mandatory for launch but recommended for ongoing maintenance. The Snyk free tier covers
open source projects. Install with `npm install -g snyk` and `snyk auth`.

---

### 6. Supabase Connection Pooling — Supavisor (configuration change, no new package)

| Property | Value |
|----------|-------|
| Feature | Supabase Supavisor (built-in on all paid Supabase plans) |
| Action | Switch DATABASE_URL to pooler connection string |
| Confidence | HIGH — official Supabase documentation |

**Why this matters:**
Next.js on Vercel deploys as serverless functions. Each request can spin up a new function
instance that opens a new PostgreSQL connection. At hundreds of concurrent users, this exhausts
Postgres's `max_connections` limit (100 on Supabase free tier, ~200 on Pro).

**IMPORTANT caveat:** The existing stack uses `@supabase/supabase-js`, which communicates via
PostgREST (HTTP API) — not direct TCP connections to Postgres. This means the connection
exhaustion risk applies only if any code makes direct database connections. Audit for:
- Any raw `pg` or `postgres` package usage
- Prisma (not in current stack, but verify)
- Supabase Edge Functions that use the service role key with direct DB access

If no direct connections exist, Supavisor is still worth enabling for future-proofing and
the Supabase Dashboard gains connection pool visibility.

**Migration:**
1. In Supabase Dashboard → Settings → Database → Connection Pooling, note the Transaction
   mode pooler URL (port 6543)
2. Set `DATABASE_URL` to the pooler URL in production environment
3. Keep direct URL available for migrations only (Supabase CLI)
4. Pool size: allocate 60–70% of max_connections to Supavisor

---

### 7. Supabase Realtime Cost Optimization (configuration, no new package)

| Property | Value |
|----------|-------|
| Feature | Supabase Realtime channel consolidation + Broadcast mode |
| Cost structure | $10 per 1K peak concurrent connections, $2.50 per 1M messages |
| Action | Audit `useConnectionManager`, reduce channel count |
| Confidence | HIGH — official Supabase pricing documentation |

**The hidden cost problem:**
Postgres Changes events fan out: one database INSERT with 100 subscribers triggers 100
authorization reads (Supabase checks RLS for each subscriber). A 10-person draft with picks
flowing through Postgres Changes = 10x RLS read amplification on every pick.

**Optimization actions:**
1. Audit `src/lib/connection-manager.ts` — count how many Supabase channels open per draft
2. Consolidate per-table subscriptions into a single Broadcast channel where possible:
   - Picks, turn changes, and timer events can all flow through one broadcast channel
   - The draft host pushes updates; clients receive via broadcast (no RLS fan-out)
3. Switch the highest-frequency tables (picks, auctions) from `postgres_changes` to
   `supabase.channel('draft:${id}').on('broadcast', ...)` — eliminates per-event RLS reads
4. Enable **Spend Cap** in Supabase Dashboard → Billing to hard-stop overages
5. Subscribe to Supabase billing email alerts (available in billing settings)

**Expected impact:** Switching picks from Postgres Changes to Broadcast can reduce realtime
message cost by 80–90% for a typical draft session.

---

### 8. Database Query Optimization — Supabase Built-in Extensions (enable, no install)

| Property | Value |
|----------|-------|
| Extensions | `index_advisor`, `hypopg` |
| Where to enable | Supabase Dashboard → Database → Extensions |
| Confidence | HIGH — official Supabase documentation |

**index_advisor:** Analyzes slow queries and recommends missing indexes. Works by observing
actual query patterns and suggesting B-tree or partial indexes.

**hypopg:** Creates hypothetical (virtual) indexes with zero storage cost. Lets you test
whether a proposed index would improve a query before committing to creating it.

**Enable via SQL:**
```sql
CREATE EXTENSION IF NOT EXISTS index_advisor;
CREATE EXTENSION IF NOT EXISTS hypopg;
```

**Priority queries to analyze with EXPLAIN ANALYZE:**
```sql
-- Most executed: fetch draft state
SELECT * FROM picks WHERE draft_id = $1 ORDER BY turn_number;
-- Needs: INDEX on (draft_id, turn_number)

SELECT * FROM teams WHERE draft_id = $1 ORDER BY draft_order;
-- Needs: INDEX on (draft_id)

-- Auction queries during active auction drafts
SELECT * FROM auctions WHERE draft_id = $1 AND status = 'active';
-- Needs: INDEX on (draft_id, status)
```

The Supabase Dashboard now provides visual EXPLAIN diagrams — use these before adding indexes
to confirm they'll be used by the query planner.

---

### 9. Load Testing — k6 (standalone CLI tool, not npm)

| Property | Value |
|----------|-------|
| Tool | k6 v1.0+ (released May 2025) |
| Install | `brew install k6` or Docker (`docker pull grafana/k6`) — NOT via npm |
| Confidence | MEDIUM — community standard; Supabase uses k6 for their own realtime benchmarks |

**Why k6 over Artillery:**
k6 v1.0 (May 2025) added first-class TypeScript support without transpilation — TypeScript
scripts run natively. This aligns with the project's TypeScript-first approach. k6 is also
3x more memory-efficient than JMeter and has better DX for complex scenarios.

**Why not add to npm dependencies:**
k6 is a Go binary with a JS/TS runtime for test scripts. It does not install via `npm install`.
Keep load test scripts in `tests/load/` as TypeScript files that k6 runs directly.

**Scenarios to test before launch:**
1. 8 concurrent users in one draft room making picks (measures Supabase Realtime + API latency)
2. 10 simultaneous drafts (80 concurrent WebSocket connections — check Supabase connection quota)
3. Room code join endpoint: enumerate-style load (validate rate limiting blocks at the app layer)

**Do NOT run against production Supabase.** Use a staging project or run against the free tier
with spend cap enabled. Supabase Realtime benchmarks charge per connection/message.

---

### 10. Vercel WAF Bot Filter (configuration, free tier)

| Property | Value |
|----------|-------|
| Feature | Vercel Firewall → Bot Filter managed ruleset |
| Cost | Free on all Vercel plans |
| Advanced rules | Vercel Pro plan required for custom WAF rules |
| Confidence | HIGH — official Vercel documentation |

**Why enable this:**
Draft room codes are 6 characters (uppercase alphanumeric = ~2.17 billion combinations, but
in practice far fewer are active). Without bot filtering, scrapers can enumerate active rooms.
The Bot Filter applies JS challenges to non-browser traffic before requests reach the
application.

**Enable via:** Vercel Dashboard → Project → Security → Firewall → Enable Bot Filter

**Additional WAF rule (Vercel Pro):** Block requests containing `x-middleware-subrequest`
header as defense-in-depth against CVE-2025-29927, even after patching Next.js:
```
Rule: Header "x-middleware-subrequest" exists → Block
```

---

### 11. PGAudit (Supabase extension — enable for compliance/debug, no install)

| Property | Value |
|----------|-------|
| Extension | `pgaudit` (available as Supabase extension) |
| Purpose | Log database-level operations for security audit trail |
| Confidence | HIGH — official Supabase documentation |

**When to enable:** PGAudit logs database operations at the session/object level. For a beta
launch, enabling object-level auditing on the `picks` and `teams` tables creates a tamper-
evident log useful for debugging disputed draft results.

**Not strictly required for launch** but low-risk to enable. Enable via:
```sql
CREATE EXTENSION IF NOT EXISTS pgaudit;
```

Configure in `postgresql.conf` (Supabase Dashboard → Database → Settings):
```
pgaudit.log = 'write'  -- log INSERT, UPDATE, DELETE
```

---

## What NOT to Add

| Technology | Reason to Avoid |
|------------|----------------|
| Cloudflare WAF | Adds a second CDN layer that complicates Clerk's JWT distribution (Clerk uses short-lived JWTs that need clock sync). Vercel's native WAF is sufficient. |
| Helmet.js | Node.js middleware — does not integrate with Next.js App Router. The `next.config.ts` headers approach is correct. |
| Redis session store (custom) | Clerk manages sessions via short-lived JWTs. Adding Redis session storage duplicates the auth layer and creates sync bugs. |
| Prisma / ORM migration | The existing stack uses Supabase JS client (PostgREST). Introducing Prisma during a security milestone is a rewrite risk with no security benefit. |
| Cloudflare Turnstile / reCAPTCHA | Draft rooms require invitations. CAPTCHA on a private, invite-based flow creates friction with minimal threat surface. Add only if bot abuse is observed post-launch. |
| SIEM / centralized log aggregation | Overkill at thousands-of-users scale. Supabase logs + Vercel log drains are sufficient. Evaluate at 50K+ MAU. |
| Dedicated Redis cluster | Upstash free tier handles beta traffic. A self-managed Redis cluster adds operational cost with no benefit until 10M+ requests/month. |
| `express-rate-limit` | In-memory storage resets on serverless cold starts — fundamentally broken for serverless deployments. |
| Snyk (mandatory) | `npm audit` in CI is sufficient for launch. Snyk adds CI complexity and cost. Treat as optional enhancement post-launch. |
| Artillery | k6 v1.0 has native TypeScript and is what Supabase uses for their own benchmarks. Don't maintain two load testing tools. |

---

## Full Installation Summary

```bash
# New production dependencies (3 packages only)
npm install @upstash/ratelimit @upstash/redis isomorphic-dompurify

# New dev dependencies
npm install -D @types/dompurify

# No npm install for:
#   Security headers     → next.config.ts change
#   Zod validation       → already installed, expand coverage
#   Supavisor pooling    → environment variable change
#   Realtime cost fixes  → code changes in useConnectionManager
#   DB indexes           → SQL commands in Supabase dashboard
#   k6 load testing      → standalone binary (brew/docker)
#   Vercel WAF           → dashboard configuration
#   PGAudit              → SQL extension command
```

## New Environment Variables

```env
# Upstash Redis — rate limiting (required)
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# Supabase pooler — optional if no direct DB connections found in audit
# SUPABASE_POOLER_URL=postgres://postgres.[project]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres
```

---

## Sources

- [@upstash/ratelimit npm — v2.0.8](https://www.npmjs.com/package/@upstash/ratelimit)
- [Upstash Rate Limiting for Next.js Edge](https://upstash.com/blog/edge-rate-limiting)
- [Upstash Redis Pricing 2025](https://upstash.com/docs/redis/overall/pricing)
- [CVE-2025-29927 — Datadog Security Labs](https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/)
- [CVE-2025-29927 — Snyk Blog](https://snyk.io/blog/cve-2025-29927-authorization-bypass-in-next-js-middleware/)
- [Cloudflare WAF rule for CVE-2025-29927](https://developers.cloudflare.com/changelog/post/2025-03-22-next-js-vulnerability-waf/)
- [Next.js CSP Configuration](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
- [Clerk CSP Headers Guide](https://clerk.com/docs/guides/secure/best-practices/csp-headers)
- [isomorphic-dompurify GitHub](https://github.com/kkomelin/isomorphic-dompurify)
- [DOMPurify SSR issue in Next.js](https://github.com/vercel/next.js/issues/46893)
- [Supabase Connection Management](https://supabase.com/docs/guides/database/connection-management)
- [Supabase Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI)
- [Supabase Realtime Pricing](https://supabase.com/docs/guides/realtime/pricing)
- [Supabase Spend Cap](https://supabase.com/docs/guides/platform/spend-cap)
- [Supabase index_advisor](https://supabase.com/docs/guides/database/extensions/index_advisor)
- [Supabase Query Optimization](https://supabase.com/docs/guides/database/query-optimization)
- [PGAudit Extension — Supabase](https://supabase.com/docs/guides/database/extensions/pgaudit)
- [k6 vs Artillery comparison](https://npm-compare.com/artillery,k6)
- [Vercel Firewall Documentation](https://vercel.com/docs/vercel-firewall)
- [Vercel Bot Management](https://vercel.com/security/bot-management)
- [Vercel WAF Managed Rulesets](https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets)
- [Supabase RLS Security — Hidden Dangers](https://dev.to/fabio_a26a4e58d4163919a53/supabase-security-the-hidden-dangers-of-rls-and-how-to-audit-your-api-29e9)
- [Next.js Security Headers Best Practices 2025](https://www.turbostarter.dev/blog/complete-nextjs-security-guide-2025-authentication-api-protection-and-best-practices)
