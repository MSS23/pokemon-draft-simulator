# ROADMAP.md — Milestone 3: Gold Standard Draft Experience

**Milestone:** Gold Standard Draft Experience
**Timeline:** 2-week sprint
**Phases:** 8 (continuing from Milestone 2)
**Phase numbering:** Starts at Phase 11 (Milestones 1-2 were phases 1-10)

---

## Phase 11: Draft Room Sound & Animation Engine
**Goal:** Build the foundational animation and sound system that all subsequent phases depend on.
**Requirements:** R3.1, R3.2, R3.3, R3.7
**Estimated effort:** Medium

### Tasks:
1. Create `src/lib/draft-sounds.ts` — Sound manager with preloaded audio sprites (Web Audio API)
   - Sounds: pick-confirm, tick, rapid-tick, buzzer, celebration, bid-placed, nomination, your-turn
   - Use short audio sprites (100-500ms) embedded as base64 or fetched from /public/sounds/
   - Volume control via gain node, persisted to localStorage
   - Respects user's mute preference
2. Create `src/lib/draft-animations.ts` — Animation utilities using Framer Motion
   - `flyToPosition(from, to)` — sprite flies from grid to roster
   - `pulseElement(ref)` — attention-drawing pulse
   - `scaleReveal(ref)` — scale-up entrance
   - `confettiBurst()` — celebration particles (CSS-only, no library)
3. Add mute toggle button to draft room header (speaker icon, persisted)
4. Add `prefers-reduced-motion` check — disable animations, use instant transitions
5. Add sound preference to settings page

### Success criteria:
- [ ] Sound system plays reliably across Chrome/Safari/Firefox
- [ ] Animation utilities produce 60fps motion
- [ ] Mute toggle works and persists
- [ ] Reduced motion respected

### Dependencies: None (foundational)

---

## Phase 12: Pick Flow Polish — The Hero Moment
**Goal:** Make the pick confirmation feel like a premium, satisfying event.
**Requirements:** R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R1.8
**Estimated effort:** Large

### Tasks:
1. "On the Clock" banner — redesign top of draft room:
   - Large team name + avatar with pulsing glow when it's their turn
   - Timer countdown with color transitions (green → yellow → red)
   - "YOUR PICK" variant when it's the current user's turn
2. Timer audio integration:
   - Tick sound at 30s remaining
   - Rapid ticking at 10s
   - Buzzer on expiry
   - Hook into `useDraftTimers.ts`
3. Pick confirmation animation sequence:
   - User clicks "Confirm Pick" → pokemon sprite scales up with flash
   - Sprite flies from confirmation modal to team roster slot
   - Roster slot pulses to confirm arrival
   - Sound: pick-confirm plays
4. Other player pick notification:
   - Toast shows "[Team] picked [Pokemon]!" with sprite thumbnail
   - Brief highlight animation on the team's roster
5. Draft completion celebration:
   - CSS confetti burst on draft completion
   - Team showcase animation (each team's roster displayed in sequence)
   - Transition to results page after 5s

### Success criteria:
- [ ] Pick → animate → roster update feels like one fluid motion
- [ ] Timer creates visible urgency for all participants
- [ ] Draft completion feels celebratory
- [ ] All animations <200ms perceived latency

### Dependencies: Phase 11 (sound & animation engine)

---

## Phase 13: Mobile-First Draft Room Redesign
**Goal:** Make the draft room fully functional and comfortable on phones.
**Requirements:** R2.1-R2.8
**Estimated effort:** Large

### Tasks:
1. Responsive layout overhaul for draft room:
   - Mobile (<768px): single column, stacked sections
   - Tablet (768-1024px): 2-column with collapsible sidebar
   - Desktop (>1024px): current layout with improvements
2. Sticky mobile header:
   - Timer + current picker always visible (48px height)
   - Compact mode: team name + countdown only
3. Bottom sheet pattern for Pokemon selection:
   - Search bar at top (always visible)
   - Filter chips row (type, tier, availability)
   - Virtual grid below
   - Sheet drags up to full screen, down to half screen
4. Team roster as collapsible bottom tab:
   - Tab bar: "Pokemon" | "My Team" | "Draft Board"
   - My Team shows compact roster with budget remaining
5. Mobile pick confirmation:
   - Full-screen modal with large Pokemon image
   - "Confirm Pick" button at bottom (thumb zone)
   - Cost display and budget remaining
6. Touch targets audit:
   - All buttons ≥44px
   - Pokemon cards have adequate spacing
   - No accidental tap zones
7. Push notification for turn:
   - Integrate with existing push-notifications.ts
   - Send "Your turn to pick!" when turn changes to user's team

### Success criteria:
- [ ] Full draft completable on iPhone SE (375px)
- [ ] No horizontal scroll
- [ ] All touch targets ≥44px
- [ ] Timer visible during scroll

### Dependencies: Phase 12 (pick flow polish — animations must work on mobile)

---

## Phase 14: Auction Draft UX Overhaul
**Goal:** Redesign auction format to be intuitive and exciting.
**Requirements:** R4.1-R4.8
**Estimated effort:** Large

### Tasks:
1. Nomination flow redesign:
   - Clear "Your Turn to Nominate" state with search-to-nominate flow
   - Nomination queue showing upcoming nominators
   - Starting bid input with smart defaults (based on BST/tier)
2. Bidding interface redesign:
   - Current bid display: large number with bidder name
   - Quick-bid buttons: +1, +5, +10, Custom
   - "Match + 1" shortcut button
   - Max bid indicator (based on remaining budget)
   - Budget bars for all teams visible
3. Auction timer redesign:
   - Large, centered countdown (120px+ on desktop, 80px+ on mobile)
   - Color-coded: green → yellow → red
   - "Going once... Going twice... SOLD!" sequence on last 5 seconds
4. Bid history feed:
   - Real-time scrolling feed of bids
   - Bidder name + amount + timestamp
   - Highlight current winner
5. Auction completion animation:
   - "SOLD to [Team]!" banner with Pokemon sprite
   - Price tag animation showing final cost
   - Sound: auction-sold sound effect
6. Mobile auction layout:
   - Bid buttons in thumb zone
   - Timer always visible
   - Current Pokemon front-and-center

### Success criteria:
- [ ] New user understands auction flow within 30 seconds
- [ ] Bidding feels responsive and competitive
- [ ] Timer resolution is deterministic
- [ ] Mobile-friendly bidding

### Dependencies: Phase 11 (sounds), Phase 13 (mobile layout)

---

## Phase 15: Competitive Data Integration
**Goal:** Surface Smogon/VGC usage data during draft for informed picks.
**Requirements:** R5.1-R5.7
**Estimated effort:** Large

### Tasks:
1. Install `@pkmn/smogon` and create `src/lib/usage-stats-service.ts`:
   - Fetch usage stats by format from data.pkmn.cc
   - Cache with 24-hour TTL in IndexedDB
   - Progressive loading (draft room works without stats)
2. Pokemon card usage badge:
   - Show usage percentage on each card during draft (e.g., "35% OU")
   - Color-coded: high usage (red), medium (yellow), low (green)
   - Toggleable via settings
3. Pokemon detail modal — competitive data tab:
   - Common sets (moves, items, abilities, EVs)
   - Top teammates
   - Checks and counters
   - Usage trend (rising/falling)
4. Team type coverage overlay:
   - Show team's offensive + defensive type coverage as you draft
   - Highlight gaps: "Your team has no answer to Ground-type"
   - Update in real-time as picks are made
5. "Meta Picks Available" section:
   - Show top undrafted Pokemon by usage rate
   - Filtered to current format
   - Collapses to not clutter the draft room
6. Install `@smogon/calc` and create `src/lib/damage-calc-service.ts`:
   - Wrap @smogon/calc for use in matchup pages
   - Quick calc: "How much does X's Move do to Y?"
   - Results in percentage with OHKO/2HKO/3HKO annotation

### Success criteria:
- [ ] Usage stats visible on Pokemon cards during draft
- [ ] Type coverage updates in real-time as team grows
- [ ] Damage calc matches Showdown's calculator output
- [ ] Draft room loads in <3s even if stats are slow

### Dependencies: None (can parallel with Phase 12-13)

---

## Phase 16: PokePaste Import/Export
**Goal:** Full interop with the Pokemon Showdown ecosystem.
**Requirements:** R6.1-R6.5
**Estimated effort:** Small

### Tasks:
1. Enhance existing `src/lib/pokepaste-parser.ts`:
   - Ensure bidirectional parsing (PokePaste ↔ internal format)
   - Support all Gen 9 syntax (Tera Type, etc.)
   - Handle nickname, gender, shiny, happiness
2. Export button on team roster:
   - "Export to Showdown" button on draft results page (per team)
   - "Export to Showdown" on league team detail page
   - Copies PokePaste to clipboard + offers .txt download
3. Import flow on matchup page:
   - "Import from Showdown" text area
   - Parse and display team for analysis
   - Validate against current format
4. Export draft results:
   - All teams exportable in a single PokePaste document
   - Includes team name as comment header

### Success criteria:
- [ ] Exported PokePaste imports correctly into Pokemon Showdown
- [ ] Import handles all PokePaste syntax variants
- [ ] Available from draft results and league team pages

### Dependencies: None (independent)

---

## Phase 17: Broadcast Spectator Mode
**Goal:** Give content creators an OBS-ready spectator view for streaming drafts.
**Requirements:** R7.1-R7.6
**Estimated effort:** Medium

### Tasks:
1. Create `/spectate/[id]/broadcast/page.tsx`:
   - Full-screen, chrome-free layout (no header, no nav, no scrollbars)
   - Dark background (customizable via query param `?bg=hex`)
   - Real-time pick updates via existing Supabase subscription
2. Broadcast layout design:
   - Draft board grid (teams as columns, rounds as rows)
   - Current pick highlighted with animation
   - Team rosters building visually as picks happen
   - Large timer display
3. Styling for stream readability:
   - Larger sprites (96px+)
   - Bold, high-contrast text
   - Designed for 1920x1080 and 1280x720
   - No hover effects (OBS Browser Source doesn't hover)
4. Custom branding:
   - Query params: `?bg=1a1a2e&accent=e94560&teamColors=true`
   - Team name labels with configurable colors
5. Test as OBS Browser Source:
   - Verify rendering in OBS Browser Source
   - Verify real-time updates work
   - No audio (spectator view is silent, streamer adds their own)

### Success criteria:
- [ ] Renders correctly as OBS Browser Source at 1920x1080
- [ ] Readable at 720p stream quality
- [ ] Real-time pick updates visible within 1s
- [ ] No UI chrome visible

### Dependencies: Phase 12 (pick animations used in broadcast view)

---

## Phase 18: Onboarding & Draft Templates
**Goal:** Get new users from landing page to first draft in 60 seconds.
**Requirements:** R8.1-R8.5
**Estimated effort:** Medium

### Tasks:
1. Draft templates system:
   - Create `src/lib/draft-templates-presets.ts` with pre-configured drafts:
     - "Quick Draft (4 players)" — 6 Pokemon, 30s timer, budget scoring
     - "League Season (8 players)" — 11 Pokemon, 90s timer, tiered scoring, league creation
     - "Showmatch (2 players)" — 6 Pokemon, 60s timer, budget scoring
     - "Custom" — current create flow
   - Template selection as first step in create-draft wizard
2. Interactive draft room tour:
   - Use existing TourProvider (`src/components/tour/`)
   - 5-step tour: Timer area → Pokemon grid → Search/filter → Team roster → Wishlist
   - Triggers on first draft room visit (localStorage flag)
   - Skip button + "Don't show again"
3. Format explainer tooltips:
   - Hover/tap tooltips on format names: "Regulation H — VGC 2024 format. Bans all legendaries, mythicals, and paradox Pokemon."
   - Brief explanation of scoring systems in create wizard
4. Landing page "How it works" section:
   - 3-step visual: Create → Draft → Play
   - Short animated demo (CSS animation, not video)
5. Draft type comparison on create page:
   - Side-by-side cards: Snake vs Auction vs Tiered
   - Pros/cons for each
   - "Recommended for beginners" badge on Snake

### Success criteria:
- [ ] New user creates draft in <60s using template
- [ ] Tour completes in 5 steps without confusion
- [ ] Format tooltips explain terms without jargon
- [ ] Landing page communicates value in 5 seconds

### Dependencies: None (independent)

---

## Phase Dependency Graph

```
Phase 11 (Sound/Animation Engine)
  ├──→ Phase 12 (Pick Flow Polish)
  │      └──→ Phase 13 (Mobile Redesign)
  │             └──→ Phase 14 (Auction Overhaul)
  │      └──→ Phase 17 (Broadcast Mode)
  │
Phase 15 (Competitive Data) ──→ [independent, can parallel with 12-14]
Phase 16 (PokePaste) ──→ [independent, can parallel with anything]
Phase 18 (Onboarding) ──→ [independent, can parallel with anything]
```

## Recommended Execution Order

**Wave 1 (Days 1-3):** Phase 11 + Phase 15 + Phase 16 (parallel — foundational + independent features)
**Wave 2 (Days 4-7):** Phase 12 + Phase 18 (pick polish + onboarding, parallel)
**Wave 3 (Days 8-10):** Phase 13 (mobile redesign, depends on Phase 12)
**Wave 4 (Days 11-13):** Phase 14 + Phase 17 (auction + broadcast, parallel)
**Day 14:** Integration testing, polish, deploy
