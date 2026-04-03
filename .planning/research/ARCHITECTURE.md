# Architecture Patterns: Security Hardening & Scalability

**Domain:** Security hardening and scalability for Next.js 15 + Supabase + Clerk platform
**Researched:** 2026-04-03
**Confidence:** HIGH (architecture grounded in actual codebase + official docs)

---

## Existing Architecture Snapshot

Before mapping integration points, here is what is already in place. This is the baseline every change must integrate with — not a greenfield system.

| Layer | Current State |
|-------|---------------|
| Middleware | `src/middleware.ts` — Clerk auth + Upstash rate limiting (sliding window, per route) |
| CSP headers | `next.config.ts` — Static CSP in `headers()` with `unsafe-eval` + `unsafe-inline` |
| Supabase client | `src/lib/supabase.ts` — anon key, no service role usage in client |
| Supabase server | `src/lib/supabase/server.ts` — `@supabase/ssr` server client (cookie-based, no auth persistence) |
| RLS | `migrations/fix-rls-policies.sql` — Owner-check helper functions (SECURITY DEFINER), permissive SELECT, restricted UPDATE/DELETE |
| Guest auth | `src/lib/user-session.ts` — `guest-{uuid}` IDs in `localStorage`, no server-side validation |
| Real-time | `src/lib/draft-realtime.ts` — `DraftRealtimeManager`, one channel per draft, postgres_changes + presence + broadcast |
| Rate limiting | Upstash Redis (primary) + in-memory fallback. Applied to `/api/*` only. |
| Input validation | `src/lib/validation.ts` + `src/lib/schemas.ts` (Zod) — sanitizers exist but usage is inconsistent |
| Connection pooling | Not yet configured — using direct Supabase connection strings |
| DB indexes | `migrations/add-performance-indexes.sql` — picks, teams, drafts, auctions, league tables |
| Next.js version | `^15.5.12` — past CVE-2025-29927 patch (15.2.3), safe |

---

## Recommended Architecture

### Overview: Five Concern Layers

```
Browser / PWA
    │
    ├── Service Worker (pokemon-sprites CacheFirst, pokeapi NetworkFirst)
    │
    ▼
Vercel Edge Network
    │
    ├── CDN cache (public pages, static assets)
    ├── Edge Middleware (Clerk auth + Upstash rate limiting)  ← already here
    │
    ▼
Next.js App Router (Node.js / serverless functions)
    │
    ├── API Routes  → input validation (Zod) → Clerk server auth check → business logic
    ├── Server Components → createSupabaseServerClient (anon key + RLS)
    │
    ▼
Supabase
    │
    ├── Supavisor (transaction mode, port 6543)  ← ADD
    ├── PostgreSQL + RLS policies               ← AUDIT & HARDEN
    └── Realtime (WebSocket)                    ← SCALE & COST OPTIMIZE
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Edge Middleware | Rate limiting, Clerk JWT validation, request ID injection | Upstash Redis, Clerk JWKS |
| API Routes | Input validation, auth verification, business logic orchestration | Supabase (via service role for admin ops), Clerk server SDK |
| Server Components | Read-only data fetch, no mutations | Supabase anon client (RLS enforced) |
| Supabase RLS | Row-level access control, enforce ownership without application auth | PostgreSQL executor |
| Realtime Manager | WebSocket lifecycle, presence, event deduplication | Supabase Realtime server |
| UserSessionService | Guest ID persistence, draft participation tracking | localStorage (client only) |

---

## Integration Point Map: Where Each Change Lives

### 1. Rate Limiting

**Current state:** Already implemented in `src/middleware.ts` with Upstash Redis + in-memory fallback. Covers `/api/*` routes with per-route sliding windows.

**Gaps to address:**
- No rate limiting on Supabase Realtime WebSocket connections themselves
- No per-user-authenticated rate limit (current key uses `user_id` cookie or IP; Clerk userId not used)
- No rate limiting on draft room join / spectate actions

**Integration points:**
- `src/middleware.ts` — Extend `getClientId()` to prefer Clerk's `auth().userId` when available (reduces IP-based collisions behind CDN)
- `src/middleware.ts` — Add rate limit config entry for `/spectate/` and `/join-draft`
- No new file needed — modify existing middleware only

**Data flow change:** None. Middleware already runs before all non-static requests.

### 2. Content Security Policy (CSP)

**Current state:** Static CSP string in `next.config.ts` `headers()`. Uses `'unsafe-eval'` and `'unsafe-inline'` for `script-src` — the two most dangerous exceptions, both added for Next.js hydration compatibility.

**The problem:** The current CSP cannot be tightened without breaking Next.js inline script injection. The fix requires nonce-based CSP generated per-request in middleware.

**Recommended change:**

Move from static CSP in `next.config.ts` to nonce-based CSP in middleware:

```typescript
// In src/middleware.ts — generate nonce per request
const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
const cspHeader = `
  default-src 'self';
  script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
  style-src 'self' 'unsafe-inline';
  img-src 'self' https://raw.githubusercontent.com https://pokeapi.co ...;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co ...;
`
// Set as response header AND as request header (for Next.js to read)
response.headers.set('Content-Security-Policy', cspHeader)
response.headers.set('x-nonce', nonce)  // Server Components can read this
```

**Integration points:**
- `src/middleware.ts` — Add nonce generation, inject as both response CSP header and `x-nonce` request header
- `next.config.ts` — Remove static `Content-Security-Policy` from `headers()` (it would conflict)
- Server Components that render `<script>` tags directly — read nonce from `headers()['x-nonce']`

**Constraint:** `'unsafe-inline'` for `style-src` is acceptable because CSS injection doesn't execute code. Radix UI and Tailwind require it. Removing `'unsafe-eval'` from `script-src` is the high-value change.

**Impact:** Nonce-based CSP forces dynamic rendering for all pages that include the nonce header. Cache those pages at the application level (TanStack Query), not at CDN level.

### 3. Supabase Connection Pooling (Supavisor)

**Current state:** `src/lib/supabase/server.ts` uses `NEXT_PUBLIC_SUPABASE_URL` which points to the direct Postgres connection. Under load (many serverless invocations), each function instance opens its own connection, exhausting Postgres's max_connections.

**Recommended change:** Use Supavisor transaction mode for all server-side DB queries.

**Integration points:**
- Environment variables — Add `DATABASE_URL` (pooled, port 6543) and `DIRECT_URL` (direct, port 5432)
- `src/lib/supabase/server.ts` — No code change needed; Supabase JS client uses HTTP, not raw TCP. Supavisor applies at the database URL level for direct Postgres access (Prisma, pg, etc.). For `@supabase/supabase-js`, the connection pooling is handled automatically by Supabase's PostgREST layer
- If raw SQL queries are added (e.g., for RLS audit scripts, EXPLAIN ANALYZE), those should use the pooled URL

**Key distinction (HIGH confidence, official docs):** The `@supabase/supabase-js` client uses PostgREST over HTTP — it does NOT open raw Postgres connections. Supavisor is only relevant if you add raw `pg` / Prisma connections. The real Supabase scalability lever for this stack is **Realtime connection management** (see section 5) and **RLS query efficiency** (see section 4).

**What to actually configure:**
- Enable Supavisor in Supabase Dashboard → Database → Connection Pooling → Transaction mode (port 6543)
- Set pool size based on plan limits (keep under 40% for normal, 80% for peak)
- Add `DATABASE_POOLED_URL` env var for any future raw SQL migrations run from CI

### 4. RLS Policy Audit

**Current state:** `fix-rls-policies.sql` added owner-check functions and locked down UPDATE/DELETE. SELECT remains permissive (`USING (true)`). The guest user model (TEXT user_id) means RLS cannot use `auth.uid()` for write policies — it uses custom `is_draft_host()` / `is_team_owner()` SECURITY DEFINER functions.

**Performance risk (MEDIUM confidence):** Each RLS policy evaluation that calls a SECURITY DEFINER function executes a sub-select. Under Realtime load, this multiplies: 100 subscribers to a table change = 100 RLS evaluation sub-selects.

**Integration points for RLS audit:**

```
Audit queries to run in Supabase SQL Editor:
1. SELECT * FROM pg_policies WHERE schemaname = 'public';   -- List all policies
2. npx supabase inspect db unused-indexes                    -- Find index waste
3. EXPLAIN ANALYZE [slow query]                              -- Profile RLS overhead
4. Supabase Dashboard → Database → Query Performance         -- pg_stat_statements
```

**Patterns to implement:**

a) **Wrap auth functions in SELECT subqueries** to allow Postgres optimizer to cache per-statement:
```sql
-- Current (re-evaluated per row):
USING (is_draft_host(draft_id, request.headers->>'x-user-id'))

-- Better (optimizer can cache):
USING ((SELECT is_draft_host(draft_id, current_setting('request.jwt.claims', true)::json->>'sub')))
```

b) **Add missing RLS-support indexes** — any column referenced in WHERE clauses inside RLS helper functions needs an index:
```sql
-- These should already exist from add-performance-indexes.sql but verify:
CREATE INDEX IF NOT EXISTS idx_drafts_host_id ON drafts(host_id);  -- confirmed exists
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);  -- confirmed exists
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);  -- verify
```

c) **Enable Supabase Security Advisor** — Dashboard → Database → Security Advisor flags `0003_auth_rls_initplan` for the initPlan pattern described above.

**No new files needed** — this is SQL migrations + dashboard configuration.

### 5. WebSocket / Realtime Connection Management at Scale

**Current state:** `DraftRealtimeManager` creates one channel per draft with 5 postgres_changes subscriptions (drafts, teams, picks, participants, auctions) + presence. Each connected client holds open WebSocket for the duration of the draft.

**Scale math:**
- Supabase Free: 200 concurrent peak connections
- Supabase Pro: 500 concurrent peak connections (500 extra = $10/month per 1000)
- One draft room = N participants * 1 connection each
- 20 concurrent draft rooms * 8 players = 160 connections
- Add spectators: 20 rooms * 20 spectators = 400 connections
- Total: ~560 connections — already exceeds Pro plan base at moderate scale

**Key RLS cost (confirmed, official Supabase docs):** Every `postgres_changes` event to a subscribed table triggers one RLS check per subscriber. 100 subscribers + one pick INSERT = 100 RLS evaluations. This can hammer the database.

**Recommended architecture change: Hybrid broadcast model**

For public-read events (picks, turn advances, auction bids), switch from `postgres_changes` to **Supabase Realtime Broadcast** triggered from the server:

```typescript
// In draft-picks-service.ts (server-side, after successful DB write):
await supabase.channel(`draft:${draftId}`).send({
  type: 'broadcast',
  event: 'pick_made',
  payload: { pick, newTurn }
})

// In DraftRealtimeManager (client-side):
// Replace postgres_changes for 'picks' with broadcast listener
.on('broadcast', { event: 'pick_made' }, handlePickBroadcast)
```

**Why this helps:**
- Broadcast: no RLS check per subscriber (server-controlled events)
- postgres_changes: one RLS check per subscriber per event
- Keep postgres_changes ONLY for tables where client needs row-level filtering that can't be sent via broadcast (e.g., private wishlist_items)

**Integration points:**
- `src/lib/draft-realtime.ts` — Replace `picks` and `teams` postgres_changes with broadcast listeners. Keep postgres_changes for `drafts` (turn state, status) and `participants`
- `src/lib/draft-picks-service.ts` — Add broadcast send after successful pick insert
- `src/lib/auction-service.ts` — Add broadcast send after bid/auction state changes

**Presence connection optimization:**
- Current: presence track called on every subscriber including spectators
- Recommendation: Only track presence for active participants (not spectators), saving connections on large public drafts

### 6. Guest User Security

**Current state:** Guest IDs (`guest-{uuid}`) generated with `crypto.randomUUID()` in browser, stored in `localStorage`. The ID is used as `host_id` / `owner_id` in database rows. RLS owner-check functions compare against these TEXT IDs.

**Risk assessment:**
- localStorage is readable by any JavaScript on the page (XSS risk)
- The guest ID acts as an authentication credential — if stolen, an attacker can impersonate a guest user
- No server-side validation that a claimed guest ID was legitimately issued
- The CSP `unsafe-inline` makes XSS vectors more feasible

**Threat model for this product:** Guest users participate in real-time drafts. The attack surface is:
1. Guest ID theft via XSS — impersonate team owner, make unauthorized picks
2. Fake guest ID injection — attempt to own any team with guessed ID format
3. Unlimited guest ID generation — spam participants table with fake joins

**Mitigation architecture (no breaking change to guest flow):**

a) **Fix CSP first** — nonce-based CSP eliminates the most practical XSS vector that could steal localStorage. This is the highest-leverage fix.

b) **Add server-side guest ID issuance** (medium-term):
```
POST /api/guest/session
→ Server generates guest ID
→ Returns as httpOnly cookie (not just localStorage value)
→ Client still has localStorage copy for display
→ API routes verify cookie matches claimed guest ID in request body
```

c) **Rate limit guest ID creation** — currently any client can generate unlimited guest IDs and spam `participants` inserts. Add rate limit on `/api/guest/session` creation endpoint.

**Integration points:**
- New file: `src/app/api/guest/session/route.ts` — POST handler for server-issued guest IDs
- `src/lib/user-session.ts` — `getOrCreateSession()` calls the API endpoint instead of generating locally
- `src/middleware.ts` — Rate limit `/api/guest/` route pattern

**Build order note:** CSP fix must come before guest session migration because the migration adds a new API call pattern that the CSP must allow.

### 7. Caching Layer Strategy

**Current state:** Three caching layers exist:
- Service Worker: Pokemon sprites (CacheFirst, 7d), PokeAPI responses (NetworkFirst, 1h)
- TanStack Query: Draft state, Pokemon data (staleTime 5m, gcTime 10m)
- In-memory: Pokemon search index, format data (module-level singletons)

**Missing layers:**

a) **API response caching for public/static endpoints:**

```typescript
// Health check — can be cached at edge
export async function GET() {
  return NextResponse.json(health, {
    headers: {
      'Cache-Control': 's-maxage=30, stale-while-revalidate=60'
    }
  })
}

// Public draft listing (/api/drafts?public=true)
// Cache at Vercel edge for 30s with SWR
'Cache-Control': 's-maxage=30, stale-while-revalidate=120'
```

b) **TanStack Query staleTime increases for immutable data:**
- Pokemon species data: increase staleTime from 5m to 24h (PokeAPI data never changes)
- Format rules: increase from 5m to infinity (loaded from static files)
- Draft results after completion: increase staleTime to infinity (immutable once completed)

c) **Supabase query result caching:** The `draft-cache-db.ts` file exists — ensure it's used for completed draft data (immutable) to avoid re-querying the database.

**Integration points:**
- `src/app/api/health/route.ts` — Add Cache-Control header
- `src/hooks/usePokemon.ts` — Increase staleTime to 24h
- `src/lib/pokemon-cache.ts` — Verify LRU eviction settings handle 1000+ pokemon
- No new files needed

### 8. Dependency Vulnerability Audit

**Current state:** Package versions from `package.json`:
- `next: ^15.5.12` — safe (CVE-2025-29927 patched in 15.2.3)
- `@clerk/nextjs: ^7.0.8` — check for latest
- `@supabase/supabase-js: ^2.58.0` — check for latest
- `@sentry/nextjs: ^10.27.0` — check for latest
- `serialize-javascript` — override in package.json to `>=7.0.3` (security fix already applied)

**Audit command:**
```bash
npm audit --audit-level=moderate
```

**Integration point:** `package.json` — update dependencies. No architecture changes.

---

## Data Flow Changes

### Before (Current Flow): Pick Submission

```
Client picks Pokemon
  → optimistic update (Zustand)
  → POST /api/picks OR direct Supabase RPC
    → Supabase validates RLS (is_team_owner check)
    → INSERT into picks table
    → postgres_changes fires to ALL subscribers
      → 8 players * 5 table subscriptions = 40 RLS evaluations
  → Client gets realtime update
```

### After (Target Flow): Pick Submission

```
Client picks Pokemon
  → optimistic update (Zustand)
  → POST /api/picks (rate-limited by middleware)
    → Clerk auth check (server-side, in route handler)
    → Zod input validation
    → Supabase INSERT (RLS or service role for validated writes)
    → Server broadcasts pick event: channel.send({ event: 'pick_made', payload })
  → All clients receive broadcast (no RLS eval per subscriber)
  → Keep postgres_changes ONLY for drafts table (turn/status changes)
```

**Key improvement:** RLS evaluations drop from O(subscribers * tables) to O(1) per pick.

---

## Build Order (Dependencies Between Changes)

Security and scalability work has internal dependencies. Build in this order to avoid rework:

### Phase 1 — Foundation (no dependencies, can parallelize)
1. **Dependency audit** — `npm audit`, update packages. Zero risk, no code changes.
2. **Database RLS audit** — Run pg_stat_statements queries, Security Advisor, add missing indexes. Pure SQL/dashboard work.
3. **Supavisor configuration** — Dashboard toggle + env var. No code changes.

### Phase 2 — Application Security (depends on Phase 1 audit findings)
4. **Nonce-based CSP** — Modify `src/middleware.ts` + `next.config.ts`. Must come before guest session work because it removes `unsafe-inline` that XSS attacks exploit.
5. **Middleware hardening** — Extend rate limiting to use Clerk userId, add spectate/join routes. Modifies existing `src/middleware.ts` only.
6. **API route auth hardening** — Enforce `auth().protect()` or Clerk server checks in all mutating API routes. Audit each route in `src/app/api/`.

### Phase 3 — Scalability (depends on Phase 2 auth being correct)
7. **Realtime broadcast migration** — Replace `picks` + `teams` postgres_changes with server-broadcast. Modifies `DraftRealtimeManager` + pick/auction services. Requires correct server-side auth from Phase 2.
8. **Guest session server-issuance** — New `/api/guest/session` endpoint + `UserSessionService` migration. Depends on CSP being correct (Phase 2).

### Phase 4 — Cost Optimization (independent, low risk)
9. **Caching headers** — API route Cache-Control + TanStack Query staleTime increases.
10. **Presence optimization** — Spectator-only connections skip presence tracking.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Middleware-Only Auth
**What:** Relying on `clerkMiddleware` as the sole auth gate.
**Why bad:** CVE-2025-29927 proved middleware can be bypassed. Fortunately, this project runs Next.js 15.5.12 (patched), but defense-in-depth requires auth checks inside API route handlers too.
**Instead:** Every mutating API route calls `auth()` from `@clerk/nextjs/server` and throws 401 if no session. Server Components call `auth()` before any data mutation.

### Anti-Pattern 2: postgres_changes at Scale
**What:** Using `postgres_changes` for all real-time events with many subscribers.
**Why bad:** Every event = N RLS checks (one per subscriber). Confirmed by Supabase docs: 100 subscribers + 1 insert = 100 reads.
**Instead:** Use broadcast for server-controlled events. Reserve postgres_changes for low-subscriber, row-filtered tables (private wishlists, admin events).

### Anti-Pattern 3: Static CSP String with unsafe-eval
**What:** The current `next.config.ts` CSP has `'unsafe-eval'` in script-src to accommodate Next.js internals.
**Why bad:** `unsafe-eval` allows `eval()` and `new Function()` — the primary XSS code execution vector.
**Instead:** Nonce-based CSP in middleware. Next.js 15 App Router supports nonce extraction for its own scripts when CSP header includes a `nonce-{value}` token.

### Anti-Pattern 4: Guest ID in localStorage as Auth Credential
**What:** Current guest IDs in localStorage used as the only proof of ownership for database rows.
**Why bad:** XSS attack reads localStorage — steals guest ID — makes picks on behalf of that team.
**Instead:** Server-issued guest IDs returned as httpOnly cookies (primary auth surface) + localStorage (display/convenience only). API routes validate cookie not body-supplied ID.

### Anti-Pattern 5: In-Memory Rate Limiter as Primary Limiter
**What:** Current code uses in-memory rate limiter as fallback when Upstash Redis is not configured.
**Why bad:** In-memory state resets between serverless function invocations (Vercel spins up multiple instances). The same client can hit different instances and bypass the limit.
**Instead:** Always configure Upstash Redis for production. The in-memory fallback is acceptable in development only. Add startup check that warns loudly in production if Redis is not configured.

### Anti-Pattern 6: Permissive SELECT + TEXT User ID Comparison
**What:** RLS SELECT policies use `USING (true)` — any anon client can read all rows.
**Why bad:** Draft data (Pokemon picks, team compositions, budgets) may be strategically sensitive in sealed/blind draft modes. Evaluate before launching sealed draft features.
**Instead:** For the current use case (transparent drafts), permissive SELECT is intentional and acceptable. If sealed draft is added, restrict picks SELECT during active phase.

---

## Scalability Considerations

| Concern | At 100 concurrent users | At 1K concurrent users | At 10K concurrent users |
|---------|------------------------|----------------------|------------------------|
| Supabase Realtime connections | ~100 (free tier 200 limit) | ~1000 (Pro base 500, overage billed) | Need broadcast model to reduce per-event multiplier |
| RLS evaluation load | Manageable with indexes | Starts to slow without broadcast migration | Must switch to broadcast pattern |
| Rate limiter accuracy | In-memory works | Upstash required (multi-instance Vercel) | Upstash required + regional distribution |
| Connection pool exhaustion | Not a risk (HTTP-based Supabase JS) | Not a risk | Only risk if raw pg connections added |
| Vercel serverless cold starts | Occasional | Frequent on spiky traffic | Consider reserved concurrency |
| PokeAPI dependency | Cached well (7d sprites, 1h data) | Same — no risk | Same — PokeAPI is not a scalability bottleneck |

---

## Sources

- [Supabase Connection Management docs](https://supabase.com/docs/guides/database/connection-management)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Supabase Realtime Pricing](https://supabase.com/docs/guides/realtime/pricing)
- [Supabase RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Supabase Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors)
- [Supabase Query Optimization](https://supabase.com/docs/guides/database/query-optimization)
- [Supabase Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase Broadcast docs](https://supabase.com/docs/guides/realtime/broadcast)
- [Next.js CSP with nonces (App Router)](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
- [CVE-2025-29927 Next.js Middleware Bypass](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw)
- [Clerk security blog on CVE-2025-29927](https://clerk.com/blog/cve-2025-29927)
- [Upstash Rate Limiting for Next.js Edge](https://upstash.com/blog/edge-rate-limiting)
- [localStorage vs httpOnly cookies security](https://design-code.tips/blog/2025-02-28-why-local-storage-is-vulnerable-to-xss-attacks-and-a-safer-alternative/)
- [Vercel Edge Caching / stale-while-revalidate](https://vercel.com/blog/vercel-cache-api-nextjs-cache)
