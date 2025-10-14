# Multi-User Real-Time Architecture

This document explains how the Pokemon Draft Simulator handles multiple simultaneous users with real-time synchronization.

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User A    │     │   User B    │     │   User C    │
│  (Browser)  │     │  (Browser)  │     │  (Browser)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │ WebSocket         │ WebSocket         │ WebSocket
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Supabase  │
                    │  Realtime   │
                    │   Server    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  PostgreSQL │
                    │  Database   │
                    └─────────────┘
```

## Core Components

### 1. Real-Time Subscription Layer

**Location**: [`src/app/draft/[id]/page.tsx`](src/app/draft/[id]/page.tsx:526-606)

**Purpose**: Listens for changes from Supabase and updates local state

**Key Features**:
- 100ms debouncing to batch rapid updates
- `startTransition` for deferred state updates
- Error counting with auto-retry (max 5 errors)
- Ref-based callbacks to prevent stale closures

```typescript
// Subscribe to real-time updates
useEffect(() => {
  if (!roomCode || !isConnected) return

  let mounted = true
  const abortController = new AbortController()
  let updateTimeoutId: NodeJS.Timeout | null = null

  const unsubscribe = DraftService.subscribeToDraft(roomCode, async (payload) => {
    // Debounce: Clear previous timeout
    if (updateTimeoutId) clearTimeout(updateTimeoutId)

    // Wait 100ms before processing to batch updates
    updateTimeoutId = setTimeout(async () => {
      const dbState = await DraftService.getDraftState(roomCode)

      // Use startTransition to defer state updates
      startTransition(() => {
        setDraftState(transformDraftState(dbState, userId))
      })
    }, 100)
  })

  return () => {
    mounted = false
    abortController.abort()
    if (updateTimeoutId) clearTimeout(updateTimeoutId)
    unsubscribe()
  }
}, [roomCode, isConnected, userId])
```

### 2. Connection Management

**Location**: [`src/hooks/useReconnection.ts`](src/hooks/useReconnection.ts)

**Purpose**: Handles connection drops and automatic reconnection

**Features**:
- Exponential backoff (1s → 2s → 4s → 8s → 16s → 30s max)
- Monitors browser online/offline events
- Auto-reconnect with configurable retry limits
- Connection health tracking

```typescript
const { isConnected, isReconnecting } = useReconnection({
  enabled: !!roomCode,
  maxRetries: 5,
  onReconnect: async () => {
    // Reload full state when reconnected
    const dbState = await DraftService.getDraftState(roomCode)
    setDraftState(transformDraftState(dbState, userId))
  }
})
```

**Connection States**:
- `online` - Fully connected to Supabase
- `offline` - No connection, queuing actions
- `reconnecting` - Attempting to restore connection
- `degraded` - Connected but poor quality

### 3. Connection Status Indicator

**Location**: [`src/components/ui/ConnectionStatus.tsx`](src/components/ui/ConnectionStatus.tsx)

**Purpose**: Visual feedback for connection health

**Features**:
- Simple badge showing online/offline/reconnecting
- Detailed panel with latency, network type, signal strength
- Offline queue counter
- Manual reconnect button
- Adaptive feature indicators

**Usage**:
```typescript
<ConnectionStatus className="mr-2" />
```

### 4. Optimistic Updates

**Location**: [`src/app/draft/[id]/page.tsx`](src/app/draft/[id]/page.tsx:488-561)

**Purpose**: Instant UI feedback before server confirmation

**Pattern**:
```typescript
async function makePick(pokemon: Pokemon) {
  // 1. Optimistically update local UI immediately
  const optimisticPick = {
    id: `temp-${Date.now()}`,
    pokemonId: pokemon.id,
    teamId: userTeam.id
  }
  setDraftState(prev => ({
    ...prev,
    teams: prev.teams.map(t =>
      t.id === userTeam.id
        ? { ...t, picks: [...t.picks, pokemon.id] }
        : t
    )
  }))

  try {
    // 2. Send to server
    const result = await DraftService.makePick(
      roomCode,
      userId,
      pokemon.id,
      pokemon.name,
      pokemon.cost
    )

    // 3. Server broadcasts to all other users via Supabase Realtime
    // 4. All peers receive update and refresh their UI
    notify.success('Drafted!', `${pokemon.name} added to your team`)
  } catch (error) {
    // 5. Revert optimistic update on error
    setDraftState(prev => ({
      ...prev,
      teams: prev.teams.map(t =>
        t.id === userTeam.id
          ? { ...t, picks: t.picks.filter(id => id !== pokemon.id) }
          : t
      )
    }))
    notify.error('Failed', 'Could not draft Pokemon')
  }
}
```

### 5. Stable Memoization (Infinite Loop Prevention)

**Location**: [`src/app/draft/[id]/page.tsx`](src/app/draft/[id]/page.tsx:311-339)

**Purpose**: Prevent infinite re-render loops in Radix UI components

**Problem**: Depending on entire `draftState` object causes every component to re-render when any field changes, triggering cascading re-renders.

**Solution**: Use stable string signatures that only change when actual data changes

```typescript
// ❌ BAD - Causes infinite loops
const userTeam = useMemo(() =>
  draftState?.teams.find(t => t.id === draftState.userTeamId),
  [draftState] // New object reference on every update
)

// ✅ GOOD - Only updates when picks or budgets change
const userTeam = useMemo(() => {
  if (!draftState?.teams || !draftState.userTeamId) return null
  return draftState.teams.find(t => t.id === draftState.userTeamId) || null
}, [
  draftState?.userTeamId,
  draftState?.teams?.map(t =>
    `${t.id}:${t.picks.length}:${t.budgetRemaining}`
  ).join('|') // Stable signature: "team1:3:85|team2:5:70"
])
```

### 6. Ref-Based Callbacks

**Location**: [`src/app/draft/[id]/page.tsx`](src/app/draft/[id]/page.tsx:340-359)

**Purpose**: Stable callbacks that don't cause re-renders

**Pattern**:
```typescript
// Store latest values in refs
const draftStateRef = useRef(draftState)
const userIdRef = useRef(userId)
const notifyRef = useRef(notify)

// Keep refs in sync
useEffect(() => {
  draftStateRef.current = draftState
  userIdRef.current = userId
  notifyRef.current = notify
}, [draftState, userId, notify])

// Callbacks read from refs instead of closure
const handleAddToWishlist = useCallback(async (pokemon: Pokemon) => {
  const currentDraftState = draftStateRef.current
  const currentUserId = userIdRef.current
  const currentNotify = notifyRef.current

  // Use current values without recreating callback
  await WishlistService.addToWishlist(
    roomCode,
    currentUserId,
    pokemon
  )
  currentNotify.success('Added!', `${pokemon.name} added to wishlist`)
}, [roomCode]) // Only roomCode dependency
```

### 7. Session Management

**Location**: [`src/lib/user-session.ts`](src/lib/user-session.ts)

**Purpose**: Persistent user identity across refreshes

**Features**:
- Guest user support (no auth required)
- User ID format: `guest-{timestamp}-{random}`
- Stored in localStorage
- Can upgrade to full auth later

```typescript
// Get or create session
const session = await UserSessionService.getOrCreateSession(userName)
// Returns: { userId: "guest-1644512345678-a3b4c5", userName: "Player1" }

// Session persists across page refreshes
localStorage.setItem('guestUserId', session.userId)
```

### 8. Server-Side Validation (RLS Policies)

**Location**: Supabase Database

**Purpose**: Prevent conflicts and ensure only valid actions

**Example Policies**:

```sql
-- Only current team can make picks
CREATE POLICY "Users can only draft for their team on their turn"
ON picks FOR INSERT
USING (
  team_id IN (
    SELECT t.id FROM teams t
    JOIN drafts d ON d.id = t.draft_id
    WHERE d.current_turn = t.draft_order
  )
);

-- Users can only update their own team
CREATE POLICY "Users can update their own team"
ON teams FOR UPDATE
USING (id IN (
  SELECT team_id FROM participants
  WHERE user_id = auth.uid()
));
```

## Data Flow Example: Making a Pick

### User A Makes a Pick

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User A clicks "Draft Charizard"                          │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Optimistic Update (User A's UI)                          │
│    - Immediately show Charizard in User A's team            │
│    - Update budget locally                                   │
│    - Show success notification                               │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Send to Supabase                                          │
│    - POST /api/draft/{roomCode}/pick                        │
│    - Validate: Is it User A's turn?                         │
│    - Validate: Does User A have enough budget?              │
│    - Insert into `picks` table                               │
│    - Update `teams` table (budget)                           │
│    - Advance turn to next team                               │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Supabase Realtime Broadcast                              │
│    - Send UPDATE event to all connected clients             │
│    - Includes changed row data                               │
└────────┬───────────────┬───────────────┬────────────────────┘
         │               │               │
         ▼               ▼               ▼
    ┌────────┐      ┌────────┐      ┌────────┐
    │ User A │      │ User B │      │ User C │
    └────┬───┘      └────┬───┘      └────┬───┘
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. All Clients Process Update (100ms debounce)              │
│    - Fetch full draft state from database                   │
│    - Transform to UI format                                  │
│    - Update local state with startTransition                │
└────────────────────────────────────────────────────────────┬┘
                                                              │
                                                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. UI Updates for All Users                                 │
│    - User A: Confirms pick (already shown optimistically)   │
│    - User B: Sees Charizard appear in User A's team         │
│    - User C: Sees Charizard appear in User A's team         │
│    - All: Charizard removed from available Pokemon          │
│    - All: Turn indicator moves to next team                  │
└─────────────────────────────────────────────────────────────┘
```

### Timeline

- **0ms**: User A clicks button
- **0ms**: Optimistic UI update (User A only)
- **50ms**: HTTP request reaches Supabase
- **100ms**: Database transaction completes
- **150ms**: Realtime broadcast sent to all clients
- **200ms**: User B and C receive WebSocket message
- **300ms**: All clients finish processing (100ms debounce)
- **350ms**: All UIs fully synchronized

**Total sync time**: ~350ms from click to all users seeing the update

## Performance Optimizations

### 1. Debouncing (100ms)

**Why**: Multiple database tables update when a pick is made (picks, teams, drafts), triggering multiple WebSocket events

**Solution**: Batch all updates within 100ms window into single state update

### 2. startTransition

**Why**: State updates block rendering, causing UI lag

**Solution**: Mark updates as low-priority, allowing React to keep UI responsive

### 3. Memoization

**Why**: Re-calculating derived values (like userTeam) is expensive and causes re-renders

**Solution**: Use stable dependencies to only recalculate when actual data changes

### 4. Ref-Based Callbacks

**Why**: Creating new callback functions causes child components to re-render (React.memo fails)

**Solution**: Use refs to read latest values without recreating callbacks

### 5. Virtualization

**Location**: [`src/components/pokemon/VirtualizedPokemonGrid.tsx`](src/components/pokemon/VirtualizedPokemonGrid.tsx)

**Why**: Rendering 1000+ Pokemon cards at once is slow

**Solution**: Only render cards visible in viewport + small overscan buffer

## Connection Recovery

### Scenario: User Loses Internet

```
1. Browser detects offline
   ↓
2. useReconnection hook marks as offline
   ↓
3. ConnectionStatus shows "Offline" badge
   ↓
4. User tries to make pick
   ↓
5. Action queued in offline queue
   ↓
6. Toast: "Action saved, will sync when online"
   ↓
7. Internet restored
   ↓
8. useReconnection detects online
   ↓
9. Exponential backoff reconnection starts
   ↓
10. Connection established
    ↓
11. Full draft state reloaded
    ↓
12. Offline queue processed
    ↓
13. Pick is made (if still valid)
    ↓
14. Toast: "Back online! Pick synchronized"
```

### Exponential Backoff

```typescript
// Retry delays
Attempt 1: 1 second
Attempt 2: 2 seconds
Attempt 3: 4 seconds
Attempt 4: 8 seconds
Attempt 5: 16 seconds
Attempt 6+: 30 seconds (max)
```

## Conflict Resolution

### Scenario: Two Users Pick Simultaneously

```
User A (Turn 1):              User B (Turn 2):
└─ Picks Charizard            └─ Also tries Charizard
   ↓                             ↓
   Server receives A first       Server receives B second
   ↓                             ↓
   A: Success ✓                  B: Error (not your turn)
   ↓                             │
   Broadcast A's pick            ▼
   ↓                          B's optimistic update reverted
   All users see A got it     B sees error: "Not your turn"
```

**Resolution**: Server-side RLS policies ensure only current team can pick

### Scenario: Race Condition on Budget

```
User A picks $15 Pokemon:     User B picks $90 Pokemon:
Budget: $100                  Budget: $100 (stale)
└─ Sends pick                 └─ Sends pick
   ↓                             ↓
   Server: Budget check          Server: Budget check
   ↓                             ↓
   $100 - $15 = $85 ✓            $85 - $90 = -$5 ✗
   ↓                             │
   Success                       ▼
                              Error: Insufficient budget
```

**Resolution**: Server rechecks budget using latest database value (not client's stale value)

## Testing Multi-User Sync

### Manual Test

1. Open draft in 3 browser windows (or tabs)
2. Join as different teams (User A, B, C)
3. Start draft
4. User A makes pick → Verify appears in all windows within 500ms
5. User B makes pick → Verify appears in all windows
6. Disconnect User C's internet → Verify shows "Offline" badge
7. User A makes pick → User C doesn't see it (offline)
8. Reconnect User C → Verify catches up automatically

### Load Test

```bash
# Simulate 50 concurrent users
# (Future: Add this script)
npm run test:load -- --users=50 --room=TEST123
```

## Troubleshooting

### Issue: Infinite Render Loops

**Symptom**: Browser freezes, React DevTools shows thousands of renders

**Cause**: Unstable memoization dependencies (using entire `draftState` object)

**Fix**: Use stable string signatures instead

```typescript
// Before (bad)
[draftState]

// After (good)
[draftState?.teams?.map(t => `${t.id}:${t.picks.length}`).join('|')]
```

### Issue: Users Not Seeing Updates

**Symptom**: User A makes pick, User B doesn't see it

**Possible Causes**:
1. **WebSocket disconnected**: Check ConnectionStatus badge
2. **RLS policy blocking**: Check browser console for 403 errors
3. **Wrong room code**: Verify both users in same room
4. **Subscription not active**: Check `isConnected` is true

**Debug**:
```typescript
// Enable subscription logging
console.log('[Draft Subscription] Change detected:', payload)
```

### Issue: Stale Data After Reconnect

**Symptom**: User reconnects but sees old draft state

**Cause**: onReconnect callback not reloading data

**Fix**: Ensure onReconnect fetches full state

```typescript
useReconnection({
  onReconnect: async () => {
    const dbState = await DraftService.getDraftState(roomCode)
    setDraftState(transformDraftState(dbState, userId))
  }
})
```

## Future Enhancements

### 1. Presence System
Show which users are currently online viewing the draft

### 2. Cursor Sharing
Show which Pokemon other users are hovering over

### 3. Typing Indicators
Show when users are typing in chat

### 4. Voice Chat
Integrate WebRTC for voice communication

### 5. Spectator Mode Improvements
- Live commentary
- Polls and predictions
- Reactions and emotes

### 6. Offline Mode
- Full offline draft capability
- Sync when connection restored
- Conflict resolution UI

## References

- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)
- [React startTransition](https://react.dev/reference/react/startTransition)
- [Exponential Backoff](https://en.wikipedia.org/wiki/Exponential_backoff)
- [WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

**Last Updated**: 2025-10-14
**Version**: 1.0.0
