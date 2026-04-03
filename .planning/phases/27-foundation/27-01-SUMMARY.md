---
phase: 27-foundation
plan: "01"
subsystem: draft-room
tags: [foundation, context, typescript, css, testing]
dependency_graph:
  requires: []
  provides:
    - DraftRealtimeContext (context + consumer hook for subscription sharing)
    - ViewerRole type (4-value permission role derivation)
    - turn-state CSS custom properties (data-turn-state theming)
  affects:
    - Phase 28 (Host Command Bar needs ViewerRole)
    - Phase 29 (Activity Feed needs DraftRealtimeContext)
    - Phase 30 (Layout Extraction assembles all primitives)
    - Phase 31 (Spectator Unification needs ViewerRole)
tech_stack:
  added: []
  patterns:
    - React createContext + useContext with null guard for typed context sharing
    - ViewerRole derived via useMemo from participants array (additive to existing hook)
    - CSS custom properties via data-turn-state attribute (compositor-only animations)
key_files:
  created:
    - src/app/draft/[id]/DraftRealtimeContext.ts
    - tests/draft-foundation.test.ts
  modified:
    - src/hooks/useDraftSession.ts
    - src/app/globals.css
decisions:
  - ViewerRole derives from participants array data (is_host, team_id) rather than URL params — prevents permission drift
  - DraftRealtimeContext uses null-initialized createContext with runtime throw guard — provides clear error for mis-use
  - CSS animations use box-shadow and opacity only — satisfies TURN-04 (no layout-affecting properties, prevents Android jank)
  - ViewerRole additive to existing hook — isHost/isSpectator booleans preserved unchanged for backward compat
metrics:
  duration: "6 minutes"
  completed: "2026-04-03"
  tasks_completed: 1
  files_changed: 4
---

# Phase 27 Plan 01: Draft Foundation Primitives Summary

JWT auth with refresh rotation using jose library — No, this is:

**Three foundation primitives for draft room redesign: typed React context for subscription sharing, ViewerRole permission type, and CSS turn-state theming with compositor-only animations.**

## Tasks Completed

| Task | Description | Commit | Files |
| ---- | ----------- | ------ | ----- |
| 1 | Create DraftRealtimeContext, ViewerRole, CSS turn-state | 650a2b6 | 4 files |

## What Was Built

### DraftRealtimeContext (`src/app/draft/[id]/DraftRealtimeContext.ts`)

A React context wrapping `UseDraftRealtimeReturn` (the full return type from `useDraftRealtime`). Provides:
- `DraftRealtimeContext` — the raw context object for use as `DraftRealtimeContext.Provider`
- `useDraftRealtimeContext()` — consumer hook that throws a clear error if called outside a provider

This prevents subscription teardown during future component extraction in Phase 30 (known bug class: pickInFlightRef race conditions).

### ViewerRole in `src/hooks/useDraftSession.ts`

Added `ViewerRole = 'host' | 'participant' | 'spectator' | 'lobby'` type export. Extended `UseDraftSessionParams.participants` array type with `team_id?: string | null` and `is_host?: boolean` fields. Added `viewerRole` to `DraftSessionResult` interface and derives it via `useMemo`:

- `'host'` — participant found with `is_host: true`
- `'participant'` — participant found with `team_id` set (and not host)
- `'spectator'` — not in participants but `isSpectatorParam=true`
- `'lobby'` — participants undefined (loading) OR user not found and not spectator

All existing return values (`isHost`, `isSpectator`, `isAdmin`) are unchanged.

### CSS Turn-State Theming (`src/app/globals.css`)

Added `[data-turn-state='active']` and `[data-turn-state='waiting']` blocks defining CSS custom properties:
- `--draft-accent`, `--draft-surface`, `--draft-border` — theme tokens

Added `.pick-button-primary` pulse animation (box-shadow only — paint compositor, no layout reflow) and `.panel-dimmed` opacity transition (compositor-only). No `height`, `width`, `padding`, or `margin` animated — satisfies TURN-04.

## Tests

All 7 unit tests pass in `tests/draft-foundation.test.ts`:
- Tests 1-5: ViewerRole derivation (host, participant, spectator, lobby-by-loading, lobby-by-not-found)
- Test 6: `useDraftRealtimeContext()` throws when called outside provider
- Test 7: Context value correctly passed through `DraftRealtimeContext.Provider`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All exported values are fully functional:
- `DraftRealtimeContext` and `useDraftRealtimeContext` are complete and tested
- `viewerRole` derives correctly from participants data
- CSS rules are complete and valid

## Self-Check: PASSED
