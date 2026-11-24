import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), yourTurn: vi.fn() },
  wishlist: {
    addToWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
    markPokemonDrafted: vi.fn(),
  },
  draft: {
    makePick: vi.fn(),
    getDraftState: vi.fn(async () => null),
    invalidateDraftStateCache: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/notifications', () => ({ notify: h.notify }))
vi.mock('@/lib/wishlist-service', () => ({ WishlistService: h.wishlist }))
vi.mock('@/lib/draft-service', () => ({ DraftService: h.draft }))
vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { useDraftActions } from '@/hooks/useDraftActions'
import { useDraftStore } from '@/stores/draftStore'
import type { Pokemon } from '@/types'

const pokemon = { id: '25', name: 'Pikachu', cost: 5 } as Pokemon

function makeState() {
  const team = { id: 'team-1', name: 'A', userName: 'a', draftOrder: 1, picks: [], budgetRemaining: 100, pickCosts: [], pickTiers: [] }
  return {
    roomCode: 'ABCDEF',
    status: 'drafting' as const,
    currentTurn: 1,
    currentTeam: 'team-1',
    userTeamId: 'team-1',
    teams: [team],
    participants: [{ id: 'part-uuid-1', userId: 'user_clerk', team_id: 'team-1', display_name: 'a', last_seen: '' }],
    draftSettings: { maxTeams: 2, timeLimit: 60, pokemonPerTeam: 6, draftType: 'points' as const },
    timeRemaining: 60,
    draft: { id: 'draft-uuid', status: 'active' },
  }
}

function renderActions() {
  const state = makeState()
  return renderHook(() => useDraftActions({
    draftState: state,
    setDraftState: vi.fn(),
    userId: 'user_clerk',
    roomCode: 'ABCDEF',
    isHost: false,
    isSpectator: false,
    isUserTurn: true,
    isAuctionDraft: false,
    userTeam: state.teams[0],
    currentTeam: state.teams[0],
    budgetFeasibility: null,
    availablePokemon: [],
    shouldShowNotification: () => true,
    transformDraftState: vi.fn(() => state),
    requestBrowserNotificationPermission: vi.fn(),
    authUser: { id: 'user_clerk' },
  }))
}

describe('useDraftActions', () => {
  beforeEach(() => {
    useDraftStore.getState().setWishlistItems([])
  })

  it('writes the wishlist row with participants.id, not the user id (H-02)', async () => {
    h.wishlist.addToWishlist.mockResolvedValue({ id: 'w1' })
    const { result } = renderActions()
    await act(async () => { await result.current.handleAddToWishlist(pokemon) })
    expect(h.wishlist.addToWishlist).toHaveBeenCalledWith('abcdef', 'part-uuid-1', pokemon)
    expect(h.notify.success).toHaveBeenCalled()
  })

  it('treats a null insert result as failure and rolls back (H-02)', async () => {
    h.wishlist.addToWishlist.mockResolvedValue(null)
    const { result } = renderActions()
    await act(async () => { await result.current.handleAddToWishlist(pokemon) })
    expect(h.notify.success).not.toHaveBeenCalled()
    expect(h.notify.error).toHaveBeenCalled()
    expect(Object.keys(useDraftStore.getState().wishlistItemsById)).toHaveLength(0)
  })

  it('does not mark the wishlist drafted when the pick is rejected (H-04)', async () => {
    h.draft.makePick.mockRejectedValue(new Error('Insufficient budget'))
    const { result } = renderActions()
    await act(async () => { await result.current.handleDraftPokemon(pokemon) })
    await act(async () => { await Promise.resolve() })
    expect(h.wishlist.markPokemonDrafted).not.toHaveBeenCalled()
  })

  it('replays a realtime refresh that was skipped during the pick (H-08)', async () => {
    h.draft.makePick.mockImplementation(async () => {
      result.current.pendingRefreshRef.current = true
    })
    const { result } = renderActions()
    await act(async () => { await result.current.handleDraftPokemon(pokemon) })
    // one post-pick refetch + one replay
    expect(h.draft.getDraftState).toHaveBeenCalledTimes(2)
    expect(result.current.pendingRefreshRef.current).toBe(false)
  })
})
