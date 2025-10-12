/**
 * MEMOIZED SELECTORS FOR DRAFT STORE
 *
 * These selectors use closure-based memoization to prevent unnecessary recalculations.
 * Import and use these selectors in components for optimal performance.
 *
 * Usage:
 * const currentTeam = useDraftStore(selectCurrentTeam)
 * const userTeam = useDraftStore(selectUserTeam(userId))
 */

import { Team, Participant, Pick, WishlistItem, Pokemon } from '@/types'

// Import the store type (not the hook)
import { useDraftStore } from './draftStore'

type DraftState = ReturnType<typeof useDraftStore.getState>

// ============================================
// CLOSURE-BASED MEMOIZATION PATTERN
// ============================================

/**
 * Create a memoized selector with closure-based caching
 */
function createMemoizedSelector<T>(
  selector: (state: DraftState) => T,
  equalityFn: (prev: T, next: T) => boolean = Object.is
) {
  let lastState: DraftState | null = null
  let lastResult: T | null = null

  return (state: DraftState): T => {
    const newResult = selector(state)

    // Return cached result if equal
    if (lastState === state && lastResult !== null && equalityFn(lastResult, newResult)) {
      return lastResult
    }

    // Update cache
    lastState = state
    lastResult = newResult
    return newResult
  }
}

// ============================================
// DRAFT SELECTORS
// ============================================

/**
 * Get current draft
 */
export const selectDraft = (state: DraftState) => state.draft

/**
 * Get draft status
 */
export const selectDraftStatus = (state: DraftState) => state.draft?.status || 'setup'

/**
 * Get current turn
 */
export const selectCurrentTurn = (state: DraftState) => state.draft?.currentTurn || 0

/**
 * Get draft settings
 */
export const selectDraftSettings = (state: DraftState) => state.draft?.settings

// ============================================
// TEAM SELECTORS
// ============================================

/**
 * Get all teams as array (sorted by draft order)
 */
export const selectTeams = createMemoizedSelector((state: DraftState): Team[] => {
  return state.teamIds
    .map(id => state.teamsById[id])
    .filter(Boolean)
    .sort((a, b) => a.draftOrder - b.draftOrder)
})

/**
 * Get team by ID
 */
export const selectTeamById = (teamId: string) =>
  (state: DraftState): Team | null => state.teamsById[teamId] || null

/**
 * Get team by draft order
 */
export const selectTeamByOrder = (order: number) =>
  createMemoizedSelector((state: DraftState): Team | null => {
    return Object.values(state.teamsById).find(team => team.draftOrder === order) || null
  })

/**
 * Get current team (based on current turn and snake draft order)
 * NOW O(1) instead of O(n) - uses pre-computed draft order
 */
export const selectCurrentTeam = createMemoizedSelector((state: DraftState): Team | null => {
  if (!state.draft?.currentTurn || state.teamIds.length === 0) return null

  const currentTurn = state.draft.currentTurn

  // Use pre-computed draft order (O(1) lookup!)
  if (currentTurn > state.draftOrder.length) return null

  const currentTeamOrder = state.draftOrder[currentTurn - 1]

  // O(1) lookup instead of O(n) find
  return Object.values(state.teamsById).find(team => team.draftOrder === currentTeamOrder) || null
})

/**
 * Get user's team by userId
 * NOW O(1) instead of O(n) - uses participantsByUserId index
 */
export const selectUserTeam = (userId: string) =>
  createMemoizedSelector((state: DraftState): Team | null => {
    // O(1) lookup: userId -> participantId
    const participantId = state.participantsByUserId[userId]
    if (!participantId) return null

    // O(1) lookup: participantId -> teamId
    const teamId = state.teamsByParticipantId[participantId]
    if (!teamId) return null

    // O(1) lookup: teamId -> team
    return state.teamsById[teamId] || null
  })

/**
 * Check if it's user's turn
 */
export const selectIsUserTurn = (userId: string) =>
  createMemoizedSelector((state: DraftState): boolean => {
    const userTeam = selectUserTeam(userId)(state)
    const currentTeam = selectCurrentTeam(state)
    return userTeam?.id === currentTeam?.id
  })

/**
 * Get team pick count
 * NOW O(1) instead of O(n) - uses picksByTeamId index
 */
export const selectTeamPickCount = (teamId: string) =>
  (state: DraftState): number => {
    return state.picksByTeamId[teamId]?.length || 0
  }

/**
 * Get team budget used
 * NOW O(n) where n = team's picks, not all picks
 */
export const selectTeamBudgetUsed = (teamId: string) =>
  createMemoizedSelector((state: DraftState): number => {
    const pickIds = state.picksByTeamId[teamId] || []
    return pickIds.reduce((sum, pickId) => {
      const pick = state.picksById[pickId]
      return sum + (pick?.cost || 0)
    }, 0)
  })

// ============================================
// PICK SELECTORS
// ============================================

/**
 * Get all picks as array
 */
export const selectPicks = createMemoizedSelector((state: DraftState): Pick[] => {
  return state.pickIds.map(id => state.picksById[id]).filter(Boolean)
})

/**
 * Get picks for a specific team
 * NOW O(1) to get array, O(n) to map picks
 */
export const selectTeamPicks = (teamId: string) =>
  createMemoizedSelector((state: DraftState): Pick[] => {
    const pickIds = state.picksByTeamId[teamId] || []
    return pickIds.map(id => state.picksById[id]).filter(Boolean)
  })

/**
 * Get all drafted Pokemon IDs
 */
export const selectDraftedPokemonIds = createMemoizedSelector((state: DraftState): string[] => {
  return Object.values(state.picksById).map(pick => pick.pokemonId)
})

/**
 * Check if a Pokemon is drafted
 */
export const selectIsPokemonDrafted = (pokemonId: string) =>
  (state: DraftState): boolean => {
    return Object.values(state.picksById).some(pick => pick.pokemonId === pokemonId)
  }

// ============================================
// PARTICIPANT SELECTORS
// ============================================

/**
 * Get all participants as array
 */
export const selectParticipants = createMemoizedSelector((state: DraftState): Participant[] => {
  return state.participantIds.map(id => state.participantsById[id]).filter(Boolean)
})

/**
 * Get participant by ID
 */
export const selectParticipantById = (participantId: string) =>
  (state: DraftState): Participant | null => state.participantsById[participantId] || null

/**
 * Get participant by user ID
 * NOW O(1) instead of O(n)
 */
export const selectParticipantByUserId = (userId: string) =>
  (state: DraftState): Participant | null => {
    const participantId = state.participantsByUserId[userId]
    return participantId ? state.participantsById[participantId] || null : null
  }

// ============================================
// WISHLIST SELECTORS
// ============================================

/**
 * Get all wishlist items for a participant
 * NOW O(1) to get array, O(n) to map items
 */
export const selectUserWishlist = (participantId: string) =>
  createMemoizedSelector((state: DraftState): WishlistItem[] => {
    const itemIds = state.wishlistItemsByParticipantId[participantId] || []
    return itemIds
      .map(id => state.wishlistItemsById[id])
      .filter(Boolean)
      .sort((a, b) => a.priority - b.priority)
  })

/**
 * Get available wishlist items (not drafted)
 */
export const selectAvailableWishlistItems = (participantId: string) =>
  createMemoizedSelector((state: DraftState): WishlistItem[] => {
    const itemIds = state.wishlistItemsByParticipantId[participantId] || []
    return itemIds
      .map(id => state.wishlistItemsById[id])
      .filter(item => item && item.isAvailable)
      .sort((a, b) => a.priority - b.priority)
  })

/**
 * Get next auto-pick Pokemon
 */
export const selectNextAutoPickPokemon = (participantId: string) =>
  createMemoizedSelector((state: DraftState): WishlistItem | null => {
    const availableItems = selectAvailableWishlistItems(participantId)(state)
    return availableItems.length > 0 ? availableItems[0] : null
  })

/**
 * Check if Pokemon is in wishlist
 */
export const selectIsInWishlist = (participantId: string, pokemonId: string) =>
  (state: DraftState): boolean => {
    const itemIds = state.wishlistItemsByParticipantId[participantId] || []
    return itemIds.some(id => {
      const item = state.wishlistItemsById[id]
      return item?.pokemonId === pokemonId
    })
  }

// ============================================
// AUCTION SELECTORS
// ============================================

/**
 * Get current auction
 */
export const selectCurrentAuction = (state: DraftState) => state.currentAuction

/**
 * Get all auctions
 */
export const selectAuctions = createMemoizedSelector((state: DraftState) => {
  return state.auctionIds.map(id => state.auctionsById[id]).filter(Boolean)
})

/**
 * Get active auction
 */
export const selectActiveAuction = createMemoizedSelector((state: DraftState) => {
  return Object.values(state.auctionsById).find(auction => auction.status === 'active') || null
})

// ============================================
// POKEMON SELECTORS
// ============================================

/**
 * Get available Pokemon
 */
export const selectAvailablePokemon = (state: DraftState): Pokemon[] => state.availablePokemon

/**
 * Get undrafted Pokemon
 */
export const selectUndraftedPokemon = createMemoizedSelector((state: DraftState): Pokemon[] => {
  const draftedIds = new Set(selectDraftedPokemonIds(state))
  return state.availablePokemon.filter(p => !draftedIds.has(p.id))
})

// ============================================
// DERIVED STATE SELECTORS
// ============================================

/**
 * Get draft progress (percentage)
 */
export const selectDraftProgress = createMemoizedSelector((state: DraftState): number => {
  if (!state.draft) return 0

  const maxPokemonPerTeam = state.draft.settings?.maxPokemonPerTeam || 6
  const totalTeams = state.teamIds.length
  const totalPicks = Object.keys(state.picksById).length
  const maxPicks = maxPokemonPerTeam * totalTeams

  return maxPicks > 0 ? (totalPicks / maxPicks) * 100 : 0
})

/**
 * Check if draft is complete
 */
export const selectIsDraftComplete = createMemoizedSelector((state: DraftState): boolean => {
  if (!state.draft) return false

  const maxPokemonPerTeam = state.draft.settings?.maxPokemonPerTeam || 6
  const totalTeams = state.teamIds.length

  // Check if all teams have max picks
  return state.teamIds.every(teamId => {
    const pickCount = state.picksByTeamId[teamId]?.length || 0
    return pickCount >= maxPokemonPerTeam
  })
})

/**
 * Get round number from current turn
 */
export const selectCurrentRound = createMemoizedSelector((state: DraftState): number => {
  if (!state.draft?.currentTurn) return 1

  const totalTeams = state.teamIds.length
  if (totalTeams === 0) return 1

  return Math.floor((state.draft.currentTurn - 1) / totalTeams) + 1
})

/**
 * Check if user can pick
 */
export const selectCanUserPick = (userId: string) =>
  createMemoizedSelector((state: DraftState): boolean => {
    if (state.draft?.status !== 'active') return false

    const isUserTurn = selectIsUserTurn(userId)(state)
    if (!isUserTurn) return false

    const userTeam = selectUserTeam(userId)(state)
    if (!userTeam) return false

    // Check if team has budget remaining
    return userTeam.budgetRemaining > 0
  })

// ============================================
// LOADING & ERROR SELECTORS
// ============================================

/**
 * Get loading state
 */
export const selectIsLoading = (state: DraftState): boolean => state.isLoading

/**
 * Get error state
 */
export const selectError = (state: DraftState): string | null => state.error

// ============================================
// EXPORT ALL SELECTORS
// ============================================

export const selectors = {
  // Draft
  selectDraft,
  selectDraftStatus,
  selectCurrentTurn,
  selectDraftSettings,

  // Teams
  selectTeams,
  selectTeamById,
  selectTeamByOrder,
  selectCurrentTeam,
  selectUserTeam,
  selectIsUserTurn,
  selectTeamPickCount,
  selectTeamBudgetUsed,

  // Picks
  selectPicks,
  selectTeamPicks,
  selectDraftedPokemonIds,
  selectIsPokemonDrafted,

  // Participants
  selectParticipants,
  selectParticipantById,
  selectParticipantByUserId,

  // Wishlist
  selectUserWishlist,
  selectAvailableWishlistItems,
  selectNextAutoPickPokemon,
  selectIsInWishlist,

  // Auctions
  selectCurrentAuction,
  selectAuctions,
  selectActiveAuction,

  // Pokemon
  selectAvailablePokemon,
  selectUndraftedPokemon,

  // Derived state
  selectDraftProgress,
  selectIsDraftComplete,
  selectCurrentRound,
  selectCanUserPick,

  // Loading & Error
  selectIsLoading,
  selectError
}
