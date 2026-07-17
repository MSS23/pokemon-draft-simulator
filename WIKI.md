---
tags: [project]
type: web app
status: active
---

# pokemon-draft-simulator

**Type:** web app
**Stack:** Next.js 15 (App Router), React 18, TypeScript 5, Supabase (Postgres + Realtime), Zustand, TanStack Query v5, Tailwind CSS + Radix UI + Framer Motion, Clerk auth, Vitest + Playwright, PWA

## What it does
A real-time, multiplayer Pokemon drafting platform ("Pokemon Draft League") for competitive tournament play. It supports snake and auction draft formats with VGC 2024 Regulation H/G legality, Smogon tiers, and custom budget formats, plus team-building, wishlist auto-pick, and budget/coverage analysis across a 1000+ Pokemon database.

## How it works
Next.js App Router frontend with a central Zustand store (`src/stores/draftStore.ts`, using subscribeWithSelector). Live multiplayer state syncs through Supabase Realtime WebSockets, with optimistic updates and virtualized lists for performance. Domain logic is split into service modules under `src/lib/` (auction, auto-skip, commissioner, draft-access, AI analysis, etc.) and React hooks under `src/hooks/` (realtime, timers, auction, wishlist sync, optimistic updates). Pokemon data comes from PokeAPI plus the @pkmn/* and @smogon/calc libraries. Format packs are compiled from `data/formats/*.json` via `npm run build:formats`. Auth is via Clerk; rate limiting via Upstash Redis; monitoring via Sentry + PostHog. Deploys to Vercel.

## Key files
- `src/stores/draftStore.ts` — central Zustand store for draft state
- `src/hooks/useDraftRealtime.ts` — Supabase Realtime synchronization
- `src/hooks/useDraftAuction.ts` / `src/lib/auction-service.ts` — auction draft + bidding logic
- `src/lib/draft-access.ts` / `src/lib/commissioner-service.ts` — access control and commissioner tools
- `src/lib/ai-analysis-service.ts` — team/draft AI analysis
- `data/formats/*.json` + `scripts/build-format.ts` — format/legality packs (build:formats)
- `migrations/` + `supabase/` — database schema and Supabase config
- `CLAUDE.md` — detailed architecture and dev commands

## Notes
Active, fairly mature app with e2e (Playwright) and unit (Vitest) tests, PWA support, Sentry/PostHog instrumentation, and staging setup (`STAGING_SETUP.md`). Guest/shareable draft links require no registration. Supabase URL/anon key and Clerk keys required via env.
