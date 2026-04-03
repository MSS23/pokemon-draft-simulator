# STATE.md

## Current Milestone
**Milestone 4:** Beta Launch — draftpokemon.com
**Status:** Roadmap created — ready to plan Phase 19
**Next action:** Run `/gsd:plan-phase 19` to plan Deployment Foundation

## Current Position

Phase: 19 — Deployment Foundation (not started)
Plan: —
Status: Awaiting plan
Last activity: 2026-04-03 — Roadmap created for Milestone 4

Progress: [----------] 0/4 phases complete

## Phase Status

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 19 | Deployment Foundation | Not started | - |
| 20 | Observability & Feedback | Not started | - |
| 21 | Core Beta Features | Not started | - |
| 22 | Launch Polish | Not started | - |

## Accumulated Context

### Project State
- Milestone 1 (Production Overhaul) complete
- Milestone 2 (Codebase Health) complete
- Milestone 3 paused — cherry-picked mobile, onboarding, PokePaste into M4
- 414 tests passing, ~79K lines TypeScript, 30+ routes
- Domain: draftpokemon.com, deploying on Vercel

### Known Implementation Constraints
- CSP headers must be in `next.config.ts` only (not vercel.json — conflict risk)
- PostHog and Sentry must be initialized in separate files to avoid hydration errors
- Mobile bottom sheet requires physical iPhone Safari testing (emulator insufficient)
- Existing pokepaste-parser.ts should be inspected before adding @pkmn/sets
- Supabase channel count per draft participant must be audited before public launch
- Clerk production keys (pk_live_*, sk_live_*) must be set in Vercel Production scope — not preview scope

### Feature Implementation Status (from research)
- MobileDraftView: built but unwired (needs useMediaQuery conditional in draft page)
- Draft templates: draft-templates.ts exists, needs TemplateSelector UI step
- PokePaste export: pokepaste-parser.ts exists, needs export button in results/team pages
- Onboarding tour: TourProvider built, needs localStorage trigger on first visit
- Analytics: src/lib/analytics.ts built, call sites not wired
- Feedback widget: /feedback page exists, needs floating button on all pages

### Key Decisions
- LAND-04 (feedback widget) assigned to Phase 20 with observability work — it shares the "infrastructure visible to testers before community launch" boundary
- Phase 21 combines MOBILE + ONBOARD + PASTE because none depend on each other and all depend on Phase 20 being done
- Phase 22 is deliberately last — landing page copy is cheapest to change and benefits from knowing what Phase 21 actually shipped

## Last Updated
2026-04-03
