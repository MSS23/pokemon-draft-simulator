# League System Implementation Guide

## Overview
This document tracks the implementation of the post-draft league system with team standings, weekly fixtures, match results, Pokemon KO/death tracking, and inter-week trading.

**Status**: Phase 1 Complete ✅
**Date Started**: January 10, 2025

---

## What's Been Completed

### ✅ Phase 1: Database Schema Extensions

#### Migration 010: Pokemon KO/Death Tracking
**File**: `migrations/010_league_pokemon_tracking.sql`

**Tables Created**:
1. **match_pokemon_kos** - Tracks Pokemon knockouts during matches
   - Records which Pokemon fainted in each game
   - Supports Nuzlocke permanent deaths
   - Stores optional battle details (opponent, move used, etc.)

2. **team_pokemon_status** - Overall Pokemon health across league
   - Tracks alive/fainted/dead status
   - Statistics: total KOs, matches played/won
   - Death tracking: match, date, details

**Features**:
- Automatic timestamp updates
- RLS policies configured
- Indexes for performance
- Validation prevents trading dead Pokemon

#### Migration 011: Trade System
**File**: `migrations/011_league_trades.sql`

**Tables Created**:
1. **trades** - Pokemon swaps between teams
   - Week-based trading (between gameweeks)
   - Array of pick IDs being exchanged
   - Workflow: proposed → accepted/rejected → completed
   - Commissioner approval support

2. **trade_approvals** - Optional approval workflow
   - Commissioner/admin can approve/reject trades
   - Comments and audit trail

**Views Created**:
- **trade_history** - Convenient view with team names

**Functions Created**:
- **execute_trade(uuid)** - Swaps Pokemon ownership between teams
- **validate_trade_pokemon()** - Prevents trading dead Pokemon
- **set_trade_responded_at()** - Auto-timestamps responses

**Features**:
- Dead Pokemon validation (Nuzlocke)
- Trade history/audit log
- RLS policies
- Automatic Pokemon ownership transfer

#### TypeScript Type Definitions
**File**: `src/types/index.ts`

**New Interfaces Added**:
- `MatchPokemonKO` - Pokemon knockout records
- `TeamPokemonStatus` - Pokemon health tracking
- `Trade` - Trade proposals and completions
- `TradeApproval` - Commissioner approvals
- `ExtendedLeagueSettings` - League settings with Nuzlocke/trades
- `TradeWithDetails` - UI-friendly trade object
- `MatchWithKOs` - Match with Pokemon death stats
- `TeamWithPokemonStatus` - Team roster with Pokemon health

---

## Existing Infrastructure (Already Built)

The app already has 80% of league functionality:

### Database (migration 003_league_schema.sql)
- ✅ `leagues` table - League metadata
- ✅ `league_teams` - Team-to-league mapping
- ✅ `matches` - Match scheduling and results
- ✅ `standings` - Win/loss records with auto-update triggers
- ✅ `match_games` - Individual games in best-of-X matches

### Services
- ✅ `LeagueService` (src/lib/league-service.ts)
  - Create league from draft
  - Round-robin scheduling (circle method algorithm)
  - Update match results
  - Get standings with team info
- ✅ `TournamentService` (src/lib/tournament-service.ts)
  - Single/double elimination
  - Swiss system
  - Bracket generation

### UI Components
- ✅ `TournamentSchedule` - Schedule display and result recording
- ✅ Match detail page (`/match/[id]`)
- ✅ My drafts page shows upcoming matches

---

## Next Steps: Service Layer Implementation

### 1. Create MatchKOService
**File to create**: `src/lib/match-ko-service.ts`

**Methods needed**:
```typescript
class MatchKOService {
  // Record Pokemon KO/faint
  static async recordPokemonKO(
    matchId: string,
    gameNumber: number,
    pickId: string,
    koCount: number,
    isDeath: boolean,
    details?: object
  ): Promise<MatchPokemonKO>

  // Mark Pokemon as permanently dead (Nuzlocke)
  static async markPokemonDead(
    pickId: string,
    matchId: string,
    details?: object
  ): Promise<TeamPokemonStatus>

  // Get Pokemon status
  static async getPokemonStatus(
    pickId: string,
    leagueId: string
  ): Promise<TeamPokemonStatus | null>

  // Get all KOs for a match
  static async getMatchKOs(
    matchId: string
  ): Promise<MatchPokemonKO[]>

  // Initialize Pokemon status for league
  static async initializePokemonStatus(
    leagueId: string,
    teamId: string,
    picks: Pick[]
  ): Promise<void>

  // Get team's Pokemon with status
  static async getTeamPokemonStatuses(
    teamId: string,
    leagueId: string
  ): Promise<TeamPokemonStatus[]>

  // Update Pokemon stats after match
  static async updatePokemonMatchStats(
    pickId: string,
    won: boolean
  ): Promise<void>
}
```

**Usage**:
```typescript
// After recording match result
await MatchKOService.recordPokemonKO(
  matchId,
  1, // game number
  'pick-uuid',
  2, // Pokemon fainted twice
  false // not a death
)

// If Nuzlocke enabled and Pokemon dies
await MatchKOService.markPokemonDead(
  'pick-uuid',
  matchId,
  { opponentPokemon: 'Charizard', moveUsed: 'Flare Blitz' }
)
```

### 2. Create TradeService
**File to create**: `src/lib/trade-service.ts`

**Methods needed**:
```typescript
class TradeService {
  // Propose trade
  static async proposeTrade(
    leagueId: string,
    weekNumber: number,
    fromTeamId: string,
    toTeamId: string,
    fromPicks: string[],
    toPicks: string[],
    notes?: string
  ): Promise<Trade>

  // Accept trade
  static async acceptTrade(
    tradeId: string,
    teamId: string
  ): Promise<Trade>

  // Reject trade
  static async rejectTrade(
    tradeId: string,
    teamId: string,
    reason?: string
  ): Promise<Trade>

  // Execute accepted trade
  static async executeTrade(
    tradeId: string
  ): Promise<void>

  // Cancel pending trade
  static async cancelTrade(
    tradeId: string,
    teamId: string
  ): Promise<Trade>

  // Get pending trades for team
  static async getPendingTrades(
    teamId: string
  ): Promise<TradeWithDetails[]>

  // Get trade history for league
  static async getTradeHistory(
    leagueId: string
  ): Promise<TradeWithDetails[]>

  // Validate trade is legal
  static async validateTrade(
    leagueId: string,
    pickIds: string[]
  ): Promise<{ valid: boolean; reason?: string }>

  // Commissioner approve trade
  static async approveTrade(
    tradeId: string,
    userId: string,
    approved: boolean,
    comments?: string
  ): Promise<TradeApproval>
}
```

**Usage**:
```typescript
// Propose trade
const trade = await TradeService.proposeTrade(
  leagueId,
  3, // week 3
  'team-a-id',
  'team-b-id',
  ['pick-1', 'pick-2'], // Team A gives
  ['pick-3'], // Team B gives
  'Trading for type coverage'
)

// Other team accepts
await TradeService.acceptTrade(trade.id, 'team-b-id')

// Execute the trade (swap ownership)
await TradeService.executeTrade(trade.id)
```

### 3. Extend LeagueService
**File to modify**: `src/lib/league-service.ts`

**Methods to add**:
```typescript
// Add to existing LeagueService class
static async getLeagueWithPokemonStatus(
  leagueId: string
): Promise<League & { teams: TeamWithPokemonStatus[] }>

static async getWeekFixtures(
  leagueId: string,
  weekNumber: number
): Promise<Match[]>

static async canTradeThisWeek(
  leagueId: string,
  currentWeek: number
): Promise<boolean>

static async getLeagueSettings(
  leagueId: string
): Promise<ExtendedLeagueSettings>
```

---

## UI Implementation Roadmap

### Phase 3: Post-Draft League Creation (4-6 hours)

**Files to modify**:
1. `src/app/draft/[id]/results/page.tsx`
   - Add check for existing league
   - Show "Create League" or "View League" button

**Files to create**:
2. `src/components/league/CreateLeagueModal.tsx`
   - League name input
   - Number of weeks (6-20)
   - Conference split option
   - Match format (best of 1/3/5)
   - Enable Nuzlocke checkbox
   - Enable trades checkbox
   - Trade deadline week selector

### Phase 4: Match Recording UI (8-10 hours)

**Files to create**:
1. `src/components/league/MatchRecorderModal.tsx`
   - Game-by-game score entry
   - Pokemon selector (which Pokemon were used)
   - KO counter per Pokemon
   - Death confirmation dialog for Nuzlocke

2. `src/components/league/PokemonStatusBadge.tsx`
   - Visual status: 💚 Alive | 💛 Fainted | ❤️‍🩹 Dead

3. `src/components/league/PokemonKOTable.tsx`
   - Shows which Pokemon fainted in match
   - KO counts
   - Death indicators

**Files to modify**:
4. `src/components/league/MatchCard.tsx`
   - Add "Record Result" button
   - Show KO summary for completed matches

### Phase 5: Trade System UI (10-12 hours)

**Files to create**:
1. `src/app/league/[id]/trades/page.tsx`
   - Trade center hub
   - Active proposals
   - Trade history log

2. `src/components/league/TradeProposalModal.tsx`
   - Drag-and-drop Pokemon builder
   - Team A ↔ Team B interface
   - Shows Pokemon status (can't trade dead)

3. `src/components/league/TradeNotification.tsx`
   - Toast for "Team proposed trade"
   - Real-time trade updates

4. `src/components/league/TradeHistoryList.tsx`
   - Audit log of completed trades
   - Week-by-week view

### Phase 6: League View Pages (8-10 hours)

**Files to create**:
1. `src/app/league/[id]/page.tsx`
   - Main league dashboard
   - Standings table
   - This week's fixtures
   - Recent results
   - Quick stats

2. `src/app/league/[id]/schedule/page.tsx`
   - Full calendar view
   - All weeks' matches
   - Filter by team

3. `src/app/league/[id]/week/[week]/page.tsx`
   - Week detail view
   - Fixtures and results
   - Trades completed this week
   - KO summary

4. `src/app/league/[id]/stats/page.tsx`
   - League statistics
   - Pokemon usage rates
   - KO leaders
   - Death count (if Nuzlocke)
   - Head-to-head records

---

## Database Migration Instructions

### To Apply Migrations:

**Option 1: Supabase Dashboard**
1. Go to Supabase project dashboard
2. Navigate to SQL Editor
3. Copy content from `migrations/010_league_pokemon_tracking.sql`
4. Run the SQL
5. Repeat for `migrations/011_league_trades.sql`
6. Verify tables created in Table Editor

**Option 2: Supabase CLI** (if installed)
```bash
supabase db push
```

### Verify Migrations:
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('match_pokemon_kos', 'team_pokemon_status', 'trades', 'trade_approvals');

-- Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('match_pokemon_kos', 'team_pokemon_status', 'trades');
```

---

## Testing Checklist

### After Service Layer Complete:
- [ ] Can record Pokemon KO in match
- [ ] Can mark Pokemon as dead (Nuzlocke)
- [ ] Pokemon status updates correctly
- [ ] Can propose trade
- [ ] Can accept/reject trade
- [ ] Trade executes successfully (Pokemon swap teams)
- [ ] Dead Pokemon cannot be traded (validation works)

### After UI Complete:
- [ ] League creation wizard works
- [ ] League appears on draft results page
- [ ] Can record match result with Pokemon KOs
- [ ] Death confirmation works (Nuzlocke)
- [ ] Pokemon status badges display correctly
- [ ] Trade proposal builder works
- [ ] Trade notifications appear
- [ ] League pages load and display data
- [ ] Real-time updates work

---

## Estimated Remaining Effort

| Phase | Description | Hours |
|-------|-------------|-------|
| **Phase 2** | Service Layer (MatchKOService, TradeService, extend LeagueService) | 6-8 hours |
| **Phase 3** | League Creation Flow (modal, draft results integration) | 4-6 hours |
| **Phase 4** | Match Recording UI (with Pokemon KO tracking) | 8-10 hours |
| **Phase 5** | Trade System UI (proposal, approval, history) | 10-12 hours |
| **Phase 6** | League View Pages (hub, schedule, stats) | 8-10 hours |
| **Phase 7** | Real-time subscriptions and testing | 2-4 hours |
| **Total** | | **38-50 hours** |

---

## Key Design Decisions Made

### 1. Nuzlocke Rules
- ✅ Optional per league (checkbox during creation)
- ✅ Pokemon marked as "dead" (status = 'dead')
- ✅ Dead Pokemon cannot be traded
- ✅ Death confirmation required in UI
- ✅ Tracked: match where died, date, details

### 2. Trade System
- ✅ Trades happen between weeks (not during gameweek)
- ✅ Commissioner approval optional (league setting)
- ✅ Trade deadline configurable (e.g., week 8 of 12)
- ✅ Full audit trail (trade_history view)
- ✅ Validation: no dead Pokemon, both teams consent

### 3. Match Recording
- ✅ Manual entry (v1)
- ✅ Game-by-game for best-of-3/5
- ✅ Track which Pokemon were used
- ✅ KO counter per Pokemon
- ⏳ Future: Pokemon Showdown replay import (v2)

### 4. League Types
- ✅ Round-robin scheduling (circle method)
- ✅ Single league or split conferences
- ⏳ Future: Playoffs after regular season (v2)
- ⏳ Future: Promotion/relegation (v3)

---

## Dependencies

### Existing Services Used:
- `LeagueService` - League creation, scheduling
- `supabase` - Database client
- `useDraftStore` - Draft state management

### New Dependencies Needed:
- None! All functionality uses existing packages

---

## Support & Troubleshooting

### Common Issues:

**Migration Errors:**
- Ensure `leagues`, `teams`, `picks`, `matches` tables exist first
- Check `migration/003_league_schema.sql` was run
- Verify RLS is enabled on dependent tables

**Type Errors:**
- Restart TypeScript server after adding types
- Check imports: `import type { Trade } from '@/types'`

**Service Errors:**
- Verify Supabase client is initialized
- Check RLS policies allow operation
- Look for foreign key constraint errors

---

## Next Actions

1. **Run database migrations** (migrations 010 & 011)
2. **Create MatchKOService** (src/lib/match-ko-service.ts)
3. **Create TradeService** (src/lib/trade-service.ts)
4. **Extend LeagueService** (add Pokemon status methods)
5. **Create CreateLeagueModal** component
6. **Test end-to-end** with real draft → league → match → trade flow

---

**Status**: Ready to proceed with Phase 2 (Service Layer)
**Last Updated**: January 10, 2025
**Version**: 0.2.0
