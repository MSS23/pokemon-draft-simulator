# Requirements: Pokemon Draft — Milestone 6: Draft UX Overhaul

**Defined:** 2026-04-03
**Core Value:** The gold standard platform for Pokemon draft leagues — replacing Discord bots + Google Sheets with a single premium experience

## Milestone Goal

Restructure all drafting pages into a modern, intuitive experience with clear spatial hierarchy, dramatic turn-state shifts, and unified views for managers, participants, and spectators.

## Success Criteria

- Draft room uses a three-zone layout (pool/rosters/activity) with resizable panels on desktop
- "Your turn" state is visually unmistakable — panels dim, pick button pulses, audio cue plays
- Host controls are accessible in one tap via persistent command bar (not buried in collapsible panel)
- Spectators and participants share a single /draft/[id] URL that adapts by database-derived role
- League hub has 3 primary sections (Overview/Matches/Management) instead of 7+ tabs
- Draft page.tsx is reduced from 1,382 lines to a ~200-line thin coordinator

---

## v6 Requirements

### Draft Room Layout

- [ ] **LAYOUT-01**: User sees a three-zone desktop layout: Pokemon pool (left), team rosters (center), activity feed (right) with drag-to-resize dividers
- [ ] **LAYOUT-02**: User sees a persistent sticky header showing whose turn it is and time remaining at all scroll positions
- [ ] **LAYOUT-03**: User sees an always-visible activity feed in the main layout (desktop: right column) instead of a slide-in sidebar overlay
- [x] **LAYOUT-04**: Draft page.tsx is restructured from monolithic 1,382-line file into a thin coordinator (~200 lines) that wires hooks and passes props to named region components
- [ ] **LAYOUT-05**: User can drag the divider between Pokemon pool and team roster panels to resize them, with layout persisting across page reloads

### Turn State & Host Controls

- [x] **TURN-01**: User experiences a decisive visual shift when it's their turn — inactive panels dim, pick button pulses, and an audio cue plays
- [ ] **TURN-02**: Host sees a slim persistent command bar (pause/skip/ping/timer) always visible in the header area, without needing to expand a collapsible panel
- [ ] **TURN-03**: Host can access a command palette (Ctrl+K) for quick actions: pause draft, skip turn, adjust timer, undo last pick
- [x] **TURN-04**: Turn state transitions use compositor-only CSS animations (opacity + transform) without layout thrashing on mid-range devices

### Spectator & Unified View

- [ ] **SPEC-01**: Participant, spectator, and host all use a single /draft/[id] URL that adapts UI based on database-derived role (not URL parameter)
- [ ] **SPEC-02**: Existing /spectate/[id] URLs redirect (308) to /draft/[id] preserving all shared links in Discord/Reddit
- [ ] **SPEC-03**: Broadcast/OBS mode remains accessible at /spectate/[id]?mode=broadcast with minimal chrome dark-mode display

### Mobile Experience

- [ ] **MOBILE-01**: User sees a persistent bottom bar on mobile with search, team summary, and progress indicators
- [ ] **MOBILE-02**: Timer and current picker name are visible at all scroll positions on mobile via sticky header
- [ ] **MOBILE-03**: Mobile layout uses tab-based panel switching (Pokemon/Team/Board) with no horizontal scroll on 375px screens

### League Hub

- [ ] **LEAGUE-01**: User navigates the league hub via 3 primary sections: Overview, Matches, and Management
- [ ] **LEAGUE-02**: Overview section shows standings, current week matchup, recent activity, and announcements
- [ ] **LEAGUE-03**: Matches section shows schedule, results, matchup detail, and playoff bracket
- [ ] **LEAGUE-04**: Management section contains trades, waivers, free agents, power rankings, and commissioner tools
- [ ] **LEAGUE-05**: All existing league sub-routes remain functional with preserved URLs

### Post-Draft Continuity

- [ ] **POST-01**: User sees a clear CTA on the draft results page to navigate directly to the league hub
- [ ] **POST-02**: Draft results page links to league hub with the league auto-created on draft completion

---

## v7 Requirements (Deferred)

### Mobile Enhancement
- **MOBILE-04**: Continuous scroll mobile layout replacing tab navigation (HIGH complexity)

### Social & Sharing
- **SHARE-01**: Shareable draft recap OG image card for Discord/Reddit/Twitter
- **SHARE-02**: Embeddable draft recap widget for content creators

### Draft Features
- **DRAFT-01**: Soft timer option (no auto-advance when timer expires, Sleeper pattern)
- **DRAFT-02**: AI pick suggestions during draft (requires @pkmn/smogon integration)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Continuous scroll mobile (replacing tabs) | HIGH complexity, unproven pattern — no competitor has solved this; defer to v7 based on mobile usage data |
| OG image generation for draft recaps | Requires server-side image rendering infrastructure; defer to post-beta |
| AI pick suggestions | Deferred per PROJECT.md until post-beta; requires @pkmn/smogon integration |
| Tailwind v4 migration | Separate refactor project; not a UX overhaul task |
| Supabase Broadcast migration | Covered by Milestone 5 (Security Hardening); out of scope for UX overhaul |
| Sound engine / audio system | Beyond the single audio cue for turn notification; full sound design deferred to post-beta |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAYOUT-01 | Phase 30 | Pending |
| LAYOUT-02 | Phase 30 | Pending |
| LAYOUT-03 | Phase 29 | Pending |
| LAYOUT-04 | Phase 27 | Complete |
| LAYOUT-05 | Phase 30 | Pending |
| TURN-01 | Phase 27 | Complete |
| TURN-02 | Phase 28 | Pending |
| TURN-03 | Phase 28 | Pending |
| TURN-04 | Phase 27 | Complete |
| SPEC-01 | Phase 31 | Pending |
| SPEC-02 | Phase 31 | Pending |
| SPEC-03 | Phase 31 | Pending |
| MOBILE-01 | Phase 32 | Pending |
| MOBILE-02 | Phase 32 | Pending |
| MOBILE-03 | Phase 32 | Pending |
| LEAGUE-01 | Phase 33 | Pending |
| LEAGUE-02 | Phase 33 | Pending |
| LEAGUE-03 | Phase 33 | Pending |
| LEAGUE-04 | Phase 33 | Pending |
| LEAGUE-05 | Phase 33 | Pending |
| POST-01 | Phase 34 | Pending |
| POST-02 | Phase 34 | Pending |

**Coverage:**
- v6 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 — traceability filled after roadmap creation*
