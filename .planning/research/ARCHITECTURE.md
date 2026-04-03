# Architecture Research

**Domain:** Real-time draft room UX overhaul — composable layout, role-adaptive views, league consolidation
**Researched:** 2026-04-03
**Confidence:** HIGH — based on direct codebase analysis of all affected files

---

## Current Architecture (Baseline)

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ROUTE LAYER (Next.js App Router)              │
├─────────────────────────────────────────────────────────────────────┤
│  /draft/[id]/page.tsx     │  /spectate/[id]/page.tsx  │  /league/[id]│
│  1,382 lines               │  ~400 lines               │  7+ sub-pages│
│  DraftUIState (local)      │  Separate realtime hook   │  Own state   │
│  5 domain hooks            │  SpectatorId (session)    │  LeagueNav   │
├─────────────────────────────────────────────────────────────────────┤
│                     DOMAIN HOOKS LAYER                                │
│  useDraftSession  useDraftActions  useDraftAuction                   │
│  useDraftTimers   useDraftActivity  useDraftRealtime                 │
├─────────────────────────────────────────────────────────────────────┤
│                        STATE LAYER                                    │
│  Zustand draftStore         │  Local useState in page.tsx            │
│  (wishlist, pokemon tiers)  │  (DraftUIState — source of truth)      │
├─────────────────────────────────────────────────────────────────────┤
│                        SERVICE LAYER                                  │
│  DraftService  AuctionService  LeagueService  DraftRealtimeManager  │
├─────────────────────────────────────────────────────────────────────┤
│                    SUPABASE (Postgres + Realtime)                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Files and Their Roles

| File | Lines | Responsibility | Change in Overhaul |
|------|-------|---------------|-------------------|
| `src/app/draft/[id]/page.tsx` | 1,382 | Orchestrator: holds DraftUIState, wires 5 hooks, renders everything | Extract layout regions into sub-components; page becomes thin coordinator |
| `src/app/spectate/[id]/page.tsx` | ~400 | Separate spectator with its own realtime hook | Merge role handling into draft page; keep as redirect or alias |
| `src/app/league/[id]/page.tsx` | ~550 | Hub with fixtures + standings inline | Stays, but layout restructures around 3 views |
| `src/hooks/useDraftRealtime.ts` | ~200 | Supabase subscription lifecycle | No change — the subscription anchor |
| `src/hooks/useDraftActions.ts` | ~300 | All pick/start/pause/undo callbacks | No change — stable interface |
| `src/hooks/useDraftActivity.ts` | ~100 | Sidebar open state + activity data | Rename: `isActivitySidebarOpen` repurposed to mobile-only trigger; feed always visible on desktop |
| `src/components/draft/DraftActivitySidebar.tsx` | ~200 | Slide-in panel | Replace with inline feed panel on desktop |
| `src/components/draft/DraftControls.tsx` | ~400 | Collapsible host controls | Extract primary actions into `HostCommandBar` |
| `src/components/draft/ActivityFeed.tsx` | ~80 | Generic feed (unused in main page) | Promote to primary feed component |

---

## Architecture for the Overhaul

### Q1: Restructuring Draft Page Without Breaking Subscriptions

**The constraint:** `useDraftRealtime` is initialized with `draftState?.draft?.id` derived from DraftUIState in page.tsx local state. The `pickInFlightRef` that suppresses realtime refresh during picks also lives in page.tsx via `useDraftActions`. Both must remain in the same component tree as the subscription.

**Pattern: Thin Coordinator + Region Components**

The page.tsx becomes a thin coordinator that:
1. Owns DraftUIState (stays as local useState — do not lift to Zustand)
2. Wires all 5 hooks (unchanged)
3. Passes derived data down to region components via props

Region components replace the inline JSX blocks. They do NOT subscribe to Supabase directly — they receive pre-derived props only.

```
DraftRoomPage (page.tsx) — coordinator only
├── DraftPageHeader         — room code, status badge, connection indicator, share
├── DraftCommandBar         — replaces DraftControls (host-only, always visible)
├── TurnStateOverlay        — "your turn" dramatic takeover vs dimmed waiting state
├── DraftLayout             — responsive grid container
│   ├── DraftLeftPanel      — activity feed (always visible) + turn history
│   ├── DraftCenterPanel    — pokemon grid + pick controls
│   └── DraftRightPanel     — user team roster + budget + wishlist
├── AllTeamsBoard           — team rosters grid (board tab on mobile)
├── DraftModals             — confirmation, details, auction UIs (portal-rendered)
└── DraftActivitySidebarLegacy — keep for mobile fallback during transition
```

**Rule:** No region component calls hooks that touch Supabase. All realtime data flows from page.tsx downward. This preserves the subscription lifecycle without any migration risk.

**The DraftUIState stays local.** Moving it to Zustand is out of scope and would require rewriting the `transformDraftState` memoization and hash comparison that prevents unnecessary re-renders from Supabase polling.

---

### Q2: Unifying /draft/[id] and /spectate/[id]

**Current separation:** The spectator page uses `useDraftStateWithRealtime` (a different hook from `useDraftRealtime`), maintains its own `recentActivity` state, and generates its own `spectatorId`. The main draft page already handles spectators via `isSpectator` flag from `useDraftSession`.

**Finding:** The main draft page already renders `<SpectatorMode>` when `isSpectator || !draftState.userTeamId` (line 1057 of page.tsx). The separate spectate route is largely redundant for the UX itself.

**Migration Strategy:**

Step 1 (non-breaking): Add a redirect from `/spectate/[id]` to `/draft/[id]?spectator=true`. The existing `isSpectatorParam` handling in `useDraftSession` picks this up. Keep `/spectate/[id]` alive as a redirect only.

Step 2: The spectator page currently shows a "broadcast view" link to `/spectate/[id]/broadcast`. Preserve this sub-route since it is OBS-targeted with 1920x1080 fixed dimensions.

Step 3: In the unified draft page, `useDraftSession` already returns `isSpectator`. Add a `viewerRole` derived value:

```typescript
// src/hooks/useDraftSession.ts — additive change
type ViewerRole = 'host' | 'participant' | 'spectator' | 'lobby'
// Derived from: isHost, userTeamId !== null, isSpectatorParam
```

Use this single value to gate which layout sub-tree renders:
- `'spectator'` → DraftSpectatorLayout (read-only, activity feed prominent, no pick controls)
- `'participant'` → DraftParticipantLayout (full controls, your-turn state)
- `'host'` → DraftParticipantLayout + HostCommandBar
- `'lobby'` → waiting room with join prompt

**Broadcast mode preservation:** `/spectate/[id]/broadcast` imports `SpectatorMode` directly and has specific OBS CSS. This route stays independent — no merge needed.

---

### Q3: Restructuring the League Hub

**Current state:** The league hub page.tsx renders standings and week fixtures inline. The 7+ "tabs" are actually separate Next.js sub-routes: `/schedule`, `/rankings`, `/stats`, `/free-agents`, `/trades`, `/admin`, `/matchup/[id]`, `/team/[teamId]` — each with their own `loading.tsx`.

**Finding:** This is a navigation redesign, not a component refactor. The `LeagueNav` component (`src/components/league/LeagueNav.tsx`) already acts as the nav between these pages.

**The three target views map as:**

| New View | Current Location | Content |
|----------|-----------------|---------|
| Overview | `/league/[id]` | Standings + current week fixtures + announcements + playoff bracket |
| Matches | New grouping | `/schedule` + `/matchup/[id]` + match recording. Week navigation stays inline |
| Management | New grouping | `/trades` + `/free-agents` + `/admin` (commissioner-gated) |

**Implementation:** Update `LeagueNav` to show 3 primary navigation items. The existing sub-pages remain functional with their own URL structure — they become nested under each view group in the nav. No sub-page files are merged or deleted.

**LeagueNav integration point:** `src/components/league/LeagueNav.tsx` — change from listing 7+ individual links to 3 top-level views with sub-navigation within each group.

---

### Q4: Component Composition for Turn-State Visual Changes

**The "your turn" state needs a dramatic full-screen shift.** The current implementation is a subtle border glow (`ring-2 ring-primary/20`). The overhaul targets ESPN/Sleeper-quality visual drama.

**Pattern: CSS Custom Property Cascade**

The page root element gets a `data-turn-state` attribute that propagates visual theming through CSS variables. This avoids prop drilling the turn state into every sub-component and avoids a React context (which would cause all consumers to re-render on every turn change).

```typescript
// In DraftRoomPage render:
<div
  className="min-h-screen draft-room-mobile"
  data-turn-state={isUserTurn ? 'active' : 'waiting'}
>
```

```css
/* In globals.css */
[data-turn-state='active'] {
  --draft-accent: var(--color-primary);
  --draft-surface: hsl(142 76% 36% / 0.05);
  --draft-border: hsl(142 76% 36% / 0.3);
}
[data-turn-state='waiting'] {
  --draft-accent: var(--color-muted-foreground);
  --draft-surface: transparent;
  --draft-border: var(--color-border);
}
```

**TurnStateOverlay component** — a fixed-position overlay that mounts only when the turn transitions to active:
- Mount trigger: `isUserTurn` transitions from `false` to `true`
- Animation: radial green glow expanding from center (CSS animation, no framer-motion needed)
- Duration: 600ms then auto-unmount
- Replaces: the current inline `showTurnFlash` div (line 1366 in page.tsx)

The `showTurnFlash` state and the `turnFlashFade` CSS animation are already wired in the codebase. The `TurnStateOverlay` component wraps and formalizes this existing mechanism.

**DraftCenterPanel** changes className based on `isUserTurn` prop:
- Active turn: full-width grid, pick controls prominent, glowing border via `--draft-border`
- Waiting turn: grid slightly dimmed (`opacity-80`), pick controls replaced by "Waiting for {team}..." banner

---

### Q5: Persistent Host Controls

**Current problem:** `DraftControls` is dynamically imported and rendered below the team rosters in the page scroll — it is collapsible and gets scrolled off-screen. Host commands are buried during active drafting.

**Pattern: HostCommandBar as Header Slot**

```
DraftPageHeader (sticky, z-30)
├── Left: RoomCode + StatusBadge + ConnectionBadge
├── Center: [host/admin only] HostCommandBar
│     ├── Start/Pause/Resume (primary action button)
│     ├── Skip Turn (icon button)
│     ├── Ping Player (bell icon button)
│     └── Overflow (•••) → Reset, Delete, Shuffle, Undo, Adjust Timer
└── Right: SoundToggle + Share + ActivityToggle
```

**Integration with existing DraftControls:** `DraftControls` accepts 15+ callback props. `HostCommandBar` uses the same callbacks from `useDraftActions` — the prop interface does not change. Only the rendering location and visual treatment change.

**Refactor approach:** Extract the 4 primary action buttons into `HostCommandBar`. Keep `DraftControls` for the overflow panel (triggered by the "•••" button). This is a composition change, not a rewrite.

**File to create:** `src/components/draft/HostCommandBar.tsx`
**File to modify:** `src/app/draft/[id]/page.tsx` — replace the dynamic DraftControls block (line 1095-1129) with HostCommandBar in the header area

---

### Q6: Activity Feed Integration (Sidebar to Always-Visible)

**Current data flow:**
```
useDraftActivity() → sidebarActivities → DraftActivitySidebar (slide-in, gated by isActivitySidebarOpen)
```

**Target data flow:**
```
useDraftActivity() → feedActivities → DraftActivityFeed (always mounted in DraftLeftPanel)
                                    → (mobile) bottom-sheet via isActivitySidebarOpen
```

**The `useDraftActivity` hook needs one change:** `isActivitySidebarOpen` is repurposed — it controls a mobile bottom-sheet only, not the desktop panel. Rename `sidebarActivities` to `feedActivities` for clarity.

**Data shape is already correct.** The `SidebarActivity` type contains `teamId`, `teamName`, `pokemonId`, `pickNumber`, `round`, `timestamp` — everything the inline feed needs. No data restructuring required.

**DraftActivityFeed component** renders in `DraftLeftPanel` on desktop (md+). On mobile, it becomes a bottom sheet accessed via the History button in the header (same trigger, different container).

**DraftActivitySidebar.tsx:** Retain during transition as the mobile bottom-sheet container. On desktop, `DraftActivityFeed.tsx` takes over. After the overhaul ships, the sidebar file can be deprecated.

**Performance note:** Moving from a conditionally-mounted sidebar to always-mounted feed adds minor memory cost but eliminates open/close animation overhead. The `useMemo` in `useDraftActivity` already has stable dependencies — no changes needed.

---

### Q7: Build Order

```
CSS custom properties (no deps)
    ↓
ViewerRole enum in useDraftSession (no UI deps)
    ↓
HostCommandBar component (depends on: ViewerRole for conditional render)
    ↓
DraftActivityFeed component (depends on: useDraftActivity hook change)
    ↓
TurnStateOverlay component (depends on: CSS custom properties)
    ↓
DraftLayout Region Components (depends on: HostCommandBar + ActivityFeed + TurnStateOverlay)
    ↓
Spectator Unification (depends on: ViewerRole + DraftLayout composability)
    ↓
Mobile Scrollable Flow (depends on: DraftLayout region composability)
    |
League Hub Nav Restructure (independent — runs in parallel with any phase)
    |
Results-to-League Continuity (independent — no draft room deps)
```

**Recommended phase breakdown:**

| Phase | Work | Risk | Can Parallelize With |
|-------|------|------|---------------------|
| 1. Foundation | CSS variables, ViewerRole, TurnStateOverlay | Low | League Hub (Phase 7) |
| 2. Host Bar | HostCommandBar, DraftControls overflow | Medium | — |
| 3. Activity Feed | Hook simplification, DraftActivityFeed | Low | Phase 2 |
| 4. Layout Regions | DraftLayout + Left/Center/Right panels, refactor page.tsx render | High | — |
| 5. Spectator Unification | ViewerRole-gated layouts, /spectate redirect | Medium | — |
| 6. Mobile Flow | Continuous scroll replacing tab switching | Medium | — |
| 7. League Hub Nav | LeagueNav 3-view restructure | Low | Any phase |
| 8. Results Continuity | Post-draft league creation flow | Low | Any phase |

**Phase 4 is the highest risk** — it restructures the render block of page.tsx. The mitigation: page.tsx continues to own all state and hooks unchanged. Only the JSX return block changes. Each region component is a pure prop-receiver. If one breaks, the coordinator retains full state and can temporarily inline-render the broken region.

---

## Component Inventory

### New Components to Create

| Component | Location | Purpose | Replaces |
|-----------|----------|---------|---------|
| `HostCommandBar` | `src/components/draft/HostCommandBar.tsx` | Persistent host actions in sticky header | Buried collapsible DraftControls |
| `DraftActivityFeed` | `src/components/draft/DraftActivityFeed.tsx` | Always-visible inline feed panel | DraftActivitySidebar slide-in |
| `TurnStateOverlay` | `src/components/draft/TurnStateOverlay.tsx` | Full-screen turn flash animation component | Inline `showTurnFlash` div in page.tsx |
| `DraftLayout` | `src/components/draft/DraftLayout.tsx` | Three-panel responsive grid wrapper | Inline grid in page.tsx |
| `DraftLeftPanel` | `src/components/draft/DraftLeftPanel.tsx` | Activity feed + history panel | Inline sidebar button trigger |
| `DraftCenterPanel` | `src/components/draft/DraftCenterPanel.tsx` | Pokemon grid + pick controls bar | Inline grid section in page.tsx |
| `DraftRightPanel` | `src/components/draft/DraftRightPanel.tsx` | User team roster + budget + wishlist | Separate scattered sections in page.tsx |

### Components to Modify

| Component | Change | Risk |
|-----------|--------|------|
| `src/hooks/useDraftActivity.ts` | Repurpose `isActivitySidebarOpen` to mobile-only; rename `sidebarActivities` | Low |
| `src/hooks/useDraftSession.ts` | Add `viewerRole: ViewerRole` derived return value | Low (additive) |
| `src/components/draft/DraftControls.tsx` | Extract primary buttons to HostCommandBar; keep overflow actions | Medium |
| `src/components/league/LeagueNav.tsx` | Restructure to 3 primary views + sub-navigation | Low |
| `src/app/spectate/[id]/page.tsx` | Convert to redirect to `/draft/[id]?spectator=true` | Low |
| `src/app/draft/[id]/page.tsx` | Replace inline JSX with region components; all hooks/state unchanged | High |

### Components to Preserve (Do Not Modify)

- `src/hooks/useDraftRealtime.ts` — subscription lifecycle
- `src/hooks/useDraftActions.ts` — all callback logic
- `src/hooks/useDraftAuction.ts` — auction state
- `src/hooks/useDraftTimers.ts` — timer logic
- `src/lib/draft-realtime.ts` — Supabase channel management
- `src/stores/draftStore.ts` — Zustand store and selectors
- All 8 league sub-page files (redirect is the only spectate change)
- `/spectate/[id]/broadcast` route (OBS-targeted, keep independent)

---

## Data Flow

### Turn State Data Flow (After Overhaul)

```
page.tsx: isUserTurn = (draftState.userTeamId === draftState.currentTeam)
    ↓
<div data-turn-state={isUserTurn ? 'active' : 'waiting'}>
    ↓ (CSS cascade)
DraftCenterPanel: border, background via --draft-surface, --draft-border
TurnStateOverlay: mounts on isUserTurn true transition, auto-unmounts after 600ms
HostCommandBar: ping/skip buttons highlight state
```

### Realtime Update Flow (Unchanged)

```
Supabase postgres_changes event
    ↓ useDraftRealtime.onRefreshNeeded callback
    ↓ pickInFlightRef.current check (suppress if pick in flight)
    ↓ DraftService.getDraftState(roomCode)
    ↓ transformDraftState(dbState, userId) with hash comparison
    ↓ setDraftState(newState)
    ↓ Re-render of all region components (props change)
```

### Spectator View Data Flow (After Unification)

```
URL: /draft/[id]?spectator=true (or redirect from /spectate/[id])
    ↓ useDraftSession → viewerRole: 'spectator'
    ↓ Same useDraftRealtime subscription as participants
    ↓ DraftSpectatorLayout (no pick controls, activity feed prominent)
    ↓ DraftLeftPanel + AllTeamsBoard (read-only)
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Moving DraftUIState to Zustand

**What people do:** Lift all state to Zustand when refactoring for composability.
**Why it's wrong:** The `transformDraftState` hash comparison (`prevTransformedStateRef`) prevents unnecessary re-renders from Supabase polling. Zustand's shallow equality does not replicate this hash-based comparison. The `pickInFlightRef` pattern requires co-location with both the state setter and the realtime callback.
**Do this instead:** Keep DraftUIState in page.tsx local state. Pass derived values down to region components as props. Region components remain pure renderers.

### Anti-Pattern 2: Giving Region Components Their Own Subscriptions

**What people do:** Move Supabase subscriptions into individual panel components for isolation.
**Why it's wrong:** Multiple subscriptions to the same Supabase channel from one browser tab causes duplicate event delivery. The connection manager in `useDraftRealtime` handles deduplication — distributing subscriptions breaks this.
**Do this instead:** Single subscription in page.tsx via `useDraftRealtime`. Region components are dumb renderers.

### Anti-Pattern 3: Merging League Sub-Pages into a Single Tabbed File

**What people do:** Interpret "3 views" as requiring a single page.tsx with client-side tab state.
**Why it's wrong:** The current league sub-pages have `loading.tsx` and proper Next.js code splitting. Merging into client tabs bundles all league data fetching into one large component.
**Do this instead:** Keep the 7 sub-routes as-is. Restructure `LeagueNav` to group them under 3 primary labels. Navigation remains Next.js route-based.

### Anti-Pattern 4: Removing `isActivitySidebarOpen` Entirely

**What people do:** Delete the sidebar open state assuming the inline feed handles all viewports.
**Why it's wrong:** On mobile (< md breakpoint) a three-panel layout is impossible. The activity feed needs a mobile trigger.
**Do this instead:** Repurpose `isActivitySidebarOpen` as the mobile bottom-sheet trigger. On desktop (md+), the feed is always visible in `DraftLeftPanel`. On mobile, the History button in the header opens a bottom sheet.

### Anti-Pattern 5: React Context for Turn State

**What people do:** Create `DraftTurnContext` to propagate `isUserTurn` without prop drilling.
**Why it's wrong:** Turn state changes every 30-120 seconds. A context with a frequently-updating value causes all consumers to re-render simultaneously — the opposite of what the existing memoized selectors achieve.
**Do this instead:** CSS custom property cascade via `data-turn-state` attribute. Pass `isUserTurn` as an explicit prop only to the 3 components that need conditional logic: `DraftCenterPanel`, `HostCommandBar`, `TurnStateOverlay`.

---

## Integration Points Summary

### Realtime Subscription Boundary

| Layer | File | Role |
|-------|------|------|
| Subscription owner | `src/hooks/useDraftRealtime.ts` | Creates/destroys Supabase channel |
| State coordinator | `src/app/draft/[id]/page.tsx` | Receives refresh callbacks, updates DraftUIState |
| Region components | `DraftCenterPanel`, `DraftLeftPanel`, etc. | Pure renderers, no Supabase access |

**Rule:** Nothing below page.tsx in the component tree should import from `src/lib/supabase.ts` for draft room panels.

### DraftUIState Interface Note

The `DraftUIState` interface is defined in both `page.tsx` and `useDraftActions.ts` (duplication is existing tech debt). Do not unify these during the UX overhaul — it introduces unnecessary merge risk. Keep the duplication and address it in a separate cleanup phase.

### League Sub-Routes Preservation

All 8 league sub-routes remain with their existing URL structure. `LeagueNav` is the only integration point for the hub restructure. Sub-page files are not modified.

---

## Sources

- Direct analysis: `src/app/draft/[id]/page.tsx` (full 1,382 lines)
- Direct analysis: `src/app/spectate/[id]/page.tsx`
- Direct analysis: `src/app/league/[id]/page.tsx` and all 8 sub-page files
- Direct analysis: `src/hooks/useDraftRealtime.ts`, `useDraftActivity.ts`, `useDraftActions.ts`, `useDraftSession.ts`
- Direct analysis: `src/components/draft/DraftControls.tsx`, `DraftActivitySidebar.tsx`, `ActivityFeed.tsx`
- Direct analysis: `src/stores/draftStore.ts`
- Codebase comment: `Cache bust: 2025-10-14-v3-fix-infinite-loop` — pickInFlightRef pattern was a deliberate fix, not incidental code

---
*Architecture research for: Pokemon Draft UX Overhaul (Milestone 6)*
*Researched: 2026-04-03*
