---
phase: 26-performance-caching-load-testing
plan: 01
subsystem: performance
tags: [caching, cdn, tanstack-query, pokemon-api, vercel-edge]
dependency_graph:
  requires: []
  provides: [cdn-pokemon-proxy, extended-staletime-pokemon-hooks]
  affects: [src/hooks/usePokemon.ts, src/app/api/pokemon/[id]/route.ts]
tech_stack:
  added: []
  patterns: [next-api-route-proxy, tanstack-query-staletime-tuning, vercel-edge-cdn-cache]
key_files:
  created:
    - src/app/api/pokemon/[id]/route.ts
  modified:
    - src/hooks/usePokemon.ts
decisions:
  - "Proxy returns raw PokeAPI bytes (no transform) so Vercel can cache the exact response body"
  - "30-minute staleTime chosen over Infinity — app may need refresh after extended inactivity"
  - "gcTime bumped to 60 minutes for all 4 hooks with explicit gcTime (usePokemonByIds left at default)"
  - "QueryProvider.tsx global default left at 5 minutes — draft state queries must stay fresh"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-03"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
requirements_satisfied:
  - PERF-01
  - PERF-02
---

# Phase 26 Plan 01: Pokemon CDN Proxy + TanStack Query Cache Tuning Summary

**One-liner:** PokeAPI proxy with `s-maxage=86400` CDN headers and 30-minute TanStack Query staleTime for all static Pokemon data hooks.

## Objective

Eliminate redundant PokeAPI network calls during draft sessions by (1) creating a Vercel Edge-cacheable proxy route and (2) extending TanStack Query staleTime from 5–10 minutes to 30 minutes for static Pokemon data hooks.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add /api/pokemon/[id] CDN proxy route | c19bace | src/app/api/pokemon/[id]/route.ts (created) |
| 2 | Bump TanStack Query staleTime for static Pokemon data | a4f8477 | src/hooks/usePokemon.ts (modified) |

## What Was Built

### Task 1: /api/pokemon/[id] CDN proxy

`src/app/api/pokemon/[id]/route.ts` is a thin GET proxy that:
- Validates the `id` param (alphanumeric + hyphens, max 50 chars) — returns 400 on invalid
- Fetches `https://pokeapi.co/api/v2/pokemon/{id}` with a 10-second AbortController timeout
- Forwards the raw JSON bytes with:
  - `Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600`
  - `CDN-Cache-Control: public, s-maxage=86400`
  - `Content-Type: application/json`
- Forwards non-2xx PokeAPI status codes (e.g. 404 passthrough)
- Returns 502 with `{ error: 'PokeAPI unavailable' }` on network/timeout failures (no cache headers on errors)

### Task 2: Extended staleTime for Pokemon hooks

All five hooks in `src/hooks/usePokemon.ts` now use `staleTime: 30 * 60 * 1000`:

| Hook | Old staleTime | New staleTime | Old gcTime | New gcTime |
|------|--------------|--------------|-----------|-----------|
| usePokemon | 5 min | 30 min | 10 min | 60 min |
| usePokemonList | 10 min | 30 min | 30 min | 60 min |
| usePokemonListByFormat | 10 min | 30 min | 30 min | 60 min |
| usePokemonByType | 5 min | 30 min | 10 min | 60 min |
| usePokemonByIds | 5 min | 30 min | (default) | (default) |

`QueryProvider.tsx` global default remains at `5 * 60 * 1000` — draft state queries must stay fresh.

## Verification

- `npx tsc --noEmit` passes with zero errors after both tasks
- `npm run build` completes successfully
- `s-maxage=86400` and `stale-while-revalidate` present in proxy route
- All 5 hooks show `30 * 60 * 1000` in grep output
- `QueryProvider.tsx` still shows `5 * 60 * 1000`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both changes are complete and wired.

## Self-Check: PASSED

- `src/app/api/pokemon/[id]/route.ts` — FOUND
- commit c19bace — confirmed in git log
- commit a4f8477 — confirmed in git log
- `QueryProvider.tsx` staleTime unchanged at `5 * 60 * 1000` — confirmed
