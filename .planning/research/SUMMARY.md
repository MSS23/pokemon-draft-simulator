# Project Research Summary

**Project:** Pokemon Draft — Draft UX Overhaul (Milestone 6)
**Domain:** Real-time competitive draft platform UX — fantasy sports patterns applied to Pokemon drafting
**Researched:** 2026-04-03
**Confidence:** HIGH (stack verified against npm/official docs; architecture derived from direct codebase analysis; features cross-referenced across 8 competitor platforms; pitfalls grounded in this app's actual bug history)

## Executive Summary

The Draft UX Overhaul (Milestone 6) is a targeted UX refactor of an existing, functioning platform — not a greenfield build. The existing stack (Next.js 15, Supabase, Zustand, TanStack Query, Radix UI, framer-motion, @dnd-kit, Vitest) is validated and requires only four focused additions: `react-resizable-panels` for drag-to-resize panels, `nuqs` for URL-synced view state, the `motion` package rename from `framer-motion`, and `@tailwindcss/container-queries` for role-adaptive layouts. Net new bundle impact is approximately 28KB gzipped. No architectural rewrites are needed — the refactor is purely additive: extracting inline JSX from a 1,382-line page coordinator into named region components while all subscriptions and state remain anchored at the page level.

The recommended approach follows a clear industry pattern established by Sleeper, ESPN Fantasy, Yahoo Fantasy, and FantasyPros: three-zone layout (available pool / team roster / activity feed), role-adaptive views derived from database state rather than URL parameters, and a maximum of 3-5 top-level navigation items. Competitor analysis reveals the current league hub's 7+ tabs exceed the cognitive load threshold documented by ESPN's 2025 redesign (which explicitly reduced to 4 tabs). No major fantasy platform implements a full-screen turn takeover; the differentiating approach is a decisive visual shift using CSS custom properties and compositor-only animations rather than layout-affecting modal overlays.

The highest risk in this milestone is restructuring `src/app/draft/[id]/page.tsx`: any refactor that causes `useDraftRealtime`'s subscription to tear down and remount during an active draft session can result in lost pick events — a class of bug this app has already encountered and fixed (the `pickInFlightRef` race condition). The mitigation is strict: subscriptions stay anchored at the page-level coordinator, region components are pure prop-receivers, and a `DraftRealtimeContext` must be established before any panel is moved. Three additional risks require early attention: Zustand inline selectors triggering infinite re-renders (already hit once in production), mount storms when converting slide-in panels to always-visible, and permission drift when unifying the participant/spectator view.

## Key Findings

### Recommended Stack

The current stack requires no technology replacement — only four targeted additions and one rename. `react-resizable-panels@4.x` (via shadcn's `<Resizable>`) provides keyboard-accessible drag-to-resize for the split panel layout with cookie-based SSR persistence. `nuqs@2.x` provides a `useState`-like API that syncs with URL query params, solving view state loss on reload and enabling shareable draft and league URLs without manual router manipulation. The `framer-motion` → `motion` rename is a single import-path swap (`from 'motion/react'`); the old package is frozen and receives no further updates. `@tailwindcss/container-queries` (the official Tailwind Labs plugin for v3) enables the same `<PokemonGrid>` component to adapt its column count based on container width rather than viewport — prerequisite for role-adaptive layouts without markup duplication. Tailwind v4 migration is explicitly deferred; it is a standalone refactor, not a UX overhaul task.

**Core technology additions:**
- `react-resizable-panels@4.x`: drag-to-resize split panel layout — 15KB gzipped, shadcn-native, keyboard-accessible
- `nuqs@2.x`: URL-synced view state for league hub sections and draft sidebar state — 5.5KB gzipped, zero runtime deps
- `motion@12.x` (rename from `framer-motion`): identical API, import from `motion/react` — neutral bundle swap
- `@tailwindcss/container-queries`: container-responsive grid columns via `@container` classes — build-time only, zero runtime cost
- shadcn `command` component: host command palette via existing `cmdk` dep — ~8KB gzipped (no new package install)

### Expected Features

Features are organized across seven UX areas researched against eight competitor platforms.

**Must have (table stakes — users expect these):**
- Persistent sticky "whose turn / time remaining" header — every major platform shows this always-visible; currently scrolls off-screen
- Host pause/resume accessible in one tap — all platforms require this emergency control; currently buried in a collapsible panel
- Pick queue / wishlist visible before turn — standard on Yahoo, FantasyPros, Sleeper; currently hidden until sidebar opened
- League hub with 3-5 top-level navigation items — ESPN reduced to 4 in 2025; current 7+ tabs exceed the cognitive load threshold
- Post-draft board view available after completion — standard on all platforms; exists but needs clean presentation mode
- Spectator can follow without picking — all platforms support passive viewing; currently requires a separate /spectate route

**Should have (differentiators — competitive advantage):**
- Decisive "your turn" visual shift (dim inactive panels, pulsing pick button, audio cue) — no competitor does full-screen takeover; this balance is the unoccupied design space
- Persistent activity feed in main layout (not slide-in) — transforms draft from solitary to social; no competitor has this as a permanent panel
- Unified `/draft/[id]` role-adaptive page (participant/spectator via DB role, not URL split) — cleaner than separate route; aligns with how all major platforms actually work
- Host command bar — slim persistent strip visible only to host; all competitors bury controls in menus
- Post-draft → league CTA with direct navigation — results feel like a dead end without a guided handoff to league infrastructure

**Defer (v2+):**
- Continuous scroll mobile (replacing tab-switching) — HIGH complexity, defer until mobile usage data shows tabs are the top complaint
- Shareable draft recap OG image — requires server-side image rendering, high infrastructure cost
- AI pick suggestions — deferred per PROJECT.md until post-beta
- Soft timer option (no auto-advance) — Sleeper's most-praised feature; add when host feedback specifically requests it

### Architecture Approach

The architecture follows a "Thin Coordinator + Region Components" pattern. `page.tsx` remains the single owner of `DraftUIState`, all 5 domain hooks, and the Supabase subscription lifecycle. The 1,382-line JSX return block is extracted into 7 named region components that are pure prop-receivers — they do not subscribe to Supabase, do not call hooks that touch the database, and do not resolve `userId` independently. Turn state propagates via CSS custom properties on a `data-turn-state` attribute at the page root, avoiding React context overhead for frequently-changing values. The league hub restructure is navigation-only: `LeagueNav` is updated to group existing sub-routes under 3 primary labels; no sub-page files are merged or deleted. `DraftUIState` intentionally stays in page.tsx local state — lifting it to Zustand would break the hash-based comparison that prevents unnecessary re-renders from Supabase polling.

**Major components:**
1. `DraftRoomPage (page.tsx)` — coordinator: owns DraftUIState, wires 5 hooks, never renders UI directly; outputs derived props to region components
2. `HostCommandBar` — persistent host action strip in sticky header; replaces buried collapsible DraftControls
3. `DraftActivityFeed` — always-visible inline panel (desktop: left column; mobile: bottom-sheet); replaces slide-in DraftActivitySidebar
4. `TurnStateOverlay` — compositor-only turn transition (opacity + transform only, no layout properties); formalizes existing showTurnFlash div
5. `DraftLayout + Left/Center/Right Panels` — three-panel responsive grid; resizable via react-resizable-panels
6. `ViewerRole enum in useDraftSession` — derives `host | participant | spectator | lobby` from DB participants, not URL params
7. `LeagueNav (modified)` — 3-view restructure (Overview / Matches / Management) grouping existing sub-routes without touching sub-page files

### Critical Pitfalls

1. **Subscription teardown during restructuring** — moving or refactoring any component that calls `useDraftRealtime` causes WebSocket cleanup on unmount, with a 200–800ms gap where pick events are silently lost. This is the same bug class as the `pickInFlightRef` race condition already fixed. Prevention: hoist `useDraftRealtime` to the route-level page component before any panel extraction; establish `DraftRealtimeContext` in Phase 1 before touching any layout structure.

2. **Zustand selector instability in new panel components** — this app hit this exact bug in production (`useWishlistSync.ts` infinite loop, React #185). Inline selectors like `useDraftStore(state => state.teams.find(...))` create new function references on every render, causing infinite re-render loops. Prevention: all selectors for new panel components must be named exports in `selectors.ts`; parameterized selectors use `useMemo` to maintain stable references between renders.

3. **Mount storm from always-visible panels** — converting `DraftActivitySidebar` and `DraftControls` from conditionally-mounted to always-mounted causes all panel `useEffect` hooks to fire simultaneously on page load, including Supabase channel creation, which creates duplicate channels. Prevention: gate panels behind `draftState !== null` (render skeletons until first state load); add `enabled={draftState !== null && !!participantId}` to all panel hook subscriptions before removing conditional rendering.

4. **Permission drift in unified participant/spectator view** — `?spectator=true` URL param is not auth; any user can remove it to see pick controls. The Supabase RLS will block the actual DB mutation, but the UI will show confusing error messages. Prevention: derive `isSpectator` from database participants check (`!me?.team_id`), using the URL param only as an initial hint before state loads; introduce a single `userRole` derived value that all permission checks use.

5. **Turn animation layout thrashing** — Framer Motion's `layout` prop on containers triggers full DOM reflow on every animation frame, causing visible jank during the "your turn" transition on mid-range Android devices. Prevention: drive all turn-state animations exclusively via `opacity` and `transform` (compositor-only); use CSS custom properties for visual theming; use `position: fixed` for the overlay; profile with Chrome DevTools at 4x CPU throttle before integrating into live draft state.

## Implications for Roadmap

Based on the architecture's build order dependency graph and pitfall prevention requirements, the suggested phase structure is 8 phases. Phases 7 and 8 (league hub and post-draft continuity) are independent of the draft room phases and should be scheduled to run concurrently with Phases 1-4 to reduce total milestone duration.

### Phase 1: Foundation — CSS Variables, ViewerRole, Turn Overlay
**Rationale:** CSS custom properties and the `ViewerRole` enum are dependencies for every subsequent draft room phase. Establishing these first means no later phase is blocked waiting for core primitives. The `DraftRealtimeContext` provider must be created in this phase before any structural changes — this is the most important pitfall prevention action in the entire milestone.
**Delivers:** Formalized turn-state theming system via `data-turn-state` attribute and CSS custom properties; `ViewerRole` type added to `useDraftSession`; `TurnStateOverlay` component replacing inline `showTurnFlash`; `DraftRealtimeContext` provider at page level.
**Addresses:** Decisive "your turn" visual shift (P1 feature)
**Avoids:** Subscription teardown (Pitfall 1), Turn animation layout thrashing (Pitfall 5)

### Phase 2: Host Command Bar
**Rationale:** Depends on ViewerRole for permission gating (Phase 1). Self-contained: only modifies the header area and extracts buttons from `DraftControls` — does not touch the main panel layout. Safe to ship independently.
**Delivers:** `HostCommandBar` component in sticky header (primary actions: pause/skip/ping/timer); `DraftControls` retained as overflow panel behind "•••" button; `cmdk`-based command palette via shadcn Command component.
**Addresses:** Host command bar one-tap accessibility (P1 feature); replaces buried collapsible controls (table stakes)
**Avoids:** Participant distraction — commander controls visible only to host via ViewerRole

### Phase 3: Activity Feed Integration
**Rationale:** Depends only on the `useDraftActivity` hook rename (additive, no breaking changes). Can parallelize with Phase 2. The data shape is already correct; only rendering location changes.
**Delivers:** `DraftActivityFeed` component always-visible in `DraftLeftPanel` slot (desktop); mobile bottom-sheet via existing `isActivitySidebarOpen` trigger; `DraftActivitySidebar` retained as mobile container.
**Uses:** Existing `useDraftActivity` hook, `@tanstack/react-virtual` for list virtualization
**Addresses:** Persistent activity feed (P1 feature)
**Avoids:** Mount storm (Pitfall 3) — gate behind `draftState !== null`; Activity feed re-render regression — `React.memo` with `activities.length` comparison, incremental append model

### Phase 4: Layout Region Extraction (Highest Risk Phase)
**Rationale:** Depends on Phase 1 (CSS vars/context), Phase 2 (HostCommandBar exists), Phase 3 (ActivityFeed exists). This is the highest-risk phase. Must be done when all region components already exist so the page coordinator assembles pre-built, tested pieces rather than creating and restructuring simultaneously.
**Delivers:** `DraftLayout`, `DraftLeftPanel`, `DraftCenterPanel`, `DraftRightPanel` components; `page.tsx` reduced from 1,382 lines to a thin coordinator; `react-resizable-panels` integration for user-draggable divider; `@tailwindcss/container-queries` for adaptive column counts.
**Addresses:** Three-zone layout (table stakes); resizable split panels (stack addition)
**Avoids:** Subscription teardown — page.tsx retains all hooks unchanged; Zustand selector instability — all new panel selectors must be named exports in `selectors.ts`; Anti-pattern: do not move DraftUIState to Zustand; do not give panels their own Supabase subscriptions

### Phase 5: Spectator Unification
**Rationale:** Depends on ViewerRole (Phase 1) and DraftLayout region composability (Phase 4). The unified view requires role-adaptive layout switching between `DraftSpectatorLayout` and `DraftParticipantLayout`.
**Delivers:** `viewerRole`-gated layout variants; `/spectate/[id]` converted to 308 permanent redirect to `/draft/[id]?spectator=true`; `isSpectator` derived from DB participants (not URL param only); service worker cache version bumped in `public/sw.js`.
**Addresses:** Unified participant/spectator page (P1 feature); broadcast mode at `/spectate/[id]?mode=broadcast` preserved for OBS users
**Avoids:** Permission drift (Pitfall 7) — DB-derived roles supersede URL params; Spectator link breakage in Discord (Pitfall 6) — 308 redirect preserved indefinitely

### Phase 6: Mobile Layout
**Rationale:** Depends on Phase 4 (region components exist as separate, composable trees). Mobile-specific layout changes are isolated to the DraftLayout mobile breakpoint behavior.
**Delivers:** Persistent bottom bar (search / team summary / progress); sticky timer visible at all scroll positions; tab-based panel switching on mobile (continuous scroll deferred to v2).
**Addresses:** Mobile draft with persistent Pokemon search (table stakes)
**Avoids:** iOS Safari scroll conflicts (Pitfall 4) — `h-[100dvh]` (not `h-screen`), `touch-action: pan-y` on drag handles, bounded WishlistManager container with `overscroll-behavior: contain`

### Phase 7: League Hub Navigation Consolidation (Independent)
**Rationale:** Fully independent of all draft room phases. Can start in parallel with Phase 1. `LeagueNav` is the only integration point — sub-page files are unchanged, sub-route URLs are preserved.
**Delivers:** 3-view LeagueNav (Overview / Matches / Management); pending trade count badge preserved and promoted to Overview quick-link; deep-linkable `?tab=management&section=trades` anchor support; task-flow audit completed before implementation.
**Addresses:** League hub 3-5 item maximum (table stakes per ESPN 2025 pattern)
**Avoids:** Feature discoverability loss (Pitfall 8) — task-flow audit required; trades reachable in 2 taps from any league view

### Phase 8: Post-Draft League Continuity (Independent)
**Rationale:** Fully independent. Low complexity. Verify league auto-creation on draft completion before implementing the CTA link.
**Delivers:** DraftResults CTA button linking to league hub; draft recap as league's first snapshot; `nuqs`-based shareable URL for active view state.
**Addresses:** Post-draft → league CTA (P1 feature); post-draft shareable results (table stakes)

### Phase Ordering Rationale

- Phases 1-3 establish primitives and low-risk components before the high-risk Phase 4 restructuring. When Phase 4 runs, it assembles already-tested pieces rather than building and moving simultaneously.
- Phase 4 is the highest-risk phase; deferring it until Phases 1-3 are stable reduces the scope of what can go wrong during the dangerous restructuring window.
- Phases 5-6 depend on Phase 4's region composability and are correctly sequenced after it.
- Phases 7 and 8 have zero shared dependencies with the draft room phases and should be scheduled to overlap with Phases 1-4 to reduce total milestone wall-clock time.
- The build order in ARCHITECTURE.md (CSS vars → ViewerRole → HostCommandBar → ActivityFeed → TurnStateOverlay → Layout Regions → Spectator Unification → Mobile Flow → League Hub → Results Continuity) matches this phase structure exactly.

### Research Flags

Phases needing deeper attention during planning:
- **Phase 4 (Layout Regions):** No additional domain research needed, but implementation must explicitly reference PITFALLS.md's five anti-patterns section during code review. These are the exact mistakes this phase will be tempted to make under time pressure.
- **Phase 5 (Spectator Unification):** Security concern requiring a unit test: "isSpectator should be true when userId is not in participants list, regardless of URL param." Write this test before implementing the unified view.
- **Phase 6 (Mobile Layout):** Physical iOS device testing is mandatory before shipping. The Simulator does not reproduce the `touch-action` scroll capture bug documented in Pitfall 4. Dynamic island models have different address bar behavior from older iPhones — test on both if possible.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** CSS custom properties and TypeScript enum types are well-understood; no domain research needed.
- **Phase 2 (Host Command Bar):** Extracting buttons from an existing component to a new location with identical callbacks is low complexity.
- **Phase 3 (Activity Feed):** Data shape is already correct in `useDraftActivity`; only rendering location changes.
- **Phase 7 (League Hub Nav):** Navigation restructure with unchanged sub-routes; task-flow audit is the only required planning step.
- **Phase 8 (Post-Draft Continuity):** Low complexity CTA and URL state addition; standard Next.js link patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All additions verified against npm registry, official changelogs, and compatibility matrices. Version-specific breaking changes (react-resizable-panels v4 API rename: `PanelResizeHandle` → `Separator`, `direction` → `orientation`) explicitly documented. |
| Features | MEDIUM | Competitor UX derived from official docs and press releases (HIGH for Sleeper, ESPN, Drafty Sports). Visual specifics inferred from behavior documentation where screenshots were unavailable. The "no competitor does full-screen takeover" finding is based on documentation review, not direct UI observation of live platforms. |
| Architecture | HIGH | Based on direct codebase analysis of all affected files with specific line numbers cited (page.tsx at 1,382 lines, line 1057 for SpectatorMode render, lines 1095-1129 for DraftControls block). Known bugs and their fixes directly inform the pitfall prevention strategy. |
| Pitfalls | HIGH | All critical pitfalls grounded in this app's actual code, documented bug post-mortems (infinite loop fix 2026-03-04, pickInFlightRef race condition 2026-03-04), and verified iOS Safari behavior. These are documented failure modes with recovery strategies, not theoretical risks. |

**Overall confidence:** HIGH

### Gaps to Address

- **"No competitor does full-screen takeover" claim:** Based on documentation review, not direct UI testing of live platforms. During Phase 1, prototype the CSS custom property approach (dim + pulse) in isolation before committing. If the visual effect feels insufficient compared to competitor "on the clock" states, revisit the takeover approach with explicit UX rationale before Phase 4.
- **League hub 3-view task-flow audit:** PITFALLS.md explicitly requires completing a task-flow audit before implementing the league hub consolidation (Pitfall 8). For each existing tab, map the primary action and confirm it is reachable in 2 taps from the new structure. This is a required planning step for Phase 7, not skippable.
- **Supabase channel count baseline:** The mount storm pitfall and always-visible panels create conditions for duplicate channel subscriptions. Instrument `supabase.getChannels().length` in a staging draft session before Phase 3 to establish the actual baseline. The Supabase dashboard should show exactly 1 channel per draft room after Phase 3 ships.
- **`allDraftedIds.includes()` performance:** PITFALLS.md identifies an existing O(n) array scan in the always-visible grid that becomes critical when the Pokemon grid is no longer tab-switched. Convert to `Set`-based lookup (`new Set(allDraftedIds)` in a `useMemo`) before Phase 4 makes the grid permanently visible.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `src/app/draft/[id]/page.tsx` (1,382 lines full analysis), `src/hooks/useDraftRealtime.ts`, `useDraftActivity.ts`, `useDraftActions.ts`, `useDraftSession.ts`
- Direct codebase analysis: `src/components/draft/DraftControls.tsx`, `DraftActivitySidebar.tsx`, `ActivityFeed.tsx`, `src/stores/draftStore.ts`
- App `MEMORY.md` — infinite loop post-mortem (2026-03-04), pickInFlightRef root cause and fix documented
- [react-resizable-panels npm](https://www.npmjs.com/package/react-resizable-panels) — v4.8.0 confirmed, v4 breaking changes verified
- [motion.dev docs](https://motion.dev/docs/react) — Motion 12.37.0, migration from framer-motion, layoutId and AnimatePresence patterns
- [nuqs npm](https://www.npmjs.com/package/nuqs) — v2.8.9, Next.js Conf 2025 adoption confirmed
- [Tailwind CSS container queries plugin](https://github.com/tailwindlabs/tailwindcss-container-queries) — official Tailwind Labs plugin for v3
- [Sleeper draft timer mechanics](https://support.sleeper.com/en/articles/4029085-how-does-the-draft-timer-work) — soft timer pattern (official docs)
- [Sleeper big screen mode](https://support.sleeper.com/en/articles/2083195-how-to-cast-your-draft-to-the-big-screen) — broadcast URL pattern (official docs)
- [ESPN Fantasy 2025 redesign press release](https://espnpressroom.com/us/press-releases/2025/08/espn-fantasy-football-30th-anniversary-new-design-new-features-all-new-fantasy-app-for-2025/) — 4-tab navigation, swipe patterns
- [Drafty Sports commissioner controls](https://draftysports.com/help/docs/commissioner-controls) — operational vs. structural control separation (official docs)
- [Clicky Draft features](https://clickydraft.com/draftapp/page/features) — per-team connection status, timer controls (official feature page)

### Secondary (MEDIUM confidence)
- [FantasyPros Draft Room Refresh](https://blog.fantasypros.com/draft-room-simulator-update/) — three-panel layout pattern (official blog)
- [ESPN Fantasy new features 2024](https://www.espn.com/fantasy/football/story/_/id/40378418/2024-fantasy-football-draft-board-new-features-espn) — Draft Train, Draft Board view (official)
- [UX case study: ESPN Fantasy App](https://usabilitygeek.com/ux-case-study-espn-fantasy-app/) — tab-switching mobile frustration analysis (third-party UX analysis)
- [Unofficial Sleeper League Page analysis](https://medium.com/@n.melhado/unofficial-sleeper-fantasy-football-league-page-3566812727fe) — navigation burying critique (developer analysis)
- [shadcn resizable v4 compatibility](https://github.com/shadcn-ui/ui/issues/9197) — API changes documented

### Tertiary (LOW confidence — validate during implementation)
- [Fantasy Football App UX Dos and Don'ts](https://medium.com/@johnxaavier/the-dos-and-donts-of-fantasy-football-app-development-ui-ux-design-5576e571aca7) — general mobile patterns (single author, not platform-specific)
- Visual specifics of competitor turn-state implementations (full-screen vs. highlight only) — inferred from behavior documentation, not direct UI observation

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*
