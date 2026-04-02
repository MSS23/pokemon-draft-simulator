# PROJECT.md

## Project
**Name:** Pokemon Draft
**Type:** Real-time competitive Pokemon drafting platform
**Stack:** Next.js 15, TypeScript, Supabase, Zustand, Tailwind CSS

## Vision
The gold standard platform for Pokemon draft leagues — replacing the fragmented Discord bot + Google Sheets + PokePaste workflow with a single premium experience that content creators showcase and competitive players prefer.

## Current State (v0.1.2)
- Full snake + auction draft with real-time Supabase sync
- Complete league system (standings, trades, waivers, playoffs, KO tracking, commissioner tools)
- 30+ routes, ~79K lines TypeScript, 414 tests passing
- PWA with offline support, multi-layer caching
- Recently refactored: split monolithic draft-service (2616→989 lines), split draft page (2372→1250 lines), fixed 8 codebase concerns

## Milestone History

### Milestone 1: Production Overhaul (2026-03-03) — COMPLETE
10 phases: notification consolidation, logger migration, type safety, ESLint enforcement, error handling, bundle optimization, loading skeletons, form validation/a11y, test coverage, production hardening.

### Milestone 2: Codebase Health (2026-04-02) — COMPLETE
8 fixes: split draft-service.ts into 4 sub-modules, split draft page into 5 hooks, moved bcrypt server-side, replaced 31 SELECT * queries, added pagination, fixed as-any casts, standardized error handling, fixed serverless rate limiter.

### Milestone 3: Gold Standard Draft Experience (2026-04-02) — ACTIVE
**Goal:** Transform the draft room into a premium, broadcast-quality experience that makes Discord bots obsolete. Focus on draft room polish, mobile UX, and competitive data integration.

**Key insight from research:** The real competitor is Discord bots, not other web apps. No platform offers a premium real-time draft + integrated competitive data + content creator tools.

**Target audience:** Friend groups, content creators, tournament organizers — all equally.

**Timeline:** 2-week sprint (5-8 focused phases)

## Competitive Landscape
- **DraftZone:** League management, matchup analysis. No real-time draft room.
- **DraftMon:** Basic draft rooms on Firebase. No league management.
- **Discord bots:** Text-based drafting (pkmnDiscordBot, discord-draft-assist). The incumbent.
- **Gap:** No platform combines premium real-time drafting + competitive data + league management + creator tools.

## Differentiators to Build
1. Premium draft room with animations, sound, countdown drama (ESPN/Sleeper quality)
2. Competitive data overlay during draft (@pkmn/smogon usage stats)
3. PokePaste import/export for ecosystem interop
4. OBS-ready spectator/broadcast view
5. Mobile-first responsive draft experience
