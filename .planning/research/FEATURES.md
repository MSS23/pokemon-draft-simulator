# Feature Landscape: Pokemon Draft Beta Launch

**Domain:** Real-time competitive Pokemon draft platform — beta launch to VGC community
**Researched:** 2026-04-03
**Confidence:** MEDIUM-HIGH

---

## Context

This file covers the seven feature areas scoped for Milestone 4 (Beta Launch). The platform already
ships a complete draft room, league system, Clerk auth, PWA, and 30+ routes. The gap is launch
readiness: discoverability, trust, onboarding, ecosystem interop, and feedback channels.

---

## Table Stakes

Features users expect from any beta-era SaaS product. Missing these causes drop-off before users
reach the core draft experience.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| In-app feedback button | Every beta has one. Users need a low-friction way to report bugs; without it they leave silently | Low | Floating button + modal is the standard pattern; avoid popup surveys that interrupt draft flow |
| Bug reporting with context capture | Vague reports are useless for triage. Users expect screenshots and auto-capture of browser/device info | Medium | Sentry User Feedback widget covers this with zero custom build; Gleap/Userback are richer but add ~50KB |
| Landing page that explains the product | VGC players landing from a Reddit link have no idea what the site does. Without a clear hero + CTA they bounce | Medium | Must answer "what is this, who is it for, how do I start" above the fold |
| Mobile-functional draft room | The majority of VGC players coordinate via phone. A broken 375px experience loses them to Discord bots | High | Draft already works; the gap is bottom-sheet search, 44px touch targets, sticky timer header |
| No-registration quick start | Clerk auth is already there; but players forwarded a draft link must be able to join as guest without signup friction | Low | Guest flow already exists via `guest-{timestamp}` pattern — needs surfacing on join page |
| Error monitoring before public launch | Deploying to a custom domain without Sentry means flying blind in production | Low | Sentry is already in the env vars (SENTRY_DSN); needs wiring to Next.js 15 App Router |
| Open Graph meta tags | Every share on Discord/Twitter/Reddit needs a proper preview card with the platform name and screenshot | Low | sitemap.ts and robots.ts already exist; OG images need the `/og-image` route populated correctly |
| HTTPS + SSL on custom domain | draftpokemon.com requires valid SSL. Users will not trust a draft platform on an http:// URL | None | Vercel handles this automatically; just domain DNS setup |

---

## Differentiators

Features that set this beta apart from Discord bots and the two web competitors (DraftZone, DraftMon).
Not expected, but create word-of-mouth when experienced.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| PokePaste export from draft results | Every VGC player uses PokePaste to share teams and import to Showdown. Being the only draft tool with one-click export is a concrete advantage over Discord bots and DraftZone | Medium | Parser is well-specified; the `@smogon/sets` npm package handles format parsing. Export only (no import) is enough for beta |
| PokePaste import for team pasting | Allows coaches to paste an opponent's paste link for matchup prep inside the league page. Creates a reason to stay in the platform rather than switching to Showdown | Medium | Needs a Pokemon resolver (pokemonId from Showdown name) and partial data (items/moves are display-only) |
| Draft templates (Reg F/H, Smogon OU) | New commissioners spend 30 min configuring format rules. A "Start with VGC Regulation F" template reduces setup to under 2 minutes | Low-Medium | Templates are JSON configs the draft creation wizard reads from; 3-4 presets cover 80% of leagues |
| 60-second onboarding tour | Discord bots have zero onboarding. A contextual first-run overlay that shows how to create/join a draft removes the biggest barrier for new-to-platform players | Medium | Driver.js or Shepherd.js; must be skippable, triggered only on first visit, not on every login |
| VGC-specific landing page messaging | Generic "draft platform" copy does not resonate with competitive players. "Replace your Discord bot draft" with VGC-specific language (Regulation F, 11-slot, snake/auction) creates immediate recognition | Low | Copy + hero section redesign; no technical complexity |
| Mobile bottom-sheet Pokemon picker | Thumb-reachable search on mobile is the #1 UX gap versus a native app. Bottom sheet pattern allows browsing 1000+ Pokemon on a 375px screen without horizontal scroll | High | Requires refactoring the draft room Pokemon grid into a sheet component on mobile breakpoints |
| Vercel Analytics + Web Vitals visibility | Knowing which pages are slow and where users drop off before launch prevents embarrassing first impressions | Low | Vercel Analytics is a one-line import; free tier covers beta traffic |
| Social-ready draft recap image | After a draft completes, a shareable PNG of all picks is the single most likely thing to spread to VGC Twitter/Discord and bring in new users organically | High | Requires server-side image generation (Satori/sharp or a canvas route); the `/og-image` route is a start |

---

## Anti-Features

Features to explicitly NOT build for this beta.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Usage stats overlay during draft (@pkmn/smogon) | Real value, but adds complexity and a third-party dependency that can fail mid-draft. Wrong priority for beta. | Defer to post-beta (Milestone 3 already planned it) |
| Damage calculator during draft | Same as above — powerful, but belongs in matchup prep, not the beta launch scope | Defer to the full Gold Standard milestone |
| Broadcast / OBS mode | High effort, niche audience (streamers), zero user validation yet. | Defer to Milestone 5 post-beta based on user feedback |
| Sound and animation system | Pick sounds and confetti are polish. Wrong to build before learning if users can even complete a draft on mobile | Deferred from Milestone 3 — let beta feedback confirm demand |
| NPS or CSAT survey popups at login | 37% of users quit apps after being bombarded with feedback popups. Interrupting a draft with a survey destroys trust | Use passive feedback widget only; NPS can trigger after draft completion at most |
| Onboarding email drip | No CRM for beta. Clerk handles auth; adding Mailchimp/Resend for onboarding sequences is scope creep | Collect emails via waitlist/Discord; drip post-product-market-fit |
| Custom analytics dashboard in-app | Building internal analytics UI is building tools for yourself, not users | Use Vercel Analytics + Sentry; export to CSV if needed |
| PokePaste import into draft room (live) | Importing a paste and auto-picking from it during a live draft is a complex conflict resolution problem | PokePaste is export-first for beta; import is display-only for matchup prep |
| In-app Discord bot replacement announcement | Positioning against Discord bots aggressively could alienate the community moderators who run those bots | Let the product speak for itself; community will make the comparison |

---

## Feature Dependencies

```
Domain deployment (Vercel DNS)
  → SSL/HTTPS (auto, no action)
  → SEO meta tags + OG images (need base URL to finalize canonical)
  → Vercel Analytics (requires production URL)

Sentry error monitoring
  → Can wire now (DSN is in env vars)
  → No dependencies

Landing page redesign
  → VGC-specific messaging (independent)
  → Hero CTA routes to /create-draft or /join-draft (already exist)
  → Social proof section needs at least 2-3 beta testers for quotes
  → OG image route (/og-image) must work before launch for previews

Onboarding tour
  → Draft room must be stable on mobile (R2 from REQUIREMENTS.md) before overlaying a tour
  → Depends on draft templates existing (tour can highlight "use this template")
  → Skip/dismiss state stored in localStorage (no backend changes needed)

Draft templates
  → Depends on create-draft wizard (already exists)
  → Formats already defined in src/lib/formats.ts and data/formats/*.json
  → Only need to map 3-4 format configs to wizard presets

PokePaste export
  → Depends on draft results page (/draft/[id]/results — already exists)
  → Needs Pokemon Showdown name resolver (pokemonId → Showdown name; PokeAPI provides this)
  → No new DB schema needed; reads from existing picks table

PokePaste import (display-only, matchup prep)
  → Depends on league matchup page (already exists)
  → Needs PokePaste text parser (pure string parsing, ~50 lines)
  → Depends on PokePaste export being done first (validates parser logic)

Mobile draft room redesign
  → Requires bottom-sheet component (Radix Dialog or custom; Radix already in stack)
  → Requires Pokemon grid to be layout-aware (mobile vs desktop render)
  → Must complete before onboarding tour (tour points at mobile UI)

In-app feedback widget
  → Sentry User Feedback: zero dependencies, just a script + @sentry/nextjs
  → Custom widget: depends on feedback page (/feedback already exists)
  → Both are independent of all other features

Social-ready draft recap image
  → Depends on /draft/[id]/results page (already exists)
  → Requires Satori (server-side SVG→PNG) or a canvas API route
  → High-value but not a launch blocker; can ship post-day-one
```

---

## MVP Recommendation

The minimum viable beta launch that gives VGC players a reason to switch from Discord bots:

**Must ship on day one:**
1. Domain + deployment (draftpokemon.com, SSL, Vercel Analytics)
2. Sentry error monitoring (wired, not just configured)
3. Landing page polish (VGC messaging, hero CTA, social proof placeholder)
4. OG meta tags (Discord + Twitter preview cards show correctly)
5. In-app feedback widget (Sentry User Feedback or custom — must exist before users arrive)
6. Draft templates (VGC Reg F, VGC Reg H, Smogon OU — reduces commissioner setup friction)
7. PokePaste export from draft results (the most-requested missing feature in the Discord bot community)

**Ship in first two weeks post-launch (based on feedback):**
8. Mobile draft room bottom-sheet (if mobile feedback confirms friction)
9. Onboarding tour (if drop-off data shows users confused at first run)
10. PokePaste import for matchup prep (if league users request it)
11. Social recap image generation (if word-of-mouth is the growth lever)

**Defer until post-beta validation:**
- Usage stats overlay, damage calculator, broadcast mode, sound/animation system

---

## Prioritization Matrix

| Feature | User Impact | Build Effort | Launch Blocker | Priority |
|---------|-------------|--------------|----------------|----------|
| Domain + Vercel deployment | Critical — without it, nothing | 1 day | YES | P0 |
| Sentry monitoring | Critical — blind in production otherwise | 0.5 day | YES | P0 |
| Landing page VGC messaging | High — first impression determines bounce rate | 1–2 days | YES | P0 |
| OG meta tags | High — all Discord/Reddit shares show preview cards | 0.5 day | YES | P0 |
| In-app feedback widget | High — beta without feedback collection is waste | 0.5–1 day | YES | P0 |
| Draft templates | High — reduces commissioner setup from 30min to 2min | 1–2 days | NO | P1 |
| PokePaste export | High — concrete advantage vs every competitor | 2–3 days | NO | P1 |
| Mobile bottom-sheet picker | High — mobile is majority of VGC audience | 3–5 days | NO | P1 |
| Vercel Analytics | Medium — visibility into user flows | 0.5 day | NO | P1 |
| Onboarding tour | Medium — reduces confusion for first-timers | 2–3 days | NO | P2 |
| PokePaste import (display) | Medium — useful for matchup prep | 1–2 days | NO | P2 |
| Social recap image | Medium — organic growth driver | 3–4 days | NO | P2 |

---

## Sources

- [Competitive Landscape Research](.planning/research/competitive-landscape.md) — Discord bot workflows, VGC community tools, PokePaste spec
- [Gleap In-App Feedback Widget Guide](https://www.gleap.io/blog/in-app-feedback-widgets-guide) — Widget UX patterns for beta
- [Userpilot: In-App Feedback Best Practices](https://userpilot.com/blog/in-app-feedback-guide/) — Trigger timing, non-interruption principles
- [Sentry User Feedback](https://github.com/getsentry/sentry/discussions/60134) — Built-in feedback in @sentry/nextjs
- [Smashing Magazine: Touch Target Sizes](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/) — 44px minimum, WCAG 2.1 AAA
- [SaaS Hero Section Best Practices](https://www.alfdesigngroup.com/post/saas-hero-section-best-practices) — Above-fold conversion patterns
- [Whatfix: Product Tour Best Practices 2025](https://whatfix.com/product-tour/) — Skippable, contextual, progressive disclosure
- [Next.js 15 SEO Checklist 2025](https://dev.to/vrushikvisavadiya/nextjs-15-seo-checklist-for-developers-in-2025-with-code-examples-57i1) — OG tags, sitemap, canonical
- [Vercel SEO Playbook](https://vercel.com/blog/nextjs-seo-playbook) — App Router metadata API
- [PokePaste Syntax Spec](https://pokepast.es/syntax.html) — Team sharing format
- [Victory Road VGC](https://victoryroad.pro/) — Active VGC community hub confirming audience size
- [Sleeper Fantasy App](https://sleeper.com/fantasy-football) — Mobile-first draft UX benchmark
- [Smogon Draft League Advertisement Thread](https://www.smogon.com/forums/threads/draft-league-advertisement-thread.3710830/) — Community onboarding patterns
