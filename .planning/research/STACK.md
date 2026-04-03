# Technology Stack — Draft UX Overhaul (Milestone 6)

**Project:** Pokemon Draft (draftpokemon.com)
**Milestone:** 6 — Draft UX Overhaul
**Researched:** 2026-04-03
**Confidence:** HIGH (all additions verified against npm/official docs)
**Scope:** NEW additions only. Existing stack (Next.js 15, Supabase, Clerk, Zustand, Tailwind CSS 3.4, Radix UI, framer-motion 12, TanStack Query v5, @tanstack/react-virtual, @dnd-kit, Zod, Vitest, sonner) is validated — not re-evaluated here.

---

## What Needs New Stack Support

The UX overhaul introduces five capability gaps not covered by the current stack:

1. **Resizable split panels** — Pokemon grid + team roster side-by-side with user-draggable divider
2. **Command bar / keyboard-driven navigation** — persistent ⌘K host command center
3. **Dramatic turn-state transitions** — full-screen "your turn" takeover vs. dimmed waiting state
4. **URL-synced view state** — active tab, filter, and sidebar state survives reload and is shareable
5. **Container-query-responsive layout** — same component tree adapts for participant/spectator/host without duplicating markup

---

## Stack Additions

### 1. Resizable Panels

**Package: `react-resizable-panels@^4.8.0`**

| Property | Value |
|----------|-------|
| Current version | 4.8.0 (April 2026) |
| Bundle impact | ~15KB gzipped |
| SSR support | Yes — v4 expanded Server Component support |
| shadcn/ui integration | `npx shadcn@latest add resizable` (wraps this package) |
| Confidence | HIGH — official package, 1800+ dependents, actively maintained |

**Why this:** The draft room needs a Pokemon search grid on the left and the team roster panel on the right, user-draggable. `react-resizable-panels` is the library powering shadcn's `<Resizable>` component — using it directly gives access to imperative APIs (collapse panel on mobile, restore on desktop) that the shadcn wrapper doesn't expose. It has native keyboard accessibility (arrow keys resize panels), cookie-based layout persistence for SSR without flicker, and pixel/percent/rem size units in v4.

**v4 breaking change note:** The `PanelResizeHandle` was renamed to `Separator` and `direction` was renamed to `orientation`. If adding the shadcn `resizable` component, run `npx shadcn@latest add resizable` against the current shadcn CLI — it already targets v4 API. Do not install alongside an older shadcn-generated resizable component without updating both.

**Why not CSS Grid with resize handles:** CSS Grid cannot produce drag-to-resize behavior. All alternatives (react-split-pane, allotment) have lower maintenance and smaller communities.

```bash
npm install react-resizable-panels
```

---

### 2. Command Bar (Host Command Center + Quick Navigation)

**Package: `cmdk@^1.1.1`** (already the dependency behind shadcn's `<Command>` component — add the shadcn component, not a new package)

| Property | Value |
|----------|-------|
| Current version | 1.1.1 |
| Already in project? | No direct install — but shadcn's Command component uses it |
| Bundle impact | ~8KB gzipped |
| Confidence | HIGH — powers Linear, Raycast, and the shadcn command palette |

**Why this:** The host needs persistent, keyboard-accessible controls (pause draft, ping players, adjust timer, skip turn). A `⌘K` command bar surfaces all host actions without cluttering the layout. `cmdk` provides fuzzy search, keyboard navigation, grouping, and an empty state — everything needed without writing a custom combobox. The shadcn Command component wraps cmdk and is already stylistically consistent with the rest of the UI.

**Integration:** Add via `npx shadcn@latest add command`. Trigger on `⌘K` / `Ctrl+K` using a global `keydown` listener in the draft page. Scope commands by role (host sees admin actions, participant sees quick-pick shortcuts, spectator sees none).

**Why not a custom dropdown:** Dropdowns don't support fuzzy search, keyboard-first navigation, or contextual grouping. The host command center benefits from being searchable — "pause" is faster to type than to find in a nested menu.

```bash
# No new package — add via shadcn CLI
npx shadcn@latest add command
```

---

### 3. Motion (Dramatic Turn-State Transitions)

**Package: Migrate `framer-motion@^12.35.0` → `motion@^12.x`**

| Property | Value |
|----------|-------|
| Current installed | `framer-motion@^12.35.0` |
| Rename status | `framer-motion` → `motion` (npm package), import path: `motion/react` |
| Migration effort | Minimal — swap import path only, APIs are identical |
| Current motion version | 12.37.0 |
| Confidence | HIGH — official rename, `framer-motion` still works but no longer receives updates |

**Why migrate now:** `framer-motion` is frozen. Active development is on the `motion` package. The migration is a single import-path swap (`from 'framer-motion'` → `from 'motion/react'`). Doing it now avoids a larger migration later.

**New capabilities for turn-state transitions:**

- `layoutId` for shared element transitions — animate the "Your Turn" banner from small indicator to full-screen takeover without mounting/unmounting. The Pokemon grid shrinks into the background while the turn card expands.
- `layout="position"` on the panel wrapper — when panels resize (e.g., team roster slides in), adjacent panels animate their position rather than jumping.
- `AnimatePresence` with `mode="wait"` — the waiting state exits fully before the active state enters, creating a clean full-screen transition rather than overlapping states.
- `useMotionValue` + `useTransform` — drive dimming/blur of the "spectator-like waiting" overlay from a single animated value.

**Why not CSS transitions for this:** The "your turn" takeover requires coordinating 4-5 elements changing size and position simultaneously. CSS transitions on individual properties cause disjointed movement. Motion's `layout` animation computes the delta and drives all elements from a single animation frame tick (FLIP technique).

```bash
npm uninstall framer-motion
npm install motion
```

---

### 4. URL-Synced View State

**Package: `nuqs@^2.8.9`**

| Property | Value |
|----------|-------|
| Current version | 2.8.9 (February 2026) |
| Bundle size | ~5.5KB gzipped, zero runtime dependencies |
| Next.js support | App Router 14.2+, Server Components |
| Used by | Sentry, Supabase, Vercel, Clerk |
| Confidence | HIGH — presented at Next.js Conf 2025, widely adopted |

**Why this:** The league hub consolidation requires three distinct views (Overview, Matches, Management). The draft room needs the active panel configuration (which sidebar is open, what filter is selected) to survive a page reload and be shareable via URL. `nuqs` provides a `useState`-like API that syncs with URL query params — `const [view, setView] = useQueryState('view', parseAsStringLiteral(['overview', 'matches', 'management']).withDefault('overview'))`.

Without this, view state lives only in React state and is lost on reload. Using `useSearchParams` directly in Next.js requires manual serialization, deserialization, and router pushes — `nuqs` handles all of that with type safety.

**Integration:**
1. Wrap the root layout with `NuqsAdapter` (one-time setup).
2. Replace `useState` for active tab/view state on the league hub and draft room with `useQueryState`.
3. Use `shallow: true` (default) for client-only state changes that don't need server re-render.

**Why not zustand for this:** Zustand state doesn't survive a page reload and isn't shareable via URL. The use case is URL-visible navigation state, not internal reactive state.

```bash
npm install nuqs
```

---

## No New Package Needed: Tailwind Container Queries

**Built into Tailwind CSS v4 — but the project is on Tailwind v3.4**

| Property | Value |
|----------|-------|
| Current project version | Tailwind CSS `^3.4.17` |
| Container queries in v3 | Requires `@tailwindcss/container-queries` plugin |
| Container queries in v4 | Built-in, no plugin needed |
| v4 migration complexity | Medium (CSS-first config, breaking utilities) |
| Confidence | HIGH — official Tailwind documentation |

**Recommendation: Stay on Tailwind v3.4, add the container queries plugin.**

The v4 migration requires converting `tailwind.config.js` to CSS-first `@theme` directives, updating ~dozens of utility classes that changed names, and re-testing all existing styles. That is a separate milestone of work, not a UX overhaul task.

For the role-based view adaptation (participant/spectator/host using the same component tree), the `@tailwindcss/container-queries` plugin provides `@container` and `@sm:`, `@md:`, `@lg:` variants — exactly what's needed to make a panel component respond to its own size rather than the viewport.

```bash
npm install @tailwindcss/container-queries
```

Add to `tailwind.config.js`:
```js
plugins: [require('@tailwindcss/container-queries')]
```

Usage in components:
```tsx
// Pokemon grid panel responds to its own width, not the viewport
<div className="@container">
  <div className="grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-4">
    ...
  </div>
</div>
```

This enables the same `<PokemonGrid>` to display 2 columns when in a narrow sidebar and 4 columns when the panel is expanded — without conditional props or duplicate components.

**When to do v4:** Post-beta, as a standalone refactor. The upgrade tool (`npx @tailwindcss/upgrade`) automates most of it but requires dedicated testing time.

---

## Existing Packages That Already Cover Requirements

These capabilities are fully addressed by the current stack — no new packages needed:

| Need | Covered By | Notes |
|------|-----------|-------|
| Persistent sidebars | Zustand + `@radix-ui/react-scroll-area` | Already installed; slide-in sidebar already exists |
| Mobile continuous scroll | `@radix-ui/react-scroll-area` | Replace tab switching with a scroll container |
| Role-based view adaptation | React context + conditional rendering | No library needed — pass `role` prop from Zustand or Clerk |
| Drag-and-drop wishlist | `@dnd-kit/core` + `@dnd-kit/sortable` | Already installed, already wired |
| Activity feed virtualization | `@tanstack/react-virtual` | Already installed |
| Toast notifications | `sonner` | Already installed |
| Keyboard navigation in lists | `@radix-ui/react-scroll-area` | Native browser scroll + Radix handles focus management |
| Shared transition between draft → results | `motion` (layoutId) | Covered by motion migration above |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-spring` | Redundant with motion already in the stack; APIs conflict | `motion` (already present) |
| `react-use-gesture` | `@dnd-kit` already handles drag gestures; motion handles swipe | Existing packages |
| `@tanstack/react-router` | The project is on Next.js App Router; adding TanStack Router creates two routing systems | Next.js App Router + `nuqs` for state |
| `react-aria` / `react-spectrum` | Radix UI already provides the accessibility primitives; adding Adobe's system creates API conflicts | Existing `@radix-ui/*` packages |
| `immer` for view state | Already in `dependencies` but rarely used; don't expand its usage for simple UI state | Zustand's built-in `set` for UI state |
| Tailwind CSS v4 upgrade (now) | CSS-first config migration is a separate project; doing it mid-UX overhaul adds risk with no UX benefit | Stay on v3.4 + container queries plugin |
| `react-intersection-observer` | Motion's built-in `useInView` hook from the existing `framer-motion` / `motion` package does the same job | `motion`'s `useInView` |
| `@radix-ui/react-toolbar` | Not needed — the host command center is a command palette (cmdk), not a toolbar | `cmdk` via shadcn Command |
| `@radix-ui/react-navigation-menu` | The league hub uses tabs (`@radix-ui/react-tabs` already installed), not a navigation menu | Existing `@radix-ui/react-tabs` |

---

## Installation Summary

```bash
# New production dependencies
npm install react-resizable-panels nuqs motion @tailwindcss/container-queries

# Remove (replaced by motion)
npm uninstall framer-motion

# Add via shadcn CLI (no extra package install)
npx shadcn@latest add command
npx shadcn@latest add resizable
```

**Net new bundle impact:** ~28KB gzipped total
- `react-resizable-panels`: ~15KB
- `nuqs`: ~5.5KB
- `motion` vs `framer-motion`: neutral swap, same bundle size
- `@tailwindcss/container-queries`: build-time only, zero runtime impact
- `cmdk` (via shadcn): ~8KB (if not already pulled in transitively)

---

## Version Compatibility Notes

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `react-resizable-panels@4.x` | React 18, Next.js 15 | v4 changed `PanelResizeHandle` → `Separator`, `direction` → `orientation`. Use `npx shadcn@latest add resizable` to get the v4-compatible wrapper. |
| `motion@12.x` | React 18, Next.js 15 | Drop-in replacement for `framer-motion@12.x`. Import from `motion/react` instead of `framer-motion`. Server Components: use `motion/react` only in Client Components. |
| `nuqs@2.x` | Next.js 14.2+, React 18 | Requires wrapping root layout with `NuqsAdapter`. Shallow updates (default) don't trigger RSC re-renders. |
| `@tailwindcss/container-queries` | Tailwind CSS v3.2+ | Not needed if/when project migrates to Tailwind v4 (built-in). Remove plugin at that time. |

---

## Sources

- [react-resizable-panels npm](https://www.npmjs.com/package/react-resizable-panels) — v4.8.0 confirmed, April 2026
- [react-resizable-panels v4 changelog](https://github.com/bvaughn/react-resizable-panels/blob/v4/CHANGELOG.md) — breaking changes verified
- [shadcn resizable v4 compatibility issues](https://github.com/shadcn-ui/ui/issues/9197) — API changes documented
- [motion.dev — Motion for React docs](https://motion.dev/docs/react) — current version 12.37.0
- [Motion upgrade guide from framer-motion](https://motion.dev/docs/react-upgrade-guide) — migration steps verified
- [Motion layout animations](https://motion.dev/docs/react-layout-animations) — layoutId, AnimatePresence patterns
- [nuqs npm](https://www.npmjs.com/package/nuqs) — v2.8.9, February 2026
- [nuqs at Next.js Conf 2025](https://nextjs.org/conf/session/type-safe-url-state-in-nextjs-with-nuqs) — adoption confirmed
- [Tailwind CSS v4 container queries built-in](https://tailwindcss.com/blog/tailwindcss-v4) — verified, no plugin in v4
- [tailwindcss-container-queries GitHub](https://github.com/tailwindlabs/tailwindcss-container-queries) — official Tailwind Labs plugin for v3
- [shadcn Command component](https://ui.shadcn.com/docs/components/radix/command) — built on cmdk v1.1.1
- [cmdk npm](https://www.npmjs.com/package/cmdk) — v1.1.1, stable

---

*Stack research for: Pokemon Draft — Draft UX Overhaul (Milestone 6)*
*Researched: 2026-04-03*
