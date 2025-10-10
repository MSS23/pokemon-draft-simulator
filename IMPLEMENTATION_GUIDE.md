# Critical Improvements Implementation Guide

This guide provides step-by-step instructions for implementing the most critical improvements to make the Pokemon Draft application production-ready.

---

## 🎯 Phase 1: Critical Stability Fixes (PRIORITY)

### 1. Timer Synchronization Fix (4 hours) ⚠️ URGENT

**Problem**: Client-side timers drift, causing inconsistent experiences

**Files to Modify**:
- `src/lib/draft-service.ts`
- `src/app/draft/[id]/page.tsx`
- `src/components/draft/AuctionTimer.tsx`

**Implementation**:

```typescript
// 1. Add to draft-service.ts
export interface ServerTime {
  serverTime: number
  pickEndsAt: number | null
  auctionEndsAt: number | null
}

export async function getServerTime(draftId: string): Promise<ServerTime> {
  const { data } = await supabase
    .from('drafts')
    .select('current_turn_started_at, settings')
    .eq('id', draftId)
    .single()

  const serverTime = Date.now() // Could use Supabase server time function
  const pickDuration = data?.settings?.timePerPick || 60000
  const pickEndsAt = data?.current_turn_started_at
    ? new Date(data.current_turn_started_at).getTime() + pickDuration
    : null

  return { serverTime, pickEndsAt, auctionEndsAt: null }
}

// 2. Modify draft page to use server time
const [serverTimeOffset, setServerTimeOffset] = useState(0)

useEffect(() => {
  // Calculate server time offset on mount
  const syncTime = async () => {
    const start = performance.now()
    const { serverTime } = await DraftService.getServerTime(roomCode)
    const latency = (performance.now() - start) / 2
    const offset = serverTime - Date.now() + latency
    setServerTimeOffset(offset)
  }
  syncTime()

  // Re-sync every 5 minutes
  const interval = setInterval(syncTime, 300000)
  return () => clearInterval(interval)
}, [roomCode])

// 3. Use corrected time for calculations
const getServerTime = useCallback(() => {
  return Date.now() + serverTimeOffset
}, [serverTimeOffset])

// 4. Calculate time remaining with server authority
const updatePickTimer = useCallback(() => {
  if (!turnStartTime || !draftState?.draftSettings.timeLimit) return

  const now = getServerTime()
  const endTime = turnStartTime + (draftState.draftSettings.timeLimit * 1000)
  const remaining = Math.max(0, Math.floor((endTime - now) / 1000))

  setPickTimeRemaining(remaining)

  if (remaining === 0 && isUserTurn) {
    handleAutoSkip()
  }
}, [turnStartTime, draftState, getServerTime, isUserTurn])
```

**Testing**:
1. Open draft in two browsers with different system times
2. Verify timers show same values (±1s tolerance)
3. Test with throttled tab (background)
4. Verify auto-skip happens at same time for all users

---

### 2. Performance Optimization - useMemo/useCallback (3 hours)

**Files to Modify**: `src/app/draft/[id]/page.tsx`

**Implementation**:

```typescript
// Add at top of component
import { useMemo, useCallback } from 'react'

// Memoize all derived state
const allDraftedIds = useMemo(() => {
  return draftState?.teams.flatMap(t => t.picks) || []
}, [draftState?.teams])

const canNominate = useMemo(() => {
  if (!isAuctionDraft || currentAuction || !isUserTurn) return false
  return userTeam && userTeam.budgetRemaining > 0
}, [isAuctionDraft, currentAuction, isUserTurn, userTeam])

const availablePokemon = useMemo(() => {
  return pokemon?.filter(p => p.isLegal && !allDraftedIds.includes(p.id)) || []
}, [pokemon, allDraftedIds])

// Wrap all event handlers
const handleDraftPokemon = useCallback(async (pokemon: Pokemon) => {
  // ... existing implementation
}, [roomCode, draftState, isHost, isProxyPickingEnabled, userTeam, notify])

const handlePlaceBid = useCallback(async (amount: number) => {
  // ... existing implementation
}, [currentAuction, roomCode, draftState?.userTeamId, notify])

const handleViewDetails = useCallback((pokemon: Pokemon) => {
  setDetailsPokemon(pokemon)
  setIsDetailsOpen(true)
}, [])

const handleNominatePokemon = useCallback(async (
  pokemon: Pokemon,
  startingBid: number,
  duration: number
) => {
  // ... existing implementation
}, [roomCode, draftState?.userTeamId, notify])

// Memoize transformDraftState
const transformedDraftState = useMemo(() => {
  if (!draftState) return null
  return transformDraftState(dbState, userId)
}, [dbState, userId])
```

**Verification**:
- Install React DevTools Profiler
- Record a drafting session
- Check component render times before/after
- Aim for <16ms per render (60fps)

---

### 3. Memory Leak Fix - AbortController (2 hours)

**Files to Modify**: `src/app/draft/[id]/page.tsx`

**Implementation**:

```typescript
useEffect(() => {
  if (!roomCode || isDemoMode) {
    setIsLoading(false)
    return
  }

  let mounted = true
  const abortController = new AbortController()

  const initializeRoom = async () => {
    try {
      const dbState = await DraftService.getDraftState(roomCode.toLowerCase())

      // Check if component still mounted before updating state
      if (!mounted || abortController.signal.aborted) return

      if (dbState) {
        setDraftState(transformDraftState(dbState, userId))
        setIsConnected(true)
        setError('')
      }

      // ... subscription setup with abort signal
      const channel = supabase
        .channel(`draft-${roomCode}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'drafts',
          filter: `id=eq.${roomCode}`
        }, async (payload) => {
          // Check mounted before state updates
          if (!mounted || abortController.signal.aborted) return

          const updatedState = await DraftService.getDraftState(roomCode.toLowerCase())
          if (updatedState && mounted) {
            setDraftState(transformDraftState(updatedState, userId))
          }
        })
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    } catch (error) {
      if (!mounted || abortController.signal.aborted) return
      console.error('Room initialization error:', error)
      setError('Failed to connect to draft room')
    } finally {
      if (mounted) {
        setIsLoading(false)
      }
    }
  }

  const cleanup = initializeRoom()

  return () => {
    mounted = false
    abortController.abort()
    cleanup?.then(fn => fn?.())
  }
}, [roomCode, userId, isDemoMode])
```

---

### 4. Race Condition Protection (3 hours)

**Files to Modify**:
- `src/lib/draft-service.ts`
- `supabase-schema.sql`

**Implementation**:

```sql
-- 1. Add version column to picks table
ALTER TABLE picks ADD COLUMN version INTEGER DEFAULT 1;

-- 2. Add unique constraint to prevent duplicate picks
CREATE UNIQUE INDEX picks_draft_pokemon_unique
ON picks(draft_id, pokemon_id)
WHERE deleted_at IS NULL;

-- 3. Add trigger for optimistic locking
CREATE OR REPLACE FUNCTION increment_pick_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pick_version_trigger
BEFORE UPDATE ON picks
FOR EACH ROW
EXECUTE FUNCTION increment_pick_version();
```

```typescript
// In draft-service.ts
export async function draftPokemon(
  draftId: string,
  teamId: string,
  pokemonId: string,
  cost: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Start transaction
    const { data: existingPick } = await supabase
      .from('picks')
      .select('id')
      .eq('draft_id', draftId)
      .eq('pokemon_id', pokemonId)
      .maybeSingle()

    if (existingPick) {
      return {
        success: false,
        error: 'Pokemon already drafted by another team'
      }
    }

    // Check budget
    const { data: team } = await supabase
      .from('teams')
      .select('budget_remaining')
      .eq('id', teamId)
      .single()

    if (!team || team.budget_remaining < cost) {
      return {
        success: false,
        error: 'Insufficient budget'
      }
    }

    // Atomic insert with RLS check
    const { data, error } = await supabase.rpc('draft_pokemon_atomic', {
      p_draft_id: draftId,
      p_team_id: teamId,
      p_pokemon_id: pokemonId,
      p_cost: cost
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

```sql
-- Add stored procedure for atomic drafting
CREATE OR REPLACE FUNCTION draft_pokemon_atomic(
  p_draft_id UUID,
  p_team_id UUID,
  p_pokemon_id TEXT,
  p_cost INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_pick_order INTEGER;
  v_current_round INTEGER;
BEGIN
  -- Lock the team row for update
  PERFORM * FROM teams WHERE id = p_team_id FOR UPDATE;

  -- Check budget
  IF (SELECT budget_remaining FROM teams WHERE id = p_team_id) < p_cost THEN
    RAISE EXCEPTION 'Insufficient budget';
  END IF;

  -- Check if pokemon already drafted
  IF EXISTS (SELECT 1 FROM picks WHERE draft_id = p_draft_id AND pokemon_id = p_pokemon_id) THEN
    RAISE EXCEPTION 'Pokemon already drafted';
  END IF;

  -- Get next pick order
  SELECT COALESCE(MAX(pick_order), 0) + 1 INTO v_pick_order
  FROM picks WHERE draft_id = p_draft_id;

  SELECT current_round INTO v_current_round
  FROM drafts WHERE id = p_draft_id;

  -- Insert pick
  INSERT INTO picks (draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round)
  VALUES (p_draft_id, p_team_id, p_pokemon_id,
          (SELECT name FROM pokemon WHERE id = p_pokemon_id),
          p_cost, v_pick_order, v_current_round);

  -- Update budget
  UPDATE teams
  SET budget_remaining = budget_remaining - p_cost
  WHERE id = p_team_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
```

---

### 5. Add Loading States (5 hours)

**Files to Modify**: All async action handlers

**Implementation Pattern**:

```typescript
// Add loading state
const [isPickingPokemon, setIsPickingPokemon] = useState(false)
const [isPlacingBid, setIsPlacingBid] = useState(false)
const [isNominating, setIsNominating] = useState(false)

// Wrap async actions
const handleDraftPokemon = useCallback(async (pokemon: Pokemon) => {
  setIsPickingPokemon(true)
  try {
    // ... existing logic
  } finally {
    setIsPickingPokemon(false)
  }
}, [/* deps */])

// Update UI
<Button
  onClick={() => handleDraftPokemon(selectedPokemon)}
  disabled={isPickingPokemon}
  className="bg-green-600 hover:bg-green-700"
>
  {isPickingPokemon ? (
    <>
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
      Drafting...
    </>
  ) : (
    `Draft ${selectedPokemon.name}`
  )}
</Button>
```

**Locations Needing Loading States**:
1. Draft Pokemon button
2. Place Bid button
3. Nominate Pokemon button
4. Start Draft button
5. Pause/Resume buttons
6. Undo Last Pick button
7. Advance Turn button

---

## 🗄️ Database Improvements

### 6. Query Optimization (3 hours)

**File**: `src/lib/draft-service.ts`

**Current (Slow)**:
```typescript
// 5 separate queries
const draft = await supabase.from('drafts').select()...
const teams = await supabase.from('teams').select()...
const picks = await supabase.from('picks').select()...
const participants = await supabase.from('participants').select()...
const auctions = await supabase.from('auctions').select()...
```

**Optimized (Fast)**:
```typescript
export async function getDraftState(draftId: string): Promise<DBDraftState | null> {
  const { data, error } = await supabase
    .from('drafts')
    .select(`
      *,
      teams:teams(
        *,
        participant:participants(*)
      ),
      picks:picks(*),
      participants:participants(*),
      auctions:auctions(*)
    `)
    .eq('id', draftId)
    .single()

  if (error || !data) {
    console.error('Failed to fetch draft state:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    host_id: data.host_id,
    format: data.format,
    ruleset: data.ruleset,
    budget_per_team: data.budget_per_team,
    max_teams: data.max_teams,
    status: data.status,
    current_turn: data.current_turn,
    current_round: data.current_round,
    settings: data.settings,
    created_at: data.created_at,
    updated_at: data.updated_at,
    teams: data.teams,
    picks: data.picks,
    participants: data.participants,
    auctions: data.auctions
  }
}
```

**Add indexes**:
```sql
-- Composite indexes for faster joins
CREATE INDEX idx_picks_draft_team ON picks(draft_id, team_id);
CREATE INDEX idx_picks_draft_order ON picks(draft_id, pick_order);
CREATE INDEX idx_participants_draft_user ON participants(draft_id, user_id);
CREATE INDEX idx_teams_draft_order ON teams(draft_id, draft_order);
```

---

### 7. Subscription Consolidation (4 hours)

**File**: `src/lib/draft-service.ts`

**Current (5 subscriptions)**:
```typescript
// Inefficient - 5 WebSocket connections
supabase.channel('drafts').on(...)
supabase.channel('teams').on(...)
supabase.channel('picks').on(...)
supabase.channel('participants').on(...)
supabase.channel('auctions').on(...)
```

**Optimized (1 subscription)**:
```typescript
export function subscribeToDraft(
  draftId: string,
  callbacks: {
    onDraftUpdate?: (draft: Draft) => void
    onTeamUpdate?: (teams: Team[]) => void
    onPickAdded?: (pick: Pick) => void
    onParticipantChange?: (participants: Participant[]) => void
    onAuctionUpdate?: (auction: Auction | null) => void
  }
) {
  const channel = supabase
    .channel(`draft-room-${draftId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        filter: `draft_id=eq.${draftId}`
      },
      async (payload) => {
        const { table, eventType, new: newRecord, old: oldRecord } = payload

        // Handle different table updates
        switch (table) {
          case 'drafts':
            if (eventType === 'UPDATE' && callbacks.onDraftUpdate) {
              callbacks.onDraftUpdate(newRecord as Draft)
            }
            break

          case 'teams':
            // Fetch all teams for this draft
            const { data: teams } = await supabase
              .from('teams')
              .select('*')
              .eq('draft_id', draftId)
            if (teams && callbacks.onTeamUpdate) {
              callbacks.onTeamUpdate(teams)
            }
            break

          case 'picks':
            if (eventType === 'INSERT' && callbacks.onPickAdded) {
              callbacks.onPickAdded(newRecord as Pick)
            }
            break

          // ... handle other tables
        }
      }
    )
    .subscribe()

  return () => {
    channel.unsubscribe()
  }
}
```

---

## 🧪 Testing Recommendations

### Unit Tests to Add:

```typescript
// tests/draft-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { DraftService } from '@/lib/draft-service'

describe('DraftService', () => {
  describe('draftPokemon', () => {
    it('should prevent duplicate picks', async () => {
      // Test race condition protection
    })

    it('should validate budget', async () => {
      // Test budget enforcement
    })

    it('should handle concurrent picks gracefully', async () => {
      // Test simultaneous picks
    })
  })
})

// tests/ai-assistant.test.ts
describe('AI Draft Assistant', () => {
  it('should recommend Pokemon based on type coverage', () => {
    // Test recommendation engine
  })

  it('should identify team weaknesses correctly', () => {
    // Test team analysis
  })
})
```

### Integration Tests:

```typescript
// e2e/draft-flow.spec.ts
import { test, expect } from '@playwright/test'

test('complete draft flow', async ({ page }) => {
  // 1. Create draft
  await page.goto('/create-draft')
  await page.fill('[name="draftName"]', 'Test Draft')
  await page.click('button:has-text("Create Draft")')

  // 2. Join as team
  await expect(page).toHaveURL(/\/draft\/[A-Z0-9]+/)

  // 3. Start draft
  await page.click('button:has-text("Start Draft")')

  // 4. Make picks
  await page.click('.pokemon-card:first-child')
  await page.click('button:has-text("Draft")')

  // 5. Verify pick recorded
  await expect(page.locator('.team-roster')).toContainText('Bulbasaur')
})
```

---

## 📊 Performance Monitoring

### Add Performance Tracking:

```typescript
// lib/performance.ts
export function measurePerformance(name: string, fn: () => void) {
  const start = performance.now()
  fn()
  const duration = performance.now() - start

  if (duration > 16) { // 60fps threshold
    console.warn(`Slow operation: ${name} took ${duration}ms`)
  }

  // Send to Sentry or analytics
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'timing_complete', {
      name,
      value: Math.round(duration)
    })
  }
}

// Usage
useEffect(() => {
  measurePerformance('DraftPage:Render', () => {
    // Component render logic
  })
}, [dependencies])
```

---

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] All P0 fixes implemented
- [ ] Build passes with no errors
- [ ] Environment variables set in production
- [ ] Database migrations applied
- [ ] Indexes created
- [ ] RLS policies reviewed
- [ ] Performance tested with 8+ concurrent users
- [ ] Mobile tested on real devices
- [ ] Accessibility audit passed
- [ ] Error monitoring configured (Sentry)
- [ ] Analytics configured (Google Analytics/Plausible)
- [ ] Backup strategy in place
- [ ] Rate limiting configured
- [ ] CDN configured for assets
- [ ] SSL certificate valid

---

## 📞 Support & Troubleshooting

### Common Issues:

**"Timer not syncing between users"**
- Implement server time synchronization (#1)
- Check for network latency
- Verify system clocks aren't significantly off

**"Draft freezes during high activity"**
- Optimize re-renders (#2)
- Consolidate subscriptions (#7)
- Add loading states (#5)

**"Duplicate picks occurring"**
- Implement race condition protection (#4)
- Check database constraints
- Review pick validation logic

**"Memory growing over time"**
- Fix memory leaks (#3)
- Review subscription cleanup
- Check for lingering timers

---

*Last Updated: 2025-10-09*
*Priority: Phase 1 Critical Fixes*
*Estimated Time: 21 hours*
