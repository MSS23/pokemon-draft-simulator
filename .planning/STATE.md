---
gsd_state_version: 1.0
milestone: v6
milestone_name: Draft UX Overhaul
status: defining_requirements
last_updated: "2026-04-03"
last_activity: 2026-04-03 -- Milestone v6 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# STATE.md

## Current Milestone

**Milestone 6:** Draft UX Overhaul
**Status:** Defining requirements
**Next action:** Define requirements and create roadmap

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-03 — Milestone v6 started

## Accumulated Context

### Project State

- Milestone 1 (Production Overhaul) complete
- Milestone 2 (Codebase Health) complete
- Milestone 3 paused — cherry-picked mobile, onboarding, PokePaste into M4
- Milestone 4 (Beta Launch) paused — security hardening prioritized before public launch
- Milestone 5 (Security Hardening) paused — Draft UX overhaul prioritized
- 414 tests passing, ~79K lines TypeScript, 30+ routes
- Domain: draftpokemon.com, deploying on Vercel

### Known Implementation Constraints

- CSP headers must be in `next.config.ts` only (not vercel.json — conflict risk)
- Draft page already split into 5 hooks (useDraftRealtime, useDraftSession, useDraftActions, useDraftAuction, useDraftTimers)
- Framer Motion in use for animations, Radix UI + Tailwind for components
- Must preserve real-time Supabase subscriptions and optimistic update patterns
- Spectator broadcast mode at /spectate/[id]/broadcast must be preserved
- Mobile bottom sheet requires physical iPhone Safari testing

### Key Decisions

- Draft UX overhaul before security hardening — establish premium experience first
- Unified participant/spectator view instead of separate routes
- Mobile-first continuous flow instead of tab-switching
- Hostname gating over NODE_ENV checks for production-only telemetry (Sentry + PostHog)

## Last Updated

2026-04-03
