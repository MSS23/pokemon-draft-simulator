# Spreadsheet Feature Comparison

## Current Implementation Status

This document compares typical Pokemon draft league spreadsheet features with our app implementation.

### ✅ Core Features Implemented

#### 1. **Team Rosters**
- **Spreadsheet**: Static list of teams with Pokemon
- **Our App**:
  - Dynamic team pages showing all drafted Pokemon
  - Pokemon status indicators (alive/fainted/dead)
  - Cost/value information
  - Draft round information

#### 2. **League Standings**
- **Spreadsheet**: W-L-D records with manual calculation
- **Our App**:
  - Automatic standings calculation
  - Win-Loss-Draw records
  - Point differential
  - Ranking by wins, then point differential
  - Auto-updates after each match

#### 3. **Weekly Fixtures**
- **Spreadsheet**: Manual schedule with dates
- **Our App**:
  - Auto-generated round-robin schedule
  - Weekly dates (7 days apart)
  - Match status (scheduled/in_progress/completed)
  - Week-by-week progression with advancement button

#### 4. **Match Results**
- **Spreadsheet**: Manual score entry
- **Our App**:
  - 3-step wizard: Game Results → Pokemon KOs → Confirm
  - Game-by-game winner selection
  - Best of 1/3/5 format support
  - Automatic standings updates

#### 5. **Pokemon KO Tracking**
- **Spreadsheet**: Manual tally marks or counts
- **Our App**:
  - Per-match KO recording
  - Per-game breakdown
  - Total KO leaderboard
  - Death tracking (Nuzlocke mode)

#### 6. **Pokemon Deaths (Nuzlocke)**
- **Spreadsheet**: Strikethrough or highlight dead Pokemon
- **Our App**:
  - Status badge system (alive/fainted/dead)
  - Death confirmation dialogs
  - Memorial/death count
  - Permanent removal from competition
  - Death date and match tracking

#### 7. **Trading System**
- **Spreadsheet**: Manual notes, highlight traded Pokemon
- **Our App**:
  - Trade proposal workflow
  - Accept/reject system
  - Automatic ownership transfer
  - Trade history with dates
  - Dead Pokemon validation
  - Trade deadline enforcement

### 🆕 Potential Enhancements (Common Spreadsheet Features)

#### 1. **Individual Pokemon Statistics**
**Spreadsheet Feature**: Detailed stats per Pokemon
- Total KOs given
- Total times KO'd/fainted
- Win rate when used
- Match history

**Proposed Enhancement**: Add Pokemon detail page with:
```typescript
interface PokemonStats {
  pickId: string
  pokemonName: string
  totalKOsGiven: number      // KOs this Pokemon caused
  totalKOsTaken: number      // Times this Pokemon was KO'd
  matchesPlayed: number
  matchesWon: number
  matchesLost: number
  winRate: number
  history: Array<{
    matchId: string
    opponent: string
    result: 'won' | 'lost'
    kosGiven: number
    kosTaken: number
  }>
}
```

#### 2. **Head-to-Head Records**
**Spreadsheet Feature**: Team A vs Team B historical record
- Total matches: 5-2-1
- Last 5 meetings
- Upcoming matchup

**Proposed Enhancement**: Add to standings page:
```typescript
interface HeadToHead {
  teamAId: string
  teamBId: string
  wins: number
  losses: number
  draws: number
  pointsFor: number
  pointsAgainst: number
  lastMeeting?: {
    date: string
    score: string
    winner: string
  }
}
```

#### 3. **Weekly Highlights/Summary**
**Spreadsheet Feature**: Notes section for each week
- Best performance
- Most KOs
- Upsets
- Notable events

**Proposed Enhancement**: Add weekly summary card:
```typescript
interface WeeklySummary {
  weekNumber: number
  highlights: string[]
  topPerformer: { teamId: string; reason: string }
  mostKOs: { pokemonId: string; koCount: number }
  biggestUpset?: { matchId: string; description: string }
}
```

#### 4. **Power Rankings**
**Spreadsheet Feature**: Subjective team power rankings
- Based on performance trends
- Form indicator (🔥 hot, ❄️ cold)

**Proposed Enhancement**: Add power rankings page:
```typescript
interface PowerRanking {
  rank: number
  previousRank: number
  teamId: string
  teamName: string
  record: string
  form: 'hot' | 'neutral' | 'cold'  // Based on last 3 matches
  streak: { type: 'win' | 'loss'; count: number }
  commentary?: string
}
```

#### 5. **Playoff Bracket (Post-Season)**
**Spreadsheet Feature**: Bracket view for playoffs
- Single/double elimination
- Seeding based on standings

**Proposed Enhancement**: Add playoff system:
```typescript
interface Playoff {
  leagueId: string
  format: 'single_elimination' | 'double_elimination'
  startDate: Date
  teams: Array<{
    seed: number
    teamId: string
  }>
  bracket: Array<{
    round: number
    matchNumber: number
    team1Id: string | null
    team2Id: string | null
    winnerId?: string | null
  }>
}
```

#### 6. **Player Notes/Scouting**
**Spreadsheet Feature**: Notes column for each team/Pokemon
- Strengths/weaknesses
- Strategy notes
- Injury notes (for us: fainted Pokemon)

**Proposed Enhancement**: Add notes system:
```typescript
interface TeamNote {
  id: string
  teamId: string
  authorId: string
  content: string
  type: 'general' | 'scouting' | 'strategy'
  isPublic: boolean
  createdAt: Date
}

interface PokemonNote {
  id: string
  pickId: string
  authorId: string
  content: string
  createdAt: Date
}
```

#### 7. **Draft Recap/History**
**Spreadsheet Feature**: Sheet showing draft order and picks
- Round-by-round recap
- Team draft grades
- "Steal of the draft"

**Proposed Enhancement**: Enhanced draft results page:
```typescript
interface DraftAnalysis {
  draftId: string
  teams: Array<{
    teamId: string
    grade: 'A+' | 'A' | 'B' | 'C' | 'D'
    bestPick: { pokemonId: string; reason: string }
    steals: string[]  // Pick IDs
    reaches: string[]  // Pick IDs
    totalValue: number
  }>
  overallBestPick: string
  overallWorstPick: string
}
```

#### 8. **Trade Analysis**
**Spreadsheet Feature**: Trade value calculator
- Who won the trade?
- Before/after team strength

**Proposed Enhancement**: Add to trade history:
```typescript
interface TradeAnalysis {
  tradeId: string
  teamAValueBefore: number
  teamAValueAfter: number
  teamBValueBefore: number
  teamBValueAfter: number
  winner?: 'team_a' | 'team_b' | 'even'
  analysis?: string
}
```

#### 9. **Season Schedule Overview**
**Spreadsheet Feature**: Calendar view of entire season
- All weeks at a glance
- Important dates (trade deadline, playoffs)

**Proposed Enhancement**: Add calendar page:
```typescript
interface SeasonCalendar {
  leagueId: string
  events: Array<{
    date: Date
    type: 'match_week' | 'trade_deadline' | 'playoff_start' | 'championship'
    weekNumber?: number
    description: string
  }>
}
```

#### 10. **Awards/Achievements**
**Spreadsheet Feature**: End of season awards
- MVP (Most Valuable Pokemon)
- Most Improved Team
- Biggest Upset
- Iron Pokemon (most durable)

**Proposed Enhancement**: Add awards system:
```typescript
interface SeasonAwards {
  leagueId: string
  mvp: { pickId: string; pokemonName: string; reason: string }
  mostImproved: { teamId: string; reason: string }
  ironPokemon: { pickId: string; matchesPlayed: number }
  glassCanon: { pickId: string; kosGiven: number; kosTaken: number }
  cinderellaStory: { teamId: string; reason: string }
}
```

### 📊 Statistics Enhancements

#### Current Stats Available:
- Team W-L-D records
- Total Pokemon KOs per team
- Dead Pokemon count (Nuzlocke)
- Point differential

#### Additional Stats Often in Spreadsheets:
1. **Offensive Stats**:
   - Average points scored per match
   - Total KOs caused
   - Offensive efficiency rating

2. **Defensive Stats**:
   - Average points allowed per match
   - Total KOs received
   - Defensive efficiency rating

3. **Form Indicators**:
   - Last 5 matches (W-W-L-D-W)
   - Home vs Away record (if applicable)
   - Current win/loss streak

4. **Advanced Metrics**:
   - Pythagorean expectation (expected wins)
   - Strength of schedule
   - Point differential per game

### 🎨 UI/UX Enhancements

#### Typical Spreadsheet Visual Elements:
1. **Conditional Formatting**:
   - Green for wins, red for losses
   - Gradient for rankings
   - Icons for streaks

2. **Charts/Graphs**:
   - Standings progression over time
   - Team performance trends
   - KO distribution

3. **Quick Links**:
   - Jump to specific week
   - Filter by team
   - Search functionality

### 🔮 Priority Recommendations

Based on typical league spreadsheet usage, prioritize:

1. **High Priority** (Most Used Features):
   - ✅ Already implemented: Team rosters, standings, fixtures, results
   - 🆕 Head-to-head records
   - 🆕 Individual Pokemon statistics
   - 🆕 Form indicators (last 5 matches)

2. **Medium Priority** (Nice to Have):
   - 🆕 Weekly highlights/summary
   - 🆕 Power rankings
   - 🆕 Season calendar view
   - 🆕 Advanced statistics

3. **Low Priority** (End of Season):
   - 🆕 Playoff bracket system
   - 🆕 Awards/achievements
   - 🆕 Draft analysis/grades
   - 🆕 Trade analysis

### 📝 Implementation Notes

All core features from typical league spreadsheets are **already implemented**:
- ✅ Team management
- ✅ Standings calculation
- ✅ Fixture scheduling
- ✅ Match results
- ✅ Pokemon KO tracking
- ✅ Death tracking (Nuzlocke)
- ✅ Trading system
- ✅ Weekly progression

The enhancements listed above are **optional additions** that may or may not be in your specific spreadsheet.

**To verify your spreadsheet's specific features**, please:
1. Open the Google Spreadsheet
2. Note which sheets/tabs exist (e.g., "Standings", "Fixtures", "Stats", "Trades")
3. List any unique formulas or features you see
4. Share screenshots or descriptions of specific features you want replicated

---

**Status**: Core implementation complete ✅
**Next Steps**: Review your specific spreadsheet to identify any unique features to add
**Last Updated**: January 11, 2025
