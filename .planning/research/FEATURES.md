# Feature Research: Draft UX Overhaul

**Domain:** Real-time competitive draft platform UX — modern fantasy sports patterns applied to Pokemon drafting
**Researched:** 2026-04-03
**Confidence:** MEDIUM (direct platform UX from docs/case studies; visual specifics inferred from descriptions + behavior documentation where screenshots unavailable)

---

## Research Scope

Seven UX areas mapped against competitor behavior across Sleeper, ESPN Fantasy, Yahoo Fantasy, DraftKings, Drafty Sports, FanDraft, FantasyPros DraftWizard, and Clicky Draft. Findings are organized by the seven questions in the research brief.

---

## 1. Draft Room Layout

### What Competitors Do

**Sleeper** uses a full draftboard grid as the primary view — every pick slot for every team is visible simultaneously. The board is the dominant element. A separate player search/pool panel is secondary. Commissioner context (pause, undo, timer adjust) lives in an overlay accessed via tap.

**ESPN Fantasy (2024-2025)** introduced a scrollable Draft Train (horizontal timeline of recent picks) and a Draft Board view. The board scrolls vertically; the player pool is a separate pane. The 2025 redesign added a "Roster," "Matchup," "Players," and "League" tab row across the top — horizontal tab navigation during draft.

**FantasyPros DraftWizard (2024 refresh)** uses three distinct areas: Rankings tab (left panel), Teams tab (team rosters toggle between starters/bench), Picks tab (upcoming picks with positional needs). Panel focus shifts based on the active tab — information is never all visible at once on mobile.

**Drafty Sports / FanDraft** offer a split layout: available players on one side, team rosters and draft board on the other, with chat below. Commissioner controls are in a dedicated settings panel, not inline with the draft UI.

**Yahoo Fantasy** shows the player pool as the dominant element with a secondary panel for team rosters accessible via tab. The queue (starred players) lives in its own section, not persistently visible.

### Pattern Summary

All major platforms converge on a **three-zone layout**:
1. **Available pool** — primary, searchable, filterable
2. **Team rosters / draft board** — secondary, shows what has been picked
3. **Activity / chat / queue** — tertiary, context sidebar or tab

On desktop, these are arranged in columns. On mobile, they collapse to tabs. The notable exception is Sleeper's draftboard-first approach, where the full board is primary and the player list is secondary — effective for in-person draft parties but less optimal for individual picking decisions.

### Existing Component Dependencies

| Existing Component | Relevant to |
|-------------------|------------|
| `VirtualizedPokemonGrid` | Available pool panel |
| `TeamRoster` (compact) | Team roster panel |
| `DraftActivitySidebar` (slide-in) | Activity panel — currently a drawer, not persistent |
| `DraftProgress` | Round/pick status bar |
| `DraftControls` | Host controls — currently buried in collapsible |

---

## 2. Turn State Clarity

### What Competitors Do

**Sleeper:** When a team's timer expires without a pick, the system can be configured to take no action (soft timer) — requiring the commissioner to manually advance or force auto-pick. The "on the clock" state is shown via the active team slot on the draftboard grid being highlighted. No documented full-screen takeover.

**ESPN Fantasy:** The Draft Train scrolls to highlight the current pick slot. The active drafter is visually distinguished in the board header. Audio notifications are documented as available (browser notification when it's your pick).

**Yahoo Fantasy:** Has a player queue (starred picks) that auto-picks if the user runs out of time (60-second default). The queue doubles as a turn-preparation tool — it signals an upcoming turn by offering starred options to review.

**FantasyPros DraftWizard:** Shows "Picks Tab" with positional needs indicators for upcoming picks, helping you prepare before your turn arrives. No documented takeover animation.

**Drafty Sports / Clicky Draft:** Both show per-team "signed in / away / inactive" status on the board — a passive turn signal. Clicky Draft's documentation specifically calls out showing whether each team is connected.

**FanDraft:** Designed for in-person draft parties — the big screen display is the shared "on the clock" indicator; individual devices show personal queues.

### Key Insight

No major fantasy platform appears to implement a **full-screen takeover** for "your turn." The convention is: highlighted board slot + timer countdown + (optionally) audio notification. The full-screen takeover is a design space that exists but is not currently occupied by competitors — making it a genuine differentiator if implemented well, but an anti-pattern risk if it creates anxiety or disruptive context switching.

The **Sleeper soft timer** pattern (no automatic advance when time expires) is highly praised in their community because it prevents panic-drafting. The consequence is that turn urgency is lighter, not heavier. This is a deliberate design choice based on user feedback.

### Existing Component Dependencies

| Existing Component | Relevant to |
|-------------------|------------|
| `DraftProgress` (timer display) | Turn countdown |
| `useTurnNotifications` | Audio/toast notification |
| `selectCurrentTeam` selector | Derives whose turn it is |
| Turn indicator in draft header | Current "your turn" signal |

---

## 3. Mobile Draft Experience

### What Competitors Do

**Sleeper:** Mobile app uses native React Native. The draftboard is accessible but the article notes big screen mode (TV casting) is desktop-only — indicating that the mobile app deprioritizes the board view in favor of individual pick actions.

**ESPN Fantasy (2025):** Replaced the mobile home screen with a personalized dashboard that shows "quick-action" add/drop buttons directly on the players screen — eliminating a navigation step. The swipe-from-matchup-to-matchup pattern with a pinned score at top is a continuous scroll replacing tab jumps.

**FantasyPros DraftWizard Mobile:** Positional tier integration directly in the Rankings tab. Teams tab toggles between starter/bench. The mobile app mirrors the desktop three-panel logic but through sequential tabs rather than simultaneous columns.

**Drafty Sports / Clicky Draft:** Both claim responsive mobile support, but the approach is traditional — resize and reflow rather than mobile-native rethinking.

**FanDraft Multi-Display:** Explicitly supports multiple displays/TVs for in-person events, with remote owners picking from their phones while the big screen shows the board. This splits the interface by role: spectators watch the board, pickers interact on personal devices.

### Key Insight

The dominant mobile pattern is **tab-based navigation** between: pool | team | board. ESPN's 2025 redesign started moving away from tabs toward **swipe navigation** and **pinned elements** (score stays at top while content scrolls). No platform has documented eliminating tab-switching through a continuous scroll design specifically for drafting.

The most common mobile frustration reported (from ESPN UX case studies and user reviews) is: "I need to check my roster while looking at available players, which requires switching tabs and losing my place." A continuous scroll pattern where pool → your team → board are all in a single vertical scroll would address this — but requires careful implementation to avoid disorienting vertical jumping.

**Touch-first mobile patterns to adopt:**
- Swipe horizontally between major sections (not taps on a tab bar)
- Persistent quick-action bar at bottom (search, your team summary, pick)
- Pinned header showing time remaining and current pick number regardless of scroll position

### Existing Component Dependencies

| Existing Component | Relevant to |
|-------------------|------------|
| Mobile tab nav in draft page | Currently 3 tabs: Pokemon / Team / Board |
| `useDragAndDrop` | Wishlist drag on mobile |
| `VirtualizedPokemonGrid` | Must remain performant on scroll |

---

## 4. Spectator / Viewer Mode

### What Competitors Do

**Sleeper Big Screen Mode:** A dedicated URL/view optimized for TV display — shows the full draftboard grid updating live. Participants draft on their personal devices; the big screen is passive-only. No interactivity. Two people can have the same draft open simultaneously: one in pick mode, one in board mode.

**Yahoo Fantasy:** Historical documentation suggests spectators were not supported — the league was members-only. No recent public spectator feature found.

**ESPN Fantasy:** The Draft Board view (new in 2024) functions as a spectator-friendly view — shows all picks in a color-coded grid. It's the same view for all users, not a special spectator mode.

**Clicky Draft:** The draftboard is accessible to all league members. There is no documented separate spectator mode — the board view is shared.

**FanDraft:** Multi-display support creates implicit spectator experience — the big screen shows what spectators see.

### Key Insight

No major fantasy platform has a **role-differentiated view** (same URL, different permissions and UI based on participant vs. spectator). The industry standard is either: (1) everyone sees the same interface and picks are enabled/disabled based on whose turn it is, or (2) there is a separate read-only board URL for big screen display.

The current Pokemon Draft implementation has a separate `/spectate/[id]` route, which is non-standard. The industry direction (and PROJECT.md goal) is a single `/draft/[id]` URL that adapts — participants see pick controls when it's their turn, spectators see the board with activity feed. This is a valid UX improvement that aligns with how all major platforms actually work.

**OBS/broadcast mode:** Only Sleeper has explicit big screen functionality among mainstream fantasy platforms. Clean, minimal, dark-mode board-view URL for TV display is the right pattern. This differs from the participant view and can be the existing `/spectate/[id]` repurposed with a clean presentation mode.

### Existing Component Dependencies

| Existing Component | Relevant to |
|-------------------|------------|
| `/spectate/[id]` route | Repurpose as broadcast/big-screen view |
| `useConnectionManager` | Role detection (participant vs. spectator) |
| `DraftActivitySidebar` | Always-visible in spectator mode |
| Participant role in `participants` table | Drives view adaptation |

---

## 5. Host / Commissioner Controls

### What Competitors Do

**Sleeper:** Commissioner controls are available via tapping the current team tile (to force auto-pick) and through a settings interface accessible during draft. Controls include: pause/resume, timer adjustment, unlimited undo, pick trading, manual completion.

**Drafty Sports:** Has an explicit "Commissioner Toolbox" section — always accessible but in a side panel, not inline with the pick flow. Key tools: Undo Last Pick, Move Player, Team Settings, End Draft. Important structural settings (team count, rounds, format) cannot be changed in-draft. This separation is deliberate — prevents accidental destructive changes.

**FanDraft Commissioner Mode:** Commissioners can make picks on behalf of other users, edit picks, pause/play the clock, and perform nearly any function on behalf of league members, while remote owners can still make their own picks simultaneously. Commissioner mode is a dedicated UI state.

**Clicky Draft:** Timer can be paused indefinitely and duration adjusted. Commissioners can undo incorrect picks. Status is implied — no described dedicated panel.

**Yahoo Fantasy:** Commissioner had basic controls (pause draft, kick user) accessible via a small admin dropdown.

### Key Insight

The consensus pattern is: **commissioner controls are accessible but not prominent**. They should not distract participants from the draft experience, but must be reachable within one interaction (one click/tap) during an emergency. Buried collapsible panels (current implementation) fail the one-interaction requirement under time pressure.

The **Drafty pattern of segregating destructive vs. operational controls** is worth adopting:
- Operational (pause, timer adjust, undo last pick) → always visible in a compact persistent bar
- Structural (change format, reset draft, end draft) → one tap away, behind a confirm dialog

For the current codebase, the "admin ping bell" already exists. The expand to a **slim host command row** below the main header — always visible to host, invisible to participants — is the right direction.

### Existing Component Dependencies

| Existing Component | Relevant to |
|-------------------|------------|
| `DraftControls` (collapsible panel) | Needs refactor to persistent slim bar |
| Admin ping bell | Already in host controls |
| Pause/resume actions in draft-service | Backend for host controls |
| Host role check via Clerk/participants | Permission gating |

---

## 6. Post-Draft Transition

### What Competitors Do

**Sleeper:** After draft completion, the platform transitions to the league management view automatically. The draft room becomes read-only (historical draft board). League management (rosters, matchups, trades) is accessible from the same top-level navigation. There is no explicit "now go set up your league" flow — the league already exists, the draft just populates it.

**ESPN Fantasy:** Same pattern — draft completes, you are redirected to your team's roster view. The league hub navigation (Roster, Matchup, Players, League) is available immediately post-draft.

**Yahoo Fantasy:** Similar. Draft board becomes viewable history. The main league navigation takes over.

**FanDraft:** After draft, a "shareable draft board" URL is generated — a read-only snapshot of the board that can be shared publicly or posted to social media. This is a distinctive post-draft artifact.

### Key Insight

All major platforms treat post-draft as **seamless continuity** — the league context was already established before the draft, so completion is simply a state change. The draft result feeds into existing league infrastructure.

The current implementation (3-second auto-navigate to `/draft/[id]/results`) is closer to this pattern than it might seem. The gap is that results feel like a dead end unless they link cleanly to the league. The PROJECT.md goal of "results-to-league continuity" maps to: **draft results become the league's first snapshot, not a separate page**.

A **shareable/embeddable draft recap** (FanDraft's approach) is a genuine differentiator for the Pokemon community — content creators want to share their draft results. This is a medium-complexity feature with high community value.

### Existing Component Dependencies

| Existing Component | Relevant to |
|-------------------|------------|
| `DraftResults.tsx` (3 tabs) | Post-draft view |
| League auto-creation on draft complete | Link to league management |
| Draft recap timeline tab | Shareable artifact foundation |
| PokePaste export (deferred) | Ecosystem interop post-draft |

---

## 7. League Hub Navigation

### What Competitors Do

**Sleeper (native):** Critiqued by users and third-party tools for burying trade/waiver history, previous winners, and matchup history. Navigation is not well-documented — tabs appear to cover standings, matchups, and trades, but finding historical data is described as "cumbersome."

**ESPN Fantasy (2025):** Replaced dropdown navigation with a **horizontal button row at the top**: Roster | Matchup | Players | League. "League" tab consolidates all transaction activity, other rosters, and standings. Four top-level items is the design ceiling — they explicitly reduced navigation depth in 2025.

**Yahoo Fantasy:** Similar horizontal tab pattern. Tabs: My Team | Standings | Matchup | Transactions. Four tabs maximum for core management.

**Third-party Sleeper (League Page project):** Identified the optimal sections as: Home | Matchups | Trades & Waivers | Rosters | Drafts | Awards | Records | Managers. Eight sections — but organized with a clear information hierarchy (current season vs. history).

**Fantrax:** Praised for "simple interface and huge selection of formats" — simplicity at navigation level even with advanced format support underneath.

### Key Insight

**Four is the magic number.** Every major platform converges on 3-5 top-level navigation items for the league hub. More than 5 creates cognitive load. The 7+ tabs in the current league hub is explicitly above this threshold.

The ESPN 2025 pattern is the clearest model: **Roster | Matchup | Players | League** where "League" is a catch-all for standings/transactions/history. Applied to Pokemon Draft:

**Proposed 3-section structure:**
1. **Overview** — standings, current week matchup, recent activity, announcements
2. **Matches** — schedule, results, your matchup detail, playoff bracket
3. **Management** — trades, waivers, free agents, power rankings, commissioner tools

This consolidates 7+ current tabs into 3 clear destinations, with contextual sub-navigation within each section.

### Existing Component Dependencies

| Existing Component | Relevant to |
|-------------------|------------|
| League hub at `/league/[id]` (7+ tabs) | Consolidation target |
| Standings component | Moves to Overview |
| Fixtures / match schedule | Moves to Matches |
| Trade Center | Moves to Management |
| Free Agents / Waivers | Moves to Management |
| Commissioner panel | Moves to Management |
| Power Rankings | Moves to Overview or Management |

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Persistent "whose turn / time remaining" header | Every draft platform shows this always-visible | LOW | Exists but needs to be sticky/always accessible on scroll |
| Highlighted current-drafter indicator on board | Industry standard (Sleeper, ESPN, Yahoo all do this) | LOW | Board highlights active team slot |
| Pick queue / wishlist visible before your turn | Standard on Yahoo, FantasyPros, Sleeper — prep tool | LOW | Wishlist system exists; needs to be surfaced better |
| Post-draft shareable results | Standard expectation after competitive events | MEDIUM | Draft recap tab exists; needs clean share URL |
| "On the clock" notification (push/audio) | ESPN does this; Sleeper does this; users are conditioned to expect it | LOW | `useTurnNotifications` exists; verify push notification path |
| Commissioner pause/resume accessible in one tap | All platforms require this emergency control | LOW | Exists but buried in collapsible panel |
| Spectator can follow draft without picking | All platforms support passive viewing | LOW | Exists at /spectate/[id]; needs role-based adaptation on main page |
| League nav with under 5 top-level items | ESPN 2025 set the expectation; 7+ tabs feel broken | MEDIUM | Current 7+ tabs need consolidation to 3 |
| Mobile draft with persistent Pokemon search | Users expect to search/filter pool from any context | MEDIUM | Currently tab-locked; needs persistent access |
| Draft board / history view after completion | Standard on every platform (Sleeper, ESPN, Yahoo) | LOW | Exists; needs clean presentation mode |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dramatic "your turn" visual state shift | No competitor does full-screen takeover; high emotional impact for competitive drafts | MEDIUM | Darken non-active areas + expand pick modal + audio cue; not a full-screen break but a decisive visual shift |
| Unified participant/spectator page (role-adaptive) | Cleaner than separate /spectate route; one URL shareable | MEDIUM | Requires role detection at render time; use `participants` table role field |
| OBS-ready broadcast mode at clean URL | Sleeper has big-screen mode; no Pokemon draft platform has OBS-ready overlay | MEDIUM | Repurpose /spectate/[id] with ?mode=broadcast query param for minimal chrome dark mode display |
| Always-visible activity feed (not slide-in) | No competitor has this in the main layout; transforms draft from solitary to social | MEDIUM | Restructure main layout to include activity as a persistent right column on desktop |
| Host command bar (slim, always visible to host) | All competitors bury controls; accessible-one-tap pattern is unoccupied | LOW | Thin strip below main header, host-only, shows pause/timer/undo at a glance |
| Continuous scroll mobile (no tab switching) | ESPN 2025 started moving this direction; no platform has fully solved it | HIGH | Requires layout rethink for mobile; risk: vertical jumping disorientation |
| Draft result → league hub direct CTA | Competitors have seamless continuity; none have a guided "here's your league" moment | LOW | Post-draft CTA button pointing to league hub, with league auto-created on draft complete |
| Shareable draft recap card (link + image) | FanDraft does a shareable board URL; no Pokemon platform has social-share card | HIGH | OG image generation of draft results; requires server-side image rendering |
| Soft timer option (no auto-advance) | Sleeper's most-praised feature; not available in current implementation | MEDIUM | Add `softTimer` flag to draft settings; timer expires → no action, commissioner must intervene |

### Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Full-screen modal takeover on "your turn" | Feels dramatic and urgent | Breaks context, causes disorientation on mobile, creates anxiety rather than excitement; Sleeper deliberately chose soft timers for this reason | Decisive visual shift — dim other panels, expand pick area, pulsing border on pick button |
| Tab bar with 7+ league sections | Feels comprehensive and organized | Cognitive overload; users cannot remember what is in which tab; ESPN reduced to 4 in 2025 specifically because of this | 3-section hub (Overview / Matches / Management) with contextual sub-nav |
| Separate /spectate route indefinitely | Simple implementation | Creates two codebases to maintain; sharing a link requires knowing which URL to share; participants can't switch to spectator view | Role-adaptive single /draft/[id] URL with spectator controls visible to non-participants |
| Real-time everything via Postgres Changes | Appears simpler to implement | At scale, Postgres Changes fan-out multiplies message cost by subscriber count (documented in M5 FEATURES.md); broadcast mode is correct but requires refactor | Keep Postgres Changes for current beta; document Broadcast migration path |
| Commissioner controls always visible to all | Reduces "where is the pause button?" questions | Adds noise to participant experience; non-hosts don't need these controls during draft | Host-role gating — show host command bar only to `draftCreatorId` match |
| AI pick suggestions in draft room | Seems like a useful assistant | Requires @pkmn/smogon integration that is deferred per PROJECT.md; adds bundle size and complexity | Deferred to post-beta per project scope; document as future differentiator |
| Auto-complete draft when all picks done | Avoids manual host action | Race condition between last pick and auto-complete can duplicate state in real-time system | Keep current 3-second navigate pattern; add clear visual countdown |

---

## Feature Dependencies

```
Unified participant/spectator page (role-adaptive)
  └──requires──> Role field in participants table (exists)
  └──requires──> Draft page role detection hook (new)
  └──enables──> Broadcast mode at /spectate/[id]?mode=broadcast

Persistent activity feed (main layout)
  └──requires──> Layout restructure (3-column on desktop)
  └──conflicts──> Current slide-in sidebar (replace, don't coexist)
  └──enhances──> Spectator experience significantly

Host command bar (slim persistent)
  └──requires──> Host role detection (exists via draftCreatorId)
  └──replaces──> DraftControls collapsible panel
  └──enables──> One-tap pause/undo/timer during draft emergency

League hub consolidation (3-section)
  └──requires──> Re-routing within /league/[id] (no URL changes, just navigation restructure)
  └──conflicts──> Any existing deep-link to specific tabs (must redirect)
  └──enables──> Better mobile league experience

Dramatic "your turn" state shift
  └──requires──> CSS class toggling on draft layout root (dim non-active panels)
  └──requires──> `selectCurrentTeam` selector (exists)
  └──enhances──> Turn notifications (sound plays on state shift)

Post-draft → league CTA
  └──requires──> League auto-creation on draft complete (verify exists)
  └──requires──> DraftResults.tsx link component update (low complexity)

Continuous scroll mobile
  └──conflicts──> Current tab-based mobile nav (replaces it)
  └──requires──> Scroll position management (complex)
  └──requires──> Intersection observer for section awareness
  ──HIGH RISK, defer to v2──>
```

---

## MVP Definition (Draft UX Overhaul)

### Launch With (v1 — this milestone)

- [ ] Persistent "whose turn + time remaining" sticky header across all scroll positions
- [ ] Host command bar — slim, always visible to host, one-tap pause/undo/timer
- [ ] Decisive "your turn" visual shift — dim inactive panels, pulsing pick button, audio cue
- [ ] Persistent activity feed in main layout (desktop: right column; mobile: tab)
- [ ] Unified participant/spectator on /draft/[id] — role-adaptive, deprecate /spectate/[id] as broadcast-only
- [ ] League hub consolidation — 3 sections: Overview / Matches / Management
- [ ] Post-draft → league CTA with auto-navigate to league hub

### Add After Validation (v1.x)

- [ ] Broadcast mode at /spectate/[id]?mode=broadcast — triggered by user feedback on OBS usage
- [ ] Shareable draft recap URL (clean share link, no OG image) — add when creators ask for it
- [ ] Soft timer option in draft settings — add when hosts complain about panic auto-picks

### Future Consideration (v2+)

- [ ] Continuous scroll mobile (replace tab nav) — high complexity, defer until mobile usage data shows tab nav is the top complaint
- [ ] Shareable draft recap image (OG card) — requires server-side image rendering, high infrastructure cost
- [ ] AI pick suggestions — deferred per PROJECT.md until post-beta

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Sticky turn header + timer | HIGH | LOW | P1 |
| Host command bar | HIGH | LOW | P1 |
| Decisive "your turn" visual shift | HIGH | MEDIUM | P1 |
| Persistent activity feed | HIGH | MEDIUM | P1 |
| League hub 3-section consolidation | HIGH | MEDIUM | P1 |
| Unified /draft/[id] role-adaptive | MEDIUM | MEDIUM | P1 |
| Post-draft → league CTA | MEDIUM | LOW | P1 |
| Broadcast mode URL | MEDIUM | LOW | P2 |
| Shareable draft recap link | MEDIUM | MEDIUM | P2 |
| Soft timer option | MEDIUM | MEDIUM | P2 |
| Continuous scroll mobile | HIGH | HIGH | P3 |
| OG image for draft recap | LOW | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature Area | Sleeper | ESPN Fantasy (2025) | Yahoo Fantasy | Our Approach |
|-------------|---------|---------------------|---------------|--------------|
| Draft room layout | Draftboard-first, player pool secondary | Tab row (Roster/Matchup/Players/League), board scrollable | Player pool primary, team roster secondary tab | Split panel: pool (left) + team roster (right) + activity (far right on desktop) |
| Turn state | Highlighted board slot, soft timer option (no auto-advance) | Draft Train highlights slot, audio notification | Timer countdown, queue auto-picks on expiry | Decisive visual shift: dim inactive panels + pulsing pick button + audio |
| Mobile experience | React Native app, draftboard deprioritized on mobile | Swipe navigation, pinned score, quick-action buttons | Tab-based navigation | Persistent bottom bar for search/team/progress; tabs for now, scroll in v2 |
| Spectator mode | Big screen mode (separate URL, board-only) | Draft Board view (same UI, passive mode) | Not documented | Role-adaptive single URL; /spectate repurposed as broadcast mode |
| Commissioner controls | Tap tile to force pick, settings panel for others | Not documented in detail | Small admin dropdown | Slim host command bar below header, always visible to host only |
| Post-draft | Auto-redirect to league hub | Auto-redirect to team roster | Auto-redirect to league | Results page with explicit CTA to league hub |
| League navigation | Praised for social, criticized for burying history | 4-item tab row (Roster/Matchup/Players/League) | 4-item tab row (My Team/Standings/Matchup/Transactions) | 3-section: Overview / Matches / Management |

---

## Sources

- [Sleeper Draft Features](https://support.sleeper.com/en/articles/1876028-why-you-should-use-sleeper-for-any-draft) — MEDIUM confidence (official support docs)
- [Sleeper Draft Timer Mechanics](https://support.sleeper.com/en/articles/4029085-how-does-the-draft-timer-work) — HIGH confidence (official support docs)
- [Sleeper Big Screen Mode](https://support.sleeper.com/en/articles/2083195-how-to-cast-your-draft-to-the-big-screen) — HIGH confidence (official support docs)
- [ESPN Fantasy Football 2025 New Design](https://espnpressroom.com/us/press-releases/2025/08/espn-fantasy-football-30th-anniversary-new-design-new-features-all-new-fantasy-app-for-2025/) — HIGH confidence (ESPN official press release)
- [ESPN Fantasy New Features 2024](https://www.espn.com/fantasy/football/story/_/id/40378418/2024-fantasy-football-draft-board-new-features-espn) — HIGH confidence (ESPN official)
- [FantasyPros Draft Room Refresh](https://blog.fantasypros.com/draft-room-simulator-update/) — MEDIUM confidence (official blog)
- [Drafty Sports Commissioner Controls](https://draftysports.com/help/docs/commissioner-controls) — HIGH confidence (official docs)
- [Clicky Draft Features](https://clickydraft.com/draftapp/page/features) — HIGH confidence (official feature page)
- [UX Case Study: ESPN Fantasy App](https://usabilitygeek.com/ux-case-study-espn-fantasy-app/) — MEDIUM confidence (third-party UX analysis)
- [Unofficial Sleeper League Page Analysis](https://medium.com/@n.melhado/unofficial-sleeper-fantasy-football-league-page-3566812727fe) — MEDIUM confidence (developer critique of Sleeper's native navigation)
- [DraftKick: Peak Fantasy UI](https://draftkick.com/blog/peak-fantasy-ui/) — MEDIUM confidence (industry analysis)
- [Fantasy Football App UX Dos and Don'ts](https://medium.com/@johnxaavier/the-dos-and-donts-of-fantasy-football-app-development-ui-ux-design-5576e571aca7) — LOW confidence (single author, not platform-specific)
- [The Brilliant UX of Fantasy Football](https://medium.com/@pieterbasklaas/the-brilliant-ux-of-fantasy-football-8780a418e97e) — LOW confidence (general patterns, not draft-specific)

---

*Feature research for: Draft UX Overhaul — real-time competitive Pokemon drafting platform*
*Researched: 2026-04-03*
