# Feature Landscape: Security Hardening & Scalability

**Domain:** Next.js 15 + Supabase + Clerk real-time application — security hardening for public beta
**Researched:** 2026-04-03
**Overall confidence:** HIGH (official docs + verified sources for all major claims)

---

## Existing Security Baseline (Already Built)

Before categorizing what to add, here is what the codebase already has — these are NOT tasks:

| Capability | File | Status |
|-----------|------|--------|
| Upstash Redis rate limiting (sliding window) | `src/middleware.ts` | Done — 5 route patterns |
| In-memory rate limiter fallback | `src/middleware.ts` | Done |
| X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy | `next.config.ts` | Done |
| Content-Security-Policy (but `unsafe-eval` in script-src) | `next.config.ts` | Partial — see Pitfalls |
| Input sanitization (XSS, HTML injection, ID format) | `src/lib/validation.ts` | Done |
| Zod schemas for API validation | `src/lib/schemas.ts` | Done |
| Supabase RLS on all tables | Database | Done |
| Clerk auth (JWT, OAuth, auto key rotation) | `src/middleware.ts` | Done |
| Sentry error tracking | `next.config.ts` | Done |
| Request ID injection | `src/middleware.ts` | Done |

---

## Table Stakes

Features users/attackers expect to find handled. Missing = exploitable or cost disaster.

### Security — Table Stakes

| Feature | Why Expected | Complexity | Current State | Notes |
|---------|--------------|------------|--------------|-------|
| Remove `unsafe-eval` from CSP | Allows arbitrary script execution; defeats the purpose of CSP | Low | Missing — `unsafe-eval` present in `script-src` | Audit which deps actually need eval; Framer Motion and some Radix components may require it; replace or use nonce-based CSP |
| CSP nonce for inline scripts | Next.js 15 hydration scripts require nonce OR unsafe-inline to function | Medium | Missing | Must use middleware to generate nonce per request and forward via `headers()`; see official Next.js CSP guide |
| Clerk `authorizedParties` validation | Without it, CSRF via JWT remains possible even with SameSite cookies | Low | Unknown — needs audit | Add `authorizedParties: ['https://draftpokemon.com']` to all `auth()` and `currentUser()` calls in server context |
| Clerk webhook signature verification | Without it, any POST to `/api/webhooks/clerk` is accepted as legitimate | Low | Unknown — needs audit | Use svix package with `CLERK_WEBHOOK_SECRET` env var to verify each inbound webhook |
| Next.js patched to fix CVE-2025-29927 | CVSS 9.1 — `x-middleware-subrequest` header bypasses all middleware logic (auth, rate limit) entirely | Critical | Needs version check | Run `npm audit`; update to Next.js 15.2.3+ or 14.2.25+; also strip the header in middleware as defense-in-depth |
| CVE-2025-55182 patch (RSC RCE) | Critical RCE via React Server Components Flight protocol — unauthenticated code execution | Critical | Needs version check | Same Next.js update addresses this; only App Router apps are affected |
| Dependency vulnerability scan | Known CVEs in transitive dependencies reach production undetected | Low | Not automated | Add `npm audit --audit-level=high` to CI; enable Dependabot security alerts on GitHub |
| RLS policy authenticated-role enforcement | Using only `auth.uid()` without `TO authenticated` allows anon users to trigger expensive RLS evaluation on every row | Low | Unknown | Add `TO authenticated` on all non-public RLS policies; eliminates anon query cost without logic change |
| Supabase anon key scope audit | Anon key is publicly exposed in JS bundle; verify no tables allow unrestricted writes without RLS | Low | Needs audit | Query `pg_policies` to confirm all tables have policies; check for accidental `USING (true)` write policies |
| Guest user write-path server validation | Guest IDs are format-validated client-side only; any string matching `guest-*` passes `isValidGuestId()` — pick and bid endpoints could be spoofed | Medium | Present risk | For write operations (picks, bids, trade proposals), add server-side check that guest ID exists in `participants` table before accepting the action |

### Rate Limiting — Table Stakes

| Feature | Why Expected | Complexity | Current State | Notes |
|---------|--------------|------------|--------------|-------|
| Supabase Auth rate limit configuration | Brute-force OTP/password reset; Supabase default is 30 req/bucket | Low | Supabase built-in; needs verification | Verify OTP expiry is 3600s or lower in Supabase Auth settings dashboard; tighten magic link limits |
| Realtime WebSocket connection cap per user | Single malicious user opening hundreds of channels exhausts project connection quota | Medium | Not implemented | Supabase limits: 200 peak (free), 500 (Pro), 10K (Team); enforce max 3 channels per authenticated user in `connection-manager.ts` |
| Admin endpoint server-side role verification | `/admin/*` routes protected by route matcher but role claim check may be client-only | Low | Needs audit | Verify Clerk `role` claim is checked via `auth().sessionClaims` server-side, not just in client component rendering logic |

### Supabase Cost — Table Stakes

| Feature | Why Expected | Complexity | Current State | Notes |
|---------|--------------|------------|--------------|-------|
| Supabase spend cap enabled | Viral growth without spend cap → unbounded bill; Pro plan has cap by default but must be confirmed | Low | Unknown — verify in dashboard | Pro plan spend cap is ON by default; confirm it is enabled; note: spend cap does NOT cover compute tier upgrades |
| Realtime message volume estimation | $2.50/million messages; Postgres Changes fan-out multiplies cost by subscriber count | Medium | Not estimated | Fan-out math: 10-player draft × 96 picks × 10 subscribers = 9,600 messages per draft; at 50 concurrent drafts = 480K messages per session (well within Pro 5M/month) |
| Pro plan connection limit awareness | Pro = 500 concurrent realtime connections; 10 users per draft = 50 simultaneous drafts max | Low | Not monitored | At beta scale this is sufficient; add realtime connection count logging to detect approach toward limit |
| Supavisor connection pooler active | Without Supavisor, direct Postgres connections = max 60 (Pro); exhausted at 60 concurrent API calls | Low | Unknown — verify connection string | Confirm all Supabase client calls use port 6543 (Supavisor) not 5432 (direct); check `.env.local` DATABASE_URL |

### Performance at Scale — Table Stakes

| Feature | Why Expected | Complexity | Current State | Notes |
|---------|--------------|------------|--------------|-------|
| RLS policy index audit | RLS using `auth.uid() = user_id` without btree index → full table scan per row per query; can be 100x slower | Low | Needs audit | Run Supabase Performance Advisor; ensure `user_id`, `draft_id`, `team_id`, `league_id` FK columns all have btree indexes |
| RLS function call wrapping (`SELECT` wrapper) | `auth.uid()` called once per row without wrapping = no optimizer caching; wrapping with `(select auth.uid())` caches per query | Low | Needs audit | Pattern fix: `WHERE (select auth.uid()) = user_id` instead of `WHERE auth.uid() = user_id` |
| N+1 query audit on draft load | Draft page loading teams, picks, participants separately in sequential queries | Medium | Partially addressed in M2 | Verify draft load uses JOIN or batched queries; the draft-service refactor in M2 should have addressed this but needs confirmation |

---

## Differentiators

Features that exceed basic hardening — meaningful improvements that make the platform trustworthy at scale.

### Security — Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Strip `x-middleware-subrequest` in middleware | Defense-in-depth for CVE-2025-29927 even before Next.js patch is applied | Low | One line in `middleware.ts`: delete the header from incoming request before any processing |
| CORS explicit header on API routes | Currently relying on Next.js defaults; explicit `Access-Control-Allow-Origin: https://draftpokemon.com` prevents cross-origin API abuse | Low | Add to API route handlers or middleware for `/api/*` paths |
| Realtime channel RLS coverage audit | Supabase Realtime respects RLS for Postgres Changes but Broadcast channels have no auth by default | Medium | Verify which subscriptions use Broadcast vs Postgres Changes; add server-side channel join validation if using Broadcast |
| Audit log for sensitive actions | Draft creation, pick submission, admin actions logged with user ID + IP + timestamp; forensics and abuse detection | Medium | New `audit_log` table with TTL policy (90 days); insert on key service actions; negligible query cost |
| Input length validation on all API routes | Current validation caps strings at 1000 chars in `sanitizeString()`; verify all routes actually call validation before DB insert | Low | Grep all API route handlers for `validateCreateDraftInput`, `validateCreatePickInput` usage; add where missing |

### Cost Optimization — Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Realtime channel cleanup on unmount | Orphaned channels from disconnected clients accumulate against connection quota and generate phantom messages | Medium | Audit `connection-manager.ts`, `draft-realtime.ts`, `useWishlistSync`, `useConnectionManager` — verify all call `supabase.removeChannel()` in cleanup |
| Selective realtime subscription columns | Postgres Changes sends full row by default; specify `columns` to reduce message payload size and egress | Low | Add `columns: ['id', 'current_turn', 'status']` to draft subscription; `columns: ['id', 'team_id', 'pokemon_id']` to picks subscription |
| PokeAPI response CDN caching | PokeAPI data is immutable; currently fetched fresh on each server request | Low | Add `Cache-Control: public, max-age=86400, s-maxage=86400` to `/api/pokemon/*` route responses; Vercel CDN serves cached response at zero compute cost |
| Static/ISR for marketing pages | Landing page (`/`), `/about`, `/terms`, `/privacy` — currently SSR; every view triggers a serverless function invocation | Low | Add `export const revalidate = 3600` to these route segments; Vercel serves from edge cache, eliminating function cost |
| Supabase egress column audit | `SELECT *` on large tables sends unnecessary columns over wire; SELECT * already fixed in M2 | None | Completed in Milestone 2 — verify no regressions |

### Observability — Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Supabase billing usage alerts | Know at 80% quota before hitting overage charges; no code required | Low | Configure in Supabase Dashboard > Organization > Billing > Notifications; 10-minute task |
| Rate limit event logging | See which IPs/users are being blocked; detect attack patterns vs. legitimate users hitting limits | Medium | Log 429 responses to Sentry with IP, route, user ID; aggregate in Sentry Issues dashboard |
| Dependency vulnerability CI gate | Block merges when `npm audit` finds critical/high severity CVEs | Low | Add GitHub Actions step: `npm audit --audit-level=high`; treat as required check |
| Realtime connection peak monitoring | Track peak connections per billing cycle to predict when Pro plan limit will be hit | Low | Log connection count in `connection-manager.ts` to Sentry Performance or a `metrics` table |

---

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full WAF (Cloudflare Enterprise, AWS Shield) | $100-$3000+/month; entirely out of scope at beta scale with under 1,000 users | Rate limiting at Vercel edge covers application-layer abuse; Vercel's network handles volumetric DDoS |
| Postgres Changes to Broadcast full migration | Correct long-term direction but high-risk refactor touching all realtime subscriptions; Postgres Changes is adequate at beta scale (<100 concurrent users) | Document migration path; defer to post-beta milestone after real usage data is available |
| Custom JWT / session layer | Clerk handles JWT issuance, rotation, expiry, CSRF, and OAuth; building alongside it creates vulnerabilities | Trust Clerk; audit Clerk integration correctness instead |
| Row-level encryption (pgcrypto) | Pokemon draft data contains no PII beyond display names and OAuth IDs; encryption overhead not justified | Standard RLS + TLS in transit is sufficient; Clerk handles sensitive auth data |
| CAPTCHA on draft/pick actions | Draft rooms are invite-based; adding friction reduces legitimate use; rate limiting covers bot abuse adequately | Existing rate limits (10 drafts/hour, 60 picks/minute) are sufficient guardrails |
| Redis-based session store | Clerk manages sessions via JWTs; adding Redis session storage is redundant and adds infrastructure cost | Continue using Clerk session management; Upstash Redis is only needed for rate limiting (already in place) |
| Automated security penetration testing service | Services like HackerOne or Detectify cost $500+/month; overkill for beta | Manual security audit against OWASP Top 10 during hardening phase; automate `npm audit` in CI |

---

## Feature Dependencies

```
Next.js CVE patch (version update)
  → must happen FIRST before all other security work
  → run npm audit after update to catch downstream breaks
  → test PWA, Sentry, Clerk integrations after update

Clerk authorizedParties fix
  → applies to every server component or API route calling auth() or currentUser()
  → can be done incrementally; low blast radius per file
  → safe to ship in small batches

CSP unsafe-eval removal
  → BLOCKED on: audit which npm packages call eval()
  → likely blockers: framer-motion (check if eval-free mode available), some Radix UI internals
  → if blocked, add nonce-based CSP as alternative path (higher complexity)
  → do NOT attempt without first running: node -e "require('./node_modules/framer-motion')" in eval-stripped env

Realtime channel cleanup audit
  → requires reading: connection-manager.ts, draft-realtime.ts, useWishlistSync.ts, useConnectionManager.ts
  → verify removeChannel() is called in useEffect cleanup for every subscription
  → grep: supabase.channel( to find all subscription sites

RLS index audit
  → requires: Supabase SQL Editor access
  → run: SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 20
  → run: SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public'
  → Supabase Performance Advisor flags missing indexes automatically

Guest ID server validation
  → requires: every write API route that accepts userId/teamId from request body
  → add DB lookup: SELECT id FROM participants WHERE user_id = $1 AND draft_id = $2
  → do NOT add to read-only routes (unnecessary overhead)

PokeAPI CDN caching
  → depends on: identifying which routes call PokeAPI or return Pokemon data
  → add Cache-Control header only to routes where response is not user-specific
  → test: verify Vercel CDN actually caches (check x-vercel-cache: HIT in response headers)
```

---

## MVP Recommendation

Prioritize in this order for the security hardening milestone:

**Phase 1 — Critical (ship-blocking):**
1. Next.js patch for CVE-2025-29927 + CVE-2025-55182 (`npm update next`)
2. Strip `x-middleware-subrequest` header in middleware (5 lines)
3. Supabase spend cap verification + billing alerts (dashboard config, no code)
4. RLS index audit + SELECT wrapper fixes (SQL changes, no app code)

**Phase 2 — Security Hardening:**
5. Clerk `authorizedParties` audit and fix across all server auth calls
6. Clerk webhook signature verification
7. CSP `unsafe-eval` removal (audit deps first; may be partially blocked)
8. Guest user ID server-side validation for write operations
9. Realtime channel cleanup enforcement audit
10. CORS hardening on API routes

**Phase 3 — Observability and Cost:**
11. PokeAPI CDN caching headers (`Cache-Control`)
12. ISR/static conversion for marketing pages
13. Realtime subscription column filtering
14. Rate limit event logging to Sentry
15. Dependency vulnerability CI gate (`npm audit` in GitHub Actions)

**Defer to post-beta:**
- Nonce-based strict CSP (high effort; may require replacing Framer Motion)
- Postgres Changes to Broadcast migration (major refactor; need production data first)
- Audit log table
- WAF evaluation

---

## Supabase Pricing Reference

| Tier | Monthly Cost | Realtime Connections (peak) | Realtime Messages | DB Egress |
|------|-------------|----------------------------|-------------------|-----------|
| Free | $0 | 200 | 2M/month | 5 GB |
| Pro | $25 | 500 ($10/1K overage) | 5M/month ($2.50/1M overage) | 250 GB |
| Team | $599 | 10,000 | Higher quota | 1 TB |

**Fan-out cost model for this app:** Postgres Changes sends one message per subscriber per DB change. A 10-player draft making 96 total picks = 960 DB events × 10 subscribers = 9,600 messages per draft session. At 50 simultaneous drafts: ~480,000 messages — well within Pro 5M/month. A viral event with 500 simultaneous drafts = 4.8M messages, approaching the Pro limit in a single session. Plan Broadcast migration before that scale is reached.

**Connection headroom on Pro:** 500 peak connections / 10 users per draft = 50 simultaneous active draft rooms. At beta launch targeting hundreds (not thousands) of concurrent users, this is adequate with room to spare.

---

## Sources

- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits) — HIGH confidence (official docs)
- [Supabase Realtime Pricing](https://supabase.com/docs/guides/realtime/pricing) — HIGH confidence (official docs)
- [Supabase RLS Performance Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — HIGH confidence (official docs)
- [Supabase Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod) — HIGH confidence (official docs)
- [Supabase Cost Control](https://supabase.com/docs/guides/platform/cost-control) — HIGH confidence (official docs)
- [Supabase Connection Management / Supavisor](https://supabase.com/docs/guides/database/connection-management) — HIGH confidence (official docs)
- [Supabase Broadcast vs Postgres Changes Benchmarks](https://supabase.com/docs/guides/realtime/benchmarks) — HIGH confidence (official docs)
- [Next.js CSP Guide](https://nextjs.org/docs/pages/guides/content-security-policy) — HIGH confidence (official docs)
- [Next.js Security: Server Components & Actions](https://nextjs.org/blog/security-nextjs-server-components-actions) — HIGH confidence (official blog)
- [CVE-2025-29927 — Next.js Middleware Bypass (CVSS 9.1)](https://snyk.io/blog/cve-2025-29927-authorization-bypass-in-next-js-middleware/) — HIGH confidence (Snyk advisory)
- [CVE-2025-55182 — React Server Components RCE](https://snyk.io/blog/security-advisory-critical-rce-vulnerabilities-react-server-components/) — HIGH confidence (Snyk advisory)
- [Clerk JWT Security / authorizedParties](https://clerk.com/docs/guides/sessions/manual-jwt-verification) — HIGH confidence (official docs)
- [Upstash Ratelimit for Vercel Edge](https://upstash.com/blog/edge-rate-limiting) — HIGH confidence (matches existing implementation)
- [Next.js Security Best Practices 2026 — Authgear](https://www.authgear.com/post/nextjs-security-best-practices) — MEDIUM confidence (third-party, well-sourced)
