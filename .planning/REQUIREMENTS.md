# Requirements: Pokemon Draft — Security Hardening & Scalability Audit

**Defined:** 2026-04-03
**Core Value:** Harden the application for production-scale traffic and ensure infrastructure costs don't spiral before public launch.

## v5 Requirements

Requirements for Milestone 5. Each maps to roadmap phases.

### Security Hardening

- [ ] **SEC-01**: Clerk `authorizedParties` enforced on all authenticated API routes and middleware
- [ ] **SEC-02**: CSP migrated from static to nonce-based (remove `unsafe-eval` and `unsafe-inline`)
- [ ] **SEC-03**: Guest write-path validated server-side (guest ID verified before mutations)
- [ ] **SEC-04**: CORS restricted to production domain(s) only
- [x] **SEC-05**: `x-middleware-subrequest` header stripped at edge (CVE-2025-29927 defense-in-depth)
- [ ] **SEC-06**: Guest sessions issued server-side via httpOnly cookie (replace localStorage IDs)
- [ ] **SEC-07**: Input sanitization audit — all API routes validated with Zod schemas, HTML sanitized with DOMPurify

### Rate Limiting & Abuse Prevention

- [x] **RATE-01**: Redis-backed rate limiting enforced in production (Upstash, no in-memory fallback)
- [ ] **RATE-02**: Per-endpoint rate limits tuned (draft picks, auction bids, API reads, auth endpoints)
- [ ] **RATE-03**: Rate limit bypass prevention — key by IP + authenticated user, not spoofable guest cookie
- [ ] **RATE-04**: IP-based fallback rate limiting for unauthenticated requests
- [ ] **RATE-05**: WebSocket connection rate limiting (max connections per user/IP)

### Supabase Cost & Scalability

- [ ] **SUPA-01**: Supabase spend cap verified and billing alerts configured
- [x] **SUPA-02**: RLS indexes added (btree on user_id, draft_id, team_id columns used in policies)
- [ ] **SUPA-03**: Realtime channel cleanup enforced (unsubscribe on unmount, connection leak prevention)
- [x] **SUPA-04**: Broadcast migration for picks/bids (replace postgres_changes to eliminate O(subscribers) fan-out)
- [x] **SUPA-05**: RLS SELECT policies wrapped with security-definer functions to prevent N+1 fan-out reads

### Performance & Caching

- [ ] **PERF-01**: PokeAPI responses served with CDN cache headers (long TTL for static data)
- [ ] **PERF-02**: TanStack Query staleTime optimized per query type (static data 30min+, draft state 0)
- [x] **PERF-03**: Static/semi-static pages converted to ISR where applicable
- [ ] **PERF-04**: k6 load testing suite covering draft creation, picks, realtime subscriptions, and concurrent users
- [x] **PERF-05**: Connection pool monitoring dashboard (active Realtime connections, DB query latency)

## Future Requirements

Deferred to post-beta. Tracked but not in current roadmap.

### Extended Security

- **SEC-F01**: Full Postgres Changes to Broadcast migration (all tables, not just picks/bids)
- **SEC-F02**: Strict CSP removing all `unsafe-inline` for `style-src` (blocked by Radix UI + Tailwind)
- **SEC-F03**: Audit log table for forensic analysis of admin actions
- **SEC-F04**: Row-level encryption for sensitive fields

### Infrastructure

- **INFRA-F01**: Cloudflare WAF for enterprise-grade DDoS protection
- **INFRA-F02**: Geographic CDN edge caching for international users

## Out of Scope

| Feature | Reason |
|---------|--------|
| CAPTCHA on draft/pick actions | Invite-based rooms — friction exceeds threat surface |
| Helmet.js middleware | Incompatible with Next.js App Router |
| Custom Redis session store | Duplicates Clerk's JWT session layer |
| Prisma migration | Rewrite risk with no security benefit |
| Cloudflare WAF (Enterprise) | Rate limiting at Vercel edge sufficient at beta scale |
| IP allowlists | Over-engineering for community platform |
| Row-level encryption | Draft data contains no PII beyond display names |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 24 | Pending |
| SEC-02 | Phase 24 | Pending |
| SEC-03 | Phase 24 | Pending |
| SEC-04 | Phase 24 | Pending |
| SEC-05 | Phase 23 | Complete |
| SEC-06 | Phase 25 | Pending |
| SEC-07 | Phase 24 | Pending |
| RATE-01 | Phase 23 | Complete |
| RATE-02 | Phase 24 | Pending |
| RATE-03 | Phase 24 | Pending |
| RATE-04 | Phase 24 | Pending |
| RATE-05 | Phase 25 | Pending |
| SUPA-01 | Phase 23 | Pending |
| SUPA-02 | Phase 25 | Complete |
| SUPA-03 | Phase 25 | Pending |
| SUPA-04 | Phase 25 | Complete |
| SUPA-05 | Phase 25 | Complete |
| PERF-01 | Phase 26 | Pending |
| PERF-02 | Phase 26 | Pending |
| PERF-03 | Phase 26 | Complete |
| PERF-04 | Phase 26 | Pending |
| PERF-05 | Phase 26 | Complete |

**Coverage:**
- v5 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after roadmap creation*
