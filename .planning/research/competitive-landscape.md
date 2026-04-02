# Competitive Landscape: Pokemon Draft League Ecosystem

**Researched:** 2026-04-02
**Overall Confidence:** MEDIUM-HIGH
**Mode:** Ecosystem Research

---

## 1. Existing Pokemon Draft Tools

The Pokemon draft league ecosystem is fragmented across web platforms, Discord bots, Google Sheets, and standalone tools. No single platform dominates, and most solutions cover only part of the workflow.

### Web Platforms

| Platform | URL | What It Does | Strengths | Weaknesses |
|----------|-----|-------------|-----------|------------|
| **Pokemon DraftZone** | [pokemondraftzone.com](https://pokemondraftzone.com/) | League management, matchup analysis, team stats, multi-gen format support | Open-source, matchup prep with shareable links, side-by-side team comparison, Smogon-aligned | No real-time draft room, no auction support, relies on manual data entry for results |
| **DraftMon** | [draftmon-web.web.app](https://draftmon-web.web.app/) | Real-time draft room creation | Room-based drafting, simple UX | Firebase-hosted, limited features beyond draft execution, no league management |
| **OnlineDraft** | [onlinedraft.com/pokemon-draft](https://www.onlinedraft.com/pokemon-draft) | Multi-device draft board | Device-agnostic, clean interface | Generic platform (not Pokemon-specific), no competitive data integration |
| **DraftySports** | [draftysports.com/pokemon](https://draftysports.com/pokemon) | Live auction draft board | Auction format support, fantasy eSports focus | Limited Pokemon-specific features |
| **Pokemon Draft League Online** | [pokemondraftleague.online](https://pokemondraftleague.online/) | Draft league assistance | Community-focused | Appears to be down or unreliable (ECONNREFUSED during research) |
| **pokeaimMD Speed Draft** | [pokeaimmd.com/speed-draft](https://www.pokeaimmd.com/speed-draft) | Speed draft tool from popular YouTuber | Creator-endorsed, fast drafts | Single-purpose, tied to one creator's format |
| **Random Pokemon Draft Generator** | [randompokemon.co/draft-league-generator](https://www.randompokemon.co/draft-league-generator) | Random draft pool generation with type/tier restrictions | Quick setup, fairness settings | No real-time drafting, no league management |

### Discord Bots (The De Facto Standard)

Most Pokemon draft leagues run through Discord. This is the primary competitor -- not other web apps, but the Discord bot ecosystem.

| Bot | What It Does | Key Feature |
|-----|-------------|-------------|
| **ClodBot** | Replay analysis, stats to Google Sheets, set generation | [clodbot.com](https://clodbot.com/) -- Analyzes Showdown replays, extracts match stats, uploads to Sheets |
| **PorygonBot** | Live battle stat tracking (K/D), PostgreSQL backend | [github.com/PorygonBot/bot](https://github.com/PorygonBot/bot) -- Joins Showdown battles live, tracks kills/deaths |
| **Bill's PC** | Team storage, draft prep tools | [top.gg/bot/683895476336197633](https://top.gg/bot/683895476336197633) -- Showdown team management |
| **pkmnDiscordBot** | Snake draft management, multi-player, queue picks | [github.com/sandyllama/pkmnDiscordBot](https://github.com/sandyllama/pkmnDiscordBot) -- Manages 11-slot GBA-style snake drafts |
| **discord-draft-assist** | Automated draft with backup picks | [github.com/andytaylor823/discord-draft-assist](https://github.com/andytaylor823/discord-draft-assist) -- Auto-fulfills queued picks |

**Key insight:** The typical draft league workflow is Discord bot for drafting + Google Sheets for stats + Pokemon Showdown for battles + PokePaste for team sharing. This fragmentation is the primary opportunity.

### How Draft Leagues Actually Work Today

Based on Smogon forum research and community patterns:

1. **Setup:** Commissioner creates a Discord server, sets rules (format, tier list, point system, roster size -- typically 11 Pokemon)
2. **Draft:** Snake draft via Discord bot (pkmnDiscordBot or manual turns in a channel). Each coach picks Pokemon one at a time in alternating order.
3. **Season:** Weekly matchups on Pokemon Showdown. Coaches bring 6 of their 11 drafted Pokemon.
4. **Stats:** ClodBot or PorygonBot tracks K/D from Showdown replays. Results logged to Google Sheets.
5. **Matchup Prep:** DraftZone or manual spreadsheets for type coverage analysis.
6. **Sharing:** PokePaste for team exports, screenshots for social media.

---

## 2. What Makes Draft Experiences Feel Premium

### Fantasy Sports Draft UX Patterns (ESPN, Yahoo, Sleeper)

**Timer and Urgency Design:**
- Competitive leagues use 60-90 second pick timers; casual leagues 90-120 seconds
- Visual countdown with color transitions (green > yellow > red) creates escalating urgency
- Audio cues at thresholds: gentle tick at 30s, rapid ticking at 10s, alarm at expiry
- "Draft is Paused" state handling for disconnects (ESPN pattern)
- Auto-pick from pre-ranked queue when timer expires

**Real-Time Draft Room Elements (from fantasy sports research):**
- Live draft board showing all picks in grid format (rounds x teams)
- "On the clock" banner with prominent team name and countdown
- Pick history feed with newest at top
- Player/Pokemon search with filters that update in real-time as picks are made
- Pre-draft rankings/wishlist that auto-remove drafted items
- Chat/reactions for social engagement during draft

**Mobile-First Patterns (from 2025-2026 fantasy app research):**
- Fast load times and smooth transitions are baseline expectations
- Live sync that updates picks as they happen without manual refresh
- Personalized alerts (your turn, opponent picked your target)
- Sleeper (fantasy app) treats the draft room as its primary competitive advantage
- Bottom-sheet pattern for search/selection on mobile (thumb-reachable)
- Swipe gestures for quick actions (queue, dismiss)

### Gaming Draft UX (League of Legends, MTG Arena)

**League of Legends Champion Select:**
- Two-phase process: declare intent, then lock in (prevents accidental picks)
- Visual fanfare on lock-in (character splash, sound effect)
- Team composition visible at all times
- Ban phase creates strategic depth and viewer engagement
- [lol-pick-ban-ui](https://github.com/RCVolus/lol-pick-ban-ui) -- open-source esports broadcast overlay for champ select

**MTG Arena Draft:**
- Card pool that shrinks visually as picks are made
- Hover previews with full card details
- Color/archetype signals help guide decisions
- Arena Tutor provides AI recommendations based on previous picks

**Synthesis -- What "Premium" Means for a Pokemon Draft:**
1. **Instant feedback:** Pick locks in with animation, sprite appears on your roster immediately
2. **Escalating urgency:** Timer changes color/sound as it counts down
3. **Social presence:** See who's connected, reactions, chat
4. **Zero confusion:** Always crystal clear whose turn it is and what's happening
5. **Satisfying moments:** Pick animations, team building visualization, completion celebration
6. **Information density:** Type coverage, stats, usage data accessible without leaving the draft

---

## 3. VGC/Competitive Pokemon Data Sources

### APIs and Data Libraries

| Source | Type | Data Available | Access | Confidence |
|--------|------|---------------|--------|------------|
| **@smogon/calc** | npm package (v0.11.0) | Damage calculations for all gens (1-9) | `npm i @smogon/calc` | HIGH -- [npmjs.com/@smogon/calc](https://www.npmjs.com/package/@smogon/calc) |
| **@pkmn/smogon** | npm package | Analyses, sets, usage stats, teams | `npm i @pkmn/smogon` -- reads from [data.pkmn.cc](https://data.pkmn.cc) | HIGH -- [github.com/pkmn/smogon](https://github.com/pkmn/smogon) |
| **Smogon Usage Stats** | Static files | Monthly usage data by format | [smogon.com/stats/](https://www.smogon.com/stats/) (latest: 2026-03) | HIGH |
| **Pikalytics** | Website + internal API | VGC usage rates, movesets, items, teammates | `/api/usage`, `/api/teams` endpoints (unofficial) | MEDIUM -- no public API docs |
| **Statsugiri** | Open-source platform + API | VGC tournament data, replay analysis | [api.statsugiri.gg](https://api.statsugiri.gg/) -- [github.com/StatsugiriLabs/Statsugiri](https://github.com/StatsugiriLabs/Statsugiri) | MEDIUM |
| **PokeAPI** | REST API | Base Pokemon data (stats, types, abilities, moves) | [pokeapi.co](https://pokeapi.co/) | HIGH -- already used in project |
| **Pokedata.ovh** | Website | VGC tournament standings | [pokedata.ovh](https://www.pokedata.ovh/) | MEDIUM |

### PokePaste Format Specification

The standard for sharing Pokemon teams across the community. Full spec at [pokepast.es/syntax.html](https://pokepast.es/syntax.html).

```
Nickname (Pokemon Name) (F) @ Item
Ability: Ability Name
Tera Type: Stellar
Level: 50
EVs: 252 HP / 4 Def / 252 SpD
Calm Nature
IVs: 0 Atk
- Move 1
- Move 2
- Move 3
- Move 4
```

**Key properties:**
- Compatible with Pokemon Showdown import/export (bidirectional)
- Supports Gen 9 Tera Types
- Unspecified EVs default to 0, IVs to 31
- Supports nicknames, gender, shiny status, happiness
- Multiple Pokemon separated by blank lines

**Actionable insight:** Supporting PokePaste export/import is table stakes. Every competitive player uses this format. Draft results should be exportable as PokePaste, and users should be able to paste in teams for matchup analysis.

### @smogon/calc Integration Opportunity

The damage calculator package is actively maintained and provides:
- Generation-specific damage formulas
- Takes: Generation, Attacker Pokemon, Defender Pokemon, Move, Field conditions
- Returns: Damage range (min/max), percentage, KO probability
- Supports all current VGC mechanics (Tera, weather, terrain)

**Use case for draft platform:** During matchup prep, show "How does my Garchomp fare against their Kingambit?" with actual damage calcs. This is what DraftZone does manually -- automating it is a differentiator.

### @pkmn/smogon Data Available

From [data.pkmn.cc](https://data.pkmn.cc):
- **Sets:** Recommended competitive movesets by format (refreshed daily)
- **Stats:** Usage rates, ability distribution, item distribution, EV spreads, teammates, checks/counters (monthly)
- **Teams:** Sample teams by format
- **Analyses:** Written strategy guides from Smogon

**Use case:** During draft, show usage rates and common sets to help players evaluate picks. "Garchomp is used in 35% of OU teams, primarily as a Swords Dance sweeper."

---

## 4. Mobile-First Draft Patterns

### Lessons from Fantasy Sports Apps (2025-2026)

Based on research into Sleeper, ESPN, Yahoo, and DraftSharks:

**Information Hierarchy on Small Screens:**
1. Timer and current picker (always visible, top of screen)
2. Available pool with search/filter (main content area)
3. Your roster so far (collapsible bottom sheet or tab)
4. Draft board/history (separate tab, not primary view)

**Selection Flow for Many Options (1000+ Pokemon):**
- Search-first approach (type name to filter instantly)
- Filter chips for type, tier, generation (reduce cognitive load)
- Recently viewed / bookmarked at top
- Virtual scrolling mandatory (your project already uses @tanstack/react-virtual)
- Card size: large enough to see sprite + name + key stat, small enough to show 4-6 per screen

**Timer Visibility Patterns:**
- Sticky header with countdown that changes color
- Haptic feedback on mobile at 10-second warning
- Push notification if app is backgrounded: "Your turn to pick!"
- Full-screen takeover at 5 seconds remaining

**Performance Expectations:**
- Sub-2-second load for draft room
- Instant search filtering (<100ms)
- Pick confirmation within 200ms visual feedback
- Graceful offline handling (queue picks, sync when reconnected)

---

## 5. Content Creator / Streaming Needs

### OBS Overlay Integration

| Tool | Type | Features |
|------|------|----------|
| **TourKOAL** | Browser-based overlay | Player/team display, runs entirely in browser, OBS Browser Source | [skeletom.net/pkmn/tournament-overlay](https://www.skeletom.net/pkmn/tournament-overlay/) |
| **Pokemon-Stream-Tool** | Desktop + HTML overlays | Cross-platform GUI, remote control, multi-operator support | [github.com/Readek/Pokemon-Stream-Tool](https://github.com/Readek/Pokemon-Stream-Tool) |
| **pkmn-tournament-overlay-tool** | Web-based | Professional-level overlays, integrates with Play! Pokemon TOM software | [github.com/FomTarro/pkmn-tournament-overlay-tool](https://github.com/FomTarro/pkmn-tournament-overlay-tool) |
| **Pokemon Team Stream Overlay** | Windows app | Team display for streams | [coboldthefox.itch.io](https://coboldthefox.itch.io/pokemon-team-stream-overlay) |

**Key insight:** Existing overlay tools handle tournament brackets and team display, but NONE provide a live draft overlay. A browser-based draft spectator view designed for OBS (clean layout, no chrome, team sprites updating in real-time) would be unique and immediately valuable to the content creator community.

### Shareable Draft Results

Current state: Coaches screenshot their draft results or manually create graphics.

**What creators need:**
1. **Image export:** A clean, branded image of draft results (all teams, picks in order) -- shareable on Twitter/Discord
2. **PokePaste export:** Every team exportable for Showdown import
3. **Replay/recap:** Animated or step-by-step draft recap showing pick order, reactions, surprises
4. **Embed widget:** Shareable URL that renders a live or completed draft board (like a tweet embed)

### Spectator Features for Broadcasts

**What streamers do today:**
- Screen share the Discord channel where draft happens (ugly, hard to follow)
- Use custom Google Sheets with audience (static, no real-time feel)
- Some use Pokemon-Stream-Tool for team display after draft

**What they need:**
- Dedicated spectator view with no interactive controls (view-only)
- "Broadcaster mode" -- larger text, cleaner layout, OBS-optimized dimensions (1920x1080 or 1280x720)
- Live pick-by-pick animation visible to spectators
- Team rosters building in real-time as picks happen
- Optional commentary/reaction overlay zones

---

## 6. Key Insights and Opportunities

### The Central Gap

The Pokemon draft league community has:
- Good tools for battles (Pokemon Showdown)
- Good tools for stats (Pikalytics, Smogon stats)
- Good tools for team sharing (PokePaste)
- Adequate tools for draft execution (Discord bots)
- Adequate tools for league management (DraftZone, Google Sheets)

But NO single platform provides a premium, real-time draft experience with integrated competitive data and league management. The workflow is fragmented across 4-6 tools.

### What "Gold Standard" Means

A gold-standard Pokemon draft platform would:

1. **Replace the Discord bot draft** with a real-time, visually premium draft room (the core differentiator)
2. **Integrate competitive data** (@pkmn/smogon usage stats, @smogon/calc damage calcs) directly into the draft and matchup prep experience
3. **Support the full league lifecycle** (draft > season > matchup prep > results > standings) so coaches don't need Google Sheets
4. **Enable content creators** with spectator views, OBS overlays, and shareable results
5. **Export to existing ecosystem** (PokePaste format, Showdown compatibility) rather than trying to replace Showdown for battles

### What NOT to Build

- **A battle simulator** -- Pokemon Showdown is entrenched and maintained by Smogon. Battles happen there. Don't compete.
- **A general Pokemon database** -- PokeAPI, Bulbapedia, Serebii exist. Use their data, don't rebuild it.
- **A Discord bot** -- The platform should have Discord integration (webhooks for notifications, OAuth for login) but the draft experience should be web-based, not bot-based.

### Priority Data Integrations

1. **@pkmn/smogon** for usage stats during draft (show "this Pokemon is used in X% of teams")
2. **@smogon/calc** for matchup prep damage calculations
3. **PokePaste import/export** for ecosystem interoperability
4. **Showdown replay link** integration for tracking match results

---

## 7. Competitive Advantage Matrix

| Feature | DraftZone | DraftMon | Discord Bots | This Platform (Target) |
|---------|-----------|----------|-------------|----------------------|
| Real-time draft room | No | Basic | Text-based | Premium (animations, timer, sound) |
| Snake draft | Manual | Yes | Yes | Yes |
| Auction draft | No | No | No | Yes |
| League management | Yes | No | Partial | Yes |
| Matchup analysis | Yes (manual) | No | No | Yes (automated with calcs) |
| Usage stats integration | No | No | No | Yes (@pkmn/smogon) |
| Damage calculator | No | No | No | Yes (@smogon/calc) |
| PokePaste export | No | No | No | Yes |
| Spectator mode | No | No | No | Yes |
| OBS overlay | No | No | No | Yes |
| Mobile-optimized | Partial | No | Discord mobile | Yes (PWA) |
| VGC format support | Yes | Limited | Varies | Yes |
| Smogon format support | Yes | Limited | Yes | Yes |
| Content creator tools | No | No | No | Yes |
| Shareable results | Links | No | Screenshots | Image export, embed, link |

---

## Sources

- [Pokemon DraftZone](https://pokemondraftzone.com/) -- primary web competitor
- [DraftMon](https://draftmon-web.web.app/) -- Firebase-based draft rooms
- [Smogon Draft League Resources](https://www.smogon.com/forums/threads/draft-league-resources.3716128/)
- [Smogon DraftZone Thread](https://www.smogon.com/forums/threads/pokemon-draftzone-the-ultimate-draft-league-website.3744321/)
- [ClodBot](https://clodbot.com/) -- Discord replay analysis bot
- [PorygonBot](https://github.com/PorygonBot/bot) -- Live battle stat tracker
- [pkmnDiscordBot](https://github.com/sandyllama/pkmnDiscordBot) -- Draft management bot
- [@smogon/calc on npm](https://www.npmjs.com/package/@smogon/calc) -- Damage calculator library
- [@pkmn/smogon on npm](https://www.npmjs.com/package/@pkmn/smogon) -- Usage stats wrapper
- [Smogon Usage Stats](https://www.smogon.com/stats/) -- Monthly competitive data
- [Pikalytics](https://www.pikalytics.com/) -- VGC usage statistics
- [Statsugiri](https://www.statsugiri.gg/) -- VGC tournament data platform
- [PokePaste Syntax](https://pokepast.es/syntax.html) -- Team sharing format spec
- [TourKOAL](https://www.skeletom.net/pkmn/tournament-overlay/) -- Tournament overlay tool
- [Pokemon-Stream-Tool](https://github.com/Readek/Pokemon-Stream-Tool) -- OBS overlay tool
- [pkmn-tournament-overlay-tool](https://github.com/FomTarro/pkmn-tournament-overlay-tool) -- Broadcast overlays
- [lol-pick-ban-ui](https://github.com/RCVolus/lol-pick-ban-ui) -- LoL esports draft broadcast UI
- [Top Fantasy Sports App Features 2026](https://www.sportsfirst.net/post/top-features-users-expect-in-a-fantasy-sports-app-in-2026)
- [Fantasy Football Draft Clocks](https://thefantasyfootballalmanac.com/2026/03/11/best-fantasy-football-draft-clocks/amp/)
- [DraftySports Pokemon](https://draftysports.com/pokemon) -- Auction draft software
- [OnlineDraft](https://www.onlinedraft.com/pokemon-draft) -- Generic draft board
