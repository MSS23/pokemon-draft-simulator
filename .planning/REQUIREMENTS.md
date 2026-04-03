# REQUIREMENTS.md — Milestone 4: Beta Launch — draftpokemon.com

## Milestone Goal
Ship a polished, mobile-friendly beta to the VGC community at draftpokemon.com with error monitoring, analytics, onboarding, PokePaste interop, and a feedback loop via Discord — ready for competitive Pokemon players to test and provide feedback.

## Success Criteria
- draftpokemon.com is live with working auth, real-time drafting, and error monitoring
- VGC players can complete a full draft on mobile phones without issues
- New users create their first draft in <60 seconds using templates
- Teams can be exported to PokePaste format for use in Pokemon Showdown
- Landing page communicates value to competitive players within 5 seconds
- Beta feedback flows to Discord for rapid iteration

---

## DEPLOY: Production Deployment & Infrastructure
**Priority:** P0 (Blocker)
**Why:** Nothing else can be validated without a working production deployment. CSP/auth breaks are silent killers.

### Requirements:
- [ ] **DEPLOY-01**: Site deployed to draftpokemon.com via Vercel with SSL
- [ ] **DEPLOY-02**: CSP headers include Clerk CDN domains so auth works in production
- [x] **DEPLOY-03**: Sentry error monitoring configured with `@sentry/nextjs` (client + server error capture)
- [x] **DEPLOY-04**: PostHog analytics wired to track draft creation funnel, page views, and key user actions
- [ ] **DEPLOY-05**: OG meta tags on all public routes (landing, create-draft, join-draft, results) with Pokemon Draft branding for social sharing

### Acceptance:
- Auth (Discord/Google/Twitch) works on draftpokemon.com without CSP errors
- Sentry captures and reports JS runtime errors from production
- PostHog records page views, draft creation events, and user actions
- Sharing a draftpokemon.com link on Discord/Reddit/Twitter shows a branded card

---

## MOBILE: Mobile Draft Room Activation
**Priority:** P0 (Critical)
**Why:** Most VGC players coordinate on phones. MobileDraftView exists but is unwired — this is the highest-impact integration work.

### Requirements:
- [ ] **MOBILE-01**: MobileDraftView activated for screens <768px via useMediaQuery hook
- [ ] **MOBILE-02**: Sticky header with timer + current picker always visible on mobile
- [ ] **MOBILE-03**: Bottom sheet pattern for Pokemon search/filter (thumb-reachable)
- [ ] **MOBILE-04**: All touch targets 44px+ minimum (WCAG compliant)
- [ ] **MOBILE-05**: Full draft completable on 375px screens (iPhone SE) without horizontal scroll

### Acceptance:
- Complete a full snake draft on an iPhone 13 without zoom/scroll issues
- Timer and current picker visible at all times during scroll
- All interactive elements are thumb-reachable
- No horizontal scroll on any mobile view

---

## ONBOARD: Onboarding & Draft Templates
**Priority:** P1 (High)
**Why:** New users bounce if they don't understand how to start. Templates and tours lower the barrier for VGC players discovering the platform.

### Requirements:
- [ ] **ONBOARD-01**: Draft templates: "Quick Draft" (4 players, 6 Pokemon, 30s), "League Season" (8 players, 11 Pokemon, 90s), "Showmatch" (2 players, 6 Pokemon, 60s), "Custom" (current create flow)
- [ ] **ONBOARD-02**: Interactive 5-step tour on first draft room visit (timer, grid, search/filter, team roster, wishlist)
- [ ] **ONBOARD-03**: Format explainer tooltips on format names in create wizard (e.g., "Regulation H — bans all legendaries, mythicals, paradox Pokemon")
- [ ] **ONBOARD-04**: Draft type comparison cards on create page (Snake vs Auction — pros, cons, "Recommended for beginners" badge)

### Acceptance:
- New user creates a draft in <60 seconds using a template
- Tour completes in 5 steps without confusion
- Format tooltips explain terms without requiring competitive Pokemon knowledge

---

## PASTE: PokePaste Import/Export
**Priority:** P1 (High)
**Why:** PokePaste is the universal format for competitive Pokemon. Without it, teams can't move between this platform and Pokemon Showdown — the #1 differentiator vs all competitors.

### Requirements:
- [ ] **PASTE-01**: Export any team roster as PokePaste format (copy to clipboard + .txt download)
- [ ] **PASTE-02**: Export button on draft results page (per team) and league team detail page
- [ ] **PASTE-03**: Import PokePaste text to pre-populate team for matchup analysis
- [ ] **PASTE-04**: Exported PokePaste imports correctly into Pokemon Showdown (round-trip validated)

### Acceptance:
- Exported PokePaste imports correctly into Pokemon Showdown teambuilder
- Import handles common PokePaste syntax variants (with/without nickname, tera type)
- Export buttons accessible from draft results and league team pages

---

## LAND: Landing Page & Feedback
**Priority:** P1 (High)
**Why:** First impression for VGC community members arriving from Reddit/Twitter/Discord. The feedback loop via Discord enables rapid iteration during beta.

### Requirements:
- [ ] **LAND-01**: VGC-focused hero section with clear CTAs ("Start a Draft" / "Join a Draft")
- [ ] **LAND-02**: "How it works" 3-step section (Create → Draft → Play) with CSS animation
- [ ] **LAND-03**: Messaging positions app for VGC draft leagues with room to expand to singles formats
- [x] **LAND-04**: Floating feedback button on all pages that sends to Discord webhook
- [ ] **LAND-05**: Landing page communicates value proposition within 5 seconds

### Acceptance:
- Landing page immediately communicates "competitive Pokemon draft platform"
- CTAs are above the fold and lead to draft creation / join flow
- Feedback button accessible from every page, submissions arrive in Discord channel
- Copy mentions VGC/draft leagues without excluding singles players

---

## Non-Requirements (Deferred to Post-Beta)
- Sound/animation engine — ship based on user feedback
- Competitive data overlay (@pkmn/smogon usage stats) — post-beta feature
- Broadcast/spectator OBS mode — post-beta, for content creators
- Auction UX overhaul — post-beta, current UX functional
- Supabase Pro upgrade — monitor connection usage, upgrade when needed
- Social recap image generation (Satori) — growth feature for later
- Damage calculator (@smogon/calc) — post-beta

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| DEPLOY-01 | Phase 19 | Pending |
| DEPLOY-02 | Phase 19 | Pending |
| DEPLOY-03 | Phase 20 | Complete |
| DEPLOY-04 | Phase 20 | Complete |
| LAND-04 | Phase 20 | Complete |
| MOBILE-01 | Phase 21 | Pending |
| MOBILE-02 | Phase 21 | Pending |
| MOBILE-03 | Phase 21 | Pending |
| MOBILE-04 | Phase 21 | Pending |
| MOBILE-05 | Phase 21 | Pending |
| ONBOARD-01 | Phase 21 | Pending |
| ONBOARD-02 | Phase 21 | Pending |
| ONBOARD-03 | Phase 21 | Pending |
| ONBOARD-04 | Phase 21 | Pending |
| PASTE-01 | Phase 21 | Pending |
| PASTE-02 | Phase 21 | Pending |
| PASTE-03 | Phase 21 | Pending |
| PASTE-04 | Phase 21 | Pending |
| DEPLOY-05 | Phase 22 | Pending |
| LAND-01 | Phase 22 | Pending |
| LAND-02 | Phase 22 | Pending |
| LAND-03 | Phase 22 | Pending |
| LAND-05 | Phase 22 | Pending |
