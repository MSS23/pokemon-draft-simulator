---
phase: 22-launch-polish
plan: 02
subsystem: seo-metadata
tags: [og-tags, seo, social-sharing, metadata]
dependency_graph:
  requires: []
  provides: [og-metadata-all-routes]
  affects: [social-sharing, discord-embeds, twitter-cards]
tech_stack:
  added: []
  patterns: [next-metadata-api, generateMetadata]
key_files:
  created:
    - src/app/create-draft/layout.tsx
    - src/app/join-draft/layout.tsx
  modified:
    - src/app/layout.tsx
    - src/app/draft/[id]/results/layout.tsx
decisions:
  - Used static metadata export for create-draft and join-draft (no dynamic params needed)
  - Used generateMetadata for draft results (dynamic route with id param)
  - All OG image URLs hardcoded to https://draftpokemon.com/og-image with query params for page-specific titles
metrics:
  duration: 4m
  completed: 2026-04-03
---

# Phase 22 Plan 02: Open Graph Meta Tags Summary

Absolute OG image URLs and per-route metadata for branded Discord/Twitter/Reddit preview cards on all public routes.

## What Was Done

### Task 1: Fix root layout OG image to absolute URL and add per-route metadata layouts

**Root layout (src/app/layout.tsx):**
- Changed openGraph.images URL from relative `/og-image` to absolute `https://draftpokemon.com/og-image`
- Changed twitter.images URL from relative `/og-image` to absolute `https://draftpokemon.com/og-image`

**Create draft (src/app/create-draft/layout.tsx) - NEW:**
- Static metadata export with title "Create a Draft"
- OG image with `?title=Create%20a%20Draft&subtitle=Snake%20...` query params
- twitter:card = summary_large_image

**Join draft (src/app/join-draft/layout.tsx) - NEW:**
- Static metadata export with title "Join a Draft"
- OG image with `?title=Join%20a%20Draft&subtitle=Enter%20your%20room%20code%20to%20join` query params
- twitter:card = summary_large_image

**Draft results (src/app/draft/[id]/results/layout.tsx) - UPDATED:**
- Replaced relative `/og-image` URLs with absolute `https://draftpokemon.com/og-image`
- Improved description with draft shortId
- Added explicit OG url field with full path

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 00a0b53 | Add Open Graph meta tags to all public routes |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
