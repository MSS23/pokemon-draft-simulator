# Phase 21: Core Beta Features - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship three feature groups for beta: (1) mobile draft room activation, (2) onboarding with draft templates, (3) PokePaste import/export. 13 requirements: MOBILE-01 through MOBILE-05, ONBOARD-01 through ONBOARD-04, PASTE-01 through PASTE-04.

</domain>

<decisions>
## Implementation Decisions

### Mobile Draft Room
- MobileDraftView.tsx and MobileWishlistSheet.tsx already exist in src/components/draft/
- They are NOT wired into the draft page — need useMediaQuery hook + conditional render
- No useMediaQuery hook exists yet — create one in src/hooks/
- Breakpoint: <768px shows mobile view
- Must ensure timer + current picker sticky at top
- Touch targets 44px+ minimum
- Test on 375px (iPhone SE) — no horizontal scroll

### Onboarding & Templates
- Draft templates exist: src/lib/draft-template-presets.ts and src/lib/draft-templates.ts
- Need a TemplateSelector component as first step in create-draft wizard
- TourProvider and TourGuide exist in src/components/tour/
- Need to wire tour to first draft room visit (localStorage flag)
- Add format explainer tooltips on format names in create wizard
- Add draft type comparison cards (Snake vs Auction) on create page

### PokePaste Import/Export
- src/lib/pokepaste-parser.ts exists — inspect before deciding if @pkmn/sets needed
- Add export buttons on draft results page (per team) and league team detail page
- Add import textarea on matchup analysis page
- Validate round-trip: export → import into Pokemon Showdown

### Claude's Discretion
- Specific UI layout and styling choices for template selector, comparison cards
- Tour step content and targeting
- PokePaste export format details (what metadata to include beyond species name)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/draft/MobileDraftView.tsx` — Complete mobile draft view (UNWIRED)
- `src/components/draft/MobileWishlistSheet.tsx` — Mobile wishlist bottom sheet (UNWIRED)
- `src/components/tour/TourProvider.tsx` — Tour context provider
- `src/components/tour/TourGuide.tsx` — Tour step component
- `src/lib/draft-template-presets.ts` — Pre-configured draft templates
- `src/lib/draft-templates.ts` — Template types and utilities
- `src/lib/pokepaste-parser.ts` — PokePaste parser (inspect for completeness)

### Key Files to Modify
- `src/app/draft/[id]/page.tsx` — Wire MobileDraftView with media query
- `src/app/create-draft/page.tsx` — Add template selector, format tooltips, type comparison
- `src/app/draft/[id]/results/page.tsx` — Add PokePaste export buttons
- `src/app/layout.tsx` — May need TourProvider if not already present

</code_context>

<specifics>
## Specific Ideas

- App positions as VGC draft tool but expandable to singles
- Templates: Quick Draft (4p), League Season (8p), Showmatch (2p), Custom
- Tour: 5 steps on first draft room visit
- PokePaste must round-trip with Pokemon Showdown

</specifics>

<deferred>
## Deferred Ideas

None — all features scoped to this phase.

</deferred>
