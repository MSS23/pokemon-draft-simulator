# Architecture

**Analysis Date:** 2026-04-02

## Pattern Overview

**Overall:** Client-heavy Next.js SPA with Supabase as backend-as-a-service (BaaS). No custom server logic beyond Next.js API routes. Real-time multiplayer via Supabase Realtime WebSocket channels. State managed client-side with Zustand (normalized store with immer).

**Key Characteristics:**
- Client-side rendering for all interactive pages (`'use client'` directives)
- Supabase handles auth, database (PostgreSQL), and real-time subscriptions
- Zustand store is the single source of truth for draft state during active sessions
- Optimistic UI updates with rollback on server error
- Domain logic (format rules, draft order, budget) runs entirely client-side
- Snake-case DB columns mapped to camelCase app types at the service layer boundary

## Layers

**UI Layer (Pages + Components):**
- Purpose: Render draft/league/tournament UI, handle user interactions
- Location: `src/app/` (pages), `src/components/` (reusable components)
- Contains: React components, dynamic imports for code splitting
- Depends on: Hooks, Zustand store, service layer
- Used by: End users via browser

**Hook Layer:**
- Purpose: Bridge between UI and services; manage subscriptions, caching, derived state
- Location: `src/hooks/`
- Contains: Custom React hooks for realtime, Pokemon data, validation, drag-and-drop
- Depends on: Service layer, Zustand store, Supabase client
- Used by: UI components

**Store Layer (Zustand):**
- Purpose: Normalized client-side state for active draft sessions
- Location: `src/stores/draftStore.ts`, `src/stores/selectors.ts`
- Contains: Normalized entity maps, relationship indexes, actions, memoized selectors
- Depends on: Nothing (pure state container)
- Used by: Hooks, UI components

**Service Layer:**
- Purpose: Encapsulate Supabase queries, business logic, external API calls
- Location: `src/lib/` (primary), `src/services/` (format loader, showdown sync)
- Contains: Static service classes and utility modules
- Depends on: Supabase client, domain rules
- Used by: Hooks, UI components, API routes

**Domain Layer:**
- Purpose: Format rules engine for Pokemon legality and cost validation
- Location: `src/domain/rules/format-rules-engine.ts`
- Contains: `FormatRulesEngine` class with legality checks, cost calculation
- Depends on: Format definitions from `src/lib/formats.ts`
- Used by: Service layer, UI components

**API Layer (Next.js Route Handlers):**
- Purpose: Server-side endpoints for operations requiring secrets or server context
- Location: `src/app/api/`
- Contains: Health check, AI analysis, format sync, push subscriptions, user data export/delete
- Depends on: Supabase server client (`src/lib/supabase/server.ts`)
- Used by: Client-side fetch calls

**Data Layer (Supabase):**
- Purpose: PostgreSQL database with RLS policies, Realtime channels
- Location: Remote Supabase instance; schema in `migrations/`
- Contains: All persistent state (drafts, teams, picks, leagues, matches, trades, etc.)
- Depends on: Nothing
- Used by: Service layer via Supabase JS client

## Data Flow

**Draft Pick Flow (Snake Draft):**

1. User clicks Pokemon in `PokemonGrid` -> opens `DraftConfirmationModal`
2. User confirms -> `DraftService.makePick()` called
3. Optimistic update: Zustand store updated immediately (pick added, budget decremented, currentTurn advanced)
4. `pickInFlightRef` set to suppress realtime refreshes during RPC
5. Supabase RPC `make_draft_pick` executes atomically (validates budget, inserts pick, advances turn)
6. On success: manual `DraftService.getDraftState()` fetch overwrites store with server-confirmed state
7. On failure: optimistic update rolled back via `removePick()`
8. Other clients: Supabase Realtime postgres_changes event fires -> `DraftRealtimeManager` receives -> debounced `onRefreshNeeded` callback -> full state refresh via `getDraftState()`

**Auction Draft Flow:**

1. Team nominates Pokemon -> `AuctionService` creates auction row in Supabase
2. Bidding: `AuctionService.placeBid()` updates auction row + inserts bid_history
3. Realtime subscription on `auctions` table pushes updates to all clients
4. Timer expiry: client-side countdown; winner determination on timer end
5. Auction completion: pick inserted, budget deducted, auction status set to 'completed'

**State Management Flow:**
```
Supabase DB (PostgreSQL)
    |
    v  (DraftService.getDraftState() - full fetch)
Service Layer (snake_case -> camelCase mapping)
    |
    v  (setDraftState() - batch update)
Zustand Store (normalized: teamsById, picksById, etc.)
    |
    v  (memoized selectors: selectCurrentTeam, selectTeams, etc.)
React Components (subscribe to specific slices)
```

**Real-time Sync Flow:**
```
Supabase Realtime (postgres_changes on drafts/teams/picks/participants/auctions)
    |
    v
DraftRealtimeManager (single channel per draft, event deduplication)
    |
    v
useDraftRealtime hook (debounced refresh, callbacks for pick/turn/status events)
    |
    v
DraftService.getDraftState() (full state re-fetch)
    |
    v
Zustand store update (setDraftState)
```

**League Data Flow:**
```
Supabase DB (leagues, matches, standings, trades, waiver_claims)
    |
    v  (LeagueService static methods)
League Page (src/app/league/[id]/page.tsx)
    |
    v  (local React state, no Zustand for league data)
Sub-pages: standings, schedule, trades, stats, team detail, matchup
```

## Key Domain Models and Relationships

```
Draft (1) ----< Team (many)
  |               |
  |               +----< Pick (many) [Pokemon selections]
  |               |
  |               +----< WishlistItem (many) [auto-pick queue]
  |
  +----< Participant (many) [users in draft, linked to teams]
  |
  +----< Auction (many) [active/completed auctions, auction format only]
  |       |
  |       +----< BidHistory (many) [bid log per auction]
  |
  +----< PokemonTier (many) [per-draft Pokemon costs/legality]
  |
  +---- League (0..1) [optional post-draft league]
           |
           +----< LeagueTeam (many) [maps draft teams to league]
           |
           +----< Match (many) [weekly fixtures]
           |       |
           |       +----< MatchGame (many) [individual games in Bo3]
           |       |
           |       +----< MatchPokemonKO (many) [per-game KO tracking]
           |
           +----< Standing (many) [W/L/D per team]
           |
           +----< Trade (many) [Pokemon trades between teams]
           |
           +----< WaiverClaim (many) [free agent pickups]
           |
           +----< TeamPokemonStatus (many) [alive/fainted/dead per Pokemon]
```

## Real-Time System Architecture

**Channel Strategy:**
- One Supabase Realtime channel per draft: `draft:{draftId}`
- Subscribes to postgres_changes on 5 tables: `drafts`, `teams`, `picks`, `participants`, `auctions`
- Supabase Presence used for online user tracking

**DraftRealtimeManager** (`src/lib/draft-realtime.ts`):
- Class-based manager with lifecycle: `subscribe()` -> events -> `cleanup()`
- Exponential backoff reconnection (1s base, 30s max, 10 max attempts)
- Event deduplication with 3-second window (prevents duplicate processing)
- AbortController for clean teardown
- Connection status tracking: disconnected -> connecting -> connected -> reconnecting -> failed

**useDraftRealtime Hook** (`src/hooks/useDraftRealtime.ts`):
- React wrapper around `DraftRealtimeManager`
- Debounced refresh (prevents rapid-fire state fetches)
- Callbacks: `onRefreshNeeded`, `onPickEvent`, `onTurnChange`, `onStatusChange`, `onDraftDeleted`
- `pickInFlightRef` pattern: suppresses realtime refreshes during active pick submission to prevent race conditions

**Broadcast Channels (non-postgres_changes):**
- `admin-ping:{draftId}` - Admin notification bell
- `league-trades:{leagueId}` - Trade notifications
- `league-trades-badge:{leagueId}` - Trade count badge updates

## State Management Patterns

**Zustand Store Structure** (`src/stores/draftStore.ts`):
- Middleware chain: `subscribeWithSelector` + `immer`
- **Normalized state**: Entities stored as `{byId: Record<string, T>, ids: string[]}` for O(1) lookups
- **Relationship indexes**: `picksByTeamId`, `participantsByUserId`, `teamsByParticipantId`, `wishlistItemsByParticipantId`
- **Batch updates**: `setDraftState()` normalizes all entities in a single state update (one re-render)
- **Immer**: Enables mutable-style updates within reducers

**Memoized Selectors** (`src/stores/selectors.ts`):
- Closure-based memoization pattern (not reselect)
- Guards against React #185 infinite loop: if same state reference, return cached result
- Equality function prevents re-renders when derived value is structurally identical
- Key selectors: `selectCurrentTeam`, `selectTeams`, `selectPicks`, `selectUserTeam(userId)`, `selectAvailablePokemon`

**Usage Pattern:**
```typescript
// Correct: subscribe to specific slice via memoized selector
const currentTeam = useDraftStore(selectCurrentTeam)

// Correct: parameterized selector (returns a selector function)
const userTeam = useDraftStore(selectUserTeam(userId))

// Incorrect: inline selector creates new reference each render
const teams = useDraftStore(state => state.teamIds.map(id => state.teamsById[id]))
```

**League State**: League pages use local React state (`useState`) rather than Zustand. Data fetched via `LeagueService` static methods on mount. No global league store.

## Draft Lifecycle

**Setup Phase** (`status: 'setup'`):
1. Host creates draft via `DraftService.createDraft()` (`src/lib/draft-service.ts`)
2. Room code generated (6-char uppercase, `src/lib/room-utils.ts`)
3. Teams created with budget allocation
4. Participants join via room code (`DraftService.joinDraft()`)
5. Host can shuffle draft order, adjust settings
6. Pokemon pool loaded based on format (`src/lib/formats.ts`, `src/domain/rules/format-rules-engine.ts`)

**Active Phase** (`status: 'active'`):
1. Host starts draft -> status set to 'active', `currentTurn` set to 1
2. Turn-based picking (snake) or nomination-based bidding (auction)
3. `currentTurn` is 1-indexed; current team derived from turn + snake order
4. Pick timer: `turn_started_at` column + `settings.timeLimit`
5. Auto-skip: `AutoSkipService` (`src/lib/auto-skip-service.ts`) handles timed-out turns
6. Auto-pick: `useAutoPick` hook (`src/hooks/useAutoPick.ts`) picks from wishlist on timer expiry
7. Realtime sync keeps all clients updated

**Completed Phase** (`status: 'completed'`):
1. All teams reach `maxPokemonPerTeam` picks OR all turns exhausted
2. Draft results page: `src/app/draft/[id]/results/page.tsx`
3. Auto-navigate from draft page to results after 3s
4. Optional league creation: `LeagueService.createLeagueFromDraft()` generates fixtures, standings

**Paused/Deleted:**
- `status: 'paused'` - Draft can be resumed
- `status: 'deleted'` - Soft delete with `deleted_at`/`deleted_by` columns

## Snake vs Auction Draft Differences

| Aspect | Snake Draft | Auction Draft |
|--------|------------|---------------|
| DB format | `format: 'snake'` | `format: 'auction'` |
| Turn tracking | `currentTurn` (1-indexed), `currentRound` | No turn; active auction determines who can bid |
| Order | `generateSnakeDraftOrder()` alternates direction each round | Nomination rotation |
| Pick mechanism | Direct selection from grid | Nominate -> bid -> timer -> winner picks |
| Budget | Deducted on pick | Deducted on auction win |
| Key service | `DraftService.makePick()` | `AuctionService.placeBid()` |
| Key components | `PokemonGrid`, `DraftConfirmationModal` | `AuctionBiddingInterface`, `AuctionNomination`, `AuctionTimer` |
| Timer | Per-turn timer (`timePerPick`) | Per-auction timer (`timePerBid`) with countdown |

**Draft Type Variants (user-facing):**
- `'tiered'` -> snake format + tiered scoring (S-E tier slots with fixed costs)
- `'points'` -> snake format + BST-based budget scoring
- `'auction'` -> auction format

## League System Architecture

**League Creation:**
- Optionally created after draft completion via `LeagueService.createLeagueFromDraft()`
- Inherits teams from the draft
- Round-robin schedule auto-generated based on `totalWeeks`
- Supports conference split (`split_conference_a`/`split_conference_b`)

**League Components:**
- Hub page: `src/app/league/[id]/page.tsx` (standings, schedule overview, activity feed)
- Schedule: `src/app/league/[id]/schedule/page.tsx` (week-by-week fixtures)
- Rankings: `src/app/league/[id]/rankings/page.tsx` (power rankings)
- Stats: `src/app/league/[id]/stats/page.tsx` (per-Pokemon KO/death stats)
- Trades: `src/app/league/[id]/trades/page.tsx` (propose/accept/reject trades)
- Free Agents: `src/app/league/[id]/free-agents/page.tsx` (waiver wire)
- Admin: `src/app/league/[id]/admin/page.tsx` (commissioner tools)
- Team Detail: `src/app/league/[id]/team/[teamId]/page.tsx` (roster, match history, AI analysis)
- Matchup: `src/app/league/[id]/matchup/[matchId]/page.tsx` (head-to-head, type coverage)

**Key League Services:**
- `src/lib/league-service.ts` - CRUD for leagues, matches, standings, schedule generation
- `src/lib/trade-service.ts` - Trade proposals, acceptance, execution, commissioner approval
- `src/lib/waiver-service.ts` - Free agent claims, budget validation
- `src/lib/match-ko-service.ts` - Per-game KO/death tracking
- `src/lib/league-stats-service.ts` - Aggregated Pokemon statistics
- `src/lib/commissioner-service.ts` - Commissioner-specific operations
- `src/lib/trade-deadline.ts` - Trade deadline enforcement

**Match Recording:**
- `MatchRecorderModal` (`src/components/league/MatchRecorderModal.tsx`) - dual-confirmation flow
- Per-game KO tracking: `gameKOs: Record<number, { home: PokemonKO[], away: PokemonKO[] }>`
- Both teams submit results; auto-confirms when scores match
- `MatchKOService` persists KOs with correct `game_number`

**Pokemon Status Tracking:**
- `TeamPokemonStatus` tracks alive/fainted/dead per Pokemon per league
- Dead Pokemon cannot be traded
- Fainted Pokemon cannot be traded
- Status updated via match KO recording

## Entry Points

**Root Layout** (`src/app/layout.tsx`):
- Provider chain: AnalyticsProvider > PerformanceMonitorProvider > ErrorBoundaryProvider > HydrationFixProvider > ThemeProvider > ImagePreferenceProvider > AuthProvider > QueryProvider
- Global Header component
- TourProvider for onboarding
- Sonner Toaster for notifications
- Vercel Analytics

**Draft Page** (`src/app/draft/[id]/page.tsx`):
- Main interactive page; ~1000+ lines
- Manages draft lifecycle (setup -> active -> completed)
- Real-time subscriptions via `useDraftRealtime`
- Zustand store as state container
- Dynamic imports for heavy components (DraftControls, DraftResults, AuctionBiddingInterface)

**Landing Page** (`src/app/page.tsx`):
- Entry point for new users
- Draft creation/join CTAs

## Error Handling

**Strategy:** Try-catch at service layer boundaries with structured logging via `createLogger()`.

**Patterns:**
- Services throw errors; callers catch and show toast notifications via `notify.error()`
- Supabase errors checked explicitly: `if (error) throw new Error(error.message)`
- `EnhancedErrorBoundary` (`src/components/ui/enhanced-error-boundary.tsx`) wraps draft page
- `ErrorBoundaryProvider` wraps entire app in root layout
- Optimistic updates: rollback state on server error
- Graceful degradation when Supabase not configured (warns but doesn't crash during SSG)

## Cross-Cutting Concerns

**Logging:** Structured logger (`src/lib/logger.ts`) with named contexts: `createLogger('DraftService')`. Used throughout all services and hooks.

**Validation:** Format rules engine (`src/domain/rules/format-rules-engine.ts`) for Pokemon legality. Zod schemas (`src/lib/schemas.ts`) for form validation. Budget validation in `src/hooks/useBudgetValidation.ts` and `src/utils/budget-feasibility.ts`.

**Authentication:** Dual system - Supabase Auth for registered users (`src/contexts/AuthContext.tsx`) and guest sessions (`src/lib/user-session.ts`) with `guest-{timestamp}-{random}` IDs stored in localStorage. Auth is optional; drafts work with guest users.

**Notifications:** `src/lib/notifications.tsx` (toast helpers via Sonner), `src/lib/notification-service.ts` (notification management), `src/lib/push-notifications.ts` (browser push via service worker), `src/hooks/useTurnNotifications.ts` (turn change alerts).

**Performance Monitoring:** `src/lib/performance-monitor.ts` wrapped in `PerformanceMonitorProvider`. Analytics via `src/lib/analytics.ts` and Vercel Analytics.

**Caching:** Multi-layer Pokemon data caching: TanStack Query (in-memory), `pokemon-cache.ts` (LRU), `pokemon-cache-db.ts` (IndexedDB), `draft-cache-db.ts` (draft state IndexedDB cache).

---

*Architecture analysis: 2026-04-02*
