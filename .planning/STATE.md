---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-03T12:41:38.758Z"
last_activity: 2026-04-03
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
  percent: 0
---

# STATE.md

## Current Milestone

**Milestone 6:** Draft UX Overhaul
**Status:** Executing Phase 27
**Next action:** Execute 27-02

## Current Position

Phase: 27 (Foundation) — EXECUTING
Plan: 2 of 2
Status: Executing Phase 27
Last activity: 2026-04-03 -- Completed 27-01-PLAN.md

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**

- Total plans completed: 1
- Average duration: 6 minutes
- Total execution time: 6 minutes

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 27-foundation | 01 | 6m | 1 | 4 |

*Updated after each plan completion*

## Accumulated Context

### Project State

- Milestones 1–5 complete
- Milestone 6 (Draft UX Overhaul) active — this milestone
- 414 tests passing, ~79K lines TypeScript, 30+ routes
- Domain: draftpokemon.com, deploying on Vercel
- Stack additions this milestone: `react-resizable-panels@4.x`, `nuqs@2.x`, `motion@12.x` (rename), `@tailwindcss/container-queries`, shadcn `command` component

### Phase Dependency Chain

```
Phase 27 (Foundation — CSS vars, ViewerRole, DraftRealtimeContext)
  → Phase 28 (Host Command Bar — needs ViewerRole)
  → Phase 29 (Activity Feed — needs stable context)
      → Phase 30 (Layout Extraction — assembles 27+28+29, HIGHEST RISK)
          → Phase 31 (Spectator Unification — needs ViewerRole + Layout)
          → Phase 32 (Mobile Layout — needs region composability)

Phase 33 (League Hub Nav) — INDEPENDENT, run parallel to 27–30
Phase 34 (Post-Draft Continuity) — INDEPENDENT, run parallel to 27–30
```

### Critical Constraints

- `DraftRealtimeContext` must exist at page level BEFORE any JSX extraction — prevents subscription teardown (known bug class: pickInFlightRef race)
- All Zustand selectors for new panel components must be named exports in `selectors.ts` — inline selectors cause infinite re-render (known production bug: useWishlistSync 2026-03-04)
- Always-mounted panels gated behind `draftState !== null` — prevents mount storm and duplicate Supabase channels
- `isSpectator` derived from DB participants check, not URL param — prevents permission drift
- Turn animations: `opacity` + `transform` only — no layout-affecting properties (prevents Android jank)
- Mobile layout: `h-[100dvh]` not `h-screen` — iOS Safari dynamic address bar
- Phase 32: Physical iOS device testing mandatory before shipping

### Key Decisions

- Phase ordering follows research dependency graph: Foundation → Command Bar → Activity Feed → Layout → Spectator → Mobile; League Hub and Post-Draft run independently
- `DraftUIState` stays in `page.tsx` local state — NOT lifted to Zustand (hash-based comparison prevents polling re-renders)
- Existing `DraftControls` collapsible retained as overflow panel — no controls removed, host command bar is additive
- Continuous-scroll mobile layout (MOBILE-04) deferred to v7 — tabs are proven pattern; continuous scroll deferred pending mobile usage data
- `/spectate/[id]` 308 redirect preserved indefinitely — Discord/Reddit links must not break
- [27-01] ViewerRole derives from DB participants data (is_host, team_id) rather than URL params to prevent permission drift
- [27-01] CSS turn-state animations use box-shadow and opacity only (compositor-only) to prevent Android jank per TURN-04

## Last Updated

2026-04-03 -- 27-01 complete
