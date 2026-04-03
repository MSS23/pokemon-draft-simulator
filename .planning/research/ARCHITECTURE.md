# Architecture Patterns

**Project:** Pokemon Draft — Milestone 4 Beta Launch
**Researched:** 2026-04-03
**Mode:** Integration architecture for new features into existing codebase

---

## System Overview

The app is a Next.js 15 App Router application with 30+ routes. The core architecture is:

- **Root layout** (`src/app/layout.tsx`) wraps the entire tree: `ClerkProvider > AnalyticsProvider > PerformanceMonitorProvider > ErrorBoundaryProvider > HydrationFixProvider > ThemeProvider > ImagePreferenceProvider > AuthProvider > QueryProvider`
- **State** lives in Zustand (`src/stores/draftStore.ts`) for draft-specific state, TanStack Query for server state
- **Realtime** is Supabase WebSocket channels, managed per-route in hooks
- **Services** in `src/lib/` are plain TypeScript modules, not React-coupled

Each Milestone 4 feature integrates at a different layer of this tree. The key insight: most features are **already partially implemented** — the work is completing and wiring them, not building from scratch.

---

## Feature Integration Analysis

### 1. Feedback Widget

**Current state:** Full-page feedback at `/feedback/page.tsx`. API route at `/api/feedback/route.ts` posts to Discord webhook via `DISCORD_FEEDBACK_WEBHOOK_URL`. Works end-to-end for the standalone page.

**What's missing:** An in-context widget — a floating button visible from inside draft rooms and the dashboard so users don't have to navigate away mid-session.

**Integration point:** `src/app/layout.tsx` — add a `<FeedbackWidget />` component just before `</body>` close, after `<Analytics />`. This ensures it appears on every page without re-mounting between route transitions.

**Component tree placement:**
```
RootLayout
  └── <FeedbackWidget />   ← new, rendered outside <main>
        └── Floating trigger button (bottom-right corner)
        └── Sheet/Dialog (reuses existing feedback form logic)
```

**Data flow:**
- Widget uses the same `POST /api/feedback` route already in place
- No new server code needed
- State is local (`useState` inside the widget) — no store involvement
- Pre-populate `context` field with current route from `usePathname()` for better bug reports

**New vs modified:**
- NEW: `src/components/feedback/FeedbackWidget.tsx` — floating button + sheet wrapper
- MODIFIED: `src/app/layout.tsx` — add `<FeedbackWidget />` import and JSX
- MODIFIED: `src/app/api/feedback/route.ts` — optionally accept a `context` (URL) field

**Avoid:** Don't add the widget inside `SidebarLayout` — it wraps only some pages. The root layout is the correct insertion point.

---

### 2. Analytics

**Current state:** PostHog integration fully built in `src/lib/analytics.ts`. `AnalyticsProvider` already in root layout. Vercel Analytics (`@vercel/analytics/next`) is imported and rendered in root layout as `<Analytics />`. `NEXT_PUBLIC_POSTHOG_KEY` env var is documented in `.env.example`.

**What's missing:** Tracking calls are defined but not called at the use sites. The typed event functions in `analytics.ts` exist (`draftCreated`, `pickMade`, `draftJoined`, etc.) but the call sites in service files and hooks need those calls added.

**Integration points — where to add calls:**

| Event | Call site | File |
|-------|-----------|------|
| `draft_created` | After successful `DraftService.createDraft()` | `src/lib/draft-lifecycle-service.ts` or `create-draft/page.tsx` |
| `draft_joined` | After successful join flow | `src/lib/draft-service.ts` `joinDraft()` |
| `draft_started` | When draft status transitions to `active` | `src/hooks/useDraftRealtime.ts` |
| `draft_completed` | When draft status transitions to `completed` | `src/hooks/useDraftRealtime.ts` |
| `pick_made` | After `makePick()` succeeds | `src/hooks/useDraftActions.ts` |
| `pwa_installed` | On `beforeinstallprompt` event | Wherever PWA install is prompted |
| `user_registered` / `user_logged_in` | In `AuthContext` after Clerk sign-in | `src/contexts/AuthContext.tsx` |

**Architecture rule:** Analytics calls must be **fire-and-forget** at the action layer (services/hooks), never blocking render. The existing `track()` function already handles the case where PostHog is not initialized.

**Route-level vs component-level:** PostHog's `capture_pageview: true` handles route-level tracking automatically. Only add explicit calls for semantic events (draft created, pick made), not for page views.

**New vs modified:**
- NO new files needed
- MODIFIED: `src/hooks/useDraftActions.ts` — add `analytics.pickMade()` call post-pick
- MODIFIED: `src/lib/draft-lifecycle-service.ts` — add `analytics.draftCreated()` call
- MODIFIED: `src/contexts/AuthContext.tsx` — add `analytics.userLoggedIn()` on Clerk sign-in detection
- MODIFIED: `src/lib/analytics.ts` — add any missing event types (e.g., `pokepasteImported`, `feedbackSubmitted`)

**CSP issue to verify:** `next.config.ts` has a hardcoded CSP header with `connect-src` listing `https://us.i.posthog.com`. If using an EU PostHog host, update this. Vercel Analytics already communicates through the Vercel edge and doesn't need a CSP addition.

---

### 3. Landing Page Polish

**Current state:** `src/app/page.tsx` is a fully built landing page with hero, feature cards, how-it-works steps, and footer CTAs. It uses Framer Motion animations. It redirects authenticated users to `/dashboard` immediately.

**What's missing:** VGC community-specific messaging (the current copy is generic). No social proof elements. No link to PokePaste demo or quick onboarding path. Mobile layout may need responsive audit.

**Integration point:** The page is already isolated at `/` — this is a **modify existing** task, not a new route.

**Key constraints:**
- Authenticated users are immediately pushed to `/dashboard` — the landing page is only for unauthenticated users. Don't add anything that requires auth context.
- The page renders inside `SidebarLayout` — on mobile this adds sidebar chrome. For a landing page this may be undesirable. Consider rendering this page **without** `SidebarLayout` by handling the layout at the route level or using a conditional.
- The `SidebarLayout` component should be inspected to understand if it injects nav chrome that competes with the landing page hero.

**Suggested structural change:** Move the landing page outside `SidebarLayout` and use the raw layout with just a minimal header. This is a one-line change in `page.tsx` but has visual impact.

**New vs modified:**
- MODIFIED: `src/app/page.tsx` — copy updates, new sections (social proof, VGC-specific content, PokePaste callout), responsive layout adjustments
- NO new routes needed — `/` already exists

---

### 4. Mobile Draft Room Redesign

**Current state:** `src/components/draft/MobileDraftView.tsx` already exists with a bottom-tab navigation pattern, compact Pokemon cards, and touch-optimized controls. It accepts `pokemon`, `teams`, `picks`, `currentUserTeamId`, `isUserTurn`, `timeRemaining`, and `onPokemonSelect` props.

`src/components/draft/MobileWishlistSheet.tsx` also exists for the mobile wishlist.

**What's missing:** `MobileDraftView` is defined but the main draft page (`src/app/draft/[id]/page.tsx`) needs to conditionally render it instead of the desktop layout when the viewport is mobile-width. Currently the draft page renders its own layout unconditionally.

**Integration pattern:**
```tsx
// In src/app/draft/[id]/page.tsx
const isMobile = useMediaQuery('(max-width: 768px)')

return isMobile
  ? <MobileDraftView {...mobileProps} />
  : <DesktopDraftLayout {...desktopProps} />
```

**useMediaQuery hook:** Does not currently exist in the codebase. Add it as `src/hooks/useMediaQuery.ts` — a simple SSR-safe wrapper around `window.matchMedia`. Initialize to `false` server-side (show desktop layout) and hydrate on mount.

**Touch target minimum:** 44x44px per WCAG. The existing desktop buttons need auditing in mobile context. The `MobileDraftView` component should enforce this via Tailwind (`min-h-[44px] min-w-[44px]`).

**Bottom sheet pattern for Pokemon picker:** On mobile, the Pokemon selection UI should use a Sheet (bottom drawer) rather than a sidebar. `MobileWishlistSheet.tsx` already uses this pattern — the Pokemon picker should adopt the same approach.

**Data flow:** The `MobileDraftView` receives the same data as the desktop layout. No new state or store changes needed. The draft page already computes the required props.

**New vs modified:**
- NEW: `src/hooks/useMediaQuery.ts` — SSR-safe media query hook
- MODIFIED: `src/app/draft/[id]/page.tsx` — conditional render of `MobileDraftView` vs desktop layout
- MODIFIED: `src/components/draft/MobileDraftView.tsx` — any missing functionality (Pokemon details, confirmation modal integration)
- MODIFIED: `src/components/draft/MobileWishlistSheet.tsx` — verify it integrates correctly with draft page state

---

### 5. PokePaste Import/Export

**Current state:**
- `src/lib/pokepaste-parser.ts` — full parser and serializer: `parsePokePaste()`, `fetchPokePaste()`, `toPokePaste()`, `teamToPokePaste()`. Handles nicknames, gender, items, EVs, IVs, tera type, nature, moves.
- `src/lib/export-service.ts` — `ExportService` class with JSON, CSV, Showdown-format, Markdown, HTML export. Has `exportAsShowdown()` that exports stats but not proper PokePaste format.
- `src/components/draft/ExportDraft.tsx` — existing export UI with JSON, CSV, summary, clipboard options. No PokePaste button.
- `src/lib/draft-export.ts` — draft-level export helpers.

**What's missing:**

**Import flow:** No UI exists to import a PokePaste during draft setup or team view. The parser exists but is not wired to any UI.

**Export flow:** The export components don't use `teamToPokePaste()`. They use `exportAsShowdown()` which outputs stats instead of proper PokePaste.

**Integration points:**

**PokePaste export** (simpler, do first):
- MODIFIED: `src/components/draft/ExportDraft.tsx` — add a "PokePaste" button using `teamToPokePaste()`. Since draft picks don't have moveset data (only species name), export generates templates using `toBasicPokePasteTemplate()` per species.
- The export copies to clipboard or downloads a `.txt` file — no server needed.

**PokePaste import** (more complex):
- WHERE: The import entry point should be the draft results page (`/draft/[id]/results`) and the team detail page in leagues (`/league/[id]/team/[teamId]`). These are post-draft contexts where a player updates their team's moveset data.
- A "Import from PokePaste" button opens a textarea or URL input. On submit, `parsePokePaste()` runs client-side. The matched species names are reconciled against the team's drafted Pokemon list.
- Parsed moveset data (EVs, item, ability, moves) is stored — either in Supabase on a `team_sets` table, or in `localStorage` keyed by team ID for a lighter beta implementation. The beta can use localStorage; a proper DB column can come post-beta.
- No new API route needed for the parser itself — it runs entirely client-side.

**Name matching problem:** PokePaste uses Showdown names (e.g., "Incineroar") while the draft stores PokeAPI names (e.g., "incineroar"). Normalize to lowercase and strip hyphens/spaces for comparison.

**New vs modified:**
- NEW: `src/components/draft/PokePasteImportModal.tsx` — textarea/URL import UI with name matching display
- NEW: `src/hooks/usePokePasteStorage.ts` — localStorage-backed moveset storage keyed by `{draftId}-{teamId}`
- MODIFIED: `src/components/draft/ExportDraft.tsx` — add PokePaste export button
- MODIFIED: `src/app/draft/[id]/results/page.tsx` — import button + `PokePasteImportModal` integration

---

### 6. Onboarding and Draft Templates

**Current state:**
- `src/components/tour/TourGuide.tsx` and `TourProvider.tsx` — a full animated tour guide with a Pokemon character, step definitions for dashboard, and event-based triggering via `TOUR_OPEN_EVENT` custom DOM event.
- `src/components/draft/DraftTour.tsx` — draft-room specific tour component.
- `src/lib/draft-templates.ts` — `BUILT_IN_TEMPLATES` array with "VGC Standard", plus template structure definition. Templates are defined but not wired to the create-draft flow.
- `src/lib/draft-template-presets.ts` — additional preset handling.
- `src/components/draft/FormatExplainer.tsx` — inline popover explanations for format concepts.

**What's missing:**
- The `create-draft` page does not show templates as selectable starting points — it uses a manual configuration form.
- The tour fires when triggered by `TOUR_OPEN_EVENT` but there is no first-time user trigger (e.g., on first dashboard visit, auto-open the tour).

**Template integration point:**
- MODIFIED: `src/app/create-draft/page.tsx` — add a "Start from template" step before or alongside the manual config form. Templates pre-populate format, team count, budget, timer settings. User can still override.
- The `BUILT_IN_TEMPLATES` array from `draft-templates.ts` drives the template selector UI. No DB needed for built-in templates.

**Onboarding trigger:**
- MODIFIED: `src/app/dashboard/page.tsx` — on first visit (check `localStorage.getItem('onboardingComplete')`), fire `TOUR_OPEN_EVENT` after a 500ms delay to let the page render first.
- The tour system is already fully built; this is just the trigger.

**"60-second first draft" target:** The critical path is: landing page → create draft (template selection) → share room code → draft starts. Templates eliminate the manual config step. The tour guides through the dashboard. FormatExplainer handles in-context education.

**New vs modified:**
- NEW: `src/components/draft/TemplateSelector.tsx` — grid of template cards with format/settings preview
- MODIFIED: `src/app/create-draft/page.tsx` — prepend template selection step
- MODIFIED: `src/app/dashboard/page.tsx` — first-visit tour trigger

---

### 7. Vercel Deployment and Domain

**Current state:**
- `vercel.json` exists with GitHub integration, auto-cancel, and CORS headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`).
- `next.config.ts` has full security headers, CSP, HSTS, PWA via `next-pwa`, Sentry via `@sentry/nextjs`.
- `src/app/layout.tsx` has `metadataBase` set to `https://draftpokemon.com`.
- `.env.example` has a complete production checklist.
- `src/app/sitemap.ts` and `src/app/robots.ts` exist for SEO.

**What's missing or needs verification:**

**CSP is incomplete for Clerk:** The current `connect-src` in `next.config.ts` lists `https://accounts.google.com https://discord.com` but does not include Clerk's CDN (`https://clerk.draftpokemon.com` or `https://*.clerk.accounts.dev`). This will cause Clerk auth to fail in production if the CSP is enforced.

Fix: Add Clerk's domains to the CSP `connect-src` and `script-src` directives. Clerk's recommended CSP domains are `https://clerk.io https://*.clerk.accounts.dev https://accounts.clerk.dev`.

**vercel.json is minimal:** Add `functions` config for API routes that have long execution times (e.g., `/api/ai` routes). The default Vercel function timeout is 10s on Hobby, 60s on Pro. AI calls may exceed this.

**Environment variables needed in Vercel dashboard:**

| Variable | Purpose | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | DB | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | DB | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth | Yes |
| `CLERK_SECRET_KEY` | Auth | Yes |
| `NEXT_PUBLIC_SITE_URL` | OG images, sitemap | Yes |
| `NEXT_PUBLIC_POSTHOG_KEY` | Analytics | Yes |
| `NEXT_PUBLIC_POSTHOG_HOST` | Analytics | Yes (or default) |
| `DISCORD_FEEDBACK_WEBHOOK_URL` | Feedback | Yes |
| `UPSTASH_REDIS_REST_URL` | Rate limiting | Recommended |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | Recommended |
| `NEXT_PUBLIC_SENTRY_DSN` | Error tracking | Optional |

**Domain setup:** Vercel requires adding `draftpokemon.com` in Project Settings > Domains. Point DNS `A` record to Vercel's IP (76.76.21.21) and `CNAME` of `www` to `cname.vercel-dns.com`.

**New vs modified:**
- MODIFIED: `vercel.json` — add function timeout config for AI routes
- MODIFIED: `next.config.ts` — fix CSP to include Clerk domains
- NO new code files — deployment is configuration only

---

## Component Responsibility Map

| Component / File | Responsibility | Integration Layer |
|-----------------|---------------|-------------------|
| `src/app/layout.tsx` | Root providers, global chrome, analytics init | Add `<FeedbackWidget />` here |
| `src/app/page.tsx` | Landing page for unauthenticated users | Modify copy and sections |
| `src/app/draft/[id]/page.tsx` | Draft room orchestration | Add mobile breakpoint conditional |
| `src/app/create-draft/page.tsx` | Draft creation wizard | Prepend template selector |
| `src/app/dashboard/page.tsx` | Authenticated user home | Add first-visit tour trigger |
| `src/app/draft/[id]/results/page.tsx` | Post-draft results | Add PokePaste import button |
| `src/lib/analytics.ts` | PostHog typed events | Add calls at action sites |
| `src/lib/pokepaste-parser.ts` | Parse/serialize PokePaste — COMPLETE | Wire to UI |
| `src/components/draft/MobileDraftView.tsx` | Mobile draft interface — EXISTS | Wire conditionally in draft page |
| `src/components/draft/ExportDraft.tsx` | Export UI — EXISTS | Add PokePaste export button |
| `src/components/tour/TourGuide.tsx` | Onboarding tour — COMPLETE | Trigger on first visit |
| `src/lib/draft-templates.ts` | Template definitions — COMPLETE | Wire to create-draft flow |

---

## Data Flow Diagrams

### Feedback Widget Data Flow
```
User fills form (FeedbackWidget or /feedback page)
  → POST /api/feedback
    → Validate fields (server)
    → POST to Discord webhook (DISCORD_FEEDBACK_WEBHOOK_URL)
    → Return { success: true }
  → Show success state in UI
```

### PokePaste Import Data Flow
```
User pastes text or URL in PokePasteImportModal
  → If URL: fetch /raw via client-side fetch (pokepaste-parser.ts#fetchPokePaste)
  → parsePokePaste(text) → PokemonSet[]
  → Match PokemonSet.name against team's drafted pokemon names (normalize lowercase)
  → Show match preview (matched / unmatched)
  → On confirm: store in localStorage keyed by {draftId}-{teamId}
    → usePokePasteStorage hook reads/writes this
  → Team results page renders moveset data from storage
```

### Analytics Data Flow
```
User action in component or hook
  → Service function (draft-lifecycle-service, useDraftActions, etc.)
    → analytics.eventName(props)  ← fire-and-forget
      → posthog.capture(event, props) [if initialized]
  → Vercel Analytics captures page views independently
```

### Mobile Layout Selection
```
Draft page mounts
  → useMediaQuery('(max-width: 768px)') [SSR: false, client: real value]
  → isMobile === true → <MobileDraftView {...props} />
  → isMobile === false → existing desktop layout
  Both consume the same draft state and callbacks from draft page hooks
```

---

## Integration Dependencies and Build Order

The features have the following dependency relationships:

```
Vercel deployment config (no deps)
  └── Must be done first to unblock production testing

Analytics call sites (depends on: analytics.ts already built)
  └── Add calls incrementally; no UI work

Landing page polish (no deps)
  └── Standalone page modification

Feedback widget (no deps on other features)
  └── Can be built in parallel with any other feature

Mobile draft room (depends on: useMediaQuery hook)
  └── Build useMediaQuery first, then wire MobileDraftView

PokePaste export (no deps)
  └── Modification to existing ExportDraft component

PokePaste import (depends on: PokePaste export pattern established)
  └── Build after export to understand name normalization

Onboarding templates (no deps on other Milestone 4 features)
  └── Wire existing template data and tour trigger
```

**Recommended build order:**
1. Vercel deployment config (CSP fix, env vars) — unblocks production testing of everything else
2. Analytics call sites — quick additions, validates PostHog is working
3. Feedback widget — isolated component, fast to ship, high beta value
4. Landing page polish — content work, no code risk
5. Mobile draft room — most complex, isolated to draft page
6. PokePaste export then import — export is simpler, import builds on it
7. Onboarding templates — can be done any time, nice-to-have polish

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding Feedback Inside SidebarLayout
**What:** Placing the feedback trigger inside `SidebarLayout` instead of root layout
**Why bad:** SidebarLayout doesn't wrap all pages. The feedback widget would disappear on auth pages, draft room, etc.
**Instead:** Add to `src/app/layout.tsx` outside the `<main>` tag

### Anti-Pattern 2: Blocking Render on Analytics
**What:** `await analytics.draftCreated(...)` before showing success UI
**Why bad:** PostHog calls are network requests that can fail or be slow
**Instead:** Call analytics after state update, never in the critical path. The existing `track()` function already returns void.

### Anti-Pattern 3: SSR-unsafe useMediaQuery
**What:** `window.matchMedia(...)` called during server render
**Why bad:** Causes hydration mismatch; Next.js will throw
**Instead:** Initialize to `false` (desktop default) during SSR, hydrate on `useEffect`

### Anti-Pattern 4: PokePaste Fetch from Browser to pokepast.es (CORS)
**What:** `fetchPokePaste(url)` called directly from client
**Why bad:** pokepast.es does not send CORS headers — direct client fetch will fail
**Instead:** Proxy through an API route at `/api/pokepaste?url=...` that fetches server-side, or instruct users to paste raw text instead of URLs

### Anti-Pattern 5: Storing PokePaste Data in Zustand
**What:** Putting moveset data in the global draftStore
**Why bad:** Movesets are post-draft personal data, not shared draft state. Pollutes the realtime-synced store.
**Instead:** localStorage via `usePokePasteStorage` hook. Post-beta: dedicated `team_sets` Supabase table.

### Anti-Pattern 6: Modifying CSP in vercel.json Headers Instead of next.config.ts
**What:** Adding CSP overrides in `vercel.json` headers
**Why bad:** The app already sets CSP in `next.config.ts` — duplicate header definitions cause unexpected merging or last-write-wins behavior
**Instead:** All CSP changes go in `next.config.ts` only

---

## Scalability Considerations

| Concern | Current | Beta (100-500 DAU) | Post-Beta |
|---------|---------|---------------------|-----------|
| Feedback volume | Discord webhook, no DB | Sufficient; webhook handles easily | Add Supabase `feedback` table for triage |
| Analytics events | PostHog free tier (1M events/month) | Sufficient for beta | Monitor event volume, may need paid tier |
| PokePaste data | localStorage only | Sufficient; no server cost | Migrate to `team_sets` DB table |
| Mobile sessions | No mobile optimization | MobileDraftView covers this | Monitor session length on mobile |
| Vercel build time | ~2 min | Acceptable | Enable Vercel's build cache for faster deploys |

---

## Sources

- Codebase inspection: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/feedback/page.tsx`, `src/app/api/feedback/route.ts`
- `src/lib/analytics.ts`, `src/lib/pokepaste-parser.ts`, `src/lib/export-service.ts`, `src/lib/draft-templates.ts`
- `src/components/draft/MobileDraftView.tsx`, `src/components/draft/ExportDraft.tsx`, `src/components/tour/TourGuide.tsx`
- `src/components/providers/AnalyticsProvider.tsx`, `next.config.ts`, `vercel.json`, `.env.example`
- Confidence: HIGH — based entirely on direct codebase inspection, no external sources needed
