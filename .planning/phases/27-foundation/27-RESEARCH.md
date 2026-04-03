# Phase 27: Foundation - Research

**Researched:** 2026-04-03
**Domain:** CSS custom property theming, TypeScript ViewerRole abstraction, React context for Supabase subscription lifecycle
**Confidence:** HIGH — based on direct codebase analysis of all affected files plus verified prior research docs

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAYOUT-04 | Draft page.tsx restructured from monolithic 1,382-line file into a thin coordinator (~200 lines) that wires hooks and passes props to named region components | Phase 27 begins this restructure: establishes `DraftRealtimeContext` so subsequent JSX extraction (Phase 30) can proceed without subscription risk. Page coordinator structure is committed here; JSX extraction is deferred to Phase 30. |
| TURN-01 | User experiences a decisive visual shift when it's their turn — inactive panels dim, pick button pulses, audio cue plays | Delivered via `data-turn-state` CSS attribute + CSS custom properties + `TurnStateOverlay` component formalizing the existing `showTurnFlash` div (line 1394 of page.tsx). |
| TURN-04 | Turn state transitions use compositor-only CSS animations (opacity + transform) without layout thrashing on mid-range devices | Achieved by restricting all turn-state animations to `opacity` and `transform` only; no `height`/`width`/`padding`/`margin` animated; profiled at 4x CPU throttle. |
</phase_requirements>

---

## Summary

Phase 27 establishes three primitives that every downstream draft room phase depends on, without making any structural JSX changes to the 1,382-line `page.tsx`. The three deliverables are: (1) a `data-turn-state` CSS attribute system with CSS custom properties driving the "your turn" visual shift, backed by a `TurnStateOverlay` component; (2) a `ViewerRole` type added to `useDraftSession` derived from the DB participants table; and (3) a `DraftRealtimeContext` provider at the page level that prevents WebSocket subscription teardown during future component extraction phases.

The codebase already has the `showTurnFlash` state variable and inline overlay div (line 1394 of page.tsx) and the `isUserTurn` memoized value (line 200). Phase 27 formalizes these into a proper component and CSS system without moving any hooks or changing the page structure. The `isHost` field in `useDraftSession` currently comes only from `isHostParam` (URL parameter) — Phase 27 adds a DB-derived `ViewerRole` alongside this, making the session hook return a proper `viewerRole: 'host' | 'participant' | 'spectator' | 'lobby'` value.

The most important action in Phase 27 is creating `DraftRealtimeContext` before any layout restructuring occurs. This is the single highest-risk pitfall in the entire milestone: any refactor that causes `useDraftRealtime` to unmount and remount will silently lose pick events during the 200-800ms re-subscription window — the same bug class as the `pickInFlightRef` race condition already documented in MEMORY.md.

**Primary recommendation:** Create `DraftRealtimeContext` first, add CSS custom properties second, then formalize `TurnStateOverlay` and `ViewerRole` — all as additive changes with zero JSX structural changes to `page.tsx`.

---

## Standard Stack

### Core (existing — no new installs required for Phase 27)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 15 (App Router) | 15.x | Page routing, SSR | Project standard |
| React 18 | 18.x | Context, hooks | Project standard |
| TypeScript 5 | 5.x | Type definitions | Project standard |
| Tailwind CSS | 3.x | CSS custom properties via `@layer` and arbitrary values | Project standard |
| `useDraftRealtime` | internal | Supabase channel lifecycle | Existing hook — no changes needed |

### No new packages required for Phase 27

All deliverables (CSS custom properties, TypeScript type, React context, React component) use existing project infrastructure. No `npm install` is needed.

---

## Architecture Patterns

### Recommended Project Structure Changes

```
src/
├── app/draft/[id]/
│   ├── page.tsx              # ADD: DraftRealtimeContext.Provider wrapper; ADD: data-turn-state attribute; no other JSX changes
│   └── DraftRealtimeContext.ts  # NEW: Context type + provider export
├── components/draft/
│   └── TurnStateOverlay.tsx  # NEW: replaces inline showTurnFlash div
├── hooks/
│   └── useDraftSession.ts    # MODIFY: add ViewerRole type + viewerRole derived return value
└── styles/
    └── globals.css           # MODIFY: add [data-turn-state] CSS variable blocks + animation
```

### Pattern 1: CSS Custom Property Cascade for Turn State

**What:** A `data-turn-state` attribute on the page root div propagates visual theming to all children via CSS custom properties, without prop drilling or a React context.

**When to use:** Any value that changes infrequently (every 30-120s) and is consumed by multiple visual elements. CSS variables update on every frame without triggering React renders.

**Example (verified from ARCHITECTURE.md):**
```typescript
// In page.tsx root div (additive change):
<div
  className="min-h-screen bg-background transition-colors duration-500 draft-room-mobile overflow-x-hidden max-w-[100vw]"
  data-turn-state={isUserTurn ? 'active' : 'waiting'}
>
```

```css
/* In globals.css — add after existing rules */
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

/* Pick button pulse — only on active turn */
[data-turn-state='active'] .pick-button-primary {
  animation: pick-pulse 1.5s ease-in-out infinite;
}
@keyframes pick-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.4); }
  50% { box-shadow: 0 0 0 8px rgba(74,222,128,0); }
}

/* Inactive panels dim on active turn — compositor-only */
[data-turn-state='active'] .panel-dimmed {
  opacity: 0.6;
  transition: opacity 0.3s ease;
}
[data-turn-state='waiting'] .panel-dimmed {
  opacity: 1;
  transition: opacity 0.3s ease;
}
```

**Anti-pattern:** Do NOT use `DraftTurnContext` — a React context for `isUserTurn` causes all consumers to re-render simultaneously every 30-120s. CSS custom properties update without React renders.

### Pattern 2: TurnStateOverlay Component

**What:** A standalone component that mounts on `isUserTurn` transition (false → true), shows the radial flash animation, and auto-unmounts after 600ms. Replaces the inline div at line 1394 of page.tsx.

**When to use:** Any brief overlay tied to a single state transition, not to ongoing state.

**Example:**
```typescript
// src/components/draft/TurnStateOverlay.tsx
import { useEffect, useState } from 'react'

interface Props {
  isUserTurn: boolean
}

export function TurnStateOverlay({ isUserTurn }: Props) {
  const [visible, setVisible] = useState(false)
  const prevIsUserTurnRef = useRef(false)

  useEffect(() => {
    // Only fire on false → true transition, not on initial mount
    if (isUserTurn && !prevIsUserTurnRef.current) {
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 600)
      return () => clearTimeout(t)
    }
    prevIsUserTurnRef.current = isUserTurn
  }, [isUserTurn])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none"
      style={{
        background: 'radial-gradient(circle at center, rgba(74,222,128,0.25), transparent 70%)',
        animation: 'turnFlashFade 0.5s ease-out forwards',
      }}
      aria-hidden="true"
    />
  )
}
```

**Critical:** Use `position: fixed` — this prevents the overlay from affecting document layout. No layout recalculation occurs for fixed elements. The `animation: turnFlashFade` already exists in the codebase CSS — this component uses it unchanged.

### Pattern 3: ViewerRole Type in useDraftSession

**What:** An additive return value on `useDraftSession` that derives `'host' | 'participant' | 'spectator' | 'lobby'` from DB participants, not URL params.

**When to use:** Any permission check throughout the UI that needs to gate content by user role.

**Implementation (additive — does not change existing return values):**
```typescript
// src/hooks/useDraftSession.ts — additive changes only

export type ViewerRole = 'host' | 'participant' | 'spectator' | 'lobby'

export interface DraftSessionResult {
  userId: string
  isHost: boolean        // existing — keep unchanged (used by DraftControls)
  isSpectator: boolean   // existing — keep unchanged
  isAdmin: boolean       // existing — keep unchanged
  viewerRole: ViewerRole // NEW — DB-derived, supersedes URL params after state loads
  showJoinAuthModal: boolean
  setShowJoinAuthModal: (v: boolean) => void
  isJoiningFromLink: boolean
  setIsJoiningFromLink: (v: boolean) => void
  authUser: ReturnType<typeof useAuth>['user']
}

// In useDraftSession body — add after existing isAdmin derivation:
const viewerRole = useMemo((): ViewerRole => {
  if (!participants || !userId) return 'lobby'
  const me = participants.find(p => p.userId === userId)
  if (!me) return isSpectatorParam ? 'spectator' : 'lobby'
  if (me.is_host) return 'host'
  if (me.team_id) return 'participant'
  return 'spectator'
}, [participants, userId, isSpectatorParam])
```

**Key constraint:** The existing `isHost`, `isSpectator`, `isAdmin` return values MUST remain unchanged — they are used by `DraftControls`, `useDraftActions`, and multiple JSX conditionals throughout page.tsx. `viewerRole` is purely additive. Do not replace the existing boolean flags with `viewerRole` in Phase 27 — that migration belongs to Phase 30/31.

### Pattern 4: DraftRealtimeContext Provider

**What:** A React context that makes the `useDraftRealtime` return values available to descendant components without requiring them to call the hook directly. The context is owned by `page.tsx` (never by a panel component) and never unmounts during the page session.

**Why critical:** This context must exist BEFORE any JSX extraction happens in Phase 30. Without it, extracting a component that reads realtime state will force that component to call `useDraftRealtime` independently, creating a second subscription and potentially tearing down the first.

**Implementation:**
```typescript
// src/app/draft/[id]/DraftRealtimeContext.ts
import { createContext, useContext } from 'react'
import type { UseDraftRealtimeReturn } from '@/hooks/useDraftRealtime'

// Default value — used when no provider is present (should not happen in practice)
const DraftRealtimeContext = createContext<UseDraftRealtimeReturn | null>(null)

export { DraftRealtimeContext }

export function useDraftRealtimeContext(): UseDraftRealtimeReturn {
  const ctx = useContext(DraftRealtimeContext)
  if (!ctx) throw new Error('useDraftRealtimeContext must be used within DraftRealtimeContext.Provider')
  return ctx
}
```

```typescript
// In page.tsx — wrap the return JSX:
// 1. Call useDraftRealtime as before (unchanged)
const realtimeResult = useDraftRealtime(draftState?.draft?.id || null, userId, {
  enabled: !!draftState?.draft?.id,
  // ...callbacks unchanged
})

// 2. Wrap root div with context provider
return (
  <DraftRealtimeContext.Provider value={realtimeResult}>
    <div
      className="min-h-screen ..."
      data-turn-state={isUserTurn ? 'active' : 'waiting'}
    >
      {/* ...all existing JSX unchanged... */}
    </div>
  </DraftRealtimeContext.Provider>
)
```

**Verification:** After adding the context, confirm `DraftRealtimeManager` is still created exactly once per page session (the log line `[UseDraftRealtime] Creating DraftRealtimeManager` should appear only once after initial page load).

### Pattern 5: Thin Coordinator Surface (Success Criterion 5)

Phase 27 establishes the `page.tsx` as a coordinator — but does NOT extract any JSX yet. The structure established in Phase 27 is:

1. All 5 domain hooks called exactly once (already true)
2. `DraftRealtimeContext.Provider` wrapping the output (new in Phase 27)
3. `data-turn-state` attribute on root div (new in Phase 27)
4. `TurnStateOverlay` replacing inline overlay div (new in Phase 27)
5. `ViewerRole` derived in `useDraftSession` (new in Phase 27)

No panel components are created or extracted yet. The "thin coordinator structure is committed" criterion means the hook-calling pattern is locked in place and the context provider is the anchor for future extraction.

### Anti-Patterns to Avoid

- **React context for turn state:** `DraftTurnContext` with `isUserTurn` causes mass re-renders on every turn change. Use CSS `data-turn-state` attribute instead.
- **AnimatePresence on the draft page:** Wrapping the Pokemon grid or team roster in `AnimatePresence` for the turn transition will trigger Framer Motion `layout` prop reflows. Use CSS `transition` for `opacity` and `transform` only.
- **Moving DraftUIState to Zustand:** The `transformDraftState` hash comparison (`prevTransformedStateRef`) prevents unnecessary re-renders from Supabase polling. Zustand's shallow equality does not replicate this hash-based comparison.
- **Replacing existing isHost/isSpectator booleans:** These are used in 10+ places in page.tsx JSX. Replace them only in Phase 30/31 when the region components are created. Phase 27 adds `viewerRole` as a new return value — never removes or renames the existing flags.
- **Inline selector for viewerRole consumers:** Any new component that reads `viewerRole` must import it from props or context, not call `useDraftSession` again — doing so creates a second `userId` resolution chain.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS animation for turn flash | Custom keyframe + JS timeout in page.tsx inline div | `TurnStateOverlay` component with existing `turnFlashFade` CSS | Existing animation already in globals.css; componentizing is the refactor, not a rewrite |
| Role derivation logic | Scattered `isHost &&` / `!isSpectator &&` checks | Single `viewerRole` derived value in `useDraftSession` | Prevents permission drift; single source of truth for role |
| Subscription context | Re-calling `useDraftRealtime` in sub-components | `DraftRealtimeContext` consuming the result from page.tsx | Re-calling the hook creates duplicate subscriptions |
| CSS variable management | Inline `style={{ '--draft-accent': ... }}` props | `data-turn-state` attribute with CSS `[data-turn-state='active']` rules | Attribute-driven CSS eliminates React render dependency for visual theming |

---

## Common Pitfalls

### Pitfall 1: showTurnFlash vs TurnStateOverlay Transition Edge Case

**What goes wrong:** The existing `showTurnFlash` state is not wired to a `isUserTurn` transition detection — it is likely set by an external callback. The `TurnStateOverlay` must detect the `false → true` transition itself using a `useRef` to track previous value. If the component simply reads `isUserTurn` on mount, it will not fire on initial render when the user is already on their turn (e.g., after page refresh mid-turn).

**How to avoid:** Use a `prevIsUserTurnRef` in `TurnStateOverlay` to detect the transition: only fire the animation when `isUserTurn` changes from `false` to `true`. On initial render, set the ref to the current value without triggering the animation.

**Warning signs:** Animation fires on every page refresh when it is the user's turn instead of only when the turn just became theirs.

### Pitfall 2: ViewerRole Returning 'lobby' Too Aggressively During Initial Load

**What goes wrong:** `useDraftSession` receives `participants` as a prop from `draftState?.participants`. Before `draftState` loads, `participants` is `undefined`, so `viewerRole` will return `'lobby'`. If any downstream code renders a "join prompt" based on `viewerRole === 'lobby'`, it will flash on every page load for 1-2 seconds before the DB state arrives.

**How to avoid:** Gate all `viewerRole === 'lobby'` renders behind `draftState !== null`. The existing loading skeleton pattern (`if (!draftState) return <DraftRoomLoading />`) already handles this — Phase 27's new context and attribute are applied only inside the main return block, which is already gated.

### Pitfall 3: DraftRealtimeContext Placed Too Low in the Tree

**What goes wrong:** If `DraftRealtimeContext.Provider` wraps only part of the render tree (e.g., the drafting-status block but not the waiting-status block), future extracted components that render during waiting status won't have access to the context.

**How to avoid:** The context provider must wrap the entire return value of `DraftRoomPage`. In page.tsx, the root `<div className="min-h-screen ...">` should be a direct child of `<DraftRealtimeContext.Provider>`. The error state and loading state early returns do NOT need the context (they render before realtime is needed).

### Pitfall 4: data-turn-state Attribute Applied Before draftState Loads

**What goes wrong:** If `isUserTurn` is `null` or `undefined` before `draftState` loads, the attribute value becomes `data-turn-state="waiting"` by default — which is correct, but the CSS rules for `[data-turn-state='waiting']` may unintentionally dim panels that should not be dimmed during the initial loading state.

**How to avoid:** Only apply panel-dimming CSS classes (e.g., `panel-dimmed`) to elements that should participate in turn-state theming — not to the loading skeleton or error states. The loading skeleton renders before the main return block and is never inside the `data-turn-state` div.

### Pitfall 5: Zustand Selector Instability in New Components

**What goes wrong:** Phase 27 creates `TurnStateOverlay.tsx` — a new component file. If any future developer adds a `useDraftStore` call inside it with an inline selector, the infinite loop bug from `useWishlistSync.ts` (2026-03-04) will recur.

**How to avoid:** `TurnStateOverlay` receives `isUserTurn: boolean` as a prop — it does NOT call `useDraftStore` at all. This must be documented in the component file header. All selectors for Phase 27 new code live in `selectors.ts`.

---

## Code Examples

### Existing turnFlashFade animation in globals.css (verified in codebase)

The CSS animation name `turnFlashFade` is referenced in page.tsx line 1398:
```css
/* Already exists in globals.css (confirmed by page.tsx reference) */
@keyframes turnFlashFade {
  from { opacity: 1; }
  to { opacity: 0; }
}
```
The `TurnStateOverlay` component uses this existing animation — no new keyframe needed.

### Existing showTurnFlash inline div (from page.tsx lines 1394-1402)

```typescript
// CURRENT CODE (to be replaced by TurnStateOverlay):
{showTurnFlash && (
  <div
    className="fixed inset-0 z-50 pointer-events-none"
    style={{
      background: 'radial-gradient(circle at center, rgba(74,222,128,0.25), transparent 70%)',
      animation: 'turnFlashFade 0.5s ease-out forwards',
    }}
  />
)}
```

The `TurnStateOverlay` component wraps this exact div, adds transition-detection logic, and is called in place of the inline JSX:
```typescript
// REPLACEMENT in page.tsx:
<TurnStateOverlay isUserTurn={isUserTurn || false} />
```

`showTurnFlash` state and its setter can be removed from page.tsx after this replacement.

### Existing isUserTurn derivation (from page.tsx lines 200-203)

```typescript
// Already in page.tsx — unchanged, used as prop to TurnStateOverlay:
const isUserTurn = useMemo(() =>
  draftState?.userTeamId === draftState?.currentTeam,
  [draftState?.userTeamId, draftState?.currentTeam]
)
```

### Existing useDraftRealtime call (from page.tsx lines 439-442)

```typescript
// Current call — unchanged, only destructured return values change:
const {
  connectionStatus: realtimeConnectionStatus,
  reconnect: realtimeReconnect,
} = useDraftRealtime(draftState?.draft?.id || null, userId, {
  enabled: !!draftState?.draft?.id,
  // ...callbacks
})

// After Phase 27 — capture full result for context:
const realtimeResult = useDraftRealtime(draftState?.draft?.id || null, userId, {
  enabled: !!draftState?.draft?.id,
  // ...callbacks unchanged
})
const { connectionStatus: realtimeConnectionStatus, reconnect: realtimeReconnect } = realtimeResult
// realtimeResult is passed to DraftRealtimeContext.Provider
```

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this phase is purely code changes to TypeScript, CSS, and React context files)

---

## Validation Architecture

**Config:** `workflow.nyquist_validation` absent in `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run tests/` |
| Full suite command | `npm test -- --run --coverage` |
| Environment | happy-dom |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TURN-01 | `data-turn-state` attribute present on root when isUserTurn | unit | `npm test -- --run tests/draft-foundation.test.ts` | ❌ Wave 0 |
| TURN-01 | `TurnStateOverlay` only renders on false→true transition | unit | `npm test -- --run tests/draft-foundation.test.ts` | ❌ Wave 0 |
| TURN-04 | No layout-affecting CSS properties animated (opacity+transform only) | manual | Chrome DevTools Performance at 4x CPU throttle — 0ms Layout time during transition | manual-only |
| LAYOUT-04 | `DraftRealtimeContext.Provider` wraps entire page output | unit | `npm test -- --run tests/draft-foundation.test.ts` | ❌ Wave 0 |
| LAYOUT-04 | `useDraftRealtimeContext()` throws when called outside provider | unit | `npm test -- --run tests/draft-foundation.test.ts` | ❌ Wave 0 |
| LAYOUT-04 | `ViewerRole` derived correctly from participants (host/participant/spectator/lobby) | unit | `npm test -- --run tests/draft-foundation.test.ts` | ❌ Wave 0 |

**TURN-04 is manual-only:** Compositor-only animation verification requires browser profiling. No automated test can assert zero layout recalculations — this must be confirmed with Chrome DevTools Performance tab at 4x CPU throttle.

### Sampling Rate
- **Per task commit:** `npm test -- --run tests/draft-foundation.test.ts`
- **Per wave merge:** `npm test -- --run` (full suite, no coverage)
- **Phase gate:** Full suite green (414+ tests) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/draft-foundation.test.ts` — covers all automated TURN-01, LAYOUT-04 test cases above. Needs test cases for: ViewerRole derivation for all 4 role values, TurnStateOverlay transition detection, DraftRealtimeContext provider/consumer throw behavior.
- [ ] No new `conftest` or `setup.ts` changes needed — existing `tests/setup.ts` and happy-dom environment are sufficient.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Inline `showTurnFlash` div in page.tsx | `TurnStateOverlay` component with proper transition detection | Testable, re-usable, removes state variable from 1,382-line page |
| `isHost: isHostParam` (URL only) | `viewerRole` derived from DB participants | Prevents permission drift; single source of truth |
| No context for realtime state | `DraftRealtimeContext` at page level | Enables safe JSX extraction in Phase 30 without subscription risk |
| CSS turn state via React inline styles | CSS custom properties via `data-turn-state` attribute | Zero React re-renders for visual theming changes |

---

## Open Questions

1. **Where is `showTurnFlash` currently set?**
   - What we know: `showTurnFlash` state variable is declared at line 513. The actual setter call must be in the hooks or effect block. A grep of page.tsx did not surface `setShowTurnFlash(true)` in the portion read.
   - What's unclear: Which hook or effect sets `showTurnFlash` to trigger the animation. This matters for `TurnStateOverlay` — if an external callback (e.g., from `useDraftTimers` or `useTurnNotifications`) sets it, the `TurnStateOverlay` must replicate that trigger.
   - Recommendation: During plan execution, search `setShowTurnFlash` in page.tsx to find all call sites. `TurnStateOverlay` should accept an `isUserTurn` prop and detect the transition internally — do not pass `setShowTurnFlash` to it.

2. **Should `viewerRole` supersede `isHost` / `isSpectator` in Phase 27?**
   - What we know: `isHost` and `isSpectator` are used in 10+ places throughout page.tsx JSX. `DraftControls` accepts `isHost` as a prop. `useDraftActions` accepts `isSpectator`. `useDraftAuction` does not use either.
   - What's unclear: Whether changing the source of truth for these flags in Phase 27 would cause regressions in DraftControls or useDraftActions.
   - Recommendation: In Phase 27, add `viewerRole` as an additive return value only. Keep `isHost` pointing to `isHostParam` (URL) and `isSpectator` pointing to `isSpectatorParam` (URL) for backward compatibility. Full role derivation migration belongs to Phase 31 (Spectator Unification) per REQUIREMENTS.md SPEC-01.

---

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives are binding for Phase 27:

- **Zustand selectors:** All `useDraftStore(selector)` calls must use named exports from `selectors.ts` or be wrapped in `useCallback`/`useMemo`. No inline arrow functions in component bodies. (`TurnStateOverlay` should not use Zustand at all — it receives a prop.)
- **Path aliases:** Always use `@/` for imports. Never use relative paths for `src/` references.
- **Performance: No inline functions in render:** `isUserTurn && ...` JSX conditionals are fine; new callbacks must use `useCallback`.
- **TypeScript:** Use strict types. The `ViewerRole` type must be exported from `useDraftSession.ts` for use in downstream phases.
- **Supabase pattern:** Check `if (!supabase)` before Supabase calls. `DraftRealtimeContext` does not directly call Supabase — it wraps the existing hook.
- **No `any` type:** `DraftRealtimeContext` default value must use the typed `UseDraftRealtimeReturn` interface, not `any`.
- **Subscription cleanup:** `DraftRealtimeContext` relies on the existing cleanup in `useDraftRealtime`'s `useEffect`. Do not add additional cleanup — the hook handles it.
- **Real-Time: Always clean up subscriptions in useEffect:** Handled by existing `useDraftRealtime` — Phase 27 does not change this hook.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `src/app/draft/[id]/page.tsx` (full structure, lines 1-200, 200-600, 700-820, 1340-1411)
- Direct codebase analysis: `src/hooks/useDraftSession.ts` (full file — ViewerRole addition target)
- Direct codebase analysis: `src/hooks/useDraftRealtime.ts` (full file — DraftRealtimeContext source)
- Direct codebase analysis: `src/stores/selectors.ts` (selector pattern confirmed)
- `.planning/research/ARCHITECTURE.md` — Q4 (Turn state CSS custom property pattern), Q7 (build order), Integration Points
- `.planning/research/PITFALLS.md` — Pitfall 1 (subscription teardown), Pitfall 2 (Zustand selector instability), Pitfall 5 (turn animation layout thrashing)
- `.planning/research/SUMMARY.md` — Phase 1 rationale, architecture approach, critical pitfalls
- `CLAUDE.md` — Performance rules, Zustand conventions, TypeScript requirements
- `MEMORY.md` — `pickInFlightRef` race condition fix (2026-03-04), infinite loop fix (2026-03-04)

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Critical constraints and key decisions section confirmed DraftRealtimeContext requirement and CSS-only turn animations

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all patterns derived from existing codebase code
- Architecture: HIGH — based on direct line-number analysis of affected files; patterns verified against prior bug post-mortems
- Pitfalls: HIGH — all pitfalls grounded in this app's actual documented bugs

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (30 days — stable CSS/TypeScript patterns)
