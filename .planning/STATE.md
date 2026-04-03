---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
last_updated: "2026-04-03T09:35:25.290Z"
last_activity: 2026-04-03
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
---

# STATE.md

## Current Milestone

**Milestone 5:** Security Hardening & Scalability Audit
**Status:** Phase complete — ready for verification
**Next action:** `/gsd:plan-phase 23`

## Current Position

Phase: 23 (critical-fixes-cost-safeguards) — EXECUTING
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-04-03

## Progress Bar

```
[Phase 23] [Phase 24] [Phase 25] [Phase 26]
[        ] [        ] [        ] [        ]
  0/? plans  0/? plans  0/? plans  0/? plans
```

## Accumulated Context

### Project State

- Milestone 1 (Production Overhaul) complete
- Milestone 2 (Codebase Health) complete
- Milestone 3 paused — cherry-picked mobile, onboarding, PokePaste into M4
- Milestone 4 (Beta Launch) paused — security hardening prioritized before public launch
- Milestone 5 (Security Hardening) active — this milestone
- 414 tests passing, ~79K lines TypeScript, 30+ routes
- Domain: draftpokemon.com, deploying on Vercel

### Phase Dependency Chain

```
Phase 23 (zero-risk baseline)
  → Phase 24 (auth + CSP hardening)
      → Phase 25 (Supabase broadcast + RLS)
          → Phase 26 (caching + load test)
```

### Known Implementation Constraints

- CSP headers must be in `next.config.ts` only (not vercel.json — conflict risk)
- Framer Motion may require `unsafe-eval` — must audit before CSP tightening
- Clerk uses string user IDs — `auth.uid()` silently returns NULL for Clerk users; use the existing custom JWT helper from `FIX-RLS-POLICIES.md`
- RLS SELECT policies must be draft-scoped, not user-scoped — user-scoped policies silently drop Realtime events for spectators
- Broadcast migration blast radius: `DraftRealtimeManager`, `draft-picks-service`, `auction-service`, potentially `useWishlistSync`
- `wishlist_items` must stay on `postgres_changes` (private per-user filtered data)
- k6 is a standalone binary, not an npm package — keep test scripts in `tests/load/`

### Key Decisions

- Security hardening before public beta launch
- Phase ordering is dependency-driven: billing/CVE fixes first, then app auth, then Supabase scalability, then load validation
- Broadcast migration covers picks and bids only (not all tables) — full migration deferred to post-beta per SEC-F01
- Guest session httpOnly cookie (Phase 25) deferred after CSP stabilization (Phase 24) — the new `/api/guest/session` endpoint must be in the CSP allowlist first
- IP-based rate limiting for unauthenticated requests (RATE-04) in Phase 24 — guest cookie values are spoofable, IP is the correct fallback key
- [23-01] Strip x-middleware-subrequest unconditionally at edge before any auth checks (CVE-2025-29927 defense)
- [23-01] Upgrade Redis missing-config warning to console.error CRITICAL for Vercel log visibility
- [23-01] CI npm audit gate uses --audit-level=high: high/critical block builds, moderate/low non-blocking

### Pre-Phase Checks

Before starting Phase 23:

- Run `npm ls @upstash/ratelimit @upstash/redis` to verify Upstash is already installed
- Verify production Upstash env vars set in Vercel dashboard

Before starting Phase 24:

- Run `grep -r "eval(" node_modules/framer-motion/dist/` to check unsafe-eval dependency
- Run `grep -r "dangerouslySetInnerHTML" src/` to scope XSS work

Before starting Phase 25:

- Review `FIX-RLS-POLICIES.md` to confirm active JWT integration path
- Instrument `supabase.getChannels().length` in staging to establish baseline

## Last Updated

2026-04-03
