import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  Draft,
  Team,
  Participant,
  Auction,
  Pokemon,
  PokemonTier,
  WishlistItem,
  DraftState
} from '@/types'
import { generateSnakeDraftOrder } from '@/utils/draft'

interface DraftActions {
  setDraft: (draft: Draft) => void
  setTeams: (teams: Team[]) => void
  setParticipants: (participants: Participant[]) => void
  setCurrentAuction: (auction: Auction | null) => void
  setAvailablePokemon: (pokemon: Pokemon[]) => void
  setPokemonTiers: (tiers: PokemonTier[]) => void
  setWishlistItems: (items: WishlistItem[]) => void
  addWishlistItem: (item: WishlistItem) => void
  removeWishlistItem: (itemId: string) => void
  updateWishlistItem: (itemId: string, updates: Partial<WishlistItem>) => void
  reorderWishlist: (participantId: string, reorderedItems: WishlistItem[]) => void
  updateTeam: (teamId: string, updates: Partial<Team>) => void
  addPick: (teamId: string, pick: { id: string; pokemonId: string; pokemonName: string; cost: number }) => void
  removePokemon: (pokemonId: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

const initialState: DraftState = {
  draft: null,
  teams: [],
  participants: [],
  currentAuction: null,
  availablePokemon: [],
  pokemonTiers: [],
  wishlistItems: [],
  draftOrder: [],
  isLoading: false,
  error: null,
}

export const useDraftStore = create<DraftState & DraftActions>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setDraft: (draft) => set({ draft }),

    setTeams: (teams) => {
      const draftOrder = teams
        .sort((a, b) => a.draftOrder - b.draftOrder)
        .map(team => team.id)
      set({ teams, draftOrder })
    },

    setParticipants: (participants) => set({ participants }),

    setCurrentAuction: (currentAuction) => set({ currentAuction }),

    setAvailablePokemon: (availablePokemon) => set({ availablePokemon }),

    setPokemonTiers: (pokemonTiers) => set({ pokemonTiers }),

    setWishlistItems: (wishlistItems) => set({ wishlistItems }),

    addWishlistItem: (item) => set((state) => ({
      wishlistItems: [...state.wishlistItems, item]
    })),

    removeWishlistItem: (itemId) => set((state) => ({
      wishlistItems: state.wishlistItems.filter(item => item.id !== itemId)
    })),

    updateWishlistItem: (itemId, updates) => set((state) => ({
      wishlistItems: state.wishlistItems.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      )
    })),

    reorderWishlist: (participantId, reorderedItems) => set((state) => ({
      wishlistItems: [
        ...state.wishlistItems.filter(item => item.participantId !== participantId),
        ...reorderedItems
      ]
    })),

    updateTeam: (teamId, updates) => set((state) => ({
      teams: state.teams.map(team =>
        team.id === teamId ? { ...team, ...updates } : team
      )
    })),

    addPick: (teamId, pick) => set((state) => ({
      teams: state.teams.map(team =>
        team.id === teamId
          ? { ...team, picks: [...team.picks, pick as any] }
          : team
      )
    })),

    removePokemon: (pokemonId) => set((state) => ({
      availablePokemon: state.availablePokemon.filter(p => p.id !== pokemonId)
    })),

    setLoading: (isLoading) => set({ isLoading }),

    setError: (error) => set({ error }),

    reset: () => set(initialState),
  }))
)

// Memoized Selectors with caching
const selectCurrentTeamMemo = new WeakMap<DraftState, { turn: number; result: Team | null }>()

export const selectCurrentTeam = (state: DraftState) => {
  if (!state.draft?.currentTurn || !state.teams.length) return null

  // Check cache
  const cached = selectCurrentTeamMemo.get(state)
  if (cached && cached.turn === state.draft.currentTurn) {
    return cached.result
  }

  const maxRounds = state.draft.settings?.maxPokemonPerTeam || 10
  const currentTurn = state.draft.currentTurn

  // Generate snake draft order and find current team
  const teams = [...state.teams].sort((a, b) => a.draftOrder - b.draftOrder)
  const draftOrder = generateSnakeDraftOrder(teams, maxRounds)

  if (currentTurn > draftOrder.length) return null

  const currentTeamOrder = draftOrder[currentTurn - 1]
  const result = teams.find(team => team.draftOrder === currentTeamOrder) || null

  // Cache result
  selectCurrentTeamMemo.set(state, { turn: currentTurn, result })

  return result
}

export const selectTeamByOrder = (order: number) => (state: DraftState) => {
  return state.teams.find(team => team.draftOrder === order)
}

const selectUserTeamCache = new Map<string, WeakMap<DraftState, Team | null>>()

export const selectUserTeam = (userId: string) => (state: DraftState) => {
  // Get or create cache for this userId
  if (!selectUserTeamCache.has(userId)) {
    selectUserTeamCache.set(userId, new WeakMap())
  }
  const cache = selectUserTeamCache.get(userId)!

  // Check cache
  if (cache.has(state)) {
    return cache.get(state)!
  }

  // Compute result
  const participant = state.participants.find(p => p.userId === userId)
  if (!participant?.teamId) {
    cache.set(state, null)
    return null
  }
  const result = state.teams.find(team => team.id === participant.teamId) || null

  // Cache result
  cache.set(state, result)
  return result
}

export const selectIsUserTurn = (userId: string) => (state: DraftState) => {
  const userTeam = selectUserTeam(userId)(state)
  const currentTeam = selectCurrentTeam(state)
  return userTeam?.id === currentTeam?.id
}

// Additional optimized selectors
export const selectDraftedPokemonIds = (state: DraftState): string[] => {
  return state.teams.flatMap(team => team.picks.map(pick => pick.pokemonId))
}

export const selectTeamBudgetUsed = (teamId: string) => (state: DraftState): number => {
  const team = state.teams.find(t => t.id === teamId)
  if (!team) return 0
  return team.picks.reduce((sum, pick) => sum + pick.cost, 0)
}

export const selectTeamPickCount = (teamId: string) => (state: DraftState): number => {
  const team = state.teams.find(t => t.id === teamId)
  return team?.picks.length || 0
}

// Wishlist selectors
export const selectUserWishlist = (participantId: string) => (state: DraftState) => {
  return state.wishlistItems
    .filter(item => item.participantId === participantId)
    .sort((a, b) => a.priority - b.priority)
}

export const selectAvailableWishlistItems = (participantId: string) => (state: DraftState) => {
  return state.wishlistItems
    .filter(item => item.participantId === participantId && item.isAvailable)
    .sort((a, b) => a.priority - b.priority)
}

export const selectNextAutoPickPokemon = (participantId: string) => (state: DraftState) => {
  const availableItems = selectAvailableWishlistItems(participantId)(state)
  return availableItems.length > 0 ? availableItems[0] : null
}

export const selectIsInWishlist = (participantId: string, pokemonId: string) => (state: DraftState) => {
  return state.wishlistItems.some(item =>
    item.participantId === participantId && item.pokemonId === pokemonId
  )
}