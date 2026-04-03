# Pitfalls Research

**Domain:** Real-time draft UX overhaul — restructuring drafting pages, unified views, and dramatic turn-state transitions on an existing Next.js 15 + Supabase + Zustand platform
**Researched:** 2026-04-03
**Confidence:** HIGH (grounded in this app's actual code, known bugs, prior infinite-loop post-mortem, and real component structure)

---

## Critical Pitfalls

### Pitfall 1: Subscription Teardown During Component Restructuring

**What goes wrong:**
When components that own subscriptions are refactored — split into panels, merged into layouts, or repositioned in the tree — `useEffect` cleanup functions fire on unmount. Moving the `useDraftRealtime` hook from the monolithic draft page into a new layout wrapper, or changing which component mounts `DraftRealtimeManager`, will cause the WebSocket channel to be torn down and re-created. During re-creation (typically 200–800ms) picks or turn-change events can be lost. If the draft is live during this window, a client ends up with stale turn state — the exact class of bug already documented in the `pickInFlightRef` fix.

**Why it happens:**
React's effect model ties subscription lifetime to component lifetime. When the component calling `useDraftRealtime` unmounts (even briefly due to layout restructuring), the cleanup path in the hook calls `manager.cleanup()`, which unsubscribes all `postgres_changes` listeners. The new mount re-subscribes, but any events that fired between unmount and the new `subscribe()` acknowledgment are silently lost.

In `src/hooks/useDraftRealtime.ts`, the manager is created in a `useEffect` with `[draftId, userId]` dependencies. Any parent refactor that changes the identity of `draftId` or `userId` props (e.g., because the new layout shell resolves `userId` independently from `useDraftSession`) triggers a full subscription cycle.

**How to avoid:**
- Hoist `useDraftRealtime` to the highest stable component in the new layout — the route-level page component, not a panel or sidebar subcomponent.
- Wrap `DraftRealtimeManager` in a React context (`DraftRealtimeContext`) so child panels consume events without owning the subscription. The context provider lives at the page level and never unmounts during layout transitions.
- Before any structural refactor, add a console assertion: log when `DraftRealtimeManager` is created. If the log fires more than once per page session without a deliberate reconnect, a structural issue is causing re-mounts.
- After restructuring, verify `manager.channel.state === 'joined'` (not `'joining'`) 2 seconds after page load.

**Warning signs:**
- Console shows repeated `[UseDraftRealtime] Creating DraftRealtimeManager` logs during normal navigation.
- Presence user counts flicker to 0 and back without disconnects.
- `connectionStatus.status` cycles `disconnected → connecting → connected` after layout changes.
- Other clients see picks that the picker's own UI does not reflect (identical to the previously fixed race condition).

**Phase to address:**
The very first phase that touches layout structure. Create the `DraftRealtimeContext` provider before splitting any panels. All subsequent phases consume events from context rather than re-subscribing.

---

### Pitfall 2: Zustand Selector Instability in New Panel Components

**What goes wrong:**
This app already hit this exact bug in `useWishlistSync.ts` — the `() => []` inline selector created a new function reference on every render, causing Zustand to re-evaluate, triggering another render, creating an infinite loop (React #185). When the component tree is restructured, new components are written that read from `useDraftStore`. If those components define selectors inline, the loop recurs. During a UX overhaul, new layout components are written quickly; the `EMPTY_SELECTOR` / `EMPTY_ARRAY` patterns learned from the prior bug are easy to forget.

The risk is highest in the unified participant/spectator view because new conditional logic like `isSpectator ? spectatorSelector : participantSelector` creates a new function reference on every render whenever `isSpectator` is re-evaluated.

**Why it happens:**
`useDraftStore(selector)` uses referential equality on the selector function. An inline selector (e.g., `useDraftStore(state => state.teams.find(t => t.id === teamId))`) is a new function every render. Zustand cannot use its cache, re-runs on every store update, and when the selector's return value also changes (because `.find()` returns a new object reference), React schedules another render, which creates another new selector.

**How to avoid:**
- All selectors for new layout panels must be defined as named exports in `src/stores/selectors.ts`. No inline selectors in component files.
- For parameterized selectors, call the factory inside `useMemo`, not directly in the `useDraftStore` call:
  ```typescript
  // Correct (already used in useWishlistSync.ts):
  const wishlistSelector = useMemo(
    () => participantId ? selectUserWishlist(participantId) : EMPTY_SELECTOR,
    [participantId]
  )
  const items = useDraftStore(wishlistSelector)

  // Wrong — triggers infinite loop:
  const items = useDraftStore(state =>
    participantId ? selectUserWishlist(participantId)(state) : []
  )
  ```
- For the unified view's role-conditional selector, use a stable reference chosen between two named selectors: `const selector = isSpectator ? selectSpectatorView : selectParticipantView`. The variable reference is stable between renders when `isSpectator` doesn't change.
- Add to `CLAUDE.md`: any `useDraftStore(state => ...)` with an inline arrow function must be wrapped in `useCallback` or moved to `selectors.ts`. Treat this as a lint-enforced rule.

**Warning signs:**
- React DevTools profiler shows a component rendering >5 times per second with no user interaction.
- Browser tab freezes during the "your turn" transition animation.
- Any hook referencing `useDraftStore` starts logging continuously.
- CPU usage climbs steadily on the draft page without picks being made.

**Phase to address:**
Before any new component is written. Create placeholder selector exports in `selectors.ts` for every new panel, and add the rule to `CLAUDE.md`. Verify with the React DevTools profiler after each new component is added.

---

### Pitfall 3: Mount Storm When Adding Always-Visible Panels

**What goes wrong:**
The current draft page lazy-loads `DraftControls`, `WishlistManager`, and `DraftActivitySidebar` with `dynamic()`. They are conditionally rendered (sidebar gated by `isActivitySidebarOpen`). When these become always-visible panels in the new layout, they mount on initial load. Each panel has its own `useEffect` subscriptions, TanStack Query fetches, or Zustand subscriptions. Mounting 4–5 panels simultaneously creates a "mount storm" — all effects fire together, network requests pile up, and the React scheduler is overwhelmed, causing a noticeable freeze on draft page load.

`WishlistManager` calls `useWishlistSync`, which creates a Supabase channel. `DraftControls` may fetch admin state. If both run setup effects in the same React render cycle, there will be duplicate channel creation attempts in Supabase.

**Why it happens:**
`dynamic()` with `ssr: false` defers the JS bundle load but does not stagger mount timing. When conditional rendering (`isActivitySidebarOpen && <Sidebar />`) is replaced with unconditional rendering, the component moves from never-mounted to always-mounted. All panels race to initialize at once.

**How to avoid:**
- Gate heavy panels behind `draftState !== null` — render a skeleton (using the existing `DraftRoomLoading` pattern) until the first draft state load completes. This staggers initialization: critical draft state loads first, panels initialize after.
- For `WishlistManager` specifically: keep `enabled={draftState !== null && !!participantId}` in `useWishlistSync`. This prevents the wishlist Supabase channel from registering with a null `participantId`.
- Keep `dynamic()` lazy imports even for always-visible panels. `dynamic()` handles JS splitting; mount timing is a separate concern controlled by conditional rendering.
- Stagger secondary panel initialization: subscribe to critical draft state first, then enable activity feed and host controls 100–200ms later.

**Warning signs:**
- Initial page load time increases by >500ms after adding panels.
- Supabase dashboard shows duplicate channel subscriptions for the same draft ID.
- TanStack Query DevTools shows the same query key fetched 2+ times in rapid succession on mount.
- `[UseWishlistSync]` logs show initialization before `draftState` is loaded.

**Phase to address:**
The phase that converts the activity sidebar and host controls from slide-in/collapsible to always-visible. Add explicit `enabled` guards to all panel hooks before removing the conditional rendering gate.

---

### Pitfall 4: iOS Safari Scroll Conflicts in Continuous Mobile Flow

**What goes wrong:**
Replacing mobile tab-switching (`activeTab: 'pokemon' | 'team' | 'board'`) with continuous vertical scroll creates overlapping scroll contexts: the browser's viewport scroll, any `overflow-y-scroll` container inside the layout, and Radix UI `ScrollArea` components used in panels. iOS Safari has a documented behavior where `touch-action: none` applied by a parent element silently prevents all scroll events from propagating — the page appears frozen.

`WishlistManager` uses drag-and-drop (`useDragAndDrop` hook). If this panel lives in the continuous scroll flow, its `touch-action: none` region captures swipes intended for page scroll.

**Why it happens:**
iOS Safari does not fire `touchmove` events when a `touchstart` event's default is prevented anywhere in the event path. Framer Motion's drag handlers call `preventDefault()` on `touchstart` within drag targets. If a drag target is inline in the scroll flow (not inside a bounded panel), any scroll gesture starting over a draggable element is captured as a potential drag, and the page does not scroll.

Additionally, `100vh` on iOS includes the browser chrome. `flex-1 overflow-y-auto` inside an `h-screen flex flex-col` Tailwind layout may fail to scroll if the parent's height isn't computed correctly — a known Tailwind/Safari interaction. The fix is `h-[100dvh]` (dynamic viewport height).

**How to avoid:**
- Keep `WishlistManager` inside a bounded, fixed-height container with its own scroll context and `overscroll-behavior: contain`. It must not be inline in the continuous page scroll flow.
- Set `touch-action: pan-y` on drag handles (not `none`), which allows vertical scrolling while enabling horizontal drag.
- Use `h-[100dvh]` (not `h-screen` or `h-[100vh]`) for the mobile layout root container.
- Avoid nesting Radix `ScrollArea` inside another scrollable container. Radix's `ScrollArea` creates its own viewport and blocks native scroll bubbling.
- Test on a physical iOS device (not Simulator) before shipping the mobile layout. The Simulator does not reproduce the touch capture bug.

**Warning signs:**
- Page appears frozen after first drag gesture on iOS.
- Pokemon grid fails to scroll when the wishlist is rendered in the same view.
- Team roster list does not scroll on iPhone even though it scrolls on Android.
- `overflow: hidden` appears on `body` (a Radix Dialog side effect that persists if dialog cleanup fails).

**Phase to address:**
The mobile continuous scroll phase. Before shipping, test on at least one physical iPhone (dynamic island models have different address bar behavior from older iPhones).

---

### Pitfall 5: Turn-State Animation Causing Layout Thrashing

**What goes wrong:**
The planned "dramatic your-turn takeover" involves large visual changes when `isUserTurn` flips: expanding a command panel, changing background colors, animating a full-screen overlay. If these animations use layout-affecting CSS properties (`height`, `width`, `top`, `padding`, `margin`) rather than compositor-only properties (`transform`, `opacity`), the browser must run layout and paint on every animation frame. On mid-range Android devices, this causes visible jank at the exact moment users are most engaged.

Framer Motion (re-added in M1 for landing/dashboard/sidebar) uses `transform` and `opacity` by default, but the `layout` prop on containers triggers layout animations, which force a full reflow. With 8 team roster cards, a Pokemon grid, and a progress bar all present, this reflow touches hundreds of DOM nodes per frame.

**Why it happens:**
The `layout` prop tells Framer Motion to animate when the component's position/size changes in the DOM. If the turn-state transition changes the size of a container (e.g., the command bar expanding from 60px to 200px), any `layout` child reflows. This is acceptable on low-frequency pages (results, landing) but causes sustained jank on the live draft page where turn changes happen every 30–60 seconds.

**How to avoid:**
- Drive the "your turn" visual shift exclusively with `opacity` and `transform: scale/translateY`. Do not change `height`, `width`, `padding`, or `margin` in the animation.
- For the full-screen overlay: use `position: fixed` with `opacity: 0 → 1` rather than inserting/removing a DOM node. A fixed overlay does not cause layout reflow on the content beneath it.
- Apply `will-change: transform, opacity` on the turn-state container only during the transition — not persistently (persistent `will-change` wastes GPU memory).
- Do not use `AnimatePresence` + `layout` on the draft page. `AnimatePresence` is appropriate on the results page (lower frequency); on the live draft page, prefer CSS `transition-property: opacity, transform`.
- Profile the animation with Chrome DevTools Performance tab at 4x CPU throttling before integrating. The metric to watch: "Layout" time in the flame chart must be 0ms during the animation.

**Warning signs:**
- Chrome DevTools shows "Layout" events during the `isUserTurn` transition.
- React DevTools shows the entire draft page re-rendering on every animation frame.
- The Pokemon grid flickers or jumps during the turn-state transition.
- Frame rate drops below 30fps during pick notification on a throttled device.

**Phase to address:**
The turn-state clarity phase. Prototype the animation in isolation (a standalone route like `/test-turn-animation`) before integrating with live draft state. Validate compositor-only properties before connecting to real turn data.

---

### Pitfall 6: Spectator Route Migration Breaking Shared Links

**What goes wrong:**
When `/spectate/[id]` is merged into `/draft/[id]?spectator=true`, existing spectator links shared in Discord stop working. VGC communities share spectator links before and during high-stakes drafts. If those links 404 or redirect to a blank page, it damages trust during the beta launch.

**Why it happens:**
Route merges are treated as implementation details, but URLs are public API contracts. The current app at `/spectate/[id]` uses `useDraftStateWithRealtime` and has distinct presence tracking (`spectator-${Date.now()}` IDs). If the file is deleted without a redirect, every link shared in Discord, Twitter, or pinned messages breaks permanently. The service worker (`public/sw.js`) may also cache the old route and serve stale 200 responses for redirected URLs.

**How to avoid:**
- Replace `src/app/spectate/[id]/page.tsx` with a 308 redirect. Do not delete the file:
  ```typescript
  // src/app/spectate/[id]/route.ts (route handler, not page)
  import { redirect } from 'next/navigation'
  export function GET(req: Request, { params }: { params: { id: string } }) {
    redirect(`/draft/${params.id}?spectator=true`, 308)
  }
  ```
  A 308 preserves the HTTP method and signals to crawlers the URL has permanently moved.
- Before removing any internal navigation, audit all `router.push('/spectate/...')` and `href="/spectate/..."` occurrences in the codebase. There are at least 2 (the spectate button in draft setup, the back button in the spectate page). Update all internal links first.
- After the redirect is deployed, bump the service worker cache version in `public/sw.js` to prevent cached 200s from masking the redirect.

**Warning signs:**
- `router.push('/spectate/...')` calls remain in the codebase after the merge.
- `curl -I https://draftpokemon.com/spectate/TESTCODE` returns 404 instead of 308.
- Service worker logs show cache hits for `/spectate/` URLs after the redirect.
- Discord link previews for old spectator URLs show a broken card.

**Phase to address:**
The unified participant/spectator view phase. The redirect must be deployed before the old route is removed. Keep `/spectate/[id]` as a redirect indefinitely — do not delete it post-launch.

---

### Pitfall 7: Permission Drift in Unified Participant/Spectator View

**What goes wrong:**
The current separation of `/draft/[id]` and `/spectate/[id]` provides a natural permission boundary. In the unified view, a single `isSpectator` flag gates all action surfaces: the pick button, wishlist, host controls, bid button, skip-turn button, and admin ping. If any check is missing, a spectator can trigger a mutation. Worse, `isSpectator` in `useDraftSession` is derived from `searchParams.get('spectator') === 'true'` — a URL parameter any user can remove.

**Why it happens:**
URL parameters are not auth. The current architecture trusts `isSpectator` from the URL because the routes were separated — spectators physically navigated to a different URL. In the unified view, the URL parameter becomes the only client-side gate. A user removing `?spectator=true` from the URL gets participant-level UI without being a registered participant. Supabase RLS will block the actual DB mutation, but the UI shows pick buttons and the user gets confusing error messages.

**How to avoid:**
- Derive `isSpectator` from the database state, not solely from the URL parameter. When `draftState` loads, check whether `userId` appears in `draftState.participants` with a `team_id`. If not, treat as spectator regardless of the URL:
  ```typescript
  const isSpectator = useMemo(() => {
    if (isSpectatorParam) return true  // URL hint for initial load
    if (!draftState?.participants || !userId) return false
    const me = draftState.participants.find(p => p.userId === userId)
    return !me?.team_id  // no team assignment = spectator
  }, [isSpectatorParam, draftState?.participants, userId])
  ```
- The URL parameter is a valid initial hint (to show the spectator skeleton before `draftState` arrives) but must be superseded by the database check once data loads.
- Introduce a single `userRole: 'host' | 'participant' | 'spectator' | 'unknown'` derived value that all permission checks use, rather than scattered `isHost &&` / `!isSpectator &&` conditionals throughout JSX.
- Apply the same pattern to `isHost`: derive from `participants.find(p => p.userId === userId)?.is_host`, not from `isHostParam` URL parameter.

**Warning signs:**
- Removing `?spectator=true` from the URL in DevTools shows pick controls to a non-participant.
- A new user navigating directly to `/draft/[id]` without a join flow sees pick controls rather than a join prompt.
- Setting `?isHost=true` in the URL exposes host controls to a non-host.

**Phase to address:**
The unified view phase. Treat role derivation as a security concern. Write a test: `isSpectator should be true when userId is not in participants list, regardless of URL param`.

---

## Moderate Pitfalls

### Pitfall 8: League Hub Tab Consolidation Losing Discoverability

**What goes wrong:**
Reducing from 7+ tabs to a 3-view layout risks hiding features that infrequent users rely on. If "Trades" and "Free Agents" are consolidated under "Management," a commissioner processing a trade during a draft session will not find it quickly. The feature exists, but users assume it is broken or gone, creating Discord support load during the beta period.

**Why it happens:**
Tab consolidation is designed from the author's mental model (who knows where everything is), not from user task flows. A commissioner processing a weekly trade check navigates: Trades → pending trades → approve. In a 3-view layout where Trades is under Management → Trade Center, that is one extra navigation layer. Under time pressure, one extra tap causes abandonment.

**How to avoid:**
- Map user tasks, not features. Three views should reflect task frequency:
  - **Overview:** Standings, current-week fixtures, announcements (read-only, high frequency)
  - **Matches:** This week's matchups, record results, KO tracking (action-oriented, weekly frequency)
  - **Management:** Trades, free agents, waiver wire, commissioner tools (administrative, low frequency)
- Keep "Trades" accessible from the Overview view via a badge/quick-link when there are pending trade requests. The existing pending trade count badge must be preserved in the new layout — it is the primary discoverability mechanism for the most time-sensitive action.
- Do not remove sub-routes (`/league/[id]/trades`, `/league/[id]/free-agents`). The consolidated hub tabs link to these sub-pages; consolidation changes the navigation entry point, not the destination.
- Add deep-linkable `?tab=management&section=trades` anchor support so trade notifications can link directly to the Trade Center rather than the Management tab root.

**Warning signs:**
- Beta testers report "I can't find trades" in feedback.
- The pending trade count badge disappears in the new layout (badge logic was tied to the old tab rendering).
- Commissioner-specific controls render for non-commissioners (wasted navigation causing confusion).

**Phase to address:**
The league hub consolidation phase. Complete a task-flow audit before implementing: for each existing tab, identify the primary action taken on that tab and ensure it is reachable in ≤2 taps from the new hub.

---

### Pitfall 9: Activity Feed Always-Visible Causing Full Page Re-renders Per Pick

**What goes wrong:**
The current `DraftActivitySidebar` is a slide-in overlay — it only renders when `isActivitySidebarOpen` is true. When it becomes always-visible and part of the main layout, its parent re-renders on every pick event (because `sidebarActivities` is derived from `draftState?.teams` in a `useMemo` on the page). Every pick re-computes the entire activity list and re-renders the feed, which is rendered in the same React subtree as the Pokemon grid. On a fast draft (8 teams, 30s timer), this is a pick every 30 seconds — acceptable. But during auction bidding, events come in every few seconds, causing visible stutter.

**Why it happens:**
The current `sidebarActivities` derivation in `useDraftActivity` (or the draft page's `useMemo`) iterates all teams and all picks on every state update. This is O(teams × picks) per render. When the activity feed is a slide-in, this only runs when the sidebar is open. As an always-visible panel, it runs on every single draft state update.

**How to avoid:**
- Move the activity feed state into its own hook (`useDraftActivity` already exists) that subscribes only to a pick-count change signal, not to the full `draftState.teams` object.
- Use `useReducer` to append to the activity list incrementally (each new pick appends an item) rather than deriving the full list from all teams on every render.
- Alternatively, pass `activities` as a stable prop from the page's `useDraftActivity` hook that only changes reference when a new pick is added — not when turn state or budget changes.
- Memoize the activity feed component with `React.memo` and a custom comparison that checks only `activities.length`, not deep equality.

**Warning signs:**
- React DevTools profiler shows `DraftActivityFeed` re-rendering on every state change, not just pick events.
- CPU usage is elevated during turn-timer countdowns (which update `timeRemaining` every second, causing full page re-renders).
- The Pokemon grid has noticeable lag during auction bidding.

**Phase to address:**
The activity feed integration phase. Profile the activity feed in isolation before integrating it into the main layout.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline Zustand selectors in new panel components | Faster to write | Infinite loop (this app already hit it); breaks with store restructuring | Never — use named selectors in `selectors.ts` |
| Derive `isSpectator` from URL param only | Works in isolation | Security theater — user removes URL param to get participant UI | Only as initial hint; must be superseded by DB-derived role |
| Remove `/spectate/[id]` without redirect | Simplifies route tree | Breaks all existing shared Discord links permanently | Never |
| `layout` prop on Framer Motion containers for turn animation | Natural-looking resize animation | Forces layout recalculation every frame; jank on mobile | Acceptable on results/landing page (not on live draft page) |
| Mount all panels immediately, add `enabled` guards later | Faster to see working UI | Mount storm + Supabase duplicate channels | Never — add `enabled` guards before making any panel always-visible |
| Pass full `draftState` to activity feed as prop | Simple API | Activity feed re-renders on every state change including timer ticks | Never — pass only `activities` array from a dedicated hook |
| `position: absolute` overlay for host controls | Quick to overlay existing layout | Overlaps interactive elements on small screens | Never — use layout flow |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase Realtime | Creating the channel inside a component that can unmount during layout transitions | Hoist to a stable React context provider at the page/route level |
| Supabase Realtime | Calling `channel.subscribe()` without checking `channel.state !== 'joined'` first | Rely on `DraftRealtimeManager` which handles state checks — do not bypass it by creating channels in panel components |
| Framer Motion `AnimatePresence` | Wrapping the entire draft panel tree during turn transitions | Only wrap the specific element that enters/exits (turn overlay); never wrap the Pokemon grid or team roster |
| TanStack Query | Calling `usePokemonListByFormat` independently in new always-visible panels | Pokemon data comes from one page-level fetch; pass as prop down to panels — panels must not fetch independently |
| Next.js `dynamic()` + `ssr: false` | Assuming `dynamic()` prevents mount until needed | It prevents SSR but not client-side mount; a conditional `{condition && <DynamicComponent />}` is still required to delay mount |
| `useDraftSession` | Resolving `userId` independently in panel components | `userId` resolution has a 5-step priority chain (auth → participation → session → sessionStorage → guest); resolve once at the page level and pass down, never re-resolve in panels |
| `public/sw.js` service worker | Not bumping cache version when routes change | After `/spectate/[id]` becomes a redirect, bump `CACHE_VERSION` in `sw.js` or cached 200s will mask the 308 |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `allDraftedIds.includes(pokemonId)` in always-visible grid | Pokemon grid lags 50ms+ per pick as 700+ items are re-filtered with array scan | Convert to `Set`: `const draftedSet = useMemo(() => new Set(allDraftedIds), [allDraftedIds])` then `!draftedSet.has(p.id)` | Already exists; becomes critical when grid is always-visible instead of tab-switched |
| Activity feed derived from full `draftState.teams` on every render | CPU spikes during timer ticks (every 1s); auction bidding causes stutter | Use `useDraftActivity` hook that appends incrementally; memoize with `React.memo` | With 8 teams × 15 picks = 120 iterations per re-render, every second during timer |
| Framer Motion `layout` on team roster cards | Visible reflow of team panel on each pick; 48 nodes reflow with 8 teams × 6 picks | Remove `layout` prop from roster card components; use CSS `transition` for visual changes | With 8 teams each with full 6-Pokemon rosters |
| Turn timer countdown triggering full page re-render | Draft page re-renders every second; wasteful when only the timer display needs to update | Isolate timer state in `useDraftTimers` hook (already exists); ensure timer updates do not call `setDraftState` on the page — use local state in the timer component only | During every active draft turn (60s window) |
| `draftState?.teams.find(...)` in JSX render body (not memoized) | Re-computes on every render including timer ticks | All derived state from `draftState.teams` must be inside `useMemo` with `[draftState?.teams]` dependency — never computed inline in JSX | Immediately visible during auction bidding |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Your turn" full-screen takeover covers the Pokemon grid mid-search | User loses search state and filtered results at the moment they need to act fastest | Use a persistent banner/spotlight, not a modal overlay. Keep the Pokemon grid visible during the user's turn; use background color change + border highlight + pulsing turn indicator |
| Activity feed always-visible reduces Pokemon grid height | Less space to browse Pokemon during the most frequent action | Make activity feed a resizable or collapsible panel; default to collapsed on desktop below 1280px; remember collapse state in localStorage |
| Continuous mobile scroll removes "jump to team" shortcut | Mobile users must scroll past 700+ Pokemon to see their team during a pick | Keep a floating action button that jumps to the team roster section, or a sticky mini-roster strip showing pick counts and budget |
| Turn timer hidden when user scrolls down | User misses time-out, causing frustrating auto-skip | Turn timer must be visible regardless of scroll position — use `position: sticky` or a persistent header, never bury the timer in a scrollable panel |
| Removing the activity sidebar removes the option to hide it | Power users want a clean grid during their turn | Even if activity is always-visible by default, provide a collapse toggle; auto-collapse during the user's turn |
| "Your turn" state transition plays simultaneously with pick confirmation animation | Visual chaos — two dramatic animations compete for attention | Sequence animations: pick confirmation plays first (500ms), then turn-transition begins. Use a `setTimeout` or `AnimatePresence` exit callback to chain them |

---

## "Looks Done But Isn't" Checklist

- [ ] **Unified view role gating:** `isSpectator` derived from DB participants, not just URL param — verify by navigating to `/draft/[id]` as a non-participant without `?spectator=true` and confirming no pick controls appear
- [ ] **Subscription continuity:** Channel name logged on mount/unmount; verify it does not change between layout renders — check that `DraftRealtimeManager` is created only once per page session
- [ ] **Old spectator route redirect:** `/spectate/[id]` returns 308 not 404 — verify with `curl -I https://draftpokemon.com/spectate/TESTCODE`
- [ ] **Service worker cache invalidated:** After route changes, `CACHE_VERSION` in `public/sw.js` is bumped — verify old spectate URLs are not served from cache
- [ ] **Mobile drag-and-drop scroll:** Wishlist reordering does not prevent page scroll on iOS Safari — test on physical device with WishlistManager in continuous scroll flow
- [ ] **Turn animation compositor-only:** Chrome DevTools Performance tab shows 0ms "Layout" time during `isUserTurn` transition — profile before shipping
- [ ] **Host controls server-validated:** Every host action API route independently checks `is_host` in DB, not the client-supplied `isHostParam` URL parameter
- [ ] **League hub deep links preserved:** `?tab=management&section=trades` navigates directly to Trade Center — test all existing notification deep-link patterns still work
- [ ] **Selector stability:** No new inline `useDraftStore(state => ...)` calls in panel components — verify with `grep -r "useDraftStore(state =>" src/components` and confirm all results are in `selectors.ts` or wrapped in `useCallback`/`useMemo`
- [ ] **Panel mount guards:** All always-visible panels have `enabled={draftState !== null && !!participantId}` or equivalent — Supabase dashboard shows 1 channel per draft room, not N channels
- [ ] **Activity feed isolation:** Re-rendering the timer state (every 1 second) does not cause `DraftActivityFeed` to re-render — verify with React DevTools profiler

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Subscription teardown breaks live draft mid-session | HIGH | 1. Revert layout refactor to last stable commit. 2. Add `DraftRealtimeContext` provider. 3. Re-deploy. 4. Affected users refresh. Post Discord announcement. |
| Zustand infinite loop in new panel | HIGH | 1. Identify inline selector via React DevTools → Components → highlight re-rendering component. 2. Replace with named selector from `selectors.ts`. 3. Hot-fix deploy. Template: the `EMPTY_SELECTOR` pattern in `useWishlistSync.ts`. |
| iOS Safari scroll freeze with drag-and-drop in scroll flow | MEDIUM | 1. Add `touch-action: pan-y` to drag handle CSS. 2. Wrap draggable area in bounded container with `overflow: hidden`. 3. Worst case: move WishlistManager back to slide-in modal on mobile only. |
| Old spectate links 404 after route merge | MEDIUM | 1. Deploy 308 redirect immediately. 2. Post in Discord acknowledging the break. 3. Update pinned Discord messages with new link format. |
| Activity feed causing draft page performance regression | MEDIUM | 1. Gate activity feed re-renders behind `React.memo` with `activities.length` comparison. 2. Move to incremental append model. 3. If still slow, move activity feed back to slide-in overlay (it worked before). |
| League hub consolidation hides trades from beta users | LOW | 1. Add "Trades" quick-link to Overview. 2. Restore full Trades tab as a fourth tab. 3. Underlying route `/league/[id]/trades` is unchanged so no data loss. |
| Turn animation causing jank on mobile | LOW | 1. Remove `layout` props from animated containers. 2. Replace CSS height/width transitions with opacity/transform. 3. Add `will-change: transform, opacity` only during active transition. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Subscription teardown during restructuring | First layout phase (before any panel moves) | `DraftRealtimeContext` provider exists; no `useDraftRealtime` calls outside the page-level context |
| Zustand selector instability | Before any new component is written | `grep "useDraftStore(state =>"` returns no inline selectors in `src/components/` files |
| Mount storm from always-visible panels | Phase adding always-visible panels | Supabase dashboard shows exactly 1 channel per draft room; no duplicate channel subscriptions |
| iOS Safari scroll conflicts | Mobile continuous scroll phase | Tested on physical iOS device; wishlist drag does not block page scroll |
| Turn animation layout thrashing | Turn-state clarity phase | Chrome Performance: 0ms Layout time during animation; profiled at 4x CPU throttle |
| Spectator route migration | Unified view phase | `curl -I /spectate/[id]` returns 308; `sw.js` cache version bumped |
| Permission drift in unified view | Unified view phase | Unit test: non-participant without `?spectator=true` gets spectator UI; `isHost` derived from DB participants |
| League tab discoverability loss | League hub consolidation phase | Task-flow audit complete; pending trade badge preserved; trades reachable in ≤2 taps |
| Activity feed re-render regression | Activity feed integration phase | React DevTools: `DraftActivityFeed` does not re-render during timer ticks; profiler baseline recorded before and after integration |

---

## Sources

- App codebase — `src/hooks/useWishlistSync.ts`: the `EMPTY_SELECTOR` fix for infinite loop (React #185)
- App codebase — `src/hooks/useDraftRealtime.ts`: callback refs pattern (`onRefreshNeededRef`) preventing unstable dependency loops
- App codebase — `src/app/draft/[id]/page.tsx`: `pickInFlightRef` race condition fix, `EMPTY_ARRAY` stable reference pattern
- App `MEMORY.md` — Infinite loop post-mortem (2026-03-04), pick-not-showing-for-picker root cause and fix
- App `CLAUDE.md` — Performance optimization guidelines, subscription cleanup patterns, Zustand best practices
- App `PROJECT.md` — Current milestone target features confirming the specific UX changes planned
- App history — Draft page split M2 (2372→1382 lines, still monolithic after split), confirming ongoing complexity risk
- iOS Safari `touch-action` scroll capture — WebKit Bugzilla documented behavior
- Framer Motion docs — `layout` prop reflow behavior, `will-change` guidance
- Next.js App Router docs — `redirect()` with 308 status in route handlers

---
*Pitfalls research for: Draft UX Overhaul (real-time Next.js 15 + Supabase + Zustand)*
*Researched: 2026-04-03*
