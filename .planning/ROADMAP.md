# ROADMAP.md — Milestone 4: Beta Launch — draftpokemon.com

**Milestone:** Beta Launch — draftpokemon.com
**Phases:** 4 (Phases 19–22, continuing from Milestone 3)
**Coverage:** 23/23 requirements mapped

---

## Phases

- [ ] **Phase 19: Deployment Foundation** — draftpokemon.com live with working auth and correct security headers
- [ ] **Phase 20: Observability & Feedback** — Error monitoring, analytics, and in-app feedback active from day one
- [ ] **Phase 21: Core Beta Features** — Mobile draft room, templates, and PokePaste interop shipped
- [ ] **Phase 22: Launch Polish** — Landing page, OG metadata, and onboarding tour ready for community announcement

---

## Phase Details

### Phase 19: Deployment Foundation
**Goal**: draftpokemon.com is live with Clerk auth working, SSL active, and CSP headers correct so no auth breakage occurs in production
**Depends on**: Nothing (first phase of this milestone)
**Requirements**: DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. Visiting draftpokemon.com loads the app over HTTPS without certificate errors
  2. A user can sign in with Discord or Google on draftpokemon.com without CSP console errors
  3. Clerk OAuth callbacks are registered against draftpokemon.com (not vercel.app or localhost)
  4. DNS has propagated and draftpokemon.com resolves consistently worldwide
**Plans**: TBD

### Phase 20: Observability & Feedback
**Goal**: Beta testing is fully instrumented — runtime errors are captured in Sentry, user flows are tracked in PostHog, and testers can submit feedback from any page
**Depends on**: Phase 19 (production URL required for Sentry DSN and PostHog host gating)
**Requirements**: DEPLOY-03, DEPLOY-04, LAND-04
**Success Criteria** (what must be TRUE):
  1. A deliberate JS error in production appears in the Sentry dashboard within 60 seconds
  2. PostHog records page views, draft creation events, and pick events in the live dashboard
  3. A floating feedback button is visible on every page and submitting it delivers a message to the Discord webhook channel
  4. Analytics events are gated to production (no noise from localhost or preview deployments)
**Plans**: TBD

### Phase 21: Core Beta Features
**Goal**: VGC players can complete a full draft on mobile, create a draft in under 60 seconds using a template, and export their team to Pokemon Showdown via PokePaste
**Depends on**: Phase 20 (analytics must be wired to measure template and PokePaste funnel impact)
**Requirements**: MOBILE-01, MOBILE-02, MOBILE-03, MOBILE-04, MOBILE-05, ONBOARD-01, ONBOARD-02, ONBOARD-03, ONBOARD-04, PASTE-01, PASTE-02, PASTE-03, PASTE-04
**Success Criteria** (what must be TRUE):
  1. On a 375px screen (iPhone SE), a user completes a full snake draft from pick 1 to draft end without horizontal scroll or zoom
  2. The timer and current picker name are visible at all times while scrolling the Pokemon grid on mobile
  3. A new user selects the "Quick Draft" template, fills in team names, and starts a draft in under 60 seconds
  4. A user exports their draft results team to clipboard in PokePaste format and the paste imports correctly into Pokemon Showdown teambuilder
  5. The interactive tour on first draft room visit completes all 5 steps without confusing the user
**Plans**: TBD
**UI hint**: yes

### Phase 22: Launch Polish
**Goal**: The landing page communicates the platform's value to VGC players within 5 seconds and every public page shows a branded embed on Discord and Reddit
**Depends on**: Phase 21 (OG canonical URLs require stable production base URL; landing page copy should reflect what Phase 21 actually shipped)
**Requirements**: DEPLOY-05, LAND-01, LAND-02, LAND-03, LAND-05
**Success Criteria** (what must be TRUE):
  1. Sharing a draftpokemon.com link on Discord shows a branded card with title, description, and image — not a blank embed
  2. A competitive Pokemon player landing on the homepage from Reddit immediately understands this is a VGC draft platform without reading body text
  3. The "How it works" section explains Create → Draft → Play in three steps visible above the fold on desktop
  4. The hero CTA "Start a Draft" and "Join a Draft" are above the fold on both mobile and desktop
  5. Copy on the landing page uses VGC/draft league terminology without excluding singles format players
**Plans**: TBD
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 19. Deployment Foundation | 0/? | Not started | - |
| 20. Observability & Feedback | 0/? | Not started | - |
| 21. Core Beta Features | 0/? | Not started | - |
| 22. Launch Polish | 0/? | Not started | - |

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| DEPLOY-01 | Phase 19 |
| DEPLOY-02 | Phase 19 |
| DEPLOY-03 | Phase 20 |
| DEPLOY-04 | Phase 20 |
| LAND-04 | Phase 20 |
| MOBILE-01 | Phase 21 |
| MOBILE-02 | Phase 21 |
| MOBILE-03 | Phase 21 |
| MOBILE-04 | Phase 21 |
| MOBILE-05 | Phase 21 |
| ONBOARD-01 | Phase 21 |
| ONBOARD-02 | Phase 21 |
| ONBOARD-03 | Phase 21 |
| ONBOARD-04 | Phase 21 |
| PASTE-01 | Phase 21 |
| PASTE-02 | Phase 21 |
| PASTE-03 | Phase 21 |
| PASTE-04 | Phase 21 |
| DEPLOY-05 | Phase 22 |
| LAND-01 | Phase 22 |
| LAND-02 | Phase 22 |
| LAND-03 | Phase 22 |
| LAND-05 | Phase 22 |

**Coverage:** 23/23 requirements mapped. No orphans.

---

## Research Flags (Implementation Notes)

- **Phase 19**: CSP changes must only live in `next.config.ts`, not `vercel.json`. Switch Vercel Production environment variables to Clerk `pk_live_*`/`sk_live_*` keys. Re-register Discord + Google OAuth callbacks against draftpokemon.com. Configure DNS early — allow 48h propagation window.
- **Phase 20**: Initialize PostHog via `instrumentation-client.ts` (Next.js 15.3+) to avoid hydration errors. Initialize Sentry and PostHog in separate files. Gate both on `NODE_ENV === 'production'` AND hostname. Test hydration in production build mode (`npm run build && npm start`) — hydration errors are invisible in dev.
- **Phase 21 (Mobile)**: Must test on a physical iPhone Safari — iOS Safari scroll-within-sheet conflict is a real-device-only failure mode. Use Vaul drawer component (verify `npm ls vaul` first — shadcn Drawer may already include it). All interactive targets must be 44px minimum.
- **Phase 21 (PokePaste)**: Inspect existing `src/lib/pokepaste-parser.ts` before adding `@pkmn/sets`. Test export against 10+ real VGC pastes from paste.victoryroad.pro. Validate export → Showdown round-trip before marking PASTE-04 complete.
- **Phase 21 (Realtime)**: Audit Supabase channel count per draft participant before any public announcement. Free tier cap is ~200 concurrent connections. Upgrade to Supabase Pro if audit shows risk.
- **Phase 22**: OG images must use absolute URLs (not relative). Validate with Discord embed tester and opengraph.xyz before community posts.
