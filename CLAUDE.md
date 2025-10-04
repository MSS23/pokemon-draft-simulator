# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time Pokémon drafting platform for competitive tournament play. Built with Next.js 15, TypeScript, Supabase, and Zustand. Supports snake and auction draft formats with VGC 2024 Regulation H compliance.

## Development Commands

### Essential Commands
```bash
npm run dev              # Start development server (localhost:3000)
npm run build            # Production build
npm run lint             # Run ESLint
npm test                 # Run Vitest tests
npm run build:formats    # Compile format packs from data/formats/*.json
```

### Testing
```bash
npm test                          # Run all tests in watch mode
npm test tests/format-reg-h.test.ts  # Run specific test file
```

## Architecture Overview

### State Management (Zustand)
- **Central store**: `src/stores/draftStore.ts` - Single source of truth for draft state
- Uses `subscribeWithSelector` middleware for fine-grained reactivity
- Memoized selectors with WeakMap caching to prevent re-renders (e.g., `selectCurrentTeam`, `selectUserTeam`)
- Never mutate state directly - always use store actions

### Real-Time System (Supabase)
- **Supabase client**: `src/lib/supabase.ts` - Typed client with Database types
- WebSocket subscriptions for live multiplayer updates
- Graceful degradation when Supabase not configured (see `isSupabaseConfigured`)
- **Connection management**: `src/lib/connection-manager.ts` handles reconnection logic
- **Optimistic updates**: `src/lib/optimistic-updates.ts` for instant UI feedback

### Draft Flow Architecture

**Draft Lifecycle:**
1. **Setup** (`status: 'setup'`) - Host creates draft, participants join teams
2. **Active** (`status: 'active'`) - Draft in progress, picks being made
3. **Completed** (`status: 'completed'`) - All picks made, view results

**Snake Draft:**
- Turn order calculated by `generateSnakeDraftOrder()` in `src/utils/draft.ts`
- Alternating round direction (1,2,3,4 then 4,3,2,1)
- Current turn tracked in `draft.currentTurn`
- Current team determined by `selectCurrentTeam` selector

**Auction Draft:**
- Auction service: `src/lib/auction-service.ts`
- Real-time bidding with countdown timers
- Bid history tracked separately in `bid_history` table

### Format Rules System

**Format Packs** (`data/formats/*.json`):
- JSON definitions of competitive formats (VGC Reg H, Smogon tiers, etc.)
- Built into optimized runtime artifacts via `npm run build:formats`
- Script: `scripts/build-format.ts` fetches from PokeAPI and compiles legal Pokemon lists with costs

**Format Rules Engine** (`src/domain/rules/`):
- `createFormatRulesEngine()` validates Pokemon legality against format rules
- Checks: legendary/mythical/paradox bans, regional dex, stat totals
- Cost calculation based on BST (Base Stat Total) or tier system

**Key Format**: VGC 2024 Regulation H
- Bans ALL legendaries, mythicals, and paradox Pokemon
- Paldea/Kitakami/Blueberry dex only (#001-375, #388-392, etc.)
- Defined in `src/lib/formats.ts` - see `POKEMON_FORMATS` array

### Database Schema (Supabase)

**Core Tables:**
- `drafts` - Draft metadata, settings, current turn/round
- `teams` - Team info, budget, draft order
- `picks` - Individual Pokemon selections
- `participants` - Users in draft, guest support
- `pokemon_tiers` - Per-draft Pokemon costs/legality
- `auctions` - Active/completed auctions
- `bid_history` - Auction bid log
- `wishlist_items` - Auto-pick wishlist system
- `spectator_events` - Spectator activity tracking

**Database types**: All tables typed in `src/lib/supabase.ts` as `Database['public']['Tables']`

### Component Architecture

**Page Routes:**
- `/` - Landing page with draft creation/join
- `/create-draft` - Draft setup wizard
- `/join-draft` - Join existing draft by room code
- `/draft/[id]` - Main draft interface
- `/draft/[id]/results` - Post-draft results
- `/spectate/[id]` - Spectator view

**Component Organization:**
- `src/components/ui/` - Shadcn/ui components (dialogs, buttons, etc.)
- `src/components/draft/` - Draft-specific (turn indicator, timer, pick modal)
- `src/components/pokemon/` - Pokemon display (cards, search, filters)
- `src/components/team/` - Team management (roster, budget tracker)
- `src/components/spectator/` - Spectator mode components

### Key Services

**Pokemon Data** (`src/lib/pokemon-api.ts`):
- Fetches from PokeAPI with caching
- Enhanced cache: `src/hooks/useEnhancedPokemonCache.ts`
- Image handling: `src/hooks/usePokemonImage.ts` with fallback sprites

**Draft Service** (`src/lib/draft-service.ts`):
- `DraftService.createDraft()` - Initialize new draft
- `DraftService.joinDraft()` - Join as participant
- Room code generation: 6-char uppercase (via `src/lib/room-utils.ts`)

**Wishlist System** (`src/lib/wishlist-service.ts`):
- Priority-based auto-pick queue
- `useAutoPick` hook (`src/hooks/useAutoPick.ts`) - Countdown timer for auto-selection
- `useWishlistSync` - Real-time sync across participants

**Session Management** (`src/lib/user-session.ts`):
- Guest user support (no auth required)
- User ID format: `guest-{timestamp}-{random}`
- Stored in localStorage, persists across sessions

### Custom Hooks

**Draft Hooks:**
- `useConnectionManager` - Supabase connection lifecycle
- `useReconnection` - Handle disconnects/reconnects
- `useOptimisticUpdates` - Client-side state updates
- `useTurnNotifications` - Turn change alerts
- `useAutoPick` - Wishlist auto-pick countdown

**Pokemon Hooks:**
- `usePokemon` - Fetch/cache Pokemon data
- `useEnhancedPokemonCache` - Advanced caching with prefetch
- `usePokemonImage` - Image loading with fallbacks

**Validation:**
- `useBudgetValidation` - Team budget checks
- `useDragAndDrop` - Wishlist reordering

## Important Implementation Patterns

### TypeScript Path Aliases
Always use `@/` for imports:
```typescript
import { useDraftStore } from '@/stores/draftStore'
import { DraftService } from '@/lib/draft-service'
import { Pokemon } from '@/types'
```

### Supabase Query Pattern
Always check if Supabase is configured before queries:
```typescript
if (!supabase) {
  throw new Error('Supabase not available')
}
```

### Optimistic Updates
For user actions, update local state immediately then sync to DB:
1. Update Zustand store
2. Call Supabase mutation
3. Handle errors by reverting local state

### Snake Draft Turn Logic
Current team is calculated, not stored:
```typescript
const currentTeam = useDraftStore(selectCurrentTeam)
// Don't store currentTeam in database - derive from currentTurn + draftOrder
```

### Format Legality Checks
Always validate Pokemon against format rules:
```typescript
import { createFormatRulesEngine } from '@/domain/rules'

const rulesEngine = createFormatRulesEngine(formatConfig)
const isLegal = rulesEngine.isPokemonLegal(pokemon)
```

### Guest User Pattern
Generate IDs client-side for guest users:
```typescript
const userId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
```

## Critical Rules & Constraints

### VGC 2024 Regulation H
- ALL legendaries banned (including Treasures of Ruin, Loyal Three, Ogerpon)
- ALL mythicals banned (Pecharunt, etc.)
- ALL paradox Pokemon banned (Great Tusk, Iron Valiant, etc.)
- Only Paldea/Kitakami/Blueberry dex Pokemon allowed
- Ban list in `src/lib/formats.ts` must match official VGC rules

### Draft State Consistency
- `draft.currentTurn` is 1-indexed (first pick = turn 1)
- Snake order alternates each round
- Never skip turns - increment by 1 only
- Auction has no `currentTurn` - uses auction table state

### Budget System
- Default budget: 100 points per team
- Pokemon costs based on BST or custom overrides
- Must validate `budgetRemaining >= cost` before pick
- Auction: deduct from winner's team on auction completion

### Real-Time Sync
- Subscribe to all relevant tables in draft view
- Handle stale data: `last_seen` timestamp for participant detection
- Clean up subscriptions in `useEffect` cleanup functions

## Common Development Tasks

### Adding a New Format
1. Create JSON in `data/formats/{format-name}.json`
2. Define `explicitBans`, `bannedCategories`, regional dex, cost config
3. Run `npm run build:formats` to compile
4. Add format to `POKEMON_FORMATS` array in `src/lib/formats.ts`

### Debugging Real-Time Issues
1. Check Supabase RLS policies (should allow all for MVP)
2. Verify subscription setup in `useConnectionManager`
3. Check browser console for WebSocket errors
4. Validate `draft_id` matches across tables

### Testing Format Rules
1. Add test case to `tests/format-reg-h.test.ts` (or new file)
2. Test specific Pokemon by ID against format rules
3. Run `npm test` to validate

### Performance Optimization
- Use memoized selectors from `draftStore` (avoid inline selectors)
- Implement virtualization for long Pokemon lists (see `@tanstack/react-virtual`)
- Lazy load Pokemon images with `usePokemonImage` hook
- Batch Supabase queries where possible

## Environment Setup

Required `.env.local` variables:
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Database schema in `supabase-schema.sql` - run in Supabase SQL editor to set up tables.
