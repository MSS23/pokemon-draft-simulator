# Technology Stack — Beta Launch Additions

**Project:** Pokemon Draft (draftpokemon.com)
**Milestone:** 4 — Beta Launch
**Researched:** 2026-04-03
**Scope:** NEW dependencies only. Existing stack (Next.js 15, Supabase, Zustand, Tailwind, Radix UI, Framer Motion, TanStack Query v5, Clerk, Vitest) is validated — do not re-evaluate.

---

## New Capabilities Required

| Capability | Needed For |
|------------|------------|
| Error monitoring | Catch runtime crashes in production before users report them |
| Product analytics | Understand drop-off in draft creation funnel, feature adoption |
| In-app feedback widget | Beta tester bug reports with screenshot + error context |
| PokePaste parser/serializer | Showdown ecosystem interop (import team → pick list, export results) |
| Mobile bottom sheet | Pokemon picker, team view on 375px screens without desktop dialog |
| SEO metadata | Sitemap, robots.txt for draftpokemon.com indexing |

---

## Recommended Stack Additions

### Error Monitoring

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@sentry/nextjs` | ^9.x (latest: 10.47.0) | Runtime error capture, performance tracing, source maps | Best-in-class Next.js App Router integration with `npx @sentry/wizard -i nextjs` wizard. Auto-instruments React components, server actions, API routes, and edge middleware in one SDK. Already referenced in CLAUDE.md `SENTRY_DSN` env var — infrastructure is already expected. Turbopack dev mode not supported yet (dev only; production fine). |

**Version note:** Sentry v8 was the minimum for User Feedback screenshots. Current is v10.x. Install latest and pin to `^9` floor to stay in supported range.

---

### Product Analytics

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `posthog-js` | ^1.364.x (latest) | Event tracking, session replay, funnel analysis, feature flags | PostHog covers analytics + surveys + feature flags in a single SDK — avoiding Plausible (pageviews only, no events) and Vercel Analytics (no funnels or custom events). Free tier is generous (1M events/month). Privacy-first, cookieless mode available — no consent banner needed. Integrates with Next.js 15.3+ via `instrumentation-client.ts`. Critical funnel to track: landing → create draft → invite → first pick. |

**Why not Plausible:** Pageview-only analytics won't tell you whether users are completing draft setup, hitting the invite step, or abandoning during picks. PostHog's funnel analysis does.

**Why not Vercel Analytics:** No event tracking, no funnels, no session replay. Adequate for a marketing site, not for a product with a multi-step onboarding flow.

---

### In-App Feedback Widget

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Sentry User Feedback (built into `@sentry/nextjs`) | Same as above | In-app bug report button with screenshot capture and automatic error context | Already included with Sentry SDK — no additional dependency. SDK v8+ supports user-attached screenshots (auto-hidden on mobile). Each feedback submission links to the session replay, breadcrumbs, and any associated error — exactly what beta triage needs. Dismisses the need for a separate Featurebase or Upstash Feedback dependency. |

**Why not a separate feedback SaaS (Featurebase, Canny, Upstash):** Adds another third-party dependency and monthly cost. Sentry's widget provides richer debugging context (error ID, replay link, breadcrumbs) than any standalone tool. For beta, bug reports with reproduction context beat feature voting boards.

---

### PokePaste Parser / Serializer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@pkmn/sets` | ^5.2.0 (latest) | Parse Showdown/PokePaste export format into typed set objects; serialize draft results back | Official `@pkmn` ecosystem package by the same team behind Smogon's tooling. Provides `Sets.importSet()` and `Sets.exportSet()` — exactly the import/export boundary needed. PokePaste uses Showdown's text format; this package is the canonical JS parser for it. Tiny bundle impact, no runtime dependencies. |

**Implementation note:** PokePaste text → `Sets.importSet()` → map species name to our `pokemon.id` via `@pkmn/dex` lookup. For export: draft picks → `Sets.exportSet()` → paste to clipboard or POST to `pokepast.es/create`. No server round-trip required for parse/format; only the optional paste-hosting POST needs a server action.

**Why not hand-rolling a parser:** The Showdown format has edge cases (nicknames, multi-line moves, unicode species names, forme handling). `@pkmn/sets` handles all of these with test coverage. Building and maintaining a regex parser is a trap.

---

### Mobile Bottom Sheet (Drawer)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `vaul` | ^1.1.2 | Pokemon picker sheet, team roster drawer, filter panel on mobile | shadcn/ui's `Drawer` component is already built on Vaul — check if it's already transitively installed. If the project uses `@radix-ui/react-dialog` (it does via Radix UI), Vaul is a near-zero-cost addition. Provides snap points, swipe-to-dismiss, background scaling. 184KB, 2k+ npm dependents. Physics-based gestures feel native on iOS/Android. |

**Check first:** Run `npm ls vaul` — shadcn's Drawer component may already list it. If present, no install needed; just add `Drawer` to the mobile draft room layout.

---

### SEO / Sitemap

| Technology | Approach | Why |
|------------|----------|-----|
| Native Next.js 15 `app/sitemap.ts` + `app/robots.ts` | Built-in metadata file conventions | Next.js 15 has native `generateSitemaps()` and `robots.txt` file conventions in the App Router. No `next-sitemap` package needed — that library exists to patch the Pages Router. Use `app/sitemap.ts` returning static routes + `app/robots.ts`. Zero extra dependency. |

**For dynamic routes:** Draft results pages (`/draft/[id]/results`) should be `noindex` — they're private. Landing page, `/create-draft`, `/join-draft`, and the blog/about pages are the only indexable URLs. Keep the sitemap simple.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Error monitoring | `@sentry/nextjs` | Datadog, Rollbar, Bugsnag | Sentry has the best Next.js App Router wizard + User Feedback built in. Already stubbed in CLAUDE.md env var. |
| Analytics | `posthog-js` | Plausible | Plausible is pageviews only — no custom events, no funnels, no session replay. Insufficient for tracking onboarding drop-off. |
| Analytics | `posthog-js` | Mixpanel | Mixpanel has no built-in session replay or feature flags. PostHog is more complete and cheaper at this scale. |
| Analytics | `posthog-js` | Vercel Analytics | No custom events, no funnels. OK for a brochure site; not enough for a draft app. |
| In-app feedback | Sentry User Feedback | Featurebase, Canny | Additional paid SaaS. Sentry feedback links to error context; standalone tools don't. Overkill for beta. |
| In-app feedback | Sentry User Feedback | Upstash Feedback | Requires Upstash Redis account; routes to Slack only. No error linking. |
| PokePaste parser | `@pkmn/sets` | Hand-rolled regex | Showdown format has too many edge cases for a regex approach to be maintainable. |
| PokePaste parser | `@pkmn/sets` | `@smogon/sets` | `@smogon/sets` is a different package (Smogon's official usage data, not the parser). `@pkmn/sets` is the right import/export package. |
| Mobile drawer | `vaul` | Radix Sheet | Radix Sheet slides from the side — not idiomatic mobile bottom sheet. Vaul's snap points and swipe-dismiss are what mobile users expect. |
| Sitemap | Native Next.js | `next-sitemap` | `next-sitemap` is a Pages Router shim. App Router has native file conventions. Adding a package to do what the framework provides natively is wrong. |

---

## What NOT to Add

| Tool | Reason to Avoid |
|------|----------------|
| LogRocket | Expensive, redundant with PostHog session replay. Using two session replay tools is wasteful. |
| Hotjar | No App Router native integration; adds heavy script. PostHog covers heatmaps + sessions. |
| Google Analytics (GA4) | Requires cookie consent banner (GDPR/CCPA); PostHog cookieless mode avoids this. Pokemon community skews young — minimize data obligations. |
| Segment | Event routing middleware adds latency and cost at this scale. PostHog ingests events directly. |
| `react-shepherd` / `intro.js` | Onboarding tour libraries with large bundles (~60KB+). Custom guided highlight using Framer Motion (already in bundle) is lighter and more on-brand. |
| `react-joyride` | Same as above. |
| `next-pwa` (additional) | PWA already configured via `public/sw.js`. Don't add a second PWA library. |
| `react-use-gesture` | Vaul handles gesture physics for bottom sheets. Adding gesture libraries on top creates conflicts. |
| Sentry Performance Monitoring (transactions) | Enable for production but keep `tracesSampleRate` at 0.1 (10%) to stay on free tier — don't set to 1.0. |

---

## Installation

```bash
# Error monitoring + feedback widget (one SDK does both)
npm install @sentry/nextjs

# Analytics + session replay + feature flags
npm install posthog-js

# PokePaste parser/serializer
npm install @pkmn/sets

# Check if vaul is already present before installing
npm ls vaul
# If not listed:
npm install vaul
```

**Environment variables to add to `.env.local` and Vercel:**
```env
# Sentry (error monitoring + feedback)
SENTRY_DSN=your-sentry-dsn                          # already stubbed in CLAUDE.md
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn              # client-side capture

# PostHog (analytics)
NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_api_key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com    # or EU: https://eu.posthog.com
```

---

## Integration Points

### Sentry — App Router Setup

The `npx @sentry/wizard -i nextjs` wizard generates:
- `sentry.client.config.ts` — browser initialization + User Feedback widget
- `sentry.server.config.ts` — server-side capture
- `sentry.edge.config.ts` — edge middleware
- `app/global-error.tsx` — React rendering error boundary
- `next.config.ts` update — `withSentryConfig()` wrapper

**User Feedback button placement:** Add to the bottom of the draft page layout (`src/app/draft/[id]/layout.tsx`) so it's present during active drafts when beta testers are most likely to hit bugs.

### PostHog — Next.js 15.3+ Setup

Use `instrumentation-client.ts` (Next.js 15.3+ native hook) for initialization rather than a custom `providers.tsx` wrapper when possible. For server-side capture (server actions, API routes), use `posthog-node` via a singleton `PostHogClient`.

**Key events to capture immediately:**
- `draft_created` — with `format`, `team_count`, `draft_type`
- `draft_joined` — with `role` (host/participant/spectator)
- `pick_made` — with `draft_type`, `round`, `cost`
- `pokepaste_imported` / `pokepaste_exported`
- `onboarding_completed`

### PokePaste — Import Flow

```
User pastes text
  → Sets.importSet() per-pokemon block
  → Map species name → internal pokemon.id via name normalization
  → Validate each pokemon against format rules engine
  → Display as pre-selected wishlist or team template
```

Export flow: draft picks → `Sets.exportSet()` → joined text block → copy to clipboard.

### Vaul — Mobile Draft Room

Replace Radix `Dialog` with Vaul `Drawer` for the Pokemon picker on screens < 640px using a `useMediaQuery` check. Snap points: `['80%', 1]` — 80% height for browsing, full-screen for search. The existing `VirtualizedPokemonGrid` drops into the `Drawer.Content` without modification.

---

## Sources

- [Sentry for Next.js docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry User Feedback widget screenshots](https://sentry.io/changelog/user-feedback-widget-screenshots/)
- [PostHog Next.js integration docs](https://posthog.com/docs/libraries/next-js)
- [PostHog vs Sentry comparison](https://posthog.com/blog/posthog-vs-sentry)
- [PostHog vs Plausible comparison](https://posthog.com/blog/posthog-vs-plausible)
- [Vercel PostHog + Next.js guide](https://vercel.com/kb/guide/posthog-nextjs-vercel-feature-flags-analytics)
- [@pkmn/sets on npm](https://www.npmjs.com/package/@pkmn/sets)
- [Vaul GitHub](https://github.com/emilkowalski/vaul)
- [Next.js generateSitemaps docs](https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps)
- [Next.js robots.txt file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)
- [Vercel custom domain setup](https://vercel.com/docs/domains/set-up-custom-domain)
