# Phase 22: Launch Polish - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the landing page for VGC community launch and add OG meta tags for social sharing. Requirements: DEPLOY-05 (OG meta tags), LAND-01 (VGC hero), LAND-02 (how it works), LAND-03 (VGC + singles messaging), LAND-05 (5-second value proposition).

</domain>

<decisions>
## Implementation Decisions

### Landing Page Messaging
- Target: VGC competitive Pokemon players arriving from Reddit/Twitter/Discord
- Primary messaging: "Draft leagues for competitive Pokemon" — speaks VGC but doesn't exclude singles
- Hero section with clear CTAs: "Start a Draft" and "Join a Draft" above the fold
- "How it works" 3-step section: Create → Draft → Play with CSS animation
- App positions as VGC draft league tool with room to expand

### OG Meta Tags
- Use Next.js 15 generateMetadata for all public routes
- Branded card with Pokemon Draft logo/description for social sharing
- Must work on Discord, Reddit, Twitter/X
- OG images must use absolute URLs (draftpokemon.com)
- Test with opengraph.xyz and Discord embed tester

### Claude's Discretion
- Specific hero visual design, color palette, layout
- CSS animation style for "How it works" section
- OG image design/content
- Exact copy for landing page sections

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `src/app/page.tsx` — Current landing page (needs redesign)
- `src/app/layout.tsx` — Root layout with existing metadata
- `src/app/sitemap.ts` — Existing sitemap
- `src/app/robots.txt/route.ts` or static file

### Integration Points
- Landing page is the `/` route
- Must work with existing SidebarLayout or use minimal nav for landing
- CTA buttons link to `/create-draft` and `/join-draft`

</code_context>

<specifics>
## Specific Ideas

- Domain: draftpokemon.com
- Must communicate value to a competitive Pokemon player within 5 seconds
- Social sharing links posted on r/VGC, Twitter/X, Discord servers

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
