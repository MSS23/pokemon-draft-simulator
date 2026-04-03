---
phase: 22-launch-polish
plan: 01
subsystem: landing-page
tags: [copy, vgc, landing, ux]
dependency_graph:
  requires: []
  provides: [vgc-targeted-landing-page]
  affects: [src/app/page.tsx]
tech_stack:
  added: []
  patterns: [vgc-first-copy]
key_files:
  modified:
    - src/app/page.tsx
decisions:
  - Used "&amp;" entity for ampersand in JSX tag line to avoid parser issues
  - Updated bottom CTA button text to match hero CTA ("Start a Draft") for consistency
metrics:
  duration: 3m
  completed: 2026-04-03T08:48:28Z
  tasks_completed: 2
  tasks_total: 2
requirements:
  - LAND-01
  - LAND-02
  - LAND-03
  - LAND-05
---

# Phase 22 Plan 01: Landing Page VGC Copy Refinement Summary

VGC-targeted hero, how-it-works, and feature copy so competitive Pokemon players understand the value within 5 seconds of landing on the page.

## What Was Done

### Task 1: Sharpen hero copy and 5-second value proposition
- **Tag line**: Changed from "The #1 Pokemon Draft Platform" to "Built for VGC & Draft League Communities"
- **Headline**: Changed from "Where Pokemon Champions draft." to "Draft leagues for competitive Pokemon."
- **Subtitle**: Now mentions VGC community, no spreadsheets, no signup walls
- **Primary CTA**: Changed from "Create Draft" to "Start a Draft"
- **Commit**: `a2d2126`

### Task 2: Refine How-It-Works and features copy for VGC audience
- **Top 3 cards**: Create a Draft (VGC Reg H mention) > Draft Your Squad > Run Your League
- **FEATURES array**: VGC-specific descriptions (8-player draft, restricted legendary enforcement, commissioner approval)
- **STEPS array**: Pick your format (VGC Reg H, Smogon), Share the room code, Draft in real-time
- **Section header**: "Built for competitive Pokemon" (was "Built for Pokemon Champions")
- **Final CTA**: "Your next draft league starts here" with updated subtitle
- **Bottom CTA**: Also updated to "Start a Draft" for consistency
- **Commit**: `60c83e4`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Consistency] Updated bottom CTA button text**
- **Found during:** Task 2
- **Issue:** Bottom CTA still said "Create Draft" while hero CTA was updated to "Start a Draft" in Task 1
- **Fix:** Changed bottom CTA button text to "Start a Draft" to match
- **Files modified:** src/app/page.tsx
- **Commit:** `60c83e4`

## Verification

- Build passes with zero type errors
- `grep "VGC" src/app/page.tsx` returns 4+ matches
- `grep "competitive Pokemon" src/app/page.tsx` returns match in hero
- `grep "Reg H" src/app/page.tsx` returns matches in cards and steps
- `grep "Start a Draft" src/app/page.tsx` returns matches in both CTAs
- `grep "Smogon" src/app/page.tsx` returns matches (inclusive of singles players)

## Known Stubs

None - all copy is final production content.

## Self-Check: PASSED
