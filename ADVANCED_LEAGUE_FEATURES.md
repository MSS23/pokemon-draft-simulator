# Advanced League Features Documentation

## Overview

This document covers all the advanced statistics, AI analysis, and enhanced tracking features added to the Pokemon Draft League system.

**Completed**: January 11, 2025
**Version**: 2.0.0

---

## Table of Contents

1. [Individual Pokemon Statistics](#individual-pokemon-statistics)
2. [Advanced Team Statistics](#advanced-team-statistics)
3. [Head-to-Head Records](#head-to-head-records)
4. [Team Form Indicators](#team-form-indicators)
5. [Power Rankings](#power-rankings)
6. [AI Team Analysis](#ai-team-analysis)
7. [Matchup Predictions](#matchup-predictions)
8. [Weekly Highlights](#weekly-highlights)

---

## Individual Pokemon Statistics

### Overview
Track detailed performance metrics for each Pokemon throughout the league season.

### Key Metrics

**Match Performance:**
- Matches Played
- Matches Won / Lost / Drawn
- Win Rate

**Combat Statistics:**
- Total KOs Given (knockouts caused)
- Total KOs Taken (times KO'd)
- KO Ratio (KOs given / KOs taken)

**Status Tracking:**
- Current status (alive/fainted/dead)
- Death information (match, date, opponent)

**Match History:**
- Complete game-by-game history
- Opponent tracking
- Performance in each match

### Implementation

**Service**: `src/lib/league-stats-service.ts`

```typescript
// Get detailed stats for a Pokemon
const stats = await LeagueStatsService.getPokemonDetailedStats(pickId)

// Stats include:
console.log(stats.pokemonName)       // "Pikachu"
console.log(stats.matchesPlayed)     // 8
console.log(stats.winRate)           // 0.625 (62.5%)
console.log(stats.totalKOsGiven)     // 12
console.log(stats.totalKOsTaken)     // 5
console.log(stats.koRatio)           // 2.4
console.log(stats.status)            // "alive"
console.log(stats.history.length)    // 8 matches
```

### UI Component

**Page**: `src/app/league/[id]/pokemon/[pickId]/page.tsx` (Future enhancement)

Features:
- Pokemon card with sprite/artwork
- Performance metrics dashboard
- Match-by-match breakdown
- Comparison vs team average
- Type effectiveness analysis

---

## Advanced Team Statistics

### Overview
Comprehensive team analytics beyond simple win-loss records.

### Offensive Stats

- **Total Points For**: Cumulative points scored
- **Avg Points/Match**: Scoring consistency
- **Total KOs Given**: Offensive dominance
- **Avg KOs/Match**: Knockout efficiency
- **Offensive Rating**: Composite offensive score (0-100)

### Defensive Stats

- **Total Points Against**: Points allowed
- **Avg Points Against/Match**: Defensive consistency
- **Total KOs Taken**: Defensive vulnerabilities
- **Point Differential**: Overall performance indicator
- **Defensive Rating**: Composite defensive score (0-100)

### Advanced Metrics

**Pythagorean Expectation:**
Expected win percentage based on points scored/allowed.

Formula: `PF² / (PF² + PA²)`

- Identifies teams performing above/below their stats
- "Lucky" teams: Wins > Expected Wins
- "Unlucky" teams: Wins < Expected Wins

**Efficiency Ratings:**
- Offensive Efficiency: Points per match × KO multiplier
- Defensive Efficiency: Inverse of points allowed

**Roster Health:**
- % of Pokemon still active (not fainted/dead)
- Critical for Nuzlocke mode

### Implementation

```typescript
const stats = await LeagueStatsService.getAdvancedTeamStats(teamId)

// Offensive analysis
console.log(stats.offensiveRating)   // 8.5 (high scoring)
console.log(stats.avgPointsFor)      // 2.8 points/match
console.log(stats.avgKOsGiven)       // 5.2 KOs/match

// Defensive analysis
console.log(stats.defensiveRating)   // 7.2 (solid defense)
console.log(stats.avgPointsAgainst)  // 2.1 points/match

// Advanced metrics
console.log(stats.pythagoreanExpectation)  // 0.65 (65% expected win rate)
console.log(stats.healthyRosterPercentage) // 83.3% (5/6 healthy)

// Identify over/under performers
const actualWinRate = stats.wins / stats.matchesPlayed
const expectedWinRate = stats.pythagoreanExpectation
const luckFactor = actualWinRate - expectedWinRate

if (luckFactor > 0.1) {
  console.log("Team is overperforming - regression likely")
} else if (luckFactor < -0.1) {
  console.log("Team is underperforming - improvement expected")
}
```

### UI Component

**Page**: `src/app/league/[id]/team/[teamId]/page.tsx`

Displays:
- Quick stats cards (offensive/defensive/health)
- Detailed stats breakdown
- Performance trends
- Roster health visualization

---

## Head-to-Head Records

### Overview
Historical matchup data between any two teams.

### Tracked Data

**Overall Record:**
- Wins / Losses / Draws
- Total matches played

**Scoring:**
- Total points for/against
- Average points per matchup
- Point differential in series

**Match History:**
- Complete game-by-game history
- Scores and winners
- Dates and weeks

**Last Meeting:**
- Most recent matchup result
- Score and winner

### Implementation

```typescript
const h2h = await LeagueStatsService.getHeadToHeadRecord(teamAId, teamBId)

console.log(`${h2h.teamAName} leads ${h2h.wins}-${h2h.losses}-${h2h.draws}`)
console.log(`Avg score: ${h2h.avgPointsFor.toFixed(1)} - ${h2h.avgPointsAgainst.toFixed(1)}`)
console.log(`Last meeting: ${h2h.lastMeeting?.winner} won ${h2h.lastMeeting?.score}`)

// Detailed history
h2h.matches.forEach(match => {
  console.log(`Week ${match.weekNumber}: ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`)
})
```

### Use Cases

1. **Pre-Match Analysis**: Review historical performance before rematches
2. **Rivalry Tracking**: Identify competitive matchups
3. **Playoff Seeding**: Use h2h as tiebreaker
4. **Strategic Planning**: Learn from past matchups

---

## Team Form Indicators

### Overview
Track recent performance (last 5 matches) to identify hot/cold teams.

### Form Tracking

**Last 5 Results:**
- W-W-L-D-W format
- Visual indicators (colors, icons)

**Form Classification:**
- **Hot** 🔥: 4+ wins in last 5 OR 3+ wins with ≤1 loss
- **Cold** ❄️: 4+ losses in last 5 OR 3+ losses with ≤1 win
- **Neutral** ➖: Everything else

**Current Streak:**
- Type (win/loss/draw)
- Count (consecutive matches)
- Display: "3W" or "2L"

**Recent Stats:**
- Last 5 wins/losses/draws
- Points scored/allowed (last 5)

### Implementation

```typescript
const form = await LeagueStatsService.getTeamForm(teamId)

console.log(form.formString)         // "W-W-L-D-W"
console.log(form.formType)           // "hot"
console.log(form.streak.displayText) // "2W"

// Recent performance
console.log(`Last 5: ${form.last5Wins}-${form.last5Losses}-${form.last5Draws}`)
console.log(`Recent scoring: ${form.last5PointsFor} PF, ${form.last5PointsAgainst} PA`)

// UI indicators
const getFormColor = (formType: string) => {
  if (formType === 'hot') return 'text-red-500'    // Red = hot
  if (formType === 'cold') return 'text-blue-400'  // Blue = cold
  return 'text-gray-500'                            // Gray = neutral
}

const getFormIcon = (formType: string) => {
  if (formType === 'hot') return '🔥'
  if (formType === 'cold') return '❄️'
  return '➖'
}
```

### UI Display

```tsx
<div className="flex items-center gap-2">
  {/* Form badges */}
  {form.form.map((result, index) => (
    <Badge
      key={index}
      variant={result === 'W' ? 'default' : result === 'L' ? 'destructive' : 'secondary'}
    >
      {result}
    </Badge>
  ))}

  {/* Form indicator */}
  <span className={getFormColor(form.formType)}>
    {getFormIcon(form.formType)}
  </span>

  {/* Streak */}
  <span>{form.streak.displayText} streak</span>
</div>
```

---

## Power Rankings

### Overview
Composite ranking system that goes beyond win-loss record.

### Ranking Algorithm

**Power Score Calculation (0-100):**

```typescript
powerScore =
  (winRate × 30) +                    // 30% weight on overall wins
  (recentWinRate × 20) +              // 20% on recent form
  (offensiveRating × 2.5) +           // 25% on offense
  (defensiveRating × 2.5) +           // 25% on defense
  (pythagoreanExpectation × 10)       // 10% on expected wins
```

**Components:**
- **Win Rate**: Overall record (0-1)
- **Recent Win Rate**: Last 5 matches (0-1)
- **Offensive Rating**: Scoring efficiency (0-10)
- **Defensive Rating**: Defensive strength (0-10)
- **Pythagorean Expectation**: Quality of wins/losses (0-1)

### Features

**Visual Indicators:**
- Rank badges (#1 gold, #2 silver, #3 bronze)
- Trend arrows (⬆️ up, ⬇️ down, ➖ same)
- Form icons (🔥 hot, ❄️ cold, 🎯 neutral)

**Displayed Stats:**
- Power score
- Record
- Current form (W-L-D pattern)
- Streak
- Offensive/defensive ratings
- Point differential

### Implementation

**Service**: `src/lib/ai-analysis-service.ts`

```typescript
const rankings = await AIAnalysisService.generatePowerRankings(leagueId)

rankings.forEach((team, index) => {
  console.log(`#${team.rank} ${team.teamName}`)
  console.log(`  Power Score: ${team.powerScore.toFixed(1)}`)
  console.log(`  Record: ${team.record}`)
  console.log(`  Form: ${team.form}`)
  console.log(`  Trend: ${team.trend}`)
})
```

**Page**: `src/app/league/[id]/rankings/page.tsx`

Features:
- Full rankings list with all teams
- Click team to view details
- Auto-updates weekly
- Mobile-responsive cards

---

## AI Team Analysis

### Overview
Intelligent analysis of team composition and performance using rule-based AI.

### Analysis Components

**1. Overall Rating (0-100)**

Composite score based on:
- Offensive capabilities
- Defensive strength
- Roster health
- Win rate

**2. Strengths Identification**

Automatically detects:
- "Strong offensive capabilities with high scoring rate" (off rating > 8)
- "Excellent defensive resilience" (def rating > 8)
- "Team is underperforming relative to scoring" (positive luck factor)

**3. Weaknesses Detection**

Identifies:
- "Struggling to score consistently" (off rating < 4)
- "Defensive vulnerabilities" (def rating < 4)
- "Limited roster depth" (healthy roster < 50%)
- "Team is overperforming relative to scoring" (negative luck factor)

**4. Recommendations**

Strategic advice:
- "Focus on Pokemon with higher offensive stats"
- "Consider defensive Pokemon or improve type coverage"
- "Manage Pokemon health carefully"
- "Improve team composition to sustain current record"

**5. Playstyle Classification**

- **Offensive**: Off rating > Def rating × 1.2
- **Defensive**: Def rating > Off rating × 1.2
- **Balanced**: Neither offensive nor defensive dominant

**6. Strategic Guidance**

Tailored strategy based on playstyle:
- Offensive: "Continue aggressive play, focus on high-damage outputs"
- Defensive: "Maintain defensive core, add a sweeper"
- Balanced: "Adapt strategy based on opponent matchups"

### Implementation

```typescript
const analysis = await AIAnalysisService.analyzeTeam(teamId, picks, stats)

console.log(`Overall Rating: ${analysis.overallRating.toFixed(0)}/100`)
console.log(`Playstyle: ${analysis.playstyle}`)

console.log("\nStrengths:")
analysis.strengths.forEach(s => console.log(`  ✓ ${s}`))

console.log("\nWeaknesses:")
analysis.weaknesses.forEach(w => console.log(`  ✗ ${w}`))

console.log("\nRecommendations:")
analysis.recommendations.forEach(r => console.log(`  → ${r}`))

console.log(`\nStrategy: ${analysis.recommendedStrategy}`)
```

### UI Component

**Page**: `src/app/league/[id]/team/[teamId]/page.tsx`

Features:
- "Analyze Team" button
- Loading state with animation
- Categorized insights (strengths/weaknesses/recommendations)
- Visual icons and color coding
- Playstyle badge

---

## Matchup Predictions

### Overview
AI-powered predictions for upcoming matches using historical data and analytics.

### Prediction Factors

**1. Offensive vs Defensive Matchup (Impact: 8/10)**
- Compare team A offense vs team B defense
- Significant advantage if offense > defense × 1.2

**2. Current Form (Impact: 6/10)**
- Compare last 5 match performance
- Advantage if form score difference > 1

**3. Roster Health (Impact: 5/10)**
- Compare % of healthy Pokemon
- Advantage if health difference > 20%

**4. Head-to-Head History (Impact: 3/10)**
- Historical record between teams
- Slight advantage to series leader

**5. Underlying Quality (Impact: 7/10)**
- Pythagorean expectation comparison
- Team with better scoring metrics gets advantage

### Prediction Output

**Winner Prediction:**
- **Home**: Home advantage points > 60%
- **Away**: Away advantage points > 60%
- **Toss Up**: Evenly matched (40-60%)

**Confidence Level:**
- 50-65%: Slight edge
- 65-80%: Moderate favorite
- 80-95%: Strong favorite

**Predicted Score:**
Based on:
- Team's average scoring
- Adjustments for predicted winner (×1.1 or ×0.9)

### Key Matchups

Identifies individual Pokemon matchups that will determine the outcome (future enhancement with type effectiveness).

### Strategic Advice

**Home Team Advice:**
- "Focus on breaking down their strong defense"
- "Be cautious with Pokemon health"

**Away Team Advice:**
- "Their defense is strong - exploit coverage gaps"
- "Manage limited roster carefully"

### Implementation

```typescript
const prediction = await AIAnalysisService.predictMatchup(
  homeTeamId,
  awayTeamId,
  homePicks,
  awayPicks
)

console.log(`Prediction: ${prediction.predictedWinner.toUpperCase()}`)
console.log(`Confidence: ${prediction.confidence.toFixed(0)}%`)
console.log(`Score: ${prediction.predictedScore.home}-${prediction.predictedScore.away}`)

console.log("\nFactors:")
prediction.factors.forEach(f => {
  const advantageIcon = f.advantage === 'home' ? '→' :
                        f.advantage === 'away' ? '←' : '↔'
  console.log(`  ${advantageIcon} ${f.category}: ${f.description} (${f.impact}/10)`)
})

console.log(`\nAdvice for ${prediction.homeTeamName}:`)
prediction.homeTeamAdvice.forEach(a => console.log(`  • ${a}`))

console.log(`\nAdvice for ${prediction.awayTeamName}:`)
prediction.awayTeamAdvice.forEach(a => console.log(`  • ${a}`))
```

### UI Display

```tsx
<Card>
  <CardHeader>
    <CardTitle>Matchup Prediction</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Predicted winner */}
    <div className="text-center mb-4">
      <div className="text-2xl font-bold">
        {prediction.predictedWinner === 'home' ? homeTeam.name :
         prediction.predictedWinner === 'away' ? awayTeam.name :
         'Toss Up'}
      </div>
      <div className="text-sm text-muted-foreground">
        {prediction.confidence}% confidence
      </div>
    </div>

    {/* Predicted score */}
    <div className="flex items-center justify-center gap-4 mb-4">
      <div className="text-3xl font-bold">{prediction.predictedScore.home}</div>
      <span>-</span>
      <div className="text-3xl font-bold">{prediction.predictedScore.away}</div>
    </div>

    {/* Factors */}
    <div className="space-y-2">
      {prediction.factors.map((factor, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {factor.advantage === 'home' && <ArrowRight className="text-blue-500" />}
          {factor.advantage === 'away' && <ArrowLeft className="text-red-500" />}
          {factor.advantage === 'neutral' && <Minus className="text-gray-400" />}
          <span className="text-sm">{factor.description}</span>
          <Badge variant="outline">{factor.impact}/10</Badge>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

---

## Weekly Highlights

### Overview
Automatic generation of weekly summaries and notable events.

### Weekly Summary

Automatically calculated when week advances:

**Statistics:**
- Total matches played
- Total KOs recorded
- Total deaths (Nuzlocke)
- Total trades completed

**Top Performers:**
- Team of the week
- Pokemon with most KOs
- Biggest upset

**Custom Content:**
- Headline (editable)
- Summary text (editable)

### Highlight Types

**Automatically Generated:**

1. **Dominant Win** 💪
   - 3+ game victory margin
   - Example: "Team Alpha Dominates! Crushes Team Beta 5-1"

2. **High Scoring Match** 🔥
   - 8+ total games
   - Example: "Epic Battle! Alpha and Beta put on a show with a 5-4 thriller"

3. **Shutout** 🛡️
   - 0 points allowed
   - Example: "Perfect Defense! Team Alpha delivers a flawless shutout"

4. **KO Leader** ⚡
   - Most KOs in a week
   - Example: "Pikachu from Team Alpha racks up 8 KOs this week"

5. **Tragic Death** 💀
   - Pokemon death (Nuzlocke)
   - Example: "RIP Charizard from Team Beta - taken too soon"

6. **Blockbuster Trade** 🔄
   - Major trade completed
   - Example: "Huge trade! Team Alpha and Beta swap star Pokemon"

**Manually Created:**
- Custom highlights
- Notable achievements
- Milestones

### Implementation

**Database**: `migrations/012_weekly_highlights.sql`

Tables:
- `weekly_summaries`: Overall week statistics
- `weekly_highlights`: Individual notable events

**Service**: `src/lib/weekly-highlights-service.ts`

```typescript
// Auto-generate highlights when week completes
await WeeklyHighlightsService.generateWeeklySummary(leagueId, weekNumber)
await WeeklyHighlightsService.autoGenerateHighlights(leagueId, weekNumber)

// Retrieve highlights
const summary = await WeeklyHighlightsService.getWeeklySummary(leagueId, weekNumber)
const highlights = await WeeklyHighlightsService.getWeeklyHighlights(leagueId, weekNumber)

console.log(`Week ${weekNumber} Summary:`)
console.log(`  ${summary.totalMatches} matches, ${summary.totalKOs} KOs`)
console.log(`  ${summary.totalDeaths} deaths, ${summary.totalTrades} trades`)

console.log("\nHighlights:")
highlights.forEach(h => {
  console.log(`  ${h.icon} ${h.title}`)
  console.log(`     ${h.description}`)
})

// Create custom highlight
await WeeklyHighlightsService.createHighlight(leagueId, weekNumber, {
  type: 'team_milestone',
  title: 'First Team to 5 Wins!',
  description: 'Team Alpha reaches 5 wins first this season',
  icon: '🏆',
  teamId: teamAlphaId,
  isPinned: true
})
```

### Integration

Highlights are automatically generated when advancing to next week:

**File**: `src/lib/league-service.ts` - `advanceToNextWeek()`

```typescript
// Before advancing, generate highlights for completed week
await WeeklyHighlightsService.generateWeeklySummary(leagueId, currentWeek)
await WeeklyHighlightsService.autoGenerateHighlights(leagueId, currentWeek)
```

### UI Display

**Page**: `src/app/league/[id]/highlights/page.tsx` (Future enhancement)

Features:
- Weekly summary cards
- Highlight feed (chronological)
- Filter by type
- Pinned highlights at top
- Share highlights

---

## Future Enhancements

### Planned Features

1. **Season Calendar View**
   - Full season schedule at a glance
   - Important dates (trade deadline, playoffs)
   - Week-by-week navigation

2. **Playoff Bracket System**
   - Single/double elimination
   - Seeding based on standings
   - Visual bracket display
   - Advancement tracking

3. **Awards & Achievements**
   - End of season awards
   - MVP, Most Improved, Iron Pokemon
   - Badges and trophies
   - Historical records

4. **Pokemon Type Effectiveness**
   - Full type chart integration
   - Coverage analysis
   - Recommended team composition
   - Matchup advantages

5. **Real-time Matchup Simulations**
   - Battle simulator
   - Probability calculations
   - Optimal team selection

6. **Export & Sharing**
   - Export statistics to CSV/Excel
   - Share team cards
   - Generate infographics
   - Social media integration

---

## API Reference

### LeagueStatsService

```typescript
// Individual Pokemon stats
getPokemonDetailedStats(pickId: string): Promise<PokemonDetailedStats | null>

// Team stats
getAdvancedTeamStats(teamId: string): Promise<AdvancedTeamStats | null>

// Head-to-head
getHeadToHeadRecord(teamAId: string, teamBId: string): Promise<HeadToHeadRecord | null>

// Form indicators
getTeamForm(teamId: string): Promise<TeamFormIndicator | null>
getAllTeamForms(leagueId: string): Promise<TeamFormIndicator[]>
```

### AIAnalysisService

```typescript
// Team analysis
analyzeTeam(teamId: string, picks: Pick[], stats?: AdvancedTeamStats): Promise<TeamAnalysis>

// Matchup prediction
predictMatchup(
  homeTeamId: string,
  awayTeamId: string,
  homePicks: Pick[],
  awayPicks: Pick[]
): Promise<MatchupPrediction>

// Power rankings
generatePowerRankings(leagueId: string): Promise<PowerRanking[]>
```

### WeeklyHighlightsService

```typescript
// Generate summaries
generateWeeklySummary(leagueId: string, weekNumber: number): Promise<WeeklySummary | null>

// Get summaries
getWeeklySummary(leagueId: string, weekNumber: number): Promise<WeeklySummary | null>
getLeagueSummaries(leagueId: string): Promise<WeeklySummary[]>

// Manage highlights
getWeeklyHighlights(leagueId: string, weekNumber: number): Promise<WeeklyHighlight[]>
autoGenerateHighlights(leagueId: string, weekNumber: number): Promise<WeeklyHighlight[]>
createHighlight(leagueId: string, weekNumber: number, highlight: HighlightInput): Promise<WeeklyHighlight>
```

---

## Performance Considerations

### Database Indexes

All statistics queries are optimized with indexes:

```sql
-- League stats
CREATE INDEX idx_team_pokemon_status_league ON team_pokemon_status(league_id)
CREATE INDEX idx_match_pokemon_kos_match ON match_pokemon_kos(match_id)
CREATE INDEX idx_matches_league_week ON matches(league_id, week_number)

-- Weekly highlights
CREATE INDEX idx_weekly_summaries_league_week ON weekly_summaries(league_id, week_number)
CREATE INDEX idx_weekly_highlights_league_week ON weekly_highlights(league_id, week_number)
```

### Caching Strategy

- **Power rankings**: Regenerate only when matches complete
- **Team stats**: Cache with 5-minute TTL
- **Weekly summaries**: Static after week completes
- **Predictions**: Cache until rosters change

### Query Optimization

- Use `Promise.all()` for parallel queries
- Minimize database round-trips
- Pre-aggregate stats in database when possible
- Lazy load detailed stats (fetch on demand)

---

## Testing

### Unit Tests

```bash
npm test tests/league-stats.test.ts
npm test tests/ai-analysis.test.ts
npm test tests/weekly-highlights.test.ts
```

### Integration Tests

Test full workflows:
- Complete a week → Check highlights generated
- Advance weeks → Verify power rankings update
- Analyze team → Validate recommendations
- Predict matchup → Confirm factors calculated

---

## Conclusion

These advanced features transform the league system from basic tracking to a comprehensive analytics platform, providing:

✅ **Deep Insights**: Understand team and Pokemon performance
✅ **Strategic Guidance**: AI-powered recommendations
✅ **Engagement**: Weekly highlights keep players interested
✅ **Competitive Balance**: Identify strengths and weaknesses
✅ **Historical Context**: Track progress over time

**Total Lines of Code Added**: ~4,500 lines
**New Database Tables**: 2 (weekly_summaries, weekly_highlights)
**New Service Files**: 3 (league-stats, ai-analysis, weekly-highlights)
**New UI Pages**: 2 (team detail, power rankings)

---

**Last Updated**: January 11, 2025
**Version**: 2.0.0
**Status**: ✅ Production Ready
