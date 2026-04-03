---
phase: 21-core-beta-features
plan: 03
subsystem: draft-export
tags: [pokepaste, export, import, showdown, competitive]
dependency_graph:
  requires: [pokepaste-parser]
  provides: [PokePasteExportButton, PokePasteImportArea]
  affects: [draft-results-page]
tech_stack:
  added: []
  patterns: [dropdown-menu-export, textarea-import-preview]
key_files:
  created:
    - src/components/draft/PokePasteExport.tsx
    - tests/pokepaste-roundtrip.test.ts
  modified:
    - src/app/draft/[id]/results/page.tsx
decisions:
  - Used DropdownMenu for export (clipboard + .txt) instead of two separate buttons
  - Replaced old generateShowdownPaste with PokePasteExportButton for user team
metrics:
  duration: ~3min
  completed: 2026-04-03
  tasks: 3/3
  tests_added: 5
---

# Phase 21 Plan 03: PokePaste Export/Import Summary

PokePaste export buttons on every team in draft results with clipboard copy and .txt download, plus import textarea component and 5 round-trip validation tests.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create PokePasteExportButton and PokePasteImportArea | 353dc2c | src/components/draft/PokePasteExport.tsx |
| 2 | Wire export to results page for all teams | 5ffdc40 | src/app/draft/[id]/results/page.tsx |
| 3 | PokePaste round-trip validation tests | 96aeed6 | tests/pokepaste-roundtrip.test.ts |

## What Was Built

### PokePasteExportButton
- Dropdown with two options: Copy to Clipboard and Download .txt
- Generates PokePaste format from pokemon names using `toBasicPokePasteTemplate`
- Includes team header (`=== Team Name ===`)
- Reusable component accepting `pokemonNames`, `teamName`, `variant`, `size` props

### PokePasteImportArea
- Textarea for pasting PokePaste/Showdown team text
- Parse button triggers `parsePokePaste` and shows live preview grid
- Preview shows species name, item, ability, and moves per Pokemon
- Calls `onImport` callback with parsed `PokemonSet[]` array

### Results Page Integration
- Replaced old single "Export to Showdown" button with PokePasteExportButton on user's team card
- Added new "Export Teams" Card section with every team listed, each with its own PokePasteExportButton
- Removed unused `generateShowdownPaste` import

### Round-Trip Tests (5 passing)
1. `toBasicPokePasteTemplate` round-trips species name through `parsePokePaste`
2. Full PokemonSet preserves item, ability, tera type, EVs, nature, moves
3. `teamToPokePaste` for 6 Pokemon produces 6 parseable blocks
4. Real VGC paste format (Incineroar set) parses correctly
5. Nickname syntax `Inci (Incineroar)` resolves species and nickname

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are fully functional.

## Self-Check: PASSED

All 3 files exist, all 3 commits verified in git log.
