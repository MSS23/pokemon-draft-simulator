# Project Research Summary

**Project:** Pokemon Draft — draftpokemon.com
**Domain:** Real-time competitive Pokemon draft platform — beta launch readiness
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

This milestone is not about building a new product — it is about shipping an existing one. The codebase is a ~79K line Next.js 15 App Router application with a complete draft room, league system, Clerk auth, Supabase realtime, PWA support, and 30+ routes. Every feature targeted for Milestone 4 (beta launch) is either already fully built but unwired, or requires a thin integration layer over infrastructure that already exists. The research consistently confirms this: the pokepaste parser is written but has no UI; the onboarding tour is complete but has no trigger; the mobile draft view exists but is never rendered; analytics events are defined but never called. The work is connection and wiring, not construction.

The recommended approach is to execute in a strict dependency order: fix the production deployment configuration first (Clerk production keys, CSP headers, environment variables) because nothing else can be validated without a real production URL. Then add observability (Sentry, PostHog call sites) so beta testing is instrumented from day one. Then surface the existing features (templates, tour, mobile view, pokepaste) with the minimum UI changes needed to activate them. The landing page and OG metadata are content and configuration work, not engineering risk.

The dominant risk category is deployment correctness, not feature complexity. Four of the five critical pitfalls are about the production environment: Clerk dev vs production keys, Supabase Realtime connection limits, service worker stale-cache behavior, and DNS propagation timing. These are cheap to prevent if addressed before launch and catastrophic if discovered by the first wave of beta users. A secondary risk cluster surrounds the iOS Safari mobile draft experience — the bottom sheet scroll conflict is a known platform bug that requires testing on physical hardware, not emulation, and cannot be verified any other way.

---

## Key Findings

### Recommended Stack

The existing stack requires no re-evaluation. The four new dependencies for this milestone are minimal and well-justified. See [STACK.md](.planning/research/STACK.md) for full rationale and alternatives considered.

**New dependencies for Milestone 4:**
- `@sentry/nextjs` (^9.x): Error monitoring + User Feedback widget — already stubbed in CLAUDE.md env vars, one SDK covers both needs
- `posthog-js` (^1.364.x): Analytics + session replay + feature flags — already built in `src/lib/analytics.ts`, just needs call sites wired; covers funnels unlike Plausible/Vercel Analytics
- `@pkmn/sets` (^5.2.0): PokePaste parser/serializer — handles Showdown edge cases (nicknames, formes, CRLF) that a hand-rolled regex would miss; however the codebase already has `src/lib/pokepaste-parser.ts` which may be sufficient if it handles these cases
- `vaul` (^1.1.2): Mobile bottom sheet — check `npm ls vaul` first as shadcn's Drawer is already built on it; provides iOS-native swipe physics

**What to explicitly avoid:** LogRocket (redundant with PostHog session replay), GA4 (requires consent banner; cookieless PostHog avoids this), Shepherd.js/react-joyride (tour system is already built), next-pwa (PWA is already configured via sw.js).

### Expected Features

The gap between what the platform currently exposes and what beta users expect is primarily a UX exposure gap, not a capability gap. See [FEATURES.md](.planning/research/FEATURES.md) for the full prioritization matrix.

**Must ship on day one (P0 — launch blockers):**
- Domain deployment to draftpokemon.com with SSL — without it, Clerk production auth cannot be tested
- Sentry error monitoring wired end-to-end — deploying blind to production is not acceptable
- Landing page with VGC-specific messaging — current copy is generic; VGC players landing from Reddit/Discord will bounce
- OG meta tags on all public routes — Discord/Reddit previews are the primary discovery mechanism for this audience
- In-app feedback widget — beta without structured feedback collection wastes the beta

**Should ship in first two weeks (P1 — beta differentiators):**
- Draft templates (VGC Reg F/H, Smogon OU) — reduces commissioner setup from 30 minutes to under 2 minutes
- PokePaste export from draft results — the most-requested feature in the Discord bot community; concrete advantage over every competitor
- Mobile bottom-sheet Pokemon picker — VGC audience is majority mobile; 375px experience must work
- PostHog analytics call sites active — needed to understand drop-off and guide iteration

**Defer until post-beta validation (P2):**
- Onboarding tour (wire the existing trigger once mobile is stable)
- PokePaste import for matchup prep (build after export validates the parser)
- Social recap image generation (high organic growth value but not launch-blocking)
- Usage stats overlay, damage calculator, broadcast mode, sound/animation system

### Architecture Approach

The Milestone 4 integration architecture is almost entirely additive modification of existing files, not new system design. The root layout (`src/app/layout.tsx`) is the correct insertion point for the feedback widget and analytics verification. The draft page (`src/app/draft/[id]/page.tsx`) needs a `useMediaQuery` conditional to route to the already-built `MobileDraftView`. The create-draft page needs a template selector step prepended. The dashboard needs a first-visit tour trigger. No new routes, no new database tables, no new state management patterns are required for any P0 or P1 feature. See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for full component responsibility map and data flow diagrams.

**Integration points by feature:**
1. `src/app/layout.tsx` — add `<FeedbackWidget />` before body close (not inside SidebarLayout)
2. `src/lib/analytics.ts` call sites — add to `useDraftActions.ts`, `draft-lifecycle-service.ts`, `AuthContext.tsx`
3. `src/app/draft/[id]/page.tsx` — add `useMediaQuery` conditional rendering `<MobileDraftView>`
4. `src/app/create-draft/page.tsx` — prepend `<TemplateSelector>` step using existing `draft-templates.ts` data
5. `src/components/draft/ExportDraft.tsx` — add PokePaste export button using existing `pokepaste-parser.ts#teamToPokePaste`
6. `next.config.ts` — fix CSP to include Clerk CDN domains (current CSP will break Clerk auth in production)
7. `vercel.json` — add function timeout config for AI routes

### Critical Pitfalls

Top pitfalls extracted and synthesized from [PITFALLS.md](.planning/research/PITFALLS.md). The deployment cluster (pitfalls 1, 2, 10) must be resolved before any community announcement.

1. **Clerk dev keys in Vercel Production scope** — Switch to `pk_live_*` / `sk_live_*` in Vercel's Production environment specifically; preview can use dev keys. Re-register Discord and Google OAuth callbacks against the production Clerk instance pointing to draftpokemon.com, not vercel.app. Test auth end-to-end on the custom domain before any public post.

2. **Supabase Realtime connection limits under beta load** — Audit channel count per draft participant via `useConnectionManager` before launch. A 6-person draft room consumes 30+ Supabase channels under the current pattern. Free tier limit is ~200 concurrent connections total. Upgrade to Supabase Pro before public announcement or consolidate channels to one per draft room.

3. **PWA service worker serving stale builds post-deploy** — `sw.js` is modified (visible in git status). Ensure it uses a versioned cache name, implements `skipWaiting()` + `clients.claim()`, and shows a "reload to update" UI notification. Test the update cycle explicitly: build, deploy, load, build again, reload.

4. **OG/social metadata missing for Discord/Reddit sharing** — `generateMetadata()` must be added to every public route with absolute OG image URLs. Validate using the Discord embed tester and opengraph.xyz before any community post. A blank link preview on launch day is the worst first impression possible.

5. **PostHog + Sentry hydration errors in production** — Initialize PostHog using `disable_external_dependency_loading: true` or via `instrumentation-client.ts` (Next.js 15.3+). Initialize Sentry and PostHog in separate files. Test hydration in production build mode (`npm run build && npm start`) — hydration errors are invisible in dev mode.

---

## Implications for Roadmap

Based on the combined research, the feature dependency graph and the deployment-first risk model suggest four phases:

### Phase 1: Production Deployment Foundation
**Rationale:** Nothing in this milestone can be validated without a working production deployment on draftpokemon.com. Clerk auth requires production keys and a real domain. OG tags require an absolute base URL. Analytics require production-gated initialization. Every other phase depends on this being correct. The CSP bug (Clerk CDN missing from `connect-src`) is a silent failure that only manifests in production. This is pure configuration and infrastructure work with no UI surface.
**Delivers:** Working auth, SSL, correct security headers, Vercel env vars set, DNS configured
**Addresses:** Domain + SSL, Clerk production keys, CSP fix
**Avoids:** Pitfalls 1 (Clerk key mismatch), 10 (DNS propagation lag), 12 (missing env vars in Production scope)
**Research flag:** Standard patterns — Vercel + Clerk deployment is well-documented

### Phase 2: Observability and Feedback Infrastructure
**Rationale:** Beta testing without instrumentation produces unusable feedback. Sentry must be wired before the first user session, not added reactively after bugs are reported. PostHog call sites need to be active from day one to capture the onboarding funnel data that drives iteration decisions. The feedback widget is the primary channel for beta tester communication and must exist before inviting testers. These are all modifications to existing infrastructure (Sentry DSN is stubbed, analytics.ts is built, /feedback page exists) — the effort is low and the payoff is immediate.
**Delivers:** Runtime error capture, onboarding funnel visibility, in-app bug reporting
**Addresses:** Sentry monitoring, PostHog call sites, feedback widget
**Avoids:** Pitfalls 4 (hydration errors), 6 (bundle weight from feedback SDK), 14 (analytics firing in dev)
**Research flag:** Needs attention on hydration pitfall during implementation — initialize PostHog/Sentry per PITFALLS.md guidance

### Phase 3: Core Beta Features
**Rationale:** These are the features that make the product worth sharing with the VGC community. Draft templates eliminate the biggest onboarding friction point (30-minute manual format config). PokePaste export is the concrete differentiator that no Discord bot or web competitor offers and will be explicitly called out in community posts. Mobile draft room activation turns the existing but inert `MobileDraftView` into a shipped feature. These three features share no implementation dependencies on each other and can be built in parallel, but all depend on Phase 1 (need production URL to validate OG/analytics) and Phase 2 (need analytics wired to measure impact).
**Delivers:** VGC-ready onboarding, Showdown ecosystem interop, mobile-functional draft room
**Addresses:** Draft templates (P1), PokePaste export (P1), mobile bottom-sheet picker (P1)
**Avoids:** Pitfalls 7 (iOS Safari scroll), 8 (PokePaste edge cases), 9 (tour during live draft state)
**Research flag:** Mobile bottom sheet requires physical iPhone testing — cannot be validated on emulator

### Phase 4: Launch Polish and Growth Surface
**Rationale:** The landing page and OG metadata are content and metadata work with no technical risk, but they require Phase 1's base URL to finalize canonical URLs and OG image paths. They are the last thing to polish because copy changes are cheap and they depend on knowing what Phase 3 shipped. The onboarding tour wiring is trivial (one localStorage check + event dispatch on dashboard) but should not be done until the mobile draft room is stable (the tour points at mobile UI). Social recap image generation is a growth multiplier but not a launch blocker.
**Delivers:** First impression optimization, social shareability, guided first-run experience
**Addresses:** Landing page VGC messaging, OG meta tags (P0), onboarding tour trigger, social recap image (P2)
**Avoids:** Pitfall 5 (missing OG metadata), UX pitfall (onboarding blocking returning users)
**Research flag:** OG image generation (Satori-based) is a moderate complexity task if pursued — standard patterns exist

### Phase Ordering Rationale

- Deployment config must precede everything because Clerk production auth and OG canonical URLs are blockers for validation of all other features
- Observability before features because beta feedback is only useful if it is instrumented; fixing bugs you cannot reproduce is impossible
- Core features can be built in parallel once deployment is stable — the three features (templates, pokepaste, mobile) have no inter-dependencies
- Polish last because landing page copy and tour details are the cheapest things to change and benefit from knowing what shipped in earlier phases
- This order also matches the pitfall risk profile: the most catastrophic pitfalls (Clerk keys, Supabase limits, OG metadata) are addressed in phases 1 and 2 before any public exposure

### Research Flags

Phases needing explicit implementation attention:
- **Phase 1 (Deployment):** CSP changes require careful testing — two separate header sources (next.config.ts vs vercel.json) exist and must not conflict. All changes go to next.config.ts only.
- **Phase 2 (Observability):** PostHog/Sentry initialization order matters. Test in production build mode specifically. Gate analytics on `NODE_ENV === 'production'` AND hostname.
- **Phase 3 (Mobile):** Must test on physical iPhone Safari before merging. iOS Safari scroll-within-sheet conflict is a real-device-only failure mode. Use Vaul drawer component.
- **Phase 3 (PokePaste):** Test against 10+ real-world VGC pastes from paste.victoryroad.pro before shipping. Validate export→Showdown round-trip.

Phases with standard patterns (lower implementation risk):
- **Phase 1 (Vercel/DNS config):** Well-documented Vercel + Clerk production setup
- **Phase 4 (Landing page copy):** Content work on an existing page, no new routes or state
- **Phase 4 (OG metadata):** Next.js 15 `generateMetadata()` is well-documented; static routes are straightforward

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack validated; new deps (@sentry/nextjs, posthog-js, @pkmn/sets, vaul) are well-documented with official sources. posthog-js already built in codebase. |
| Features | HIGH | Research was confirmed against direct codebase inspection — every feature's implementation status was verified, not inferred. Prioritization matrix aligns with community patterns. |
| Architecture | HIGH | Entire architecture section based on direct codebase inspection of actual files. No external sources needed — all integration points verified against real file contents. |
| Pitfalls | HIGH (deployment/auth/realtime), MEDIUM (community/onboarding) | Deployment pitfalls verified against official Clerk, Supabase, Vercel docs. iOS Safari scroll conflict and onboarding patterns are based on community consensus and issue trackers. |

**Overall confidence:** HIGH

The combination of a large existing codebase (which was directly inspected) and well-documented third-party integrations (Clerk, Supabase, Vercel) makes this an unusually high-confidence research synthesis. The main uncertainty is in user behavior (will VGC players respond to the onboarding tour? will PokePaste export drive word-of-mouth?) which cannot be resolved before beta — that is what the beta is for.

### Gaps to Address

- **Supabase channel count per participant:** The exact number of Realtime channels opened by `useConnectionManager` per draft participant was not counted. This must be audited before launch to determine whether Supabase Free tier is safe or whether Pro upgrade is required. This is a one-hour audit task, not a research gap.
- **vaul installation status:** `npm ls vaul` was not run. If already transitively installed via shadcn's Drawer component, no new dependency is needed. Verify before adding to package.json.
- **pokepaste-parser.ts edge case coverage:** The existing `src/lib/pokepaste-parser.ts` was not inspected for completeness against the Showdown format edge cases (nicknames, gender notation, CRLF). If it handles these, `@pkmn/sets` is not needed. If it has gaps, either fix the existing parser or adopt `@pkmn/sets`. This is a 30-minute code review task.
- **Supabase Pro upgrade timing:** The decision to upgrade Supabase (cost: ~$25/month) depends on the channel count audit. Defer the upgrade decision until the audit result is known.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `src/app/layout.tsx`, `src/lib/analytics.ts`, `src/lib/pokepaste-parser.ts`, `src/lib/draft-templates.ts`, `src/components/draft/MobileDraftView.tsx`, `next.config.ts`, `vercel.json`, `.env.example`
- [Clerk Docs — Deploy to Production](https://clerk.com/docs/guides/development/deployment/production) — production key requirements, OAuth callback configuration
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits) — concurrent connection quotas
- [PostHog Next.js integration docs](https://posthog.com/docs/libraries/next-js) — instrumentation-client.ts initialization pattern
- [Sentry for Next.js docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) — App Router wizard, User Feedback widget
- [Next.js Metadata API](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) — generateMetadata, OG images
- [Next.js generateSitemaps docs](https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps) — native sitemap generation

### Secondary (MEDIUM confidence)
- [PostHog/posthog-js Issue #1645](https://github.com/PostHog/posthog-js/issues/1645) — hydration error with Next.js App Router
- [Web Platform Interop Issue #788](https://github.com/web-platform-tests/interop/issues/788) — iOS Safari scroll-within-modal conflict
- [pokepast.es/syntax.html](https://pokepast.es/syntax.html) — PokePaste format specification
- [Vaul GitHub](https://github.com/emilkowalski/vaul) — mobile bottom sheet implementation
- [@pkmn/sets on npm](https://www.npmjs.com/package/@pkmn/sets) — Showdown set parser

### Tertiary (LOW confidence — validate during implementation)
- iOS Safari bottom sheet behavior on physical device — cannot be fully validated without hardware
- VGC community response to PokePaste export as differentiator — assumed from Discord bot community patterns

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*
