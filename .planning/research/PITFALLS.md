# Domain Pitfalls

**Domain:** Beta launch of complex real-time Pokemon draft platform (adding features to existing ~79K line TypeScript app)
**Researched:** 2026-04-03
**Confidence:** HIGH for deployment/auth/realtime (verified with official docs); MEDIUM for community/onboarding (pattern analysis)

---

## Critical Pitfalls

Mistakes that cause rewrites, production outages, or failed launches.

---

### Pitfall 1: Clerk Production Keys Not Set Before Launch

**What goes wrong:** App works perfectly on localhost and Vercel preview, then auth silently fails or crashes on draftpokemon.com at launch.

**Why it happens:** Clerk uses two separate application instances — a dev instance (pk_test_*, sk_test_*) and a production instance (pk_live_*, sk_live_*). Vercel preview deployments can run on dev keys, but production deployment on a real domain requires live keys. Additionally, Clerk explicitly blocks production instances from running on *.vercel.app subdomains — so the first real-domain deploy is the first time production keys are exercised.

**Consequences:** All users hit auth errors at launch. OAuth providers (Discord, Google) fail because callback URLs are registered against the wrong Clerk instance. The app is dead at the moment that matters most.

**Prevention:**
- Create the Clerk production instance before any deployment work begins
- Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_*` and `CLERK_SECRET_KEY=sk_live_*` in Vercel's Production environment (not Preview, not Development)
- Re-register Discord and Google OAuth callback URLs in the production Clerk dashboard, pointing to draftpokemon.com (not vercel.app)
- Test auth flow end-to-end on the custom domain before any public announcement

**Detection:** 401 errors in production logs, Clerk dashboard shows zero active sessions, users report "sign in not working."

---

### Pitfall 2: Supabase Realtime Connection Limits Hit Under Beta Load

**What goes wrong:** Draft rooms work perfectly for 2-4 person tests, then silently break when 10+ users join simultaneously during beta wave.

**Why it happens:** Supabase Free plan limits concurrent Realtime connections (typically 200 concurrent on Free tier). Each draft participant opens multiple channels (draft state, picks, auctions, bids, wishlist). A 6-person draft room can consume 30+ connections. Twenty simultaneous draft rooms = 600+ connections — well above the Free tier limit. When the limit is hit, new WebSocket connections receive "too_many_connections" and silently fail rather than throwing a visible error.

**Consequences:** New joiners see stale state. Picks by other teams don't propagate. The app appears broken with no obvious error message.

**Prevention:**
- Audit connection count per draft room before launch — log how many channels `useConnectionManager` opens per participant
- Consolidate channels: one channel per draft room rather than per-table subscriptions where possible
- Upgrade Supabase to Pro before any public announcement (Pro plan supports 10,000+ concurrent connections)
- Add connection status monitoring: surface the Supabase Realtime connection state in the UI so users know when they are disconnected

**Detection:** Pick events not received by some participants; Supabase dashboard shows connection quota warnings; browser console shows "too_many_connections" WebSocket close codes.

---

### Pitfall 3: PWA Service Worker Serves Stale Build After Deployment

**What goes wrong:** You deploy a bug fix. Users who had the app installed (PWA) continue to see the broken version for hours or days because the service worker has cached the old build.

**Why it happens:** The existing `sw.js` (confirmed modified in git status) pre-caches app shell assets. After a Vercel deployment, the hashed filenames change, but the service worker update lifecycle requires: (1) new SW detected, (2) SW installs, (3) old SW releases control on next navigation. If users never close all tabs, they're stuck on the cached version indefinitely.

**Consequences:** Beta testers file bugs against already-fixed versions. You cannot reliably hotfix production. Cache-busting announcements in Discord are required, which erodes trust.

**Prevention:**
- Ensure `sw.js` has a versioned cache name that changes on every build (use the build ID or a hash)
- Implement `skipWaiting()` + `clients.claim()` in the service worker so updates take effect on next page load, not next close-and-reopen
- Add a UI notification: "App updated — click to reload" using the `waiting` event from the SW registration
- Test the update cycle locally: build, serve, load, build again, reload — verify new SW activates

**Detection:** Users report issues you've already fixed; DevTools → Application → Service Workers shows "waiting to activate" state.

---

### Pitfall 4: PostHog/Sentry Causes React Hydration Errors in Production

**What goes wrong:** Adding PostHog analytics alongside Sentry causes hydration mismatches that surface as console errors in production and can break interactive islands in the App Router.

**Why it happens:** PostHog's `init()` injects a `<script>` tag for remote config loading. This script tag is present server-side but its contents differ from what the client hydrates, triggering React 18's strict hydration diffing. The error is reported as "Prop `dangerouslySetInnerHTML` did not match" or attribute mismatches. Sentry 8.x + PostHog together amplify this because both modify the global error handling chain.

**Consequences:** Hydration errors cause entire subtrees to re-render client-side, degrading performance. In the worst case, interactive components (pick buttons, bid inputs) fail to attach event handlers.

**Prevention:**
- Use `disable_external_dependency_loading: true` in PostHog init until PostHog fixes this (accepted tradeoff: disables PostHog surveys)
- Initialize PostHog in `instrumentation-client.ts` (Next.js 15.3+) rather than in a Client Component to avoid the script injection during render
- Initialize Sentry and PostHog in separate files; do not chain them during the same initialization sequence
- Test hydration in production build (`npm run build && npm start`) before deploying — hydration errors only appear in production mode

**Detection:** Browser console shows "Hydration failed" or "attribute mismatch" errors; React DevTools highlights hydrated-but-mismatched components.

---

### Pitfall 5: OG/Social Metadata Missing, Killing Discord/Reddit Link Previews

**What goes wrong:** The VGC community shares draftpokemon.com on Discord and Reddit. Links show no preview, no image, no description — just a bare URL. This is the first impression for hundreds of potential users.

**Why it happens:** Next.js App Router requires `generateMetadata()` to be exported from Server Components. Dynamic routes (`/draft/[id]`) need per-page metadata with real data. Social crawlers (Discord, Twitter) do not execute JavaScript — they only read server-rendered HTML. If metadata is missing or relative URLs are used for OG images, crawlers see nothing.

**Consequences:** Launch posts on r/pokemonvgc and the Smogon Discord generate no engagement because link previews are blank. The platform looks unprofessional at the worst possible moment.

**Prevention:**
- Add `generateMetadata()` to every public-facing route: `/`, `/create-draft`, `/join-draft`, `/draft/[id]`
- Use absolute URLs for OG images (include `process.env.NEXT_PUBLIC_BASE_URL` prefix)
- Create a 1200x630px static OG image for the landing page specifically (the most shared URL)
- Validate with [opengraph.xyz](https://www.opengraph.xyz) and Discord's embed checker before launch

**Detection:** Paste draftpokemon.com into Discord and observe blank preview; check `<meta property="og:image">` in page source.

---

## Moderate Pitfalls

---

### Pitfall 6: Feedback Widget Delays Draft Picks Due to Bundle Weight

**What goes wrong:** Adding a third-party feedback SDK (Sentry User Feedback, Canny, etc.) adds 80-150KB to the main bundle, slowing the draft page's initial interactive time.

**Why it happens:** Feedback widgets are often imported eagerly because they need to "always be ready." The draft room already has a large JS payload (Supabase ~80KB, Radix UI ~40KB, Framer Motion ~30KB). Adding a feedback SDK on top without code-splitting pushes the draft page over the 200KB gzipped threshold that degrades mobile performance.

**Prevention:**
- Use dynamic import with `next/dynamic` and `ssr: false` for any feedback widget
- Load the widget only after the draft room has reached "active" state — not during the initial join/setup phase
- Consider a simple custom feedback form (textarea + Discord webhook, which the codebase already uses in `/feedback`) rather than a third-party SDK — the existing infrastructure handles this without additional bundle cost
- The existing Discord webhook feedback pattern is sufficient for beta; avoid SDK addition unless there is a specific gap

**Detection:** Lighthouse performance score drops after adding the widget; `npm run build` shows increased chunk sizes for draft routes.

---

### Pitfall 7: Mobile Bottom Sheet Scroll Conflict on iOS Safari

**What goes wrong:** The Pokemon selection bottom sheet on mobile allows scrolling the Pokemon list, but on iOS Safari, swipe-to-dismiss the sheet competes with scroll-within-sheet, making it nearly impossible to use on iPhone.

**Why it happens:** iOS Safari has a long-standing bug where `overflow: scroll` inside a fixed/modal element conflicts with gesture recognizers. React Spring Bottom Sheet and similar libraries have open issues for this. The problem manifests specifically on real devices — desktop Chrome's device emulator does not reproduce it.

**Consequences:** The mobile draft experience is unusable for iPhone users, which is the primary device for the VGC community at tournaments. This is the feature most visible during beta and will generate the most negative feedback.

**Prevention:**
- Test on a real iPhone (not emulator) before shipping
- Use `overscroll-behavior: contain` on the inner scroll container
- Add `touch-action: pan-y` to the inner scrollable element and ensure the drag handle has `touch-action: none`
- Shadcn/UI's Sheet/Drawer component (Vaul) has better iOS handling than custom implementations — prefer it over rolling a custom bottom sheet
- Add `env(safe-area-inset-bottom)` padding to avoid content hiding behind the iPhone home indicator

**Detection:** Test `draftpokemon.com/draft/[id]` on a real iPhone Safari session during the mobile redesign phase.

---

### Pitfall 8: PokePaste Parser Fails on Edge-Case Team Formats

**What goes wrong:** PokePaste import works for standard teams but breaks on common real-world variations: nicknamed Pokemon, custom EV spreads with no label, teams with trailing newlines, or the `(M)` / `(F)` gender notation.

**Why it happens:** PokePaste format has no formal specification — it is implicitly defined by Pokemon Showdown's export behavior. But real pastes from VGC players include handwritten variations. The format is whitespace-sensitive and line-order-sensitive. A parser written against the happy path will silently drop Pokemon or throw cryptic errors on edge cases.

**Consequences:** VGC players paste their team, get a garbled import or silent failure, and immediately distrust the platform. This is high-visibility during beta since PokePaste interop is a key differentiator claim.

**Prevention:**
- Reference the canonical PokePaste syntax at [pokepast.es/syntax.html](https://pokepast.es/syntax.html)
- Test against at least 10 real pastes from Smogon's RMT section and the VGC Discord team-dump channels before launch
- Handle: nickname (Species), gender notations (M)/(F), Ability with alternate spellings, missing EV line (treat as 0), missing Nature line, trailing blank lines, Windows-style CRLF line endings
- Export: validate that exported PokePaste re-imports cleanly into Showdown before shipping
- Consider using `@pkmn/sets` library which already handles Showdown set parsing correctly rather than writing a custom parser

**Detection:** Test with pastes from [paste.victoryroad.pro](https://paste.victoryroad.pro) — the primary VGC team-sharing site.

---

### Pitfall 9: Onboarding Tour Breaks During Live Draft State Transitions

**What goes wrong:** The product tour starts on the landing page, but if a user triggers it mid-draft (or lands in a draft room via a shared link), tooltip anchors point to elements that are conditionally rendered, creating broken highlight positions or JS errors.

**Why it happens:** Tour libraries (Shepherd.js, react-joyride) anchor to DOM elements by selector. The draft room renders conditionally based on draft status (`setup`, `active`, `completed`). If the element the tour tries to highlight doesn't exist at that moment — because the draft is in `active` state and the "Start Draft" button has been replaced — the library either throws or shows a mispositioned tooltip.

**Prevention:**
- Scope the full tour to the landing page and `create-draft` flow only — do not attempt to tour the live draft room
- For the draft room, use contextual tooltips on first encounter (e.g., tooltip on first hover over Pokemon card) rather than a guided tour
- Add existence checks before each tour step: skip the step if the anchor element is not in the DOM
- Test the tour with a user who joins via a direct draft link (bypasses the landing page entirely)

**Detection:** Open a tour in a browser, then trigger a draft state change mid-tour and observe tooltip positions.

---

### Pitfall 10: DNS Propagation and Clerk Domain Mismatch at Launch

**What goes wrong:** You configure draftpokemon.com in Vercel, point DNS to Vercel's servers, and immediately try to test auth — but DNS hasn't propagated yet, so Clerk's production domain check fails intermittently based on which DNS server the request hits.

**Why it happens:** DNS TTL for Clerk's domain validation and OAuth redirect URL checks can take up to 48 hours to fully propagate globally. During propagation, some users reach the correct deployment while others are still hitting the old DNS record or get SSL certificate errors.

**Prevention:**
- Configure DNS at least 48 hours before planned launch announcement
- Lower TTL to 300 seconds 24 hours before pointing to Vercel, then reduce to 60 seconds at cutover
- Use `dig draftpokemon.com` and multiple DNS checkers to confirm propagation before announcing
- Test auth flow from a mobile device on cellular (different DNS resolver than your home router)

**Detection:** Auth works from your machine but fails from another location; Clerk dashboard shows domain validation errors.

---

## Minor Pitfalls

---

### Pitfall 11: Supabase Free Tier Pauses After 1 Week of Inactivity Pre-Launch

**What goes wrong:** You build and test locally for a week, push to production, then don't touch the Supabase project for 7+ days before launch. Supabase Free tier pauses inactive projects after 7 days. First user to try the app gets a blank screen.

**Prevention:** Keep the Supabase project active during the pre-launch period by enabling the "Pause protection" option, or upgrade to Pro before launch. Set up a simple health check cron job (Vercel Cron or GitHub Actions) that pings the Supabase API every 24 hours.

---

### Pitfall 12: Environment Variables Missing in Vercel Production Scope

**What goes wrong:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Clerk keys, and any analytics keys set in `.env.local` work locally but are not present in Vercel's Production environment.

**Prevention:** Explicitly add each variable to Vercel → Settings → Environment Variables for the Production scope (not just Preview or Development). Variables in `.env.local` are never deployed. After adding variables, redeploy — existing deployments do not pick up variable changes.

---

### Pitfall 13: Vercel Build Timeout on Large Codebase

**What goes wrong:** At ~79K lines with 30+ routes and 414 tests, the Vercel build might approach or exceed the 45-minute build timeout, especially if `npm run build:formats` runs and fetches from PokeAPI during build.

**Prevention:** Separate the format build artifact from the CI build — commit the compiled format pack to the repo so Vercel does not need to re-run `build:formats` on every deploy. Add `scripts/build-format.ts` output to `.gitignore` exclusions carefully so the compiled artifact is tracked.

---

### Pitfall 14: Analytics Events Fire in Dev/Preview Environments

**What goes wrong:** PostHog or Sentry analytics capture events from your own development sessions and Vercel preview deployments, polluting production metrics before launch.

**Prevention:** Gate analytics initialization behind `process.env.NODE_ENV === 'production'` AND check for the production host (`window.location.hostname === 'draftpokemon.com'`). Use PostHog's environment-based project separation (separate write keys for dev and prod).

---

### Pitfall 15: React Strict Mode Double-Fires Supabase Subscriptions in Dev

**What goes wrong:** During mobile redesign testing in development, you notice Supabase events fire twice. You "fix" this by removing cleanup functions, then discover in production that subscriptions leak and accumulate.

**Why it happens:** React 18 Strict Mode intentionally mounts, unmounts, and remounts components in development to surface cleanup bugs. Supabase subscription setup + teardown must be idempotent. This is not a bug — it is the correct behavior surfacing missing cleanup.

**Prevention:** Never remove cleanup functions from `useEffect` to stop double-fires in dev. Instead, ensure every `.subscribe()` call has a matching `.unsubscribe()` in the cleanup function. The double-fire disappears in production (Strict Mode is dev-only).

---

## Technical Debt Patterns

Patterns in the existing codebase that will create friction during beta feature additions.

### Pattern 1: Feedback Already Partially Implemented

The codebase has a `/feedback` page using Discord webhooks. Adding another feedback widget will create two parallel feedback mechanisms that confuse users. During the feedback widget phase, audit what the existing `/feedback` page does and decide whether to extend it (lower risk) rather than add a third-party SDK (higher risk, bundle cost).

### Pattern 2: Draft Page Size Still High After Refactor

The draft page was split from 2372 to 1250 lines in Milestone 2. Adding mobile-first redesign (bottom sheets, responsive layouts) to this component risks re-inflating it. Establish a line budget before starting mobile work: if a component exceeds 300 lines during mobile changes, split it.

### Pattern 3: useConnectionManager Opens Many Channels

Before adding analytics that track "user is connected / disconnected," audit the exact channel count per participant. This count directly impacts the Supabase Realtime connection budget. Addressing this before going public prevents silent breakage under load.

---

## Integration Gotchas

Issues that arise specifically from combining these features with the existing system.

### Analytics + Real-Time: Double Event Firing

Supabase Realtime broadcasts events to all subscribers, including the sender. If PostHog tracks "pick made" events from both the Supabase subscription callback AND the UI action handler, each pick generates two analytics events. Instrument only at the UI action layer (user intent), not at the subscription layer (network echo).

### Clerk + Supabase RLS: JWT Claim Mismatch

Clerk issues JWTs with a `sub` claim formatted as Clerk user IDs (`user_abc123`). Supabase RLS policies written for Supabase Auth expect `auth.uid()` to return a UUID. If RLS policies were written for Supabase Auth and then auth was migrated to Clerk, there may be JWT template configuration needed in Clerk to emit claims that match Supabase's expectations. Verify RLS policies work with Clerk-issued JWTs before public launch. See `FIX-RLS-POLICIES.md` in the codebase.

### PokePaste Export + Draft State: Cost Data Exposure

PokePaste format does not have a cost field. When exporting, the team's budget costs are implicitly discarded. This is the correct behavior. However, ensure the export function does not accidentally include cost data in a comment or custom field that leaks draft balance information to opponents in a league context.

### Mobile Redesign + PWA: Viewport Height on iOS

The PWA "standalone" mode on iOS has a different viewport height than Safari browser mode — the bottom bar is hidden but `100vh` still includes that space on some iOS versions. Use `dvh` (dynamic viewport height) instead of `vh` for full-screen draft room layouts, or the bottom of the screen will be clipped under the home indicator.

### Onboarding + Clerk: Unauthenticated Tour Flow

If the landing page onboarding tour includes a step like "create your first draft," clicking it may redirect to Clerk's sign-in page mid-tour, breaking the tour state. Either gate the tour to post-authentication, or design tour steps that do not require authentication to complete.

---

## Performance Traps

### Trap 1: Analytics in the Critical Rendering Path

PostHog's page view tracking and Sentry's session replay both add initialization cost to page load. Defer both until after the page is interactive: use `requestIdleCallback` or initialize inside a `useEffect` with no dependencies.

### Trap 2: Mobile Redesign Forces CSS Recalculation

Adding responsive breakpoints to components that use inline styles or Framer Motion's `style` prop forces layout recalculation on every resize. Use Tailwind's responsive prefixes (`sm:`, `md:`) over inline style objects for layout-critical elements.

### Trap 3: PokePaste Parse on Main Thread

A large paste (6 Pokemon with full EV/IV spreads, moves, items) can take 50-100ms to parse with regex. While small, this runs on the main thread and causes a visible input lag if done synchronously on paste. Move the parser to a Web Worker or at minimum defer with `setTimeout(parse, 0)`.

---

## Security Mistakes

### Mistake 1: Feedback Submissions Without Rate Limiting

Beta feedback forms get spam-submitted (bots, repeated accidental clicks). The existing Discord webhook approach has no rate limiting. Add a Vercel Edge middleware rate limiter on the feedback API route before launch, or at minimum debounce the submit button for 30 seconds post-submission.

### Mistake 2: Draft Room URLs Indexed by Search Engines

Draft room URLs (`/draft/[id]`) should not be indexed. Active draft state is semi-private (join by room code). Add `noindex` meta tags to draft and spectate routes, and ensure `robots.txt` excludes `/draft/*` and `/spectate/*`. Only the landing page, join page, and results pages should be indexed.

### Mistake 3: Analytics Capturing PII During Auth Flow

PostHog's session replay or event capture may record email addresses, usernames, or Clerk user IDs as part of form interactions. Configure PostHog's `mask_all_inputs: true` for auth-adjacent pages, or use PostHog's consent-based initialization.

---

## UX Pitfalls

### Pitfall: Onboarding Blocks Returning Users

A tour that auto-starts on every visit penalizes returning users. Store a `hasSeenOnboarding` flag in localStorage and only show the tour once. Provide a "Replay tutorial" option in the profile/settings menu.

### Pitfall: Mobile Draft Missing Keyboard Dismiss

When a user taps a search field in the Pokemon picker on mobile, the virtual keyboard opens and the draft UI is obscured. The keyboard does not dismiss when the user taps outside the input. Add `inputMode="search"` to the search field and handle `blur` on backdrop tap.

### Pitfall: Feedback Widget Visible During Draft Turns

A floating feedback button that overlaps the pick confirmation area on mobile will receive accidental taps. Position the feedback trigger in the header/menu rather than as a floating action button, especially on the draft page.

### Pitfall: "60-Second First Draft" Template Assumption

The draft template onboarding assumes users want a quick solo test. In reality, VGC players draft in groups and will share the room code with friends immediately. The "60-second first draft" needs to handle the multi-player path gracefully, not just the solo path.

---

## "Looks Done But Isn't" Checklist

Items that appear complete in development but have launch-blocking gaps.

- [ ] Clerk production keys set in Vercel → Production scope (not Preview)
- [ ] OAuth callback URLs (Discord, Google) registered against Clerk production instance for draftpokemon.com
- [ ] Supabase project on paid plan OR connection count audited and confirmed under free tier limit
- [ ] Service worker update flow tested: build → deploy → load → build again → verify new version activates
- [ ] OG/Twitter meta tags present on every public route with absolute image URLs
- [ ] Social link preview validated in Discord embed tester before any community post
- [ ] PokePaste import tested with 10+ real-world pastes from VGC community sources
- [ ] PokePaste export tested by re-importing result into Pokemon Showdown
- [ ] Mobile bottom sheet tested on real iPhone (not emulator) — specifically scroll-within-sheet
- [ ] Draft page interactive on 375px viewport without horizontal scroll
- [ ] Analytics events gated to production hostname only
- [ ] Analytics NOT instrumenting Supabase subscription callbacks (only UI action layer)
- [ ] Feedback form rate-limited to prevent spam
- [ ] Draft room URLs excluded from robots.txt and marked noindex
- [ ] DNS configured 48+ hours before launch announcement
- [ ] Vercel environment variables present in Production scope and deployment triggered after adding them
- [ ] Supabase project not at risk of free-tier pause (last activity < 7 days)
- [ ] PWA viewport uses `dvh` not `vh` for full-screen layouts

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Mobile redesign | iOS Safari scroll conflict in Pokemon picker bottom sheet | Test on real device before PR merge; use Vaul drawer component |
| Mobile redesign | `100vh` clipped under iPhone home indicator in PWA | Use `dvh` units for full-screen containers |
| Onboarding flow | Tour anchors break during live draft state transitions | Scope tour to pre-draft flows only; use contextual tooltips in draft room |
| Onboarding flow | Tour re-shows on every visit | Store `hasSeenOnboarding` in localStorage on first completion |
| PokePaste import | Silent failure on real-world paste edge cases | Test with 10+ real pastes; handle nicknames, gender, CRLF, missing fields |
| PokePaste export | Re-import into Showdown fails | Validate export → import round-trip in Showdown before shipping |
| Analytics setup | PostHog + Sentry hydration error | Use `disable_external_dependency_loading: true` or instrumentation-client.ts init |
| Analytics setup | Events firing in development and preview | Gate on `NODE_ENV === 'production'` AND hostname check |
| Feedback widget | Third-party SDK adds bundle weight to draft page | Use dynamic import or extend existing Discord webhook feedback page |
| Deployment | Clerk dev keys in production | Use pk_live_* / sk_live_* in Vercel Production scope |
| Deployment | Supabase Realtime limits hit under beta load | Audit channel count; upgrade to Pro before launch |
| Deployment | PWA serves stale build post-deploy | Implement skipWaiting + UI update notification |
| Deployment | DNS propagation lag breaks auth at launch | Configure DNS 48h early; test from multiple locations |
| Landing page | OG images missing for Discord/Reddit sharing | Add static 1200x630 OG image and generateMetadata to all public routes |

---

## Sources

- Clerk production deployment: [Clerk Docs — Deploy to Production](https://clerk.com/docs/guides/development/deployment/production), [Deploying Clerk to Vercel](https://clerk.com/docs/guides/development/deployment/vercel) — HIGH confidence
- Supabase Realtime limits: [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits), [Concurrent Peak Connections Quota](https://supabase.com/docs/guides/troubleshooting/realtime-concurrent-peak-connections-quota-jdDqcp) — HIGH confidence
- Supabase Realtime TIMED_OUT: [Realtime TIMED_OUT Troubleshooting](https://supabase.com/docs/guides/troubleshooting/realtime-connections-timed_out-status), [WebSocket Connection Error](https://drdroid.io/stack-diagnosis/supabase-realtime-websocket-connection-error) — HIGH confidence
- PostHog + Sentry hydration error: [PostHog/posthog-js Issue #1645](https://github.com/PostHog/posthog-js/issues/1645), [Next.js App Router Analytics](https://posthog.com/tutorials/nextjs-app-directory-analytics) — HIGH confidence
- Next.js 15 OG/metadata pitfalls: [Next.js Metadata API](https://nextjs.org/docs/app/getting-started/metadata-and-og-images), [Next.js 15 SEO Checklist](https://dev.to/vrushikvisavadiya/nextjs-15-seo-checklist-for-developers-in-2025-with-code-examples-57i1) — HIGH confidence
- iOS Safari bottom sheet scroll: [Web Platform Interop Issue #788](https://github.com/web-platform-tests/interop/issues/788), [react-spring-bottom-sheet iOS issue](https://github.com/stipsan/react-spring-bottom-sheet/issues/68) — MEDIUM confidence
- Vercel PWA/service worker caching: [next.js Discussion #32402](https://github.com/vercel/next.js/discussions/32402), [next-pwa docs](https://ducanh-next-pwa.vercel.app/docs/next-pwa/configuring) — MEDIUM confidence
- PokePaste syntax: [pokepast.es/syntax.html](https://pokepast.es/syntax.html), [Showdown issue #8385](https://github.com/smogon/pokemon-showdown/issues/8385) — MEDIUM confidence
- Vercel deployment mistakes: [Vercel Production Checklist](https://vercel.com/docs/production-checklist), [Vercel Deployment Errors Guide](https://32blog.com/en/nextjs/vercel-deployment-errors-fix) — HIGH confidence
- Onboarding overlay pitfalls: [NN/G Onboarding Tutorials](https://www.nngroup.com/articles/onboarding-tutorials/), [Reteno Onboarding Analysis](https://reteno.com/blog/won-in-60-seconds-how-top-apps-nail-onboarding-to-drive-subscriptions) — MEDIUM confidence
