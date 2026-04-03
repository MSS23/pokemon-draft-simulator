# Project Research Summary

**Project:** Pokemon Draft — draftpokemon.com
**Domain:** Security hardening and scalability audit for a production Next.js 15 + Supabase + Clerk real-time platform
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

This milestone targets security hardening and scalability for an existing, working product. The research revealed that the platform already has a strong foundation: Upstash Redis rate limiting, Zod validation, Supabase RLS, Clerk auth, Sentry, and most standard security headers are already in place. The gap is not missing infrastructure — it is incomplete application of existing infrastructure. Specific items like Clerk `authorizedParties` validation, guest user server-side verification, and CSP nonce adoption are partially or inconsistently implemented across the codebase. The most impactful work is plugging these gaps rather than adding new systems.

The recommended approach prioritizes work in four sequential layers: (1) critical version fixes and cost safeguards that carry zero code risk, (2) application-layer security hardening that closes concrete exploit vectors, (3) scalability changes to Supabase Realtime that reduce cost and increase connection headroom, and (4) observability and cost optimization as independent cleanup. The ordering matters — CSP changes must precede guest session migration, and server-side auth hardening must precede the Realtime broadcast migration. Doing these out of order risks breaking working features or making correct security fixes that a later change undermines.

The dominant risk in this milestone is not missing a security feature — it is breaking existing features while adding security. The codebase has a non-standard auth model (Clerk JWTs with Supabase RLS) where standard RLS patterns using `auth.uid()` silently fail. Any RLS audit that does not account for this will produce policies that look correct but block all mutations. Similarly, tightening CSP without first auditing which domains Clerk requires will silently break authentication in production. Every security change in this milestone has an adjacent breakage risk that must be tested before shipping.

## Key Findings

### Recommended Stack

The existing stack requires no new major dependencies. Only three new npm packages are needed: `@upstash/ratelimit` and `@upstash/redis` (which may already be installed — the existing middleware already references Upstash), and `isomorphic-dompurify` for SSR-safe XSS sanitization. All other hardening tasks are configuration changes, SQL migrations, or code coverage improvements against already-installed packages. See [STACK.md](.planning/research/STACK.md) for full rationale and alternatives considered.

**Core technologies (additions only):**
- `@upstash/ratelimit` + `@upstash/redis`: Persistent rate limiting across serverless instances — existing in-memory fallback is non-functional under Vercel scaling (resets per cold start)
- `isomorphic-dompurify`: XSS sanitization that works in both Server Components and client — plain DOMPurify throws in SSR contexts (Next.js issue #46893)
- `k6` (standalone binary, not npm): Load testing for pre-launch capacity validation — TypeScript-native, Supabase's own benchmark tool; keep test scripts in `tests/load/`

**What to explicitly avoid:** Cloudflare WAF (complicates Clerk JWT distribution), Helmet.js (Node.js middleware incompatible with App Router), custom Redis session store (duplicates Clerk's JWT session layer), Prisma migration (rewrite risk with no security benefit), CAPTCHA on draft/pick actions (invite-based rooms, friction exceeds threat surface).

### Expected Features

The features research identified what is already done versus what remains. This milestone is unusual in that most "table stakes" items are partially implemented — the question is whether they are correctly applied everywhere, not whether to build them. See [FEATURES.md](.planning/research/FEATURES.md) for the full prioritization matrix.

**Must have (table stakes):**
- CVE-2025-29927 patch verification + `x-middleware-subrequest` header strip — already at Next.js 15.5.12 (patched), add defense-in-depth header removal
- Supabase spend cap enabled — dashboard verification only, zero code required
- RLS index audit + SELECT subquery wrapper pattern — SQL changes only, prevents 100x query slowdowns at scale
- Clerk `authorizedParties` validation across all server auth calls — low-complexity, high-security-value audit across every `auth()` call
- Clerk webhook signature verification — prevents forged webhook events from bypassing auth flows
- Upstash Redis confirmed configured in production — in-memory fallback is bypassable on Vercel (Pitfall 7)
- RLS policy authenticated-role enforcement — add `TO authenticated` on non-public policies to eliminate anon query cost

**Should have (competitive hardening):**
- Nonce-based CSP replacing static `unsafe-eval`/`unsafe-inline` in `next.config.ts`
- Server-issued guest session IDs (httpOnly cookie) replacing localStorage-only guest IDs
- Realtime broadcast migration for picks/bids — reduces RLS fan-out from O(subscribers) to O(1) per pick
- `npm audit` CI gate blocking builds on critical/high CVEs
- CORS explicit header on API routes
- Rate limit event logging to Sentry for attack pattern detection

**Defer to post-beta:**
- Full Postgres Changes to Broadcast migration (high refactor risk; needs production data to justify)
- Nonce-based strict CSP removing all `unsafe-inline` for `style-src` (Radix UI + Tailwind require it)
- Row-level encryption (Pokemon draft data contains no PII beyond display names)
- Full WAF (Cloudflare Enterprise) — rate limiting at Vercel edge is sufficient at beta scale
- Audit log table (useful for forensics but not launch-blocking)

### Architecture Approach

The platform uses a five-layer security model: browser/PWA, Vercel Edge (CDN + middleware), Next.js App Router (API routes + Server Components), Supabase (PostgreSQL + RLS + Realtime), and Clerk (auth). Each layer has distinct security responsibilities and must not depend solely on the layer above for security guarantees. The current architecture violates this principle in one specific place: middleware-only auth enforcement for protected routes. Defense-in-depth requires redundant `auth()` checks inside every mutating API route handler independent of middleware. See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for the full component map, integration point details, and data flow diagrams.

The most architecturally significant change in this milestone is the Realtime hybrid model: switching high-frequency events (picks, bids, turn advances) from `postgres_changes` to server-controlled Broadcast. The current model has RLS fan-out on every pick — 8 subscribers means 8 RLS evaluations per pick INSERT. At 50 simultaneous drafts during a community tournament, this becomes the primary database load. The broadcast migration reduces this to a single DB write plus a server-side broadcast send, eliminating per-subscriber RLS cost entirely.

**Major components and their changes:**
1. **Edge Middleware (`src/middleware.ts`)** — Extend rate limiting key to use Clerk userId; add `x-middleware-subrequest` header strip; add rate limit patterns for `/spectate/` and `/join-draft`
2. **RLS policies (SQL migrations)** — Wrap auth calls in `(SELECT auth.uid())` subqueries; verify custom JWT helper function (not raw `auth.uid()`) is used consistently across all tables; confirm indexes on all `USING` clause columns
3. **DraftRealtimeManager (`src/lib/draft-realtime.ts`)** — Replace `picks` and `teams` postgres_changes subscriptions with broadcast listeners; keep postgres_changes only for `drafts` table (turn/status) and `wishlist_items` (private, per-user filtered)
4. **Pick/auction services** — Add server-side broadcast send after successful DB write to drive the hybrid broadcast model
5. **`next.config.ts` CSP** — Replace static CSP with nonce-based generation in middleware; add Clerk FAPI domain to `connect-src` dynamically from env var; remove `unsafe-eval` (audit Framer Motion dependency first)
6. **Guest session (`src/lib/user-session.ts`)** — Add `/api/guest/session` endpoint for server-issued httpOnly cookie; keep localStorage for display convenience only; rate limit the new endpoint

### Critical Pitfalls

See [PITFALLS.md](.planning/research/PITFALLS.md) for full severity analysis. Top five pitfalls by impact:

1. **RLS tightening silently freezes Realtime** (CRITICAL) — Supabase checks RLS at the subscription layer. Adding per-user SELECT policies to `picks`, `teams`, or `drafts` will cause spectators and non-picking participants to stop receiving events with no error thrown — the WebSocket stays open but events are silently dropped. Prevention: keep SELECT policies draft-scoped (`USING (draft_id = $draft_id)`), not user-scoped. Always test by opening two browser tabs as different users after any RLS migration.

2. **Clerk JWT + `auth.uid()` silent mismatch** (CRITICAL) — Clerk user IDs are strings (`user_abc123`), not UUIDs. Supabase's `auth.uid()` casts `sub` to UUID type and silently returns NULL for Clerk users. New RLS policies using `auth.uid()` look correct but block every mutation silently — no error is thrown, operations just return empty. Prevention: audit `FIX-RLS-POLICIES.md` to identify the existing custom JWT helper function, then use only that function across every new policy. Never mix `auth.uid()` and custom claim functions.

3. **CSP `connect-src` missing Clerk FAPI hostname** (CRITICAL) — Adding or tightening CSP without including Clerk's Frontend API hostname breaks token refresh. The CSP blocks Clerk's `fetch()` calls silently in production. Sessions expire and users cannot re-authenticate. The Clerk FAPI hostname differs between development and production instances. Prevention: derive Clerk FAPI URL from environment variable (not hardcoded); test full auth flow (sign-in + 60-second token refresh) after any CSP change; use `Content-Security-Policy-Report-Only` in staging first.

4. **Realtime channel count multiplication** (HIGH) — React StrictMode mounts components twice in development; client-side navigation does not always trigger full `useEffect` cleanup before new page mounts. If channels are not cleaned up on unmount, navigation patterns (leave draft, return) accumulate open channels against the Pro tier's 500-connection limit. Prevention: audit `supabase.getChannels().length` on mount in the draft page; add `supabase.removeAllChannels()` on `beforeunload` as safety net; grep all files calling `supabase.channel()` for cleanup on unmount.

5. **Guest user IDs as rate limit keys are spoofable** (HIGH) — The rate limiter falls back to `request.cookies.get('user_id')` for guest users. Any client can rotate cookie values per request, bypassing per-user rate limits. The guest ID pattern (`guest-{timestamp}-{random}`) may also be predictable enough for enumeration. Prevention: use IP address (not cookie value) as the rate limit fallback for unauthenticated requests; if guest session tracking is needed, use server-issued signed cookies verified in middleware, not client-generated values.

## Implications for Roadmap

Based on the combined research, the milestone maps to four phases with clear internal dependency ordering. The build order is not arbitrary — CSP must stabilize before guest session migration, and server-side auth must be correct before Realtime broadcast migration.

### Phase 1: Critical Fixes and Cost Safeguards
**Rationale:** These items carry zero breakage risk (no app code changes), protect against the most severe outcomes, and establish the safe baseline that all subsequent phases depend on. The Next.js version is already patched per architecture research (15.5.12), so this phase focuses on the remaining critical gaps: confirming production environment configuration and adding defense-in-depth for the CVE.
**Delivers:** Confirmed Supabase spend cap, verified production Upstash Redis configuration, `x-middleware-subrequest` defense-in-depth header strip, dependency audit baseline, Supabase billing alerts enabled.
**Addresses:** CVE-2025-29927 defense-in-depth, spend cap verification, in-memory rate limiter production risk, `npm audit` CI gate setup.
**Avoids:** Billing surprises (Pitfall 14, 15), in-memory rate limiter bypass (Pitfall 7).

### Phase 2: Application Security Hardening
**Rationale:** These changes close concrete, exploitable gaps in the existing auth and validation implementation. They depend on Phase 1 establishing the correct baseline but do not depend on each other — they can be parallelized within this phase. CSP changes must be validated and stable before the guest session migration in Phase 3, because the guest session API endpoint added in Phase 3 must be in the CSP allowlist.
**Delivers:** Clerk `authorizedParties` enforcement across all server auth calls, webhook signature verification, CSP nonce migration with Clerk FAPI domain, guest write-path server validation, CORS hardening on API routes, input sanitization audit for `dangerouslySetInnerHTML` occurrences.
**Uses:** `isomorphic-dompurify` (new install), `zod` (expand existing coverage), Clerk server SDK (expand existing usage)
**Addresses:** Middleware-only auth reliance, CSP `unsafe-eval` removal, Clerk FAPI CSP breakage prevention, XSS via stored text fields.
**Avoids:** Architecture Anti-Pattern 1 (middleware-only auth), Pitfall 3 (CSP Clerk FAPI), Pitfall 13 (XSS via team/draft names).

### Phase 3: Supabase Scalability and RLS Hardening
**Rationale:** This is the highest-complexity phase with the highest breakage risk. It requires Phase 2 server-side auth to be correct before migrating Realtime to the broadcast model — the broadcast path requires verified server identity for the pick/bid services to send broadcast events. The RLS audit must use the correct Clerk JWT helper function confirmed in Phase 2. RLS index work and broadcast migration can be parallelized within this phase.
**Delivers:** RLS policy audit with SELECT subquery wrapper pattern, missing index additions on `host_id`/`user_id`/`draft_id`/`team_id` columns, Realtime broadcast migration for picks and bids (eliminating per-subscriber RLS fan-out), Supavisor connection pooling confirmed, channel cleanup enforcement across all subscription sites.
**Implements:** Hybrid broadcast architecture — server sends broadcast after DB write; clients listen on broadcast channel; postgres_changes retained only for `drafts` table and private tables
**Addresses:** RLS fan-out cost, connection limit headroom, N+1 query elimination.
**Avoids:** Pitfall 1 (RLS Realtime freeze), Pitfall 2 (Clerk/auth.uid() mismatch), Pitfall 8 (RLS index degradation), Pitfall 10 (channel count multiplication).

### Phase 4: Observability, Cost Optimization, and Load Testing
**Rationale:** These changes are independent of phases 1-3 in terms of code dependencies, but benefit from the hardened foundation. Cache header additions and TanStack Query staleTime increases carry no security coordination risk. Load testing should run after Phase 3 is complete to validate the broadcast migration and channel cleanup under realistic concurrent draft scenarios — testing before Phase 3 would measure the old architecture.
**Delivers:** PokeAPI CDN caching headers (`Cache-Control: s-maxage=86400`), ISR for landing/marketing pages, TanStack Query staleTime increases for immutable Pokemon/format data, Realtime subscription column filtering to reduce message payload, rate limit event logging to Sentry, Realtime connection peak monitoring, k6 load test scenarios for 8-player concurrent drafts.
**Addresses:** Server compute cost reduction, Realtime message cost reduction, dependency vulnerability CI gate.
**Avoids:** Pitfall 12 (security theater — no HTTPS redirect middleware, no IP allowlists), Pitfall 15 (over-engineering for non-existent scale).

### Phase Ordering Rationale

- Phase 1 before everything: establishes safe billing environment and confirms the production security baseline without touching any application code; zero breakage risk
- Phase 2 before Phase 3: CSP nonce changes must be validated and stable before the guest session httpOnly cookie migration (which adds a new API endpoint the CSP must allow); server-side `auth()` checks in API routes must be confirmed correct before Realtime broadcast migration trusts server identity for broadcast sends
- Phase 3 before Phase 4 load testing: load tests against the broadcast model will show meaningfully different results than against the postgres_changes model; testing Phase 3 changes under load validates the migration was correct
- Phases 1 and 2 can be worked by parallel tracks; Phase 3 has internal step dependencies (RLS audit must precede broadcast migration so new RLS policies don't break the existing subscription pattern before the migration is complete)

### Research Flags

Phases likely needing deeper implementation planning:
- **Phase 2 (CSP unsafe-eval removal):** Framer Motion and some Radix UI internals may require `eval()`. Run `grep -r "eval(" node_modules/framer-motion/dist/` before committing to full `unsafe-eval` removal. Use `Content-Security-Policy-Report-Only` mode first to discover violations without blocking. This may need to be deferred if Framer Motion requires eval.
- **Phase 3 (Clerk/Supabase JWT integration path):** Clerk deprecated its legacy Supabase JWT template in April 2025. The codebase's `FIX-RLS-POLICIES.md` documents a workaround, but which JWT integration path is currently active (legacy vs. native Supabase integration) needs confirmation before writing any new RLS policies — the correct custom JWT helper function depends on this.
- **Phase 3 (Realtime broadcast migration blast radius):** The migration touches `DraftRealtimeManager`, `draft-picks-service`, `auction-service`, and potentially `useWishlistSync`. Precisely map which tables must stay on postgres_changes (private per-user filtered data like `wishlist_items`) before implementation. Mixing broadcast and postgres_changes in the same subscription code requires clear separation.

Phases with standard patterns (skip deeper research):
- **Phase 1:** All tasks are dashboard configuration or standard npm commands — no domain research needed
- **Phase 4 (caching headers):** Cache-Control patterns for Next.js API routes and TanStack Query staleTime are well-documented standard patterns
- **Phase 4 (k6 load tests):** Standard k6 TypeScript test structure; all scenario types documented clearly in STACK.md research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All additions sourced from official Vercel, Upstash, and Next.js documentation. "No major new dependencies" conclusion is well-supported. |
| Features | HIGH | Features research cross-referenced official Supabase, Clerk, and Next.js docs. The existing-vs-missing gap analysis is based on actual codebase file references confirmed in architecture research. |
| Architecture | HIGH | Grounded in actual codebase file paths and confirmed current state (Next.js version 15.5.12, package.json dependencies, middleware implementation). Not inferred — verified against existing code. |
| Pitfalls | HIGH for Supabase/Clerk integration (official docs + GitHub issues verified); MEDIUM for scalability thresholds (community-verified extrapolated load models, not measured production data) |

**Overall confidence:** HIGH

### Gaps to Address

- **Clerk JWT integration path (legacy vs. native):** The pitfalls research identifies April 2025 as the deprecation date for Clerk's legacy Supabase JWT template. `FIX-RLS-POLICIES.md` documents a workaround, but whether the codebase has been migrated to native Supabase integration is not confirmed. Confirm this at the start of Phase 3 — the correct custom JWT helper function for new RLS policies depends on which path is active.
- **`dangerouslySetInnerHTML` usage count:** The input sanitization pitfall identifies this as the primary XSS risk, but the actual count of occurrences is unknown. Run `grep -r "dangerouslySetInnerHTML" src/` at the start of Phase 2 to scope the work accurately.
- **Framer Motion `eval()` dependency:** Whether the current Framer Motion version requires `eval()` is flagged as a potential blocker for full CSP tightening. Needs a targeted check before committing to the CSP nonce phase scope.
- **Actual Supabase channel count per participant:** The connection limit math assumes ~1 channel per participant using the consolidated `DraftRealtimeManager`. If older subscription code in hooks creates additional channels, the math and the upgrade decision changes. Instrument `supabase.getChannels().length` in a staging test session before Phase 3 to establish the actual baseline.
- **Upstash Redis already installed?:** The existing middleware references Upstash — run `npm ls @upstash/ratelimit @upstash/redis` before adding to package.json to avoid duplicate installs.

## Sources

### Primary (HIGH confidence)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits) — connection quotas, fan-out behavior
- [Supabase Realtime Pricing](https://supabase.com/docs/guides/realtime/pricing) — message cost model and fan-out math
- [Supabase RLS Performance Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — initPlan pattern, SELECT subquery wrapper
- [Supabase Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod) — spend cap, billing alerts
- [Supabase Broadcast docs](https://supabase.com/docs/guides/realtime/broadcast) — broadcast vs postgres_changes architecture
- [Supabase Connection Management](https://supabase.com/docs/guides/database/connection-management) — Supavisor setup
- [Supabase Performance Advisor](https://supabase.com/docs/guides/database/database-advisors) — RLS index lint warnings
- [Next.js CSP with nonces (App Router)](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy) — nonce generation pattern
- [CVE-2025-29927 Next.js Advisory](https://nextjs.org/blog/cve-2025-29927) — middleware bypass details and patch version
- [CVE-2025-55182 RSC RCE Advisory](https://snyk.io/blog/security-advisory-critical-rce-vulnerabilities-react-server-components/) — RSC vulnerability
- [Clerk CSP Headers Guide](https://clerk.com/docs/guides/secure/best-practices/csp-headers) — FAPI domain requirements
- [Clerk JWT Security / authorizedParties](https://clerk.com/docs/guides/sessions/manual-jwt-verification) — JWT validation
- [Clerk Supabase Integration Docs](https://clerk.com/docs/guides/development/integrations/databases/supabase) — JWT template deprecation (April 2025)
- [Upstash Rate Limiting for Vercel Edge](https://upstash.com/blog/edge-rate-limiting) — edge-compatible rate limiting
- [Vercel Firewall Documentation](https://vercel.com/docs/vercel-firewall) — WAF bot filter configuration

### Secondary (MEDIUM confidence)
- [Supabase Realtime RLS Issue #35195](https://github.com/supabase/supabase/issues/35195) — RLS silently breaks Realtime subscriptions
- [Supabase Discussion #33091](https://github.com/orgs/supabase/discussions/33091) — Clerk/auth.uid() UUID mismatch behavior
- [localStorage vs httpOnly cookies security](https://design-code.tips/blog/2025-02-28-why-local-storage-is-vulnerable-to-xss-attacks-and-a-safer-alternative/) — guest ID security model rationale
- [Vercel Edge Caching](https://vercel.com/blog/vercel-cache-api-nextjs-cache) — s-maxage and stale-while-revalidate patterns
- [isomorphic-dompurify GitHub](https://github.com/kkomelin/isomorphic-dompurify) — SSR/CSR DOMPurify wrapper

### Tertiary (LOW confidence — validate during implementation)
- Scalability threshold math (connections per concurrent draft, message fan-out estimates at 500 simultaneous drafts) — derived from official pricing models but based on projected load, not measured production data
- Framer Motion eval() requirement — flagged in community issues but not verified against the specific installed version

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*
