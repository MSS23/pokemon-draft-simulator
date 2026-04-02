# REQUIREMENTS.md — Milestone 3: Gold Standard Draft Experience

## Milestone Goal
Transform the Pokemon Draft platform from a functional tool into the definitive draft league experience — polished enough that content creators choose it over Discord bots, and competitive players prefer it for the integrated data.

## Success Criteria
- Draft room feels as polished as ESPN/Sleeper fantasy drafts (animations, sounds, urgency)
- Mobile users can draft comfortably on phones (responsive, touch-optimized)
- Competitive players can see usage stats and make informed picks during draft
- Content creators can use spectator view as an OBS overlay for streams
- Teams can be exported in PokePaste format for Pokemon Showdown

---

## R1: Draft Room Pick Flow Polish
**Priority:** P0 (Critical)
**Why:** The pick flow is the core product moment. It must feel instant, satisfying, and dramatic.

### Requirements:
- R1.1: Pick confirmation animates the Pokemon sprite flying to the team roster (not just appearing)
- R1.2: "On the Clock" banner prominently displays current team name with pulsing animation
- R1.3: Timer countdown changes color: green (>30s) → yellow (10-30s) → red (<10s) with pulse
- R1.4: Audio cues: gentle tick at 30s, rapid ticking at 10s, buzzer at expiry (toggleable)
- R1.5: Pick lock-in has a satisfying confirmation sound + visual burst effect
- R1.6: Other players see a real-time "Player X picked Y!" notification with sprite
- R1.7: Optimistic update feels instant (<200ms visual feedback)
- R1.8: Draft completion triggers a celebration animation (confetti, team showcase)

### Acceptance:
- Pick → animate → roster update feels like a single fluid motion
- Timer creates escalating tension visible to all participants
- Sounds can be toggled on/off and volume adjusted
- Works on both desktop and mobile

---

## R2: Mobile-First Draft Room Redesign
**Priority:** P0 (Critical)
**Why:** Most draft league players coordinate via phones. A broken mobile experience loses them to Discord.

### Requirements:
- R2.1: Draft room is fully functional on 375px+ screens (iPhone SE minimum)
- R2.2: Sticky header with timer + current picker always visible
- R2.3: Pokemon grid uses bottom-sheet pattern for search/filter (thumb-reachable)
- R2.4: Team roster is a collapsible bottom sheet or swipe tab
- R2.5: Pick confirmation is a full-screen modal on mobile (prevent mis-taps)
- R2.6: Touch targets are 44px+ minimum (WCAG)
- R2.7: Swipe gestures: swipe card to add to wishlist
- R2.8: Push notification when it's your turn (if app is backgrounded)

### Acceptance:
- Complete a full draft on an iPhone 13 without zoom/scroll issues
- All interactive elements are thumb-reachable
- No horizontal scroll on any mobile view

---

## R3: Draft Room Sound & Animation System
**Priority:** P1 (High)
**Why:** Sound and animation transform a form-fill into an event. This is what makes people choose the web app over a Discord bot.

### Requirements:
- R3.1: Sound system with preloaded audio sprites (pick, tick, buzzer, celebration, bid, nomination)
- R3.2: Volume control persisted to localStorage
- R3.3: Mute toggle accessible from draft room header
- R3.4: Pick animation: sprite scales up from grid → flies to team roster position
- R3.5: "Your Turn" full-screen flash overlay (1s, dismissable)
- R3.6: Draft board fill animation (cells populate as picks are made)
- R3.7: Respects prefers-reduced-motion media query
- R3.8: Auction bid: number counter animation on current bid display

### Acceptance:
- Sounds play reliably across Chrome, Safari, Firefox
- Animations run at 60fps (no jank)
- Reduced motion users get functional equivalents (no animation, text-only feedback)

---

## R4: Auction Draft UX Overhaul
**Priority:** P1 (High)
**Why:** Auction format is a key differentiator (no competitor supports it well), but current UX is confusing.

### Requirements:
- R4.1: Nomination flow redesigned: clear "It's your turn to nominate" state with Pokemon search
- R4.2: Bidding interface shows current bid prominently with +1/+5/+10/custom increment buttons
- R4.3: Auction timer is large, centered, with color-coded countdown
- R4.4: Bid history shows bidder name + amount in a scrollable feed
- R4.5: "Going once... going twice... SOLD!" animation sequence on timer expiry
- R4.6: Budget remaining always visible for all teams during auction
- R4.7: Quick-bid buttons (match current + 1, double, max bid)
- R4.8: Nomination queue: upcoming nominators visible

### Acceptance:
- New user can understand and participate in auction within 30 seconds
- Bidding feels responsive and competitive (real-time updates)
- Timer expiry resolution is deterministic (no "I bid in time!" disputes)

---

## R5: Competitive Data Overlay
**Priority:** P1 (High)
**Why:** Informed picks during draft is the killer feature no competitor offers. This is what makes competitive players choose the platform.

### Requirements:
- R5.1: During draft, Pokemon cards show usage rate (% in format) from @pkmn/smogon
- R5.2: Pokemon detail modal shows: common sets, abilities, items, teammates, checks/counters
- R5.3: "Popular in this format" section highlights meta-relevant undrafted Pokemon
- R5.4: Type coverage overlay: shows team's type coverage gaps as you draft
- R5.5: Quick damage calc accessible from matchup page (@smogon/calc integration)
- R5.6: Usage data cached with 24-hour TTL (avoid hammering data.pkmn.cc)
- R5.7: Data loads progressively (draft room functional before usage data arrives)

### Acceptance:
- Usage stats visible on Pokemon cards during draft without extra clicks
- Damage calc produces correct results matching Showdown's calculator
- Draft room loads in <3s even if usage data is slow

---

## R6: PokePaste Import/Export
**Priority:** P1 (High)
**Why:** PokePaste is the universal format. Without it, teams can't move between this platform and Pokemon Showdown.

### Requirements:
- R6.1: Export any team roster as PokePaste format (copy to clipboard + download .txt)
- R6.2: Export includes: Pokemon name, ability, item, EVs, nature, moves (from draft data or user-edited)
- R6.3: Import PokePaste text to pre-populate team for matchup analysis
- R6.4: Draft results page has "Export to Showdown" button per team
- R6.5: Validate imported PokePaste against current format legality

### Acceptance:
- Exported PokePaste imports correctly into Pokemon Showdown
- Import handles all PokePaste syntax variants (with/without nickname, tera type, etc.)

---

## R7: Broadcast/Spectator Mode
**Priority:** P2 (Medium)
**Why:** Content creators are force multipliers — if they stream with your tool, their audience discovers it.

### Requirements:
- R7.1: `/spectate/[id]?mode=broadcast` — clean, chrome-free view optimized for OBS (1920x1080)
- R7.2: Broadcast view shows: draft board grid, current pick animation, team rosters building live
- R7.3: No interactive controls in broadcast mode (view-only)
- R7.4: Customizable background color (for chroma key / brand matching)
- R7.5: Larger sprites and text (readable at 720p stream quality)
- R7.6: Optional team name labels with custom colors

### Acceptance:
- Broadcast view renders correctly as OBS Browser Source
- Readable at 720p YouTube/Twitch stream quality
- No UI chrome, scrollbars, or interactive elements visible

---

## R8: Onboarding & Draft Templates
**Priority:** P2 (Medium)
**Why:** New users bounce if they don't understand how to start. Templates lower the barrier.

### Requirements:
- R8.1: Interactive tour on first draft room visit (3-5 steps: timer, grid, roster, wishlist, pick)
- R8.2: Format explainer tooltips (what is Reg H? What are paradox Pokemon?)
- R8.3: Pre-made draft templates: "Quick 4-player Draft", "8-Player League Season", "Content Creator Showmatch"
- R8.4: Draft type comparison card on create page (snake vs auction vs tiered — pros/cons)
- R8.5: "How it works" section on landing page with animated demo

### Acceptance:
- New user can create and start a draft within 60 seconds using a template
- No competitive Pokemon knowledge required to use a template

---

## Non-Requirements (Explicit Exclusions)
- Battle simulator (Showdown exists)
- Discord bot (web-first, Discord webhooks only)
- Custom Pokedex / database browsing (use PokeAPI data, don't rebuild)
- Replay analysis (ClodBot/PorygonBot cover this)
