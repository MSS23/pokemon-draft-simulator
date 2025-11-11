# Weekly Schedule Features

## Overview
The league system now includes proper weekly scheduling with automatic date calculation and week progression.

## ✅ Features Implemented

### 1. **Weekly Match Scheduling**
Matches are automatically scheduled 7 days apart when the league is created:

```typescript
// In LeagueService.generateSchedule()
const weekDate = config.startDate
  ? new Date(config.startDate.getTime() + round * 7 * 24 * 60 * 60 * 1000)
  : null
```

**Example Schedule:**
- Week 1: January 15, 2025
- Week 2: January 22, 2025
- Week 3: January 29, 2025
- Week 4: February 5, 2025
- etc.

### 2. **Scheduled Date Display**
Matches now show their scheduled date:

```
Week 1 Fixtures
Best of 3 format • Mon, Jan 15

Match Card:
Team A vs Team B
scheduled • Jan 15, 2025
```

### 3. **Week Advancement System**
New functionality to progress through the season:

**Methods Added:**
- `LeagueService.advanceToNextWeek(leagueId)` - Move to next week
- `LeagueService.canAdvanceWeek(leagueId, week)` - Check if can advance

**Rules:**
- Can only advance when **all matches for current week are completed**
- Button appears when all matches done: "Advance to Week X"
- Final week shows: "Complete Season" button
- Automatically marks league as completed after final week

### 4. **Visual Indicators**

**League Hub Header:**
```
Week 3 of 12
Best of 3 format • Mon, Jan 29
[Advance to Week 4] button (appears when week complete)
```

**Match Cards:**
```
Team Alpha vs Team Beta
2 - 1
scheduled • Jan 29, 2025
[Record Result] button
```

### 5. **Season Completion**
When advancing past the final week:
- League status changed to "completed"
- End date set to current date
- No more advancement possible
- Final standings locked

## 🎮 User Flow

### Week-by-Week Progression:
1. **Week 1 Starts** (e.g., Jan 15)
   - All Week 1 matches shown
   - Status: "scheduled"
   - Date: Jan 15, 2025

2. **Record Match Results**
   - Click "Record Result" on each match
   - Enter scores, Pokemon KOs
   - Match status → "completed"

3. **All Week 1 Matches Done**
   - "Advance to Week 2" button appears
   - Click to move to next week

4. **Week 2 Loads** (e.g., Jan 22)
   - New set of matches shown
   - Previous week results in history
   - Standings updated

5. **Repeat Until Final Week**
   - Continue through all weeks
   - Standings update after each match

6. **Season Ends**
   - Final week complete
   - Click "Complete Season"
   - League marked as completed
   - Champion determined

## 📅 Scheduling Logic

### Round-Robin Algorithm
Teams play each other once (or twice if league has enough weeks):

**4 Teams:**
- Week 1: A vs B, C vs D
- Week 2: A vs C, B vs D
- Week 3: A vs D, B vs C

**6 Teams:**
- Week 1: A vs B, C vs D, E vs F
- Week 2: A vs C, B vs E, D vs F
- Week 3: A vs D, B vs F, C vs E
- Week 4: A vs E, B vs D, C vs F
- Week 5: A vs F, B vs C, D vs E

### Date Calculation
```typescript
// Start date: Jan 15, 2025
// Week 1: Jan 15 (start + 0 weeks)
// Week 2: Jan 22 (start + 1 week)
// Week 3: Jan 29 (start + 2 weeks)
// Week N: start + (N-1) weeks
```

## 🔧 Technical Details

### Database Schema
```sql
-- leagues table
current_week INTEGER DEFAULT 1
total_weeks INTEGER NOT NULL
start_date TIMESTAMPTZ
end_date TIMESTAMPTZ
status TEXT -- 'scheduled', 'active', 'completed'

-- matches table
week_number INTEGER NOT NULL
scheduled_date TIMESTAMPTZ
status TEXT -- 'scheduled', 'in_progress', 'completed'
```

### Service Methods
```typescript
// Create league with start date
LeagueService.createLeagueFromDraft(draftId, {
  leagueName: "My League",
  totalWeeks: 12,
  startDate: new Date(), // Week 1 starts now
  matchFormat: "best_of_3"
})

// Get fixtures for specific week
const fixtures = await LeagueService.getWeekFixtures(leagueId, weekNumber)

// Check if can advance
const canAdvance = await LeagueService.canAdvanceWeek(leagueId, currentWeek)

// Advance to next week
await LeagueService.advanceToNextWeek(leagueId)
```

### UI Components
```typescript
// League page state
const [canAdvance, setCanAdvance] = useState(false)
const [isAdvancing, setIsAdvancing] = useState(false)

// Check advancement
useEffect(() => {
  const checkAdvancement = async () => {
    const canAdvance = await LeagueService.canAdvanceWeek(leagueId, currentWeek)
    setCanAdvance(canAdvance)
  }
  checkAdvancement()
}, [weekFixtures])

// Advance handler
const handleAdvanceWeek = async () => {
  await LeagueService.advanceToNextWeek(leagueId)
  await loadLeagueData() // Reload with next week's fixtures
}
```

## 🎯 Example Timeline

**12-Week Season:**

| Week | Date       | Status      | Action                |
|------|------------|-------------|-----------------------|
| 1    | Jan 15     | In Progress | Record 3 matches      |
| 2    | Jan 22     | Scheduled   | Click "Advance"       |
| 3    | Jan 29     | Scheduled   | (After Week 2 done)   |
| 4    | Feb 5      | Scheduled   | ...                   |
| 5    | Feb 12     | Scheduled   | ...                   |
| 6    | Feb 19     | Scheduled   | ...                   |
| 7    | Feb 26     | Scheduled   | ...                   |
| 8    | Mar 5      | Scheduled   | Trade Deadline        |
| 9    | Mar 12     | Scheduled   | ...                   |
| 10   | Mar 19     | Scheduled   | ...                   |
| 11   | Mar 26     | Scheduled   | ...                   |
| 12   | Apr 2      | Final Week  | Click "Complete"      |

**Result:** Season runs from Jan 15 - Apr 2 (12 weeks = ~3 months)

## 🚀 Benefits

1. **Realistic Pacing**: Matches happen weekly, not all at once
2. **Clear Schedule**: Everyone knows when their matches are
3. **Progression Control**: Manual advancement prevents auto-progression
4. **Trading Windows**: Can enable/disable trades between weeks
5. **Season Arc**: Build excitement over weeks/months
6. **Flexible Timing**: Teams record results when convenient within the week

## 📝 Notes

- **Manual Advancement**: Commissioner/league admin clicks "Advance" button
- **No Auto-Advance**: System waits for all matches to complete
- **Flexible Recording**: Teams can record results anytime during the week
- **Trade Windows**: Trades happen between weeks (not during)
- **Real Dates**: Uses actual calendar dates for scheduling

## 🔮 Future Enhancements

Potential additions:
- **Auto-Advance Option**: Automatically move to next week on Sunday night
- **Reminders**: Email/notification when matches are scheduled
- **Week Preview**: See next week's fixtures in advance
- **Bye Weeks**: Schedule breaks (no matches some weeks)
- **Flexible Scheduling**: Allow teams to reschedule within a window
- **Live Scoring**: Update scores in real-time during matches

---

**Status**: ✅ Complete and Functional
**Version**: 1.0.0
**Last Updated**: January 11, 2025
