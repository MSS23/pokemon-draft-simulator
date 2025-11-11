# Pokémon Draft League - Complete Application Guide

**Build your dream team in real-time competitive Pokémon drafts**

---

## 📋 Table of Contents

1. [What is Pokémon Draft League?](#what-is-pokémon-draft-league)
2. [Getting Started](#getting-started)
3. [Creating a Draft](#creating-a-draft)
4. [Draft Formats Explained](#draft-formats-explained)
5. [Participating in a Draft](#participating-in-a-draft)
6. [Pokémon Selection & Strategy](#pokémon-selection--strategy)
7. [Wishlist System](#wishlist-system)
8. [Spectator Mode](#spectator-mode)
9. [League System](#league-system)
10. [Match Management](#match-management)
11. [Pokémon Tracking & Nuzlocke Mode](#pokémon-tracking--nuzlocke-mode)
12. [Trading System](#trading-system)
13. [Advanced Statistics](#advanced-statistics)
14. [AI-Powered Features](#ai-powered-features)
15. [Weekly Highlights](#weekly-highlights)
16. [Host & Admin Controls](#host--admin-controls)
17. [Sharing & Export](#sharing--export)
18. [Tips & Best Practices](#tips--best-practices)
19. [Troubleshooting](#troubleshooting)
20. [Technical Information](#technical-information)

---

## 🎮 What is Pokémon Draft League?

Pokémon Draft League is a **real-time multiplayer web application** designed for competitive Pokémon draft tournaments. It combines the excitement of fantasy sports drafts with the strategy of competitive Pokémon battling.

### Key Features

- **Real-Time Drafting**: Live snake or auction drafts with instant updates
- **Multiple Formats**: VGC 2024 Reg H, Smogon tiers, custom formats
- **League Management**: Post-draft leagues with match tracking and standings
- **AI Analysis**: Get strategic recommendations and matchup predictions
- **Pokémon Tracking**: Track KOs, deaths, and performance statistics
- **Trading System**: Negotiate trades between league weeks
- **Spectator Mode**: Watch public drafts live
- **Guest Access**: No account required to participate

### Who Is This For?

- Competitive Pokémon VGC players
- Pokémon Showdown community
- Fantasy sports enthusiasts
- Friend groups looking for organized tournaments
- Content creators streaming draft tournaments

---

## 🚀 Getting Started

### Creating an Account

1. **Navigate to the homepage** at `/`
2. **Choose your authentication method**:
   - **Email/Password**: Click "Sign In" → "Create Account"
   - **OAuth**: Sign in with Google or GitHub (one-click)
   - **Guest Access**: Click any action without signing in

### Guest vs. Registered Users

| Feature | Guest | Registered |
|---------|-------|------------|
| Create Drafts | ✅ | ✅ |
| Join Drafts | ✅ | ✅ |
| Spectate | ✅ | ✅ |
| Save Preferences | ❌ | ✅ |
| View Draft History | ❌ | ✅ |
| Custom Display Name | ❌ | ✅ |

**Guest Limitations**: Your session is stored in browser localStorage. Clearing browser data will reset your identity.

### Navigation

- **Homepage** (`/`): Create, join, or watch drafts
- **Dashboard** (`/dashboard`): View your drafts and leagues
- **Watch Drafts** (`/watch-drafts`): Browse public drafts

---

## 🎯 Creating a Draft

### Step-by-Step Draft Creation

1. **Click "Create Draft"** from the homepage
2. **Configure your draft settings**:

#### Basic Settings
- **Draft Name**: Give your draft a descriptive name
- **Format**: Choose between Snake or Auction
- **Number of Teams**: 2, 4, 6, or 8 teams
- **Pokémon per Team**: 3-15 (minimum 6 for competitive formats)
- **Budget per Team**: 50, 75, 100, 120, 150, or 200 points

#### Format & Rules
- **Competitive Format**: Select from 15+ official formats
  - VGC 2024 Regulation H (competitive standard)
  - VGC 2024 Regulation G
  - Smogon OU/UU/RU (Gen 4-9)
  - National Dex AG (unrestricted)
  - Custom formats via CSV upload
- **Time Limit per Pick**: 30 seconds to 4 hours, or no limit
- **Allow Undos**: Let host undo last pick (default: enabled)
- **Max Undos per Team**: 0-10 (default: 3)

#### Advanced Options
- **Auto-Create League**: Generate league immediately after draft
- **Public Draft**: Allow spectators (visible on `/watch-drafts`)
- **Password Protection**: Require password to join (private drafts)
- **Custom Format Upload**: Upload CSV with custom Pokémon pricing

3. **Click "Create Draft"** → Receive 6-character room code (e.g., `ABC123`)
4. **Share the room code** with participants

### Custom Format CSV Structure

```csv
pokemon_id,pokemon_name,cost,is_legal
25,Pikachu,15,true
6,Charizard,50,true
150,Mewtwo,100,false
```

**Columns:**
- `pokemon_id`: National Dex number
- `pokemon_name`: Pokémon name
- `cost`: Point cost (1-200)
- `is_legal`: `true` = pickable, `false` = banned

---

## 🐍 Draft Formats Explained

### Snake Draft

**How It Works:**
- Teams pick in order (1→2→3→4), then reverse (4→3→2→1)
- Round 1: Team 1, Team 2, Team 3, Team 4
- Round 2: Team 4, Team 3, Team 2, Team 1
- Round 3: Team 1, Team 2, Team 3, Team 4
- Continues until all teams reach Pokémon limit

**Strategy Tips:**
- First pick advantage: Choose high-value Pokémon
- Last pick advantage: Two consecutive picks at round turns
- Mid-pack picks: Most balanced position

**Time Management:**
- Pick timer counts down when it's your turn
- Auto-pick triggers if timer expires (from wishlist)
- Host can extend time limit or force pick

### Auction Draft

**How It Works:**
- Teams nominate Pokémon for auction
- Players bid competitively using their budget
- Highest bidder wins the Pokémon
- Auction ends when timer expires or no new bids
- Continues until all teams are full

**Bidding Rules:**
- Starting bid: Set by nominating team
- Bid increments: Minimum +1 point per bid
- Budget validation: Cannot bid more than remaining budget
- Binding bids: Cannot retract after placing

**Strategy Tips:**
- Save budget for late-game steals
- Nominate Pokémon you DON'T want to drain opponents' budgets
- Don't get into bidding wars early
- Track opponents' remaining budgets

---

## 🎲 Participating in a Draft

### Joining a Draft

1. **Receive room code** from draft host (e.g., `ABC123`)
2. **Click "Join Draft"** on homepage
3. **Enter room code** and click "Join"
4. **Choose your team name** and display name
5. **Wait in lobby** until host starts the draft

### Draft Room Interface

**Main Sections:**
- **Pokémon Grid**: Browse all available Pokémon (left side)
- **Your Team**: View your roster and budget (right side)
- **Other Teams**: See opponents' picks and budgets (tabs/dropdown)
- **Turn Indicator**: Shows current team and time remaining
- **Activity Feed**: Recent picks and events (sidebar)
- **Chat**: Communicate with participants (bottom/side panel)

**Status Indicators:**
- 🟢 **Your Turn**: You can pick
- 🟡 **Waiting**: Another team's turn
- 🔴 **Timer Warning**: Less than 10 seconds remaining
- ⏸️ **Paused**: Host paused the draft
- ✅ **Complete**: Draft finished

### Making a Pick

**Snake Draft:**
1. Wait for your turn (turn indicator highlights you)
2. Click a Pokémon card in the grid
3. Review Pokémon details in modal
4. Click "Confirm Pick"
5. Pokémon added to your roster, budget deducted

**Auction Draft:**
1. **Nominating**: Click Pokémon → "Nominate for Auction" → Set starting bid
2. **Bidding**: Click "Bid" button → Enter bid amount → Confirm
3. **Winning**: Highest bid when timer expires wins the Pokémon
4. **Auto-Win**: If only one bidder, win at starting bid

### Undo Last Pick

- **Host only** feature
- Click "Undo Last Pick" button
- Returns Pokémon to available pool
- Restores budget to team
- Limited uses (default: 3 per team)

---

## 🔍 Pokémon Selection & Strategy

### Search & Filters

**Text Search:**
- Search by name, type, ability, or move (e.g., "Pikachu", "Fire", "Levitate")
- Fuzzy matching (partial names work)
- Real-time results

**Type Filters:**
- Filter by primary or secondary type
- Multiple type selection (e.g., Water + Dragon)
- Quick type badges for common searches

**Cost Filters:**
- Drag slider to set cost range
- Filter by budget remaining
- Show only affordable Pokémon

**Stat Filters:**
- Minimum HP, Attack, Defense, Sp. Atk, Sp. Def, Speed
- Base Stat Total (BST) filter
- Sort by individual stats

**Advanced Filters:**
- Generation filter (Gen 1-9)
- Role filter (Sweeper, Tank, Support, Wall)
- Ability filter (e.g., only Intimidate users)

### Pokémon Card Details

**Information Displayed:**
- **Name** and **National Dex Number**
- **Types** (with type badges)
- **Cost** in current format
- **Base Stats** (HP/Atk/Def/SpA/SpD/Spe)
- **Base Stat Total** (BST)
- **Abilities** (up to 3)
- **Sprite or Artwork** (toggle in settings)

**Detailed View:**
- Click card for full modal
- See all stats, abilities, typing
- View weaknesses and resistances
- Compare with team composition

### Team Building Strategy

**Balanced Team Composition:**
- 2 Physical attackers
- 2 Special attackers
- 1-2 Walls/Tanks
- 1 Speed control (Tailwind, Trick Room)
- 1 Redirect/Support (Follow Me, Fake Out)

**Type Coverage:**
- Cover Fairy, Dragon, Steel types (VGC meta)
- Avoid 4x weaknesses on multiple Pokémon
- Prioritize Ground immunity (Levitate, Flying-type)

**Budget Management:**
- Don't spend >30% budget on one Pokémon (unless legendary-tier)
- Save 20-30% budget for late-game value picks
- Track opponents' spending to identify their targets

---

## 📝 Wishlist System

### Creating a Wishlist

1. **Browse Pokémon grid** and find desired Pokémon
2. **Click star icon** or "Add to Wishlist" button
3. **Pokémon appears in wishlist panel** (right sidebar)
4. **Drag to reorder** by priority (top = highest priority)

### Auto-Pick Feature

**How It Works:**
- When your turn arrives, countdown timer starts (configurable: 3-10 seconds)
- If you don't manually pick, top wishlist Pokémon auto-selected
- Budget and legality validation before auto-pick
- Skips unavailable Pokémon, moves to next priority

**Enabling/Disabling:**
- Toggle "Enable Auto-Pick" in wishlist settings
- Host can force auto-pick for absent participants
- Countdown displays on screen ("Auto-picking in 3... 2... 1...")

### Wishlist Best Practices

- **Add 10-15 Pokémon** to wishlist (more than your team size)
- **Prioritize cores**: Put synergistic Pokémon together
- **Update dynamically**: Re-prioritize based on opponents' picks
- **Include backups**: Add alternatives in case top picks taken

---

## 👁️ Spectator Mode

### Watching Public Drafts

1. **Navigate to `/watch-drafts`** or click "Watch Live" on homepage
2. **Browse available drafts**:
   - Filter by format (VGC, Smogon, etc.)
   - Filter by status (Active, Setup)
   - Search by draft name
3. **Click "Spectate"** to enter draft room

### Spectator View

**What You Can See:**
- All team rosters and budgets
- Live picks as they happen
- Pokémon grid (read-only, cannot pick)
- Activity feed with pick history
- Turn indicator showing current team
- Timer countdown

**What You Cannot Do:**
- Make picks or bids
- Send chat messages (read-only chat)
- Access host controls
- View participants' wishlists (private)

**Spectator Features:**
- Real-time updates (instant sync)
- Participant count displayed
- Join/leave anytime without disrupting draft
- Export draft results after completion

---

## 🏆 League System

### Creating a League

**Automatic Creation:**
- Enable "Auto-Create League" when creating draft
- League generated immediately when draft completes
- All teams imported with drafted rosters

**Manual Creation:**
- Navigate to completed draft results
- Click "Create League from Draft"
- Configure league settings (weeks, format, Nuzlocke mode)

### League Configuration

**Basic Settings:**
- **League Name**: Auto-generated or custom
- **Total Weeks**: 6-20 weeks (default: 8)
- **Match Format**: Best of 1, 3, 5, or 7
- **Battle Type**: WiFi (in-game) or Showdown (simulator)

**Advanced Settings:**
- **Split Conferences**: Divide teams into A/B divisions
- **Nuzlocke Mode**: Permanent Pokémon deaths
- **Trade Deadline**: Week after which trades prohibited
- **Playoff Format**: Single/double elimination (future)

### Scheduling Algorithm

**Round-Robin (Circle Method):**
- Every team plays every other team
- Balanced home/away games
- Bye weeks for odd number of teams
- Automatic fixture generation

**Week Structure:**
```
Week 1: Team 1 vs Team 2, Team 3 vs Team 4
Week 2: Team 1 vs Team 3, Team 2 vs Team 4
Week 3: Team 1 vs Team 4, Team 2 vs Team 3
... (continues until all matchups complete)
```

### Standings

**Displayed Information:**
- **Team Name** and **Seed**
- **Record**: Wins-Losses-Draws
- **Points For** (total games won)
- **Points Against** (total games lost)
- **Point Differential** (for/against)
- **Current Streak** (e.g., "W3" = 3-game win streak)

**Tiebreaker Rules:**
1. Win percentage
2. Head-to-head record
3. Point differential
4. Points for

---

## ⚔️ Match Management

### Recording Match Results

1. **Navigate to league page** (`/league/[id]`)
2. **Click "Record Result"** on scheduled match
3. **Enter game-by-game scores**:
   - Best of 3: Enter up to 3 game results
   - Best of 5: Enter up to 5 game results
4. **Select winner for each game**
5. **Track Pokémon KOs** (optional but recommended)
6. **Add notes** (e.g., replay codes, highlights)
7. **Click "Submit Result"**

### Game-by-Game Tracking

**Example (Best of 3):**
```
Game 1: Team A wins (4 KOs - 6 KOs) ✅
Game 2: Team B wins (5 KOs - 3 KOs) ✅
Game 3: Team A wins (6 KOs - 2 KOs) ✅
Final: Team A wins 2-1
```

**Why Track Games?**
- See close vs. dominant victories
- Identify momentum shifts
- More accurate KO statistics
- Better analytics

### Automatic Standings Updates

When you submit a match result:
1. **Winner**: +1 win, points for = games won
2. **Loser**: +1 loss, points against = games lost
3. **Standings**: Auto-recalculated (rank, differential, streak)
4. **Notifications**: Teams notified of result

---

## 💀 Pokémon Tracking & Nuzlocke Mode

### Pokémon Health Status

**Three States:**
- 🟢 **Healthy**: Active, can battle
- 🟡 **Fainted**: Temporarily unavailable (recovers next match)
- 🔴 **Dead**: Permanently unusable (Nuzlocke only)

### KO Tracking

**Per-Pokémon Statistics:**
- **Matches Played**: Total appearances
- **Matches Won**: Victories while on team
- **KOs Given**: Opponent Pokémon fainted
- **KOs Taken**: Times this Pokémon fainted
- **KO Ratio**: Given/Taken (e.g., 2.5 = excellent)

**Match KO Entry:**
1. During match result recording
2. Click "Track KOs" button
3. Select which Pokémon fainted (both teams)
4. Enter KO details (optional: move used, turn number)
5. Submit with match result

### Nuzlocke Mode

**What Is Nuzlocke?**
- Optional league setting
- Pokémon that faint are **permanently dead**
- Dead Pokémon cannot battle or be traded
- Adds strategic depth and risk

**Nuzlocke Rules:**
- First faint = warning (Pokémon injured)
- Second faint = permanent death
- OR single-faint death (hardcore mode)
- Death displays memorial icon 💀

**Strategic Implications:**
- Protect star Pokémon (avoid risky plays)
- Build deeper benches (more than 6 Pokémon)
- Trade becomes critical (replace losses)
- Underdog upsets more impactful

---

## 🔄 Trading System

### Proposing a Trade

1. **Navigate to league trades page** (`/league/[id]/trades`)
2. **Click "Propose Trade"**
3. **Select teams**:
   - Your team (offering)
   - Opponent team (requesting)
4. **Select Pokémon**:
   - Drag Pokémon from your roster to "Offering" box
   - Drag opponent's Pokémon to "Requesting" box
5. **Add notes** (explain trade reasoning)
6. **Submit trade proposal**

### Trade Validation

**Automatic Checks:**
- ✅ Teams have space for incoming Pokémon
- ✅ No dead Pokémon in Nuzlocke leagues
- ✅ Trade deadline not passed
- ✅ Both teams have submitted lineups
- ❌ Cannot trade during active matches

### Trade Approval Workflow

**Two-Party Approval:**
1. **Proposer** submits trade
2. **Recipient** receives notification
3. **Recipient** reviews and accepts/rejects
4. **If accepted**: Pokémon ownership transfers immediately

**Commissioner Approval (Optional):**
1. After recipient accepts
2. Commissioner (host) reviews trade
3. Commissioner approves/vetoes
4. If approved, trade completes

### Trade Deadline

- Configurable per league (e.g., Week 6 of 8-week league)
- After deadline: No new trades allowed
- Prevents last-minute roster dumping
- Display: "Trade Deadline: Week 6"

### Trade History

**View All Trades:**
- Navigate to "Trades" tab in league
- See: Date, teams involved, Pokémon swapped, status
- Filter: Accepted, Rejected, Pending

---

## 📊 Advanced Statistics

### Team Statistics

**Offensive Metrics:**
- **Points For**: Total games won
- **KOs Given**: Total opponent Pokémon fainted
- **Offensive Rating**: 0-10 scale (algorithm-based)
- **Avg Points Per Match**: Scoring consistency

**Defensive Metrics:**
- **Points Against**: Total games lost
- **KOs Taken**: Total own Pokémon fainted
- **Defensive Rating**: 0-10 scale
- **Opponent Avg Points**: Defense effectiveness

**Advanced Metrics:**
- **Pythagorean Expectation**: Expected win % based on scoring
- **Point Differential**: Net scoring (for - against)
- **Roster Health**: % of Pokémon active (not dead)
- **KO Differential**: Net KOs (given - taken)

### Power Rankings

**Ranking Algorithm:**
- **Wins** (40% weight): Most important factor
- **Recent Form** (25%): Last 5 matches performance
- **Offensive Rating** (20%): Scoring ability
- **Defensive Rating** (15%): Defense strength

**Power Score**: 0-100 composite score
- 90-100: Dominant (🔥 Hot)
- 70-89: Strong
- 50-69: Average
- 30-49: Struggling
- 0-29: Weak (❄️ Cold)

**Visual Indicators:**
- **#1**: 🥇 Gold badge
- **#2**: 🥈 Silver badge
- **#3**: 🥉 Bronze badge
- **Trend**: ⬆️ Rising, ⬇️ Falling, ➖ Stable

### Head-to-Head Records

**Compare Two Teams:**
- Win-Loss-Draw record
- Total points for/against in matchups
- Last meeting result
- Series scoring average

**Use Cases:**
- Predict future matchups
- Identify rivalries
- Playoff seeding tiebreakers

### Individual Pokémon Stats

**Per-Pokémon Analytics:**
- Win % when Pokémon used
- KO rate per match
- Performance vs. team average
- Best matchups (types dominated)

**Leaderboards:**
- Most KOs Given (league-wide)
- Best KO Ratio
- Most Matches Played
- Survivor (no deaths in Nuzlocke)

---

## 🤖 AI-Powered Features

### AI Team Analysis

**What It Provides:**
- **Overall Rating**: 0-100 team strength score
- **Grade**: A+ to F letter grade
- **Strengths**: Top 3-5 team advantages (e.g., "Excellent type coverage")
- **Weaknesses**: Top 3-5 vulnerabilities (e.g., "Weak to Fairy")
- **Playstyle**: Offensive, Defensive, Balanced, HyperOffense
- **Recommendations**: Strategic advice (e.g., "Add Ground immunity")

**How to Access:**
1. Navigate to league team page
2. Click "AI Analysis" button
3. Wait 2-3 seconds for analysis
4. View detailed breakdown

**Access Control:**
- League participants only (cannot analyze opponents' teams)
- Draft participants can analyze their own team post-draft

### AI Matchup Predictions

**What It Provides:**
- **Winner Prediction**: Team name + confidence %
- **Predicted Score**: Game score forecast (e.g., "3-2")
- **Key Factors**: 5 matchup considerations
  - Type advantages
  - Speed control
  - Coverage moves
  - Defensive walls
  - Win conditions
- **Strategic Advice**: Tips for both teams

**How to Access:**
1. Navigate to upcoming match
2. Click "AI Prediction" button
3. View prediction modal

**Accuracy:**
- Based on team composition, stats, type matchups
- Does NOT account for player skill
- Historical accuracy: ~65-70%

### AI Draft Analysis

**Post-Draft Breakdown:**
- **Overall Draft Quality**: 0-100 score
- **Competitive Balance**: How even teams are
- **Team Rankings**: 1st to last with grades
- **Best Team**: Highest-rated roster
- **Biggest Steal**: Best value pick
- **Overpayments**: Pokémon drafted above value
- **Value Picks**: Pokémon drafted below value

**How to Access:**
1. Navigate to completed draft results
2. Click "AI Analysis" tab
3. View comprehensive breakdown

**Public Draft Access:**
- Public drafts: Anyone can view AI analysis
- Private drafts: Participants only

### AI Draft Assistant (In-Draft)

**Real-Time Recommendations:**
- Suggests top 5 picks for your turn
- Considers: Budget, team needs, value
- Updates dynamically as opponents pick
- Explains reasoning for each suggestion

**How to Use:**
1. Click "AI Assistant" button during draft
2. View recommendations panel
3. Click suggested Pokémon to quick-pick
4. Or ignore and pick manually

**Note:** AI is a tool, not a requirement. Expert players often deviate from suggestions based on meta knowledge.

---

## 📰 Weekly Highlights

### Auto-Generated Highlights

**System automatically detects notable events:**

**Match Highlights:**
- 💪 **Dominant Win**: 3+ game margin victory
- 🔥 **High-Scoring Match**: 8+ total games played
- 🛡️ **Shutout**: Team wins without losing a game
- 🎯 **Upset Victory**: Lower-ranked team beats higher-ranked

**Pokémon Highlights:**
- ⚡ **KO Leader**: Most KOs this week
- 🏆 **Perfect Week**: Pokémon wins all matches
- 💀 **Tragic Death**: Pokémon dies (Nuzlocke)

**Trade Highlights:**
- 🔄 **Blockbuster Trade**: High-value Pokémon swapped

### Weekly Summary

**Displays:**
- Total matches played this week
- Total KOs recorded
- Total deaths (Nuzlocke)
- Total trades completed
- Team of the Week (best performance)
- Top 3 Pokémon performers

### Manual Highlights

**Commissioners can add custom highlights:**
1. Navigate to weekly summary
2. Click "Add Highlight"
3. Enter title, description, type (icon)
4. Assign to team/Pokémon (optional)
5. Save

**Use Cases:**
- Close matches worth mentioning
- Player quotes or reactions
- Strategic plays or comebacks
- Community moments

---

## 🛠️ Host & Admin Controls

### Host Powers

**Draft Management:**
- ⏯️ **Start/Pause/Resume** draft
- ⏭️ **Force Next Pick** (skip absent participant)
- ↩️ **Undo Last Pick** (limited uses)
- ⏱️ **Adjust Timer** mid-draft
- 🚪 **Kick Participant** (remove from draft)
- 🗑️ **Delete Draft** (before/after completion)

**Budget Management:**
- Open "Admin Panel" → "Budget Management"
- Adjust any team's budget
- Useful for: Corrections, rule changes, penalty enforcement

**Format Sync:**
- Refresh Pokémon costs if format updates
- Re-validate picks against new format

### Commissioner Powers (League)

**Match Management:**
- Edit match results (fix errors)
- Reschedule matches
- Override automatic standings

**Trade Management:**
- Enable/disable trade approval requirement
- Approve or veto trades
- Reverse completed trades (rare, for errors)

**League Settings:**
- Advance to next week manually
- Extend/shorten season
- Modify Nuzlocke rules mid-season (not recommended)

**Participant Management:**
- Transfer team ownership
- Remove inactive teams
- Add replacement teams (future feature)

### Admin Dashboard

**Performance Monitoring:**
- View real-time connection status
- Check participant latency
- Monitor Supabase usage
- Clear cache manually

**Troubleshooting Tools:**
- Force refresh for stuck participants
- Reset draft state (emergency only)
- View error logs

---

## 🔗 Sharing & Export

### Room Codes

**What They Are:**
- 6-character uppercase codes (e.g., `ABC123`)
- Unique identifier for each draft
- Required to join draft

**Sharing:**
- Copy room code to clipboard (button in draft room)
- Share via Discord, text, email, etc.
- Valid until draft deleted

### Direct Links

**Draft Links:**
- Format: `https://your-app.com/draft/[uuid]`
- Click to copy full URL
- Share on social media or forums

**League Links:**
- Format: `https://your-app.com/league/[uuid]`
- Shareable league page (public visibility)

### Export Features

**Team Roster Export:**
1. Navigate to team page
2. Click "Export" button
3. Choose format:
   - **CSV**: Spreadsheet-compatible
   - **JSON**: Developer-friendly
   - **PNG**: Shareable image (future)

**CSV Format:**
```csv
pokemon_name,cost,types,base_stat_total
Charizard,50,"Fire,Flying",534
Garchomp,80,"Dragon,Ground",600
```

**Draft Results Export:**
- Full draft history (pick-by-pick)
- All teams and rosters
- Budget information
- Timestamp data

**League Standings Export:**
- Current standings table
- Full match results
- KO statistics
- Trade history

---

## 💡 Tips & Best Practices

### Draft Strategy

**Snake Draft:**
1. **First pick**: Choose restricted Pokémon (pseudo-legendaries)
2. **Avoid trendy picks early**: Overvalued due to hype
3. **Target synergies**: Draft cores (e.g., Tailwind + fast attackers)
4. **Budget distribution**: Spend 50% on first 3 picks, 30% on next 2, 20% on fill-ins
5. **Check opponents' needs**: Counter their strategies

**Auction Draft:**
1. **Nominate Pokémon you don't want**: Drain opponents' budgets
2. **Never go all-in early**: Save 40%+ budget for late rounds
3. **Identify panic bidders**: Exploit emotional bidding
4. **Target ignored Pokémon**: Consensus undervalues (steals)
5. **Track budgets**: Know when opponents can't compete

### Format Selection

**VGC 2024 Reg H** (Competitive Standard):
- Best for: Serious VGC players
- Bans: All legendaries, mythicals, paradox
- Budget: 100-150 points per team
- Team size: 6-8 Pokémon

**Smogon OU** (Balanced):
- Best for: Showdown players
- Bans: Ubers and banned Pokémon
- Budget: 75-120 points per team
- Team size: 6 Pokémon

**National Dex AG** (Unrestricted):
- Best for: Casual fun, beginners
- Bans: None (all Pokémon legal)
- Budget: 150-200 points per team
- Team size: 8-10 Pokémon

### League Management

1. **Set realistic week count**: 6-8 weeks for friend groups, 12-16 for serious leagues
2. **Enforce deadlines**: Match completion by Friday, results by Sunday
3. **Encourage trade activity**: Spices up mid-season
4. **Weekly content**: Post highlights, power rankings, trash talk
5. **Use Nuzlocke carefully**: Not for first-time leagues (overwhelming)

### Team Building

**Type Coverage Checklist:**
- ✅ Fairy counter (Steel or Poison)
- ✅ Dragon counter (Fairy or Ice)
- ✅ Steel coverage (Fire or Fighting)
- ✅ Ground immunity (Flying or Levitate)
- ✅ Speed control (Tailwind, Trick Room, or priority)
- ✅ Redirect support (Follow Me, Rage Powder)

**Avoid Common Mistakes:**
- ❌ All physical or all special attackers (too predictable)
- ❌ 4x weaknesses on multiple Pokémon (exploitable)
- ❌ No defensive core (swept easily)
- ❌ No priority moves (loses to faster teams)
- ❌ Spending entire budget on 4 Pokémon (weak bench)

---

## 🔧 Troubleshooting

### Common Issues

**1. "Room code not found"**
- **Cause**: Invalid code or draft deleted
- **Fix**: Double-check code spelling, ask host for new invite

**2. "Pick not updating"**
- **Cause**: Connection lost or Supabase down
- **Fix**: Refresh page, check internet connection, wait 10 seconds

**3. "Cannot bid/pick (budget insufficient)"**
- **Cause**: Not enough remaining budget
- **Fix**: Check budget display, choose cheaper Pokémon

**4. "Auto-pick selected wrong Pokémon"**
- **Cause**: Top wishlist Pokémon unavailable or over-budget
- **Fix**: Update wishlist regularly, prioritize multiple options

**5. "League standings not updating"**
- **Cause**: Match result not submitted or trigger failed
- **Fix**: Re-submit match result, contact host to refresh standings

**6. "AI analysis not loading"**
- **Cause**: API timeout or rate limit
- **Fix**: Wait 30 seconds, try again, disable ad blockers

**7. "Trade not appearing"**
- **Cause**: Trade deadline passed or recipient notification failed
- **Fix**: Check trade deadline, refresh page, notify recipient manually

**8. "Spectator view stuck on loading"**
- **Cause**: Draft not started or Realtime subscription failed
- **Fix**: Confirm draft is active, refresh page, clear browser cache

### Browser Compatibility

**Supported Browsers:**
- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari (macOS/iOS)
- ⚠️ Opera (mostly supported)
- ❌ Internet Explorer (not supported)

**Mobile Experience:**
- Responsive design works on phones/tablets
- Touch-friendly controls
- Some features better on desktop (large Pokémon grid)

### Performance Tips

**Slow Draft Room:**
1. Close unused browser tabs
2. Disable browser extensions
3. Use "Sprite" image mode instead of "Artwork"
4. Reduce Pokémon grid size (filters)
5. Clear browser cache

**Connection Issues:**
1. Check internet stability (run speed test)
2. Disable VPN (can block WebSockets)
3. Switch from WiFi to Ethernet
4. Restart router

---

## 🖥️ Technical Information

### Technology Stack

**Frontend:**
- Next.js 15 (React 18)
- TypeScript 5
- Tailwind CSS + Shadcn/ui
- Framer Motion (animations)
- Zustand (state management)
- TanStack Query (data fetching)

**Backend:**
- Supabase (PostgreSQL database)
- Supabase Realtime (WebSockets)
- Row Level Security (RLS policies)

**Data Sources:**
- PokeAPI (Pokémon data)
- Custom format definitions

### Database Schema

**25 Total Tables:**
- 16 draft/league tables
- 5 league-specific tables
- 4 supporting tables

**Key Tables:**
- `drafts`: Draft metadata
- `teams`: Team rosters and budgets
- `picks`: Pokémon selections
- `matches`: Match results
- `standings`: League rankings
- `trades`: Trade proposals

### Performance Features

- **Virtual scrolling**: Handle 1000+ Pokémon grid
- **Lazy loading**: Images load on-demand
- **Optimistic updates**: Instant UI feedback
- **LRU caching**: Reduce API calls
- **Code splitting**: Faster initial load
- **PWA support**: Installable app

### Privacy & Security

**Data Storage:**
- Guest user IDs: localStorage only (client-side)
- Registered users: Supabase Auth (encrypted)
- Draft data: PostgreSQL with RLS policies

**Access Control:**
- Public drafts: Read-only for spectators
- Private drafts: Participants only
- League data: Participants + public visibility toggle
- AI analysis: Restricted to own team

**No Personal Data Required:**
- Email only for registered users (optional)
- No payment information
- No third-party tracking (analytics optional)

---

## 📞 Support & Community

### Getting Help

**Documentation:**
- This guide (APPLICATION_GUIDE.md)
- Developer guide (CLAUDE.md)
- Migration guide (migrations/README.md)

**Reporting Issues:**
- GitHub Issues: [your-repo-url]/issues
- Include: Browser, error message, steps to reproduce

### Community

**Discord/Forums** (if applicable):
- Share draft codes
- Find league participants
- Discuss strategy
- Report bugs

---

## 🎉 Conclusion

Pokémon Draft League provides a **complete solution** for organizing competitive Pokémon draft tournaments. Whether you're running a casual friend league or a serious VGC tournament, the platform offers:

✅ Real-time multiplayer drafting
✅ Flexible format support
✅ Comprehensive league management
✅ Advanced statistics and AI analysis
✅ Pokémon tracking and trading
✅ Spectator mode for community engagement

**Ready to start?** Head to the homepage and click **"Create Draft"**!

---

**Version**: 1.0
**Last Updated**: January 2025
**Platform**: Web Application (Next.js 15)
