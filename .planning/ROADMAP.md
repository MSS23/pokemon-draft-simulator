# ROADMAP.md — Milestone 6: Draft UX Overhaul

**Milestone:** Draft UX Overhaul
**Phases:** 8 (Phases 27–34, continuing from Milestone 5)
**Coverage:** 22/22 requirements mapped

---

## Milestones

- ✅ **v1 Production Overhaul** - Phases 1–10 (shipped 2026-03-03)
- ✅ **v2 Codebase Health** - Phases 11–18 (shipped 2026-04-02)
- ✅ **v3 Beta Launch** - Phases 19–22 (shipped 2026-04-03)
- ✅ **v5 Security Hardening** - Phases 23–26 (shipped 2026-04-03)
- 🚧 **v6 Draft UX Overhaul** - Phases 27–34 (in progress)

---

## Phases

<details>
<summary>✅ v5 Security Hardening (Phases 23–26) — COMPLETE 2026-04-03</summary>

- [x] **Phase 23: Critical Fixes & Cost Safeguards** — Production baseline verified, billing guarded, CVE defense applied (completed 2026-04-03)
- [x] **Phase 24: Application Security Hardening** — Auth enforcement, CSP nonce, input sanitization, CORS locked (completed 2026-04-03)
- [x] **Phase 25: Supabase Scalability & RLS Hardening** — RLS indexes, broadcast migration, channel cleanup (completed 2026-04-03)
- [x] **Phase 26: Performance, Caching & Load Testing** — CDN caching, staleTime optimization, k6 load test (completed 2026-04-03)

</details>

### 🚧 v6 Draft UX Overhaul (In Progress)

**Milestone Goal:** Restructure all drafting pages into a modern, intuitive experience with clear spatial hierarchy, dramatic turn-state shifts, and unified views for managers, participants, and spectators.

- [x] **Phase 27: Foundation** — CSS custom properties, ViewerRole enum, TurnStateOverlay, and DraftRealtimeContext established before any structural changes (completed 2026-04-03)
- [ ] **Phase 28: Host Command Bar** — Persistent slim host command strip in sticky header plus Ctrl+K command palette replaces buried collapsible controls
- [ ] **Phase 29: Activity Feed Integration** — DraftActivityFeed always-visible in main layout instead of slide-in sidebar overlay
- [ ] **Phase 30: Layout Region Extraction** — Three-zone desktop layout with resizable panels; page.tsx reduced to a thin coordinator
- [ ] **Phase 31: Spectator Unification** — Single /draft/[id] URL adapts by DB-derived role; /spectate redirect and OBS broadcast mode preserved
- [ ] **Phase 32: Mobile Layout** — Persistent bottom bar, sticky timer, and tab-based panel switching on mobile
- [ ] **Phase 33: League Hub Navigation** — Three-section league hub (Overview/Matches/Management) replacing 7+ tabs with all sub-routes preserved
- [ ] **Phase 34: Post-Draft Continuity** — Clear CTA from draft results to league hub with direct navigation

---

## Phase Details

### Phase 27: Foundation
**Goal**: The turn-state theming system, ViewerRole abstraction, and DraftRealtimeContext provider are in place as primitives that every subsequent phase depends on — no structural JSX changes yet
**Depends on**: Nothing (first phase of this milestone)
**Requirements**: LAYOUT-04, TURN-01, TURN-04
**Success Criteria** (what must be TRUE):
  1. When it is the user's turn, the page root carries a `data-turn-state="active"` attribute and inactive panels visually dim while the pick button pulses — the shift is unmistakable without reading text
  2. The turn-state transition uses only `opacity` and `transform` CSS properties — no layout-affecting properties are animated, confirmed by zero layout recalculations in a Chrome DevTools performance trace at 4x CPU throttle
  3. A `ViewerRole` type (`host | participant | spectator | lobby`) exists in `useDraftSession` and is correctly derived from the DB participants table — not from a URL parameter
  4. `DraftRealtimeContext` is mounted at the page-level coordinator and all subscription hooks read from it — the WebSocket channel does not tear down and remount when any child component re-renders
  5. `page.tsx` exposes a thin coordinator surface where domain hooks are called exactly once and props are forwarded to named region components (structure committed, JSX extraction begins)
**Plans:** 2/2 plans complete
Plans:
- [x] 27-01-PLAN.md — DraftRealtimeContext, ViewerRole, CSS custom properties, and test scaffold
- [x] 27-02-PLAN.md — TurnStateOverlay component and page.tsx integration (context provider, data attribute, overlay replacement)
**UI hint**: yes

### Phase 28: Host Command Bar
**Goal**: The host can access all primary draft controls (pause, skip, ping, timer) in one tap from a persistent bar in the header, and can trigger any action via Ctrl+K command palette — without expanding a collapsible panel
**Depends on**: Phase 27 (ViewerRole required for permission-gating the bar from non-host users)
**Requirements**: TURN-02, TURN-03
**Success Criteria** (what must be TRUE):
  1. A host sees a slim persistent command bar in the sticky header at all scroll positions — non-host participants see no trace of it
  2. The host can pause the draft, skip a turn, ping the current picker, and adjust the timer each in a single tap from the command bar
  3. Pressing Ctrl+K opens a command palette with all host actions searchable by name — the palette is dismissible with Escape and shows a keyboard shortcut hint for each action
  4. The existing collapsible DraftControls panel remains accessible behind an overflow "•••" button for secondary/advanced controls — no controls are removed
**Plans**: TBD
**UI hint**: yes

### Phase 29: Activity Feed Integration
**Goal**: The draft activity feed is always visible in the main layout — no slide-in overlay required — so all participants passively follow the pick history without an extra action
**Depends on**: Phase 27 (DraftRealtimeContext must be stable before adding always-mounted consumers)
**Requirements**: LAYOUT-03
**Success Criteria** (what must be TRUE):
  1. The activity feed is visible as a permanent panel in the draft room on desktop at all scroll positions — no button press or sidebar toggle is needed to see pick history
  2. The activity feed renders without triggering a visible layout shift when new picks arrive — new entries append at the top and existing entries do not move (scroll position preserved)
  3. Opening the draft page with 50+ prior picks does not cause a measurable frame drop — the feed is virtualized and renders only visible rows
**Plans**: TBD
**UI hint**: yes

### Phase 30: Layout Region Extraction
**Goal**: The draft room presents a three-zone desktop layout (Pokemon pool left, team rosters center, activity feed right) with user-draggable resizable dividers, assembled from pre-built region components with page.tsx as a thin coordinator
**Depends on**: Phase 27 (CSS vars/context), Phase 28 (HostCommandBar exists), Phase 29 (ActivityFeed exists)
**Requirements**: LAYOUT-01, LAYOUT-02, LAYOUT-05
**Success Criteria** (what must be TRUE):
  1. The draft room shows three clearly delineated zones on desktop: Pokemon pool on the left, team rosters in the center, and activity feed on the right — all visible simultaneously without scrolling
  2. The "whose turn / time remaining" header is visible at all scroll positions on desktop — scrolling the Pokemon pool or roster does not move it off-screen
  3. A user can drag the divider between the Pokemon pool and roster panels to resize them; the layout proportions are restored on page reload (persisted in a cookie)
  4. `page.tsx` is under 300 lines and contains no inline JSX rendering — it only wires hooks and passes props to named region components (`DraftLayout`, `DraftLeftPanel`, `DraftCenterPanel`, `DraftRightPanel`)
**Plans**: TBD
**UI hint**: yes

### Phase 31: Spectator Unification
**Goal**: Participants, spectators, and hosts all use a single /draft/[id] URL with UI adapting by database-derived role — no separate /spectate route for regular viewing — while existing spectator links redirect seamlessly and OBS broadcast mode is preserved
**Depends on**: Phase 27 (ViewerRole), Phase 30 (region components composable enough for layout variants)
**Requirements**: SPEC-01, SPEC-02, SPEC-03
**Success Criteria** (what must be TRUE):
  1. A user who is not assigned to a team (spectator) visiting /draft/[id] sees pick controls hidden and a read-only view — determined by database role, not by URL parameter; removing `?spectator=true` from the URL does not reveal pick controls
  2. An existing /spectate/[id] URL (e.g., a Discord link) issues a 308 permanent redirect to /draft/[id] — the user lands on the correct draft without a broken-link experience
  3. /spectate/[id]?mode=broadcast opens a minimal dark-mode view with no navigation chrome — suitable for OBS browser source capture
**Plans**: TBD
**UI hint**: yes

### Phase 32: Mobile Layout
**Goal**: Mobile users can draft without tab-switching for core actions — a persistent bottom bar provides always-accessible search and team summary, a sticky timer is visible at all scroll positions, and the layout fits 375px screens without horizontal scroll
**Depends on**: Phase 30 (region components exist as composable trees for the mobile breakpoint variant)
**Requirements**: MOBILE-01, MOBILE-02, MOBILE-03
**Success Criteria** (what must be TRUE):
  1. A user on a 375px screen sees a persistent bottom bar at all scroll positions containing a Pokemon search trigger, a team summary (pick count and budget), and a draft progress indicator — no scrolling required to reach these
  2. The current picker's name and countdown timer are visible at all scroll positions on mobile via a sticky header — scrolling the Pokemon list does not push the timer off-screen
  3. The mobile layout switches between Pokemon, Team, and Board panels via tabs with no horizontal scroll on a 375px viewport — all tab content fits within the screen width
  4. The mobile layout uses `h-[100dvh]` (not `h-screen`) to correctly account for iOS Safari's dynamic address bar height — confirmed by visual inspection on a physical iOS device
**Plans**: TBD
**UI hint**: yes

### Phase 33: League Hub Navigation
**Goal**: The league hub presents three primary navigation sections (Overview, Matches, Management) replacing the current 7+ tabs — all existing sub-routes remain functional and reachable in two taps
**Depends on**: Nothing (fully independent of draft room phases — can run in parallel with Phases 27–30)
**Requirements**: LEAGUE-01, LEAGUE-02, LEAGUE-03, LEAGUE-04, LEAGUE-05
**Success Criteria** (what must be TRUE):
  1. The league hub top-level navigation shows exactly three sections: Overview, Matches, and Management — no other top-level tabs are present
  2. Overview shows standings, the current week's matchup for the logged-in user, recent match activity, and league announcements — all on one screen without tab-switching
  3. Matches shows the full schedule, match results, matchup detail links, and the playoff bracket — all reachable within the Matches section
  4. Management contains trades, waivers, free agents, power rankings, and commissioner tools — all reachable within the Management section in two taps from the league hub
  5. Every existing league sub-route URL (e.g., `/league/[id]/trades`, `/league/[id]/standings`) continues to load the correct page — no broken links from prior Discord/Reddit shares
**Plans**: TBD
**UI hint**: yes

### Phase 34: Post-Draft Continuity
**Goal**: When a draft completes, the results page presents a clear path to the league hub — the transition from "draft done" to "league started" feels seamless rather than a dead end
**Depends on**: Nothing (fully independent of draft room phases — can run in parallel with Phases 27–30)
**Requirements**: POST-01, POST-02
**Success Criteria** (what must be TRUE):
  1. The draft results page shows a prominent call-to-action button that navigates directly to the associated league hub — visible above the fold without scrolling
  2. Clicking the CTA from the results page lands the user on the league Overview section with standings and the first week's fixtures populated — the league is auto-created on draft completion and ready to use immediately
**Plans**: TBD
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 27. Foundation | 2/2 | Complete    | 2026-04-03 |
| 28. Host Command Bar | 0/? | Not started | - |
| 29. Activity Feed Integration | 0/? | Not started | - |
| 30. Layout Region Extraction | 0/? | Not started | - |
| 31. Spectator Unification | 0/? | Not started | - |
| 32. Mobile Layout | 0/? | Not started | - |
| 33. League Hub Navigation | 0/? | Not started | - |
| 34. Post-Draft Continuity | 0/? | Not started | - |

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| LAYOUT-01 | Phase 30 |
| LAYOUT-02 | Phase 30 |
| LAYOUT-03 | Phase 29 |
| LAYOUT-04 | Phase 27 |
| LAYOUT-05 | Phase 30 |
| TURN-01 | Phase 27 |
| TURN-02 | Phase 28 |
| TURN-03 | Phase 28 |
| TURN-04 | Phase 27 |
| SPEC-01 | Phase 31 |
| SPEC-02 | Phase 31 |
| SPEC-03 | Phase 31 |
| MOBILE-01 | Phase 32 |
| MOBILE-02 | Phase 32 |
| MOBILE-03 | Phase 32 |
| LEAGUE-01 | Phase 33 |
| LEAGUE-02 | Phase 33 |
| LEAGUE-03 | Phase 33 |
| LEAGUE-04 | Phase 33 |
| LEAGUE-05 | Phase 33 |
| POST-01 | Phase 34 |
| POST-02 | Phase 34 |

**Coverage:** 22/22 requirements mapped. No orphans.

---

## Implementation Notes

- **Phase 27 (Foundation):** `DraftRealtimeContext` must be established before any JSX extraction. Prototype the `data-turn-state` CSS custom property approach in isolation first — confirm the visual shift is unmistakable before Phase 30 assembles the full layout.
- **Phase 28 (Host Command Bar):** Uses `cmdk` via existing shadcn `command` component — no new package install. The existing `DraftControls` collapsible is retained as overflow panel; no controls are deleted.
- **Phase 29 (Activity Feed):** Gate the always-mounted `DraftActivityFeed` behind `draftState !== null` to avoid mount storm (Pitfall 3 in SUMMARY.md). Instrument `supabase.getChannels().length` before shipping to confirm no duplicate channels.
- **Phase 30 (Layout Extraction — HIGHEST RISK):** All new panel component selectors must be named exports in `selectors.ts` — no inline selectors (Pitfall 2: Zustand infinite loop). `DraftUIState` stays in `page.tsx` local state — do not lift to Zustand. Convert `allDraftedIds.includes()` to `Set`-based lookup in `useMemo` before making the grid always-visible.
- **Phase 31 (Spectator Unification):** Write unit test "isSpectator should be true when userId is not in participants list, regardless of URL param" before implementation. 308 redirect is permanent — preserve indefinitely for Discord/Reddit links.
- **Phase 32 (Mobile):** Physical iOS device testing mandatory. Use `h-[100dvh]` not `h-screen`. Add `touch-action: pan-y` on drag handles, `overscroll-behavior: contain` on WishlistManager.
- **Phase 33 (League Hub):** Complete a task-flow audit before implementing — for each existing tab, confirm the primary action is reachable in 2 taps from the new 3-section structure. Sub-page files are not merged or deleted; only `LeagueNav` changes.
- **Phase 34 (Post-Draft):** Verify league auto-creation on draft completion fires before implementing the CTA link — the league must exist before the button navigates to it.
