# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time Pokémon drafting platform for competitive tournament play ("Pokémon Champions Draft League"). Built with Next.js 15, TypeScript, Supabase, Zustand, and **Clerk authentication**. Supports snake and auction draft formats across multiple VGC regulations and Smogon tiers, plus a full **league system** (standings, schedules, trades, waivers, playoffs, commissioner tools) and **tournaments**.

> **Auth note (READ THIS FIRST):** Auth is **Clerk**, not Supabase Auth. Clerk issues a `supabase` JWT template whose `sub` is resolved in Postgres by `public.clerk_user_id()`; every RLS policy and write RPC depends on that bridge. Guests are supported via an **httpOnly cookie** (`guest-{crypto.randomUUID()}`) issued by `/api/guest/session` — NOT via a client-generated `localStorage` id. Older sections below that describe Supabase Auth / `localStorage.guestUserId` are historical; the code has migrated. The live draft/auction/turn-timeout engine is **server-authoritative** (see "Server-authoritative draft engine" below).

**Tech Stack:**
- **Frontend**: Next.js 15 (App Router), React 18, TypeScript 5
- **State**: Zustand with subscribeWithSelector middleware
- **Database**: Supabase (PostgreSQL + Realtime)
- **Styling**: Tailwind CSS, Radix UI, Framer Motion
- **Data Fetching**: TanStack Query v5
- **Testing**: Vitest
- **Performance**: PWA support, virtualized lists, optimistic updates

## Development Commands

### Essential Commands
```bash
npm run dev              # Start development server (localhost:3000)
npm run build            # Production build + type checking
npm run lint             # Run ESLint
npm test                 # Run Vitest tests in watch mode
npm run build:formats    # Compile format packs from data/formats/*.json
```

### Testing
```bash
npm test                                  # Run all tests in watch mode
npm test tests/format-reg-h.test.ts      # Run specific test file
npm test -- --coverage                    # Run with coverage report
```

## Architecture Overview

### State Management (Zustand)

**Central Store**: [src/stores/draftStore.ts](src/stores/draftStore.ts)
- Single source of truth for all draft state
- Uses `subscribeWithSelector` middleware for fine-grained reactivity
- Memoized selectors with WeakMap caching to prevent unnecessary re-renders

**Key Selectors:**
```typescript
// ✅ Good: Use memoized selectors exported from store
const currentTeam = useDraftStore(selectCurrentTeam)
const userTeam = useDraftStore(selectUserTeam)

// ❌ Bad: Inline selectors cause re-renders
const currentTeam = useDraftStore(state =>
  state.teams.find(t => t.id === state.draft?.currentTurn)
)
```

**Performance Rules:**
- Never mutate state directly - always use store actions
- Use shallow equality checks for derived state
- Subscribe to specific slices, not the entire store
- Export memoized selectors for complex computations

### Real-Time System (Supabase)

**Supabase Client**: [src/lib/supabase.ts](src/lib/supabase.ts)
- Typed client with generated Database types
- WebSocket subscriptions for multiplayer updates
- Graceful degradation when Supabase not configured

**Connection Management**: [src/lib/connection-manager.ts](src/lib/connection-manager.ts)
- Handles reconnection logic with exponential backoff
- Tracks connection health and latency
- Auto-recovery from disconnects

**Optimistic Updates**: [src/lib/optimistic-updates.ts](src/lib/optimistic-updates.ts)
- Instant UI feedback before server confirmation
- Automatic rollback on errors
- Conflict resolution for concurrent updates

**Critical Performance Pattern:**
```typescript
// ✅ Always check if Supabase is configured
if (!supabase) {
  throw new Error('Supabase not available')
}

// ✅ Use optimistic updates for user actions
async function makePick(pokemonId: string) {
  // 1. Update local state immediately
  useDraftStore.getState().addPick(teamId, pick)

  // 2. Call Supabase mutation
  const { error } = await supabase.from('picks').insert(pick)

  // 3. Revert on error
  if (error) {
    useDraftStore.getState().removePick(pick.id)
    throw error
  }
}
```

### Draft Flow Architecture

**Draft Lifecycle:**
1. **Setup** (`status: 'setup'`) - Host creates draft, participants join teams
2. **Active** (`status: 'active'`) - Draft in progress, picks being made
3. **Completed** (`status: 'completed'`) - All picks made, view results

**Snake Draft:**
- Turn order calculated by `generateSnakeDraftOrder()` in [src/utils/draft.ts](src/utils/draft.ts)
- Alternating round direction (1→2→3→4, then 4→3→2→1)
- Current turn tracked in `draft.currentTurn` (1-indexed)
- Current team determined by `selectCurrentTeam` selector (derived, not stored)

**Auction Draft:**
- Auction service: [src/lib/auction-service.ts](src/lib/auction-service.ts)
- Real-time bidding with countdown timers
- Bid history tracked separately in `bid_history` table
- Automatic winner determination on timer expiry

### Format Rules System

**Format Packs** (`data/formats/*.json`):
- JSON definitions of competitive formats (VGC Reg H, Smogon tiers, custom)
- Built into optimized runtime artifacts via `npm run build:formats`
- Script: [scripts/build-format.ts](scripts/build-format.ts) fetches from PokeAPI and compiles legal Pokémon lists with costs

**Format Rules Engine** ([src/domain/rules/format-rules-engine.ts](src/domain/rules/format-rules-engine.ts)):
- Validates Pokémon legality against format rules
- Checks: legendary/mythical/paradox bans, regional dex, stat totals
- Cost calculation based on BST (Base Stat Total) or tier system

**Key Format: VGC 2024 Regulation H**
- Bans ALL legendaries, mythicals, and paradox Pokémon — including Ogerpon, Loyal Three, Treasures of Ruin, Terapagos
- Paldea/Kitakami/Blueberry dex only
- Defined in [src/lib/formats.ts](src/lib/formats.ts) and [data/formats/reg_h.json](data/formats/reg_h.json)

### Database Schema (Supabase)

**Core Tables:**
- `drafts` - Draft metadata, settings, current turn/round
- `teams` - Team info, budget, draft order
- `picks` - Individual Pokémon selections
- `participants` - Users in draft, guest support
- `pokemon_tiers` - Per-draft Pokémon costs/legality
- `auctions` - Active/completed auctions
- `bid_history` - Auction bid log
- `wishlist_items` - Auto-pick wishlist system
- `spectator_events` - Spectator activity tracking
- `user_profiles` - User display names and preferences

**Database Types**: All tables typed in [src/lib/supabase.ts](src/lib/supabase.ts) as `Database['public']['Tables']`

**Row Level Security (RLS)**: See [FIX-RLS-POLICIES.md](FIX-RLS-POLICIES.md) for policy configuration

### Component Architecture

**Page Routes** (~40 total — this list is representative, not exhaustive):
- `/` - Landing page with draft creation/join
- `/create-draft`, `/join-draft` - Draft setup / join by room code
- `/draft/[id]`, `/draft/[id]/results` - Main draft interface + results
- `/spectate/[id]`, `/spectate/[id]/broadcast` - Spectator view + OBS broadcast mode
- `/dashboard`, `/my-drafts`, `/history`, `/watch-drafts`, `/profile`, `/settings` - User area (Clerk-protected where personal)
- **League system**: `/league/[id]` plus `/admin`, `/free-agents`, `/rankings`, `/schedule`, `/stats`, `/trades`, `/weekly-results`, `/matchup/[matchId]` (and `/score`), `/team/[teamId]`
- **Tournaments**: `/create-tournament`, `/join-tournament`, `/tournament/[id]`, `/match/[id]`, `/lobby`
- **Auth (Clerk)**: `/sign-in`, `/sign-up` (the `/auth/*` paths are legacy redirect shims)

**Key API routes:** `/api/draft/create`, `/api/draft/[id]/tick` (server-authoritative turn-timeout), `/api/cron/draft-tick` (Vercel Cron backstop), `/api/guest/session`, `/api/health` + `/api/health/bridge` (JWT-bridge probe), `/api/ai/analyze-team`, `/api/user/{export,delete}`.

**Component Organization:**
- [src/components/ui/](src/components/ui/) - Shadcn/ui components (dialogs, buttons, etc.)
- [src/components/draft/](src/components/draft/) - Draft-specific (turn indicator, timer, pick modal)
- [src/components/pokemon/](src/components/pokemon/) - Pokémon display (cards, search, filters)
- [src/components/team/](src/components/team/) - Team management (roster, budget tracker)
- [src/components/spectator/](src/components/spectator/) - Spectator mode components

**Performance-Critical Components:**
- `VirtualizedPokemonGrid` - Uses @tanstack/react-virtual for 1000+ Pokémon
- `PokemonCard` - Lazy loads images with fallback sprites
- `WishlistManager` - Drag-and-drop with optimistic updates

### Key Services

**Pokémon Data** ([src/lib/pokemon-api.ts](src/lib/pokemon-api.ts)):
- Fetches from PokeAPI with aggressive caching
- Enhanced cache: [src/hooks/useEnhancedPokemonCache.ts](src/hooks/useEnhancedPokemonCache.ts)
- Image handling: [src/hooks/usePokemonImage.ts](src/hooks/usePokemonImage.ts) with fallback sprites
- Cache manager: [src/lib/pokemon-cache.ts](src/lib/pokemon-cache.ts) with LRU eviction

**Draft Service** ([src/lib/draft-service.ts](src/lib/draft-service.ts)):
- `DraftService.createDraft()` - Initialize new draft with RLS policies
- `DraftService.joinDraft()` - Join as participant or spectator
- Room code generation: 6-char uppercase (via [src/lib/room-utils.ts](src/lib/room-utils.ts))

**Wishlist System** ([src/lib/wishlist-service.ts](src/lib/wishlist-service.ts)):
- Priority-based auto-pick queue
- `useAutoPick` hook ([src/hooks/useAutoPick.ts](src/hooks/useAutoPick.ts)) - Countdown timer for auto-selection
- `useWishlistSync` - Real-time sync across participants

**Auth & Session Management** (Clerk + guest cookie):
- **Signed-in users**: Clerk (`@clerk/nextjs`). `src/middleware.ts` (clerkMiddleware) protects `/dashboard`, `/settings`, `/profile`, `/admin`, `/my-drafts` and the auth-required API routes. `AuthContext` maps the Clerk user into a Supabase-User-shaped object for legacy consumers.
- **Clerk → Supabase bridge**: the browser/server Supabase clients forward Clerk's `supabase`-template JWT; RLS reads identity via `public.clerk_user_id()`. Verify it live with `GET /api/health/bridge` (returns `{bridge:'up'}`).
- **Guests**: authoritative id is an **httpOnly cookie** (`guest-{crypto.randomUUID()}`) from `/api/guest/session`. `src/lib/user-session.ts` localStorage now holds only non-sensitive display data, not the source-of-truth id.

### Server-authoritative draft engine

Do NOT drive picks/auctions/turn-timeouts purely client-side. The engine is server-authoritative:
- **Interactive pick**: `make_draft_pick` RPC — requires `clerk_user_id() = p_user_id`, enforces global `UNIQUE (draft_id, pokemon_id)`. Not granted to `anon`.
- **Auction resolution**: `resolve_auction` RPC — idempotent + expiry-guarded, safe for every client to call at timer=0.
- **Absent-user progression** (auto-pick from wishlist / turn skip): the `system_make_pick` / `system_advance_turn` RPCs, **service-role only**, invoked by `src/lib/draft-tick.ts` via `POST /api/draft/[id]/tick` (client-triggered) and `GET /api/cron/draft-tick` (Vercel Cron backstop, every minute, guarded by `CRON_SECRET`).

### Custom Hooks

**Draft Hooks:**
- `useConnectionManager` - Supabase connection lifecycle
- `useReconnection` - Handle disconnects/reconnects
- `useOptimisticUpdates` - Client-side state updates
- `useTurnNotifications` - Turn change alerts
- `useAutoPick` - Wishlist auto-pick countdown

**Pokémon Hooks:**
- `usePokemon` - Fetch/cache Pokémon data
- `useEnhancedPokemonCache` - Advanced caching with prefetch
- `usePokemonImage` - Image loading with fallbacks

**Validation Hooks:**
- `useBudgetValidation` - Team budget checks
- `useDragAndDrop` - Wishlist reordering with touch support

## Performance Optimization Guidelines

### 1. Component Rendering

**Use React.memo for expensive components:**
```typescript
// ✅ Memoize components that receive complex props
export const PokemonCard = React.memo(({ pokemon, onSelect }: Props) => {
  // ...
}, (prev, next) => prev.pokemon.id === next.pokemon.id)
```

**Avoid inline functions in render:**
```typescript
// ❌ Bad: Creates new function on every render
<Button onClick={() => handleClick(id)}>Click</Button>

// ✅ Good: Use useCallback
const handleButtonClick = useCallback(() => handleClick(id), [id])
<Button onClick={handleButtonClick}>Click</Button>
```

### 2. State Management

**Subscribe to specific store slices:**
```typescript
// ❌ Bad: Re-renders on any state change
const { draft, teams, participants } = useDraftStore()

// ✅ Good: Subscribe only to what you need
const draft = useDraftStore(state => state.draft)
const currentTeam = useDraftStore(selectCurrentTeam)
```

**Batch state updates:**
```typescript
// ❌ Bad: Multiple re-renders
setDraft(newDraft)
setTeams(newTeams)
setParticipants(newParticipants)

// ✅ Good: Single update
useDraftStore.setState({
  draft: newDraft,
  teams: newTeams,
  participants: newParticipants
})
```

### 3. Data Fetching

**Use TanStack Query for server state:**
```typescript
// ✅ Automatic caching, deduplication, background refetch
const { data, isLoading } = useQuery({
  queryKey: ['pokemon', id],
  queryFn: () => fetchPokemon(id),
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000,   // 10 minutes
})
```

**Prefetch data predictively:**
```typescript
// ✅ Prefetch on hover for instant navigation
const handleMouseEnter = () => {
  queryClient.prefetchQuery({
    queryKey: ['pokemon', nextId],
    queryFn: () => fetchPokemon(nextId)
  })
}
```

### 4. Real-Time Subscriptions

**Clean up subscriptions properly:**
```typescript
useEffect(() => {
  const subscription = supabase
    .channel(`draft:${draftId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'drafts'
    }, handleUpdate)
    .subscribe()

  // ✅ Always clean up
  return () => {
    subscription.unsubscribe()
  }
}, [draftId])
```

**Throttle high-frequency updates:**
```typescript
// ✅ Use throttle for rapid updates like bidding
const throttledUpdate = useCallback(
  throttle((data) => updateState(data), 100),
  []
)
```

### 5. Image Loading

**Use progressive image loading:**
```typescript
// ✅ Show low-res sprite first, then high-res artwork
const { imageUrl, isLoading } = usePokemonImage(pokemon.id, {
  preferArtwork: true,
  fallbackToSprite: true
})
```

**Lazy load images outside viewport:**
```typescript
// ✅ Use native loading="lazy"
<img src={imageUrl} loading="lazy" alt={pokemon.name} />
```

### 6. List Virtualization

**Always virtualize long lists (>50 items):**
```typescript
// ✅ Use @tanstack/react-virtual
import { useVirtualizer } from '@tanstack/react-virtual'

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 120,
  overscan: 5
})
```

### 7. Code Splitting

**Dynamic imports for heavy features:**
```typescript
// ✅ Lazy load AI assistant (reduces initial bundle)
const AIDraftAssistant = dynamic(() =>
  import('@/components/draft/AIDraftAssistant'),
  { ssr: false }
)
```

### 8. Bundle Size

**Current bundle analysis shows:**
- Main bundle: ~200KB gzipped
- Largest dependencies: Supabase (~80KB), Radix UI (~40KB), Framer Motion (~30KB)

**Optimization opportunities:**
- Consider replacing Framer Motion with CSS animations for simple transitions
- Use Radix UI's per-component imports instead of full package
- Implement route-based code splitting for admin features

## Important Implementation Patterns

### TypeScript Path Aliases

Always use `@/` for imports:
```typescript
import { useDraftStore } from '@/stores/draftStore'
import { DraftService } from '@/lib/draft-service'
import { Pokemon } from '@/types'
```

### Supabase Query Pattern

```typescript
// ✅ Always check if Supabase is configured
if (!supabase) {
  throw new Error('Supabase not available')
}

// ✅ Use single() for expected single results
const { data, error } = await supabase
  .from('drafts')
  .select('*')
  .eq('id', draftId)
  .single()

// ✅ Handle errors explicitly
if (error) {
  console.error('Database error:', error)
  throw new Error(`Failed to fetch draft: ${error.message}`)
}
```

### Optimistic Updates Pattern

```typescript
// 1. Update local state immediately
const optimisticPick = { id: tempId, pokemonId, teamId, cost }
useDraftStore.getState().addPick(teamId, optimisticPick)

// 2. Call server mutation
try {
  const { data, error } = await supabase
    .from('picks')
    .insert(pick)
    .select()
    .single()

  if (error) throw error

  // 3. Replace optimistic with real data
  useDraftStore.getState().updatePick(tempId, data)
} catch (error) {
  // 4. Revert on error
  useDraftStore.getState().removePick(tempId)
  toast.error('Failed to make pick')
}
```

### Snake Draft Turn Logic

```typescript
// ✅ Current team is DERIVED, not stored
const selectCurrentTeam = (state: DraftState) => {
  if (!state.draft || !state.teams.length) return null
  const turn = state.draft.currentTurn - 1 // Convert to 0-indexed
  const round = Math.floor(turn / state.teams.length)
  const isEvenRound = round % 2 === 0
  const posInRound = turn % state.teams.length
  const teamIndex = isEvenRound ? posInRound : state.teams.length - 1 - posInRound
  return state.teams[teamIndex] || null
}

// ❌ Don't store currentTeam in database
// ✅ Always derive from currentTurn + draftOrder
```

### Format Legality Checks

```typescript
import { createFormatRulesEngine } from '@/domain/rules'

// ✅ Create rules engine from format config
const rulesEngine = createFormatRulesEngine(formatConfig)

// ✅ Check legality before allowing pick
const isLegal = rulesEngine.isPokemonLegal(pokemon)
if (!isLegal) {
  toast.error(`${pokemon.name} is not legal in this format`)
  return
}

// ✅ Get cost for budget validation
const cost = rulesEngine.getPokemonCost(pokemon)
```

### Guest User Pattern (current — cookie-based)

```typescript
// ✅ The authoritative guest id is an httpOnly cookie issued server-side.
//    Do NOT mint the id on the client and trust it — that was the old model.
const res = await fetch('/api/guest/session') // returns Clerk userId if signed in,
                                              // else sets a guest-{uuid} httpOnly cookie
// localStorage (src/lib/user-session.ts) holds only display data, never the id of record.
```

> Historical: earlier this app generated `guest-{timestamp}-{random}` in the
> browser and stored it in `localStorage.guestUserId`. That is gone — server
> RLS/RPCs no longer trust a client-supplied id.

## Critical Rules & Constraints

### VGC 2024 Regulation H

- **ALL legendaries banned** (including Treasures of Ruin, Loyal Three, Ogerpon)
- **ALL mythicals banned** (Pecharunt, etc.)
- **ALL paradox Pokémon banned** (Great Tusk, Iron Valiant, Walking Wake, etc.)
- **Only Paldea/Kitakami/Blueberry dex Pokémon allowed**
- Ban list in [src/lib/formats.ts](src/lib/formats.ts) must match official VGC rules

**Testing format rules:**
```bash
npm test tests/format-reg-h.test.ts
```

### Draft State Consistency

- `draft.currentTurn` is **1-indexed** (first pick = turn 1)
- Snake order alternates each round
- **Never skip turns** - increment by 1 only
- Auction has no `currentTurn` - uses auction table state
- `draftOrder` array is derived from `teams.draftOrder` (sorted)

### Budget System

- **Configurable budget per team** (50-200 points, default: 100)
- Pokémon costs based on BST (Base Stat Total) or custom format overrides
- **Must validate** `budgetRemaining >= cost` before pick
- Budget validation occurs in `makePick()` - throws error if insufficient
- Snake draft: deduct cost immediately when pick is made
- Auction: deduct from winner's team on auction completion
- Budget updates are atomic (using SQL expressions in database)
- Host can adjust budgets during draft (admin feature)

**Budget per Team Configuration:**
- Set during draft creation in [src/app/create-draft/page.tsx](src/app/create-draft/page.tsx#L35)
- Options: 50, 75, 100, 120, 150, 200 points
- Stored in `drafts.budget_per_team` column
- Each team starts with `budget_remaining = budget_per_team`

### Pokémon Count Limits

- **Configurable Pokémon per team** (3-15, default: 6)
- Minimum 6 for snake drafts (points-based gameplay)
- Validation in `makePick()` checks `currentPickCount < maxPokemonPerTeam`
- Draft completes when all teams reach their Pokémon limit OR run out of budget
- Pick count tracked per team in `picks` table

### Real-Time Sync

- Subscribe to all relevant tables in draft view
- Handle stale data: `last_seen` timestamp for participant detection
- Clean up subscriptions in `useEffect` cleanup functions
- Use `created_at` for conflict resolution (last-write-wins)

## Common Development Tasks

### Adding a New Format

1. Create JSON in `data/formats/{format-name}.json`
   ```json
   {
     "id": "custom-format",
     "name": "Custom Format",
     "explicitBans": [150, 151, 249, 250],
     "bannedCategories": ["legendary", "mythical"],
     "allowedPokedexNumbers": [1, 2, 3, ...],
     "costConfig": {
       "type": "bst",
       "minCost": 1,
       "maxCost": 15
     }
   }
   ```

2. Run `npm run build:formats` to compile
3. Add format to `POKEMON_FORMATS` array in [src/lib/formats.ts](src/lib/formats.ts)
4. Test with `npm test tests/format-{name}.test.ts`

### Debugging Real-Time Issues

1. **Check Supabase RLS policies** - Verify policies allow reads/writes for your user
   ```sql
   -- View policies for a table
   SELECT * FROM pg_policies WHERE tablename = 'drafts';
   ```

2. **Verify subscription setup** in `useConnectionManager`
   ```typescript
   console.log('Subscription status:', subscription.state)
   ```

3. **Check browser console** for WebSocket errors
   - Network tab → WS → Look for connection drops
   - Console → Filter by "realtime"

4. **Validate draft_id** matches across tables
   ```typescript
   console.log('Draft ID:', draft.id)
   console.log('Team draft_id:', teams[0].draftId)
   ```

### Testing Format Rules

```typescript
// tests/format-reg-h.test.ts
import { describe, it, expect } from 'vitest'
import { createFormatRulesEngine } from '@/domain/rules'
import { VGC_REG_H_FORMAT } from '@/lib/formats'

describe('VGC Reg H Format', () => {
  const engine = createFormatRulesEngine(VGC_REG_H_FORMAT)

  it('should ban Koraidon', () => {
    expect(engine.isPokemonLegal({ id: 1007 })).toBe(false)
  })

  it('should allow Tinkaton', () => {
    expect(engine.isPokemonLegal({ id: 959 })).toBe(true)
  })
})
```

### Performance Optimization Workflow

1. **Identify bottleneck** with React DevTools Profiler
2. **Check bundle size** with `npm run build` → Look at route sizes
3. **Analyze re-renders** - Add console.log in component body
4. **Fix patterns:**
   - Move inline functions to useCallback
   - Memoize expensive computations with useMemo
   - Split components if re-rendering unnecessarily
   - Add React.memo with custom comparison
5. **Verify improvement** - Re-profile and compare

### Adding a New Component

**Template for performance-optimized component:**
```typescript
'use client'

import { memo, useCallback, useMemo } from 'react'
import { useDraftStore } from '@/stores/draftStore'

interface Props {
  pokemonId: string
  onSelect: (id: string) => void
}

export const OptimizedComponent = memo<Props>(({ pokemonId, onSelect }) => {
  // ✅ Subscribe to specific slice
  const pokemon = useDraftStore(state =>
    state.availablePokemon.find(p => p.id === pokemonId)
  )

  // ✅ Memoize expensive computation
  const stats = useMemo(() =>
    calculateStats(pokemon),
    [pokemon]
  )

  // ✅ Memoize callbacks
  const handleClick = useCallback(() =>
    onSelect(pokemonId),
    [pokemonId, onSelect]
  )

  return (
    <div onClick={handleClick}>
      {pokemon?.name} - {stats.total}
    </div>
  )
}, (prev, next) => prev.pokemonId === next.pokemonId)
```

### Draft Activity Sidebar Pattern

**Component**: [src/components/draft/DraftActivitySidebar.tsx](src/components/draft/DraftActivitySidebar.tsx)

The draft activity sidebar is a toggleable component that displays real-time draft pick history with filtering and statistics.

**Key Features:**
- Slide-in animation from right with backdrop overlay
- Three filter modes: All Picks, My Team, Opponents
- Pokemon sprite images with type badges
- Relative timestamps ("Just now", "5m ago")
- Activity statistics (total picks, current round, your picks)
- Empty state with helpful messaging

**Implementation Pattern:**
```typescript
// 1. Add state for sidebar visibility
const [isActivitySidebarOpen, setIsActivitySidebarOpen] = useState(false)

// 2. Transform draft data to activity format with useMemo
const sidebarActivities = useMemo(() => {
  if (!draftState?.teams || !pokemon) return []

  const activities: Array<{
    id: string
    teamId: string
    teamName: string
    userName: string
    pokemonId: string
    pokemonName: string
    pickNumber: number
    round: number
    timestamp: number
  }> = []

  let totalPickNumber = 0

  draftState.teams.forEach(team => {
    team.picks.forEach((pokemonId, index) => {
      totalPickNumber++
      const pokemonData = pokemon.find(p => p.id === pokemonId)
      if (pokemonData) {
        const round = Math.floor(index / draftState.teams.length) + 1
        activities.push({
          id: `${team.id}-pick-${index}`,
          teamId: team.id,
          teamName: team.name,
          userName: team.userName,
          pokemonId,
          pokemonName: pokemonData.name,
          pickNumber: totalPickNumber,
          round,
          timestamp: Date.now() - (totalPickNumber - 1) * 30000
        })
      }
    })
  })

  return activities.sort((a, b) => b.timestamp - a.timestamp)
}, [draftState?.teams, pokemon])

// 3. Add toggle button with badge
<Button
  variant="outline"
  size="sm"
  onClick={() => setIsActivitySidebarOpen(true)}
  className="relative"
>
  <History className="h-4 w-4 mr-1" />
  Activity
  {totalPicks > 0 && (
    <Badge variant="default" className="ml-2">
      {totalPicks}
    </Badge>
  )}
</Button>

// 4. Render sidebar with transformed data
<DraftActivitySidebar
  isOpen={isActivitySidebarOpen}
  onClose={() => setIsActivitySidebarOpen(false)}
  activities={sidebarActivities}
  pokemon={pokemon || []}
  currentUserTeamId={draftState.userTeamId}
/>
```

**Performance Considerations:**
- Use `useMemo` for activity data transformation (prevents recalculation on every render)
- Dynamic import for code splitting (reduces initial bundle size)
- Efficient filtering with array methods
- ScrollArea component for handling large activity lists

**UX Best Practices:**
- Only show during active draft (`status === 'drafting'`)
- Badge shows total pick count for quick reference
- Mobile-responsive (full width on small screens, 384px on desktop)
- Backdrop click closes sidebar on mobile
- Empty state guides users when no picks exist

## Environment Setup

Required `.env.local` variables:
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Optional: Sentry (error tracking)
SENTRY_DSN=your-sentry-dsn
```

Database schema in `supabase-schema.sql` - run in Supabase SQL editor to set up tables.

## Troubleshooting

### Build Errors

**Type error: Property does not exist**
- Run `npm run build` to see all type errors
- Check that Database types are up to date with schema
- Regenerate types: `npx supabase gen types typescript --project-id <project-id>`

**Module not found**
- Verify path alias (`@/`) is used correctly
- Check `tsconfig.json` paths configuration
- Restart TypeScript server in VSCode

### Runtime Errors

**Supabase not available**
- Check `.env.local` has correct NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
- Verify Supabase project is not paused
- Check browser console for CORS errors

**WebSocket connection failed**
- Verify Supabase Realtime is enabled in project settings
- Check RLS policies allow the operation
- Look for network issues (firewall, VPN)

**Infinite re-renders**
- Check for inline object/array creation in render
- Verify useEffect dependencies are stable
- Look for state updates during render

### Performance Issues

**Slow initial load**
- Check Network tab for large bundle sizes
- Look for unoptimized images (convert to WebP)
- Enable compression in next.config.ts

**Laggy interactions**
- Profile with React DevTools
- Check for expensive re-renders
- Verify virtualization is enabled for long lists

**Memory leaks**
- Check for unclean subscriptions (missing cleanup)
- Look for accumulating event listeners
- Use Chrome Memory Profiler to find leaks

## Best Practices Summary

### Do's ✅
- Use memoized selectors from draftStore
- Clean up subscriptions in useEffect
- Validate format legality before picks
- Use optimistic updates for user actions
- Virtualize lists over 50 items
- Lazy load images outside viewport
- Handle Supabase errors explicitly
- Use TypeScript strict mode
- Write tests for format rules
- Use path aliases (`@/`)

### Don'ts ❌
- Don't mutate Zustand state directly
- Don't store derived data (like currentTeam)
- Don't skip turn validation
- Don't create inline functions in render
- Don't subscribe to entire store
- Don't render 1000+ items without virtualization
- Don't forget subscription cleanup
- Don't use `any` type (use proper types)
- Don't skip error handling
- Don't hardcode costs (use format config)

## Additional Resources

- [Next.js 15 Docs](https://nextjs.org/docs)
- [Zustand Guide](https://github.com/pmndrs/zustand)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [TanStack Query](https://tanstack.com/query/latest)
- [React Performance](https://react.dev/learn/render-and-commit)
- [PokeAPI](https://pokeapi.co/)

---

**Last Updated**: 2026-07-05
**Version**: 0.1.1 (see package.json)
