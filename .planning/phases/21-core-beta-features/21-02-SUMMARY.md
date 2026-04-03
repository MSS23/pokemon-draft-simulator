---
phase: 21-core-beta-features
plan: 02
subsystem: onboarding
tags: [tour, templates, ux, create-draft]
dependency_graph:
  requires: []
  provides: [5-step-draft-tour, always-visible-type-comparison]
  affects: [draft-room, create-draft-page]
tech_stack:
  added: []
  patterns: [guided-tour, template-selector]
key_files:
  created: []
  modified:
    - src/components/draft/DraftTour.tsx
    - src/app/create-draft/page.tsx
decisions:
  - Merged 7 tour steps into 5 by combining grid+search/filter and wishlist+goodbye
  - Removed activity button tour step as non-essential for onboarding
  - Made DraftTypeComparison always visible instead of collapsed in details element
metrics:
  duration: ~5min
  completed: 2026-04-03
---

# Phase 21 Plan 02: Onboarding Polish Summary

**One-liner:** Trimmed draft room tour from 7 to 5 steps and made draft type comparison always visible on create page.

## What Was Done

### Task 1: Trim draft room tour to 5 steps and verify onboarding completeness

**DraftTour.tsx** - Consolidated 7-step tour into exactly 5 steps:
1. Welcome (no target) - intro with guide name
2. Draft Progress (`tour-draft-progress`) - timer, turn indicator, progress
3. Pokemon Pool (`tour-pokemon-grid`) - browse, search, filter, stats
4. Team Rosters (`tour-team-rosters`) - budget, opponent picks
5. Wishlist (`tour-wishlist`) - priority queue, auto-pick, farewell

Removed: Activity button step (step 6) and standalone goodbye step (step 7). Merged search/filter info into Pokemon Pool step and farewell into Wishlist step.

**create-draft/page.tsx** - Made `DraftTypeComparison` always visible:
- Replaced `<details>/<summary>` collapsed wrapper with a simple `<div className="mt-4">` so the Snake vs Auction comparison cards are immediately visible when selecting draft type.

**Verified (no changes needed):**
- `showTemplates` already defaults to `true` (line 128) - templates show as first screen
- `FormatExplainer` already renders next to format names (lines 526, 679) - tooltips present
- `DraftTypeComparison` import already existed (line 71)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | bf7a1c6 | feat(21-02): trim draft tour to 5 steps and make type comparison always visible |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- Tour step count: 5 (verified via targetId count)
- TypeScript: `npx tsc --noEmit` passes with no errors
- `showTemplates` defaults to `true` - confirmed
- `FormatExplainer` present on format names - confirmed
- `DraftTypeComparison` rendered without details wrapper - confirmed

## Known Stubs

None.

## Self-Check: PASSED
