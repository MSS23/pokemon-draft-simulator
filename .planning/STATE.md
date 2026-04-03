# STATE.md

## Current Milestone
**Milestone 5:** Security Hardening & Scalability Audit
**Status:** Defining requirements
**Next action:** Define requirements and create roadmap

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-03 — Milestone v5 started

## Accumulated Context

### Project State
- Milestone 1 (Production Overhaul) complete
- Milestone 2 (Codebase Health) complete
- Milestone 3 paused — cherry-picked mobile, onboarding, PokePaste into M4
- Milestone 4 (Beta Launch) paused — security hardening prioritized before public launch
- 414 tests passing, ~79K lines TypeScript, 30+ routes
- Domain: draftpokemon.com, deploying on Vercel

### Known Implementation Constraints
- CSP headers must be in `next.config.ts` only (not vercel.json — conflict risk)
- PostHog and Sentry must be initialized in separate files to avoid hydration errors
- Mobile bottom sheet requires physical iPhone Safari testing (emulator insufficient)
- Existing pokepaste-parser.ts should be inspected before adding @pkmn/sets
- Supabase channel count per draft participant must be audited before public launch
- Clerk production keys (pk_live_*, sk_live_*) must be set in Vercel Production scope — not preview scope

### Key Decisions
- Security & scalability hardening before public beta launch — prevents costly rearchitecture later
- Supabase is primary cost driver (realtime connections, database, bandwidth)
- Clerk handles auth but integration points need security review

## Last Updated
2026-04-03
