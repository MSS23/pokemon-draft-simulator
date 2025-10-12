import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import {
  Draft,
  Team,
  Participant,
  Pick,
  Auction,
  Pokemon,
  PokemonTier,
  WishlistItem
} from '@/types'
import { generateSnakeDraftOrder } from '@/utils/draft'

// ============================================
// NORMALIZED STATE STRUCTURE
// ============================================

interface NormalizedDraftState {
  // Core draft metadata
  draft: Draft | null

  // Normalized entities (by ID for O(1) lookup)
  teamsById: Record<string, Team>
  participantsById: Record<string, Participant>
  picksById: Record<string, Pick>
  auctionsById: Record<string, Auction>
  pokemonTiersById: Record<string, PokemonTier>
  wishlistItemsById: Record<string, WishlistItem>

  // ID arrays for ordering
  teamIds: string[]
  participantIds: string[]
  pickIds: string[]
  auctionIds: string[]
  pokemonTierIds: string[]
  wishlistItemIds: string[]

  // Relationship indexes for fast lookups
  participantsByUserId: Record<string, string> // userId -> participantId
  teamsByParticipantId: Record<string, string> // participantId -> teamId
  picksByTeamId: Record<string, string[]> // teamId -> pickIds[]
  wishlistItemsByParticipantId: Record<string, string[]> // participantId -> wishlistItemIds[]

  // Pre-computed draft order (O(1) lookup instead of O(n) calculation)
  draftOrder: number[] // Array of team draft orders in snake pattern

  // Pokemon data (non-normalized for now - could be normalized later)
  availablePokemon: Pokemon[]

  // Current auction (denormalized for quick access)
  currentAuction: Auction | null

  // UI state
  isLoading: boolean
  error: string | null
}

// ============================================
// ACTIONS INTERFACE
// ============================================

interface DraftActions {
  // Batch state updates (reduces re-renders)
  setDraftState: (state: {
    draft?: Draft
    teams?: Team[]
    participants?: Participant[]
    picks?: Pick[]
    auctions?: Auction[]
    wishlistItems?: WishlistItem[]
    pokemonTiers?: PokemonTier[]
  }) => void

  // Individual entity updates
  setDraft: (draft: Draft) => void
  setTeams: (teams: Team[]) => void
  setParticipants: (participants: Participant[]) => void
  setPicks: (picks: Pick[]) => void
  setCurrentAuction: (auction: Auction | null) => void
  setAvailablePokemon: (pokemon: Pokemon[]) => void
  setPokemonTiers: (tiers: PokemonTier[]) => void
  setWishlistItems: (items: WishlistItem[]) => void

  // Optimistic update actions
  makePick: (teamId: string, pick: Omit<Pick, 'id' | 'draftId' | 'createdAt'>) => Promise<void>
  addPick: (teamId: string, pick: Pick) => void
  removePick: (pickId: string) => void
  updatePick: (pickId: string, updates: Partial<Pick>) => void

  // Team actions
  updateTeam: (teamId: string, updates: Partial<Team>) => void
  updateTeamBudget: (teamId: string, budgetChange: number) => void

  // Wishlist actions
  addWishlistItem: (item: WishlistItem) => void
  removeWishlistItem: (itemId: string) => void
  updateWishlistItem: (itemId: string, updates: Partial<WishlistItem>) => void
  reorderWishlist: (participantId: string, reorderedItems: WishlistItem[]) => void
  markPokemonDrafted: (pokemonId: string) => void

  // Auction actions
  addAuction: (auction: Auction) => void
  updateAuction: (auctionId: string, updates: Partial<Auction>) => void
  removeAuction: (auctionId: string) => void

  // Pokemon actions
  removePokemon: (pokemonId: string) => void

  // Utility actions
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

type DraftStore = NormalizedDraftState & DraftActions

// ============================================
// INITIAL STATE
// ============================================

const initialState: NormalizedDraftState = {
  draft: null,
  teamsById: {},
  participantsById: {},
  picksById: {},
  auctionsById: {},
  pokemonTiersById: {},
  wishlistItemsById: {},
  teamIds: [],
  participantIds: [],
  pickIds: [],
  auctionIds: [],
  pokemonTierIds: [],
  wishlistItemIds: [],
  participantsByUserId: {},
  teamsByParticipantId: {},
  picksByTeamId: {},
  wishlistItemsByParticipantId: {},
  draftOrder: [],
  availablePokemon: [],
  currentAuction: null,
  isLoading: false,
  error: null
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Normalize array into byId map and ids array
 */
function normalizeEntities<T extends { id: string }>(entities: T[]): {
  byId: Record<string, T>
  ids: string[]
} {
  const byId: Record<string, T> = {}
  const ids: string[] = []

  entities.forEach(entity => {
    byId[entity.id] = entity
    ids.push(entity.id)
  })

  return { byId, ids }
}

/**
 * Build relationship indexes
 */
function buildIndexes(
  participants: Participant[],
  picks: Pick[],
  wishlistItems: WishlistItem[]
): {
  participantsByUserId: Record<string, string>
  teamsByParticipantId: Record<string, string>
  picksByTeamId: Record<string, string[]>
  wishlistItemsByParticipantId: Record<string, string[]>
} {
  const participantsByUserId: Record<string, string> = {}
  const teamsByParticipantId: Record<string, string> = {}
  const picksByTeamId: Record<string, string[]> = {}
  const wishlistItemsByParticipantId: Record<string, string[]> = {}

  // Index participants
  participants.forEach(participant => {
    if (participant.userId) {
      participantsByUserId[participant.userId] = participant.id
    }
    if (participant.teamId) {
      teamsByParticipantId[participant.id] = participant.teamId
    }
  })

  // Index picks by team
  picks.forEach(pick => {
    if (!picksByTeamId[pick.teamId]) {
      picksByTeamId[pick.teamId] = []
    }
    picksByTeamId[pick.teamId].push(pick.id)
  })

  // Sort picks by pick order
  Object.keys(picksByTeamId).forEach(teamId => {
    picksByTeamId[teamId].sort((a, b) => {
      const pickA = picks.find(p => p.id === a)
      const pickB = picks.find(p => p.id === b)
      return (pickA?.pickOrder || 0) - (pickB?.pickOrder || 0)
    })
  })

  // Index wishlist items by participant
  wishlistItems.forEach(item => {
    if (!wishlistItemsByParticipantId[item.participantId]) {
      wishlistItemsByParticipantId[item.participantId] = []
    }
    wishlistItemsByParticipantId[item.participantId].push(item.id)
  })

  // Sort wishlist items by priority
  Object.keys(wishlistItemsByParticipantId).forEach(participantId => {
    wishlistItemsByParticipantId[participantId].sort((a, b) => {
      const itemA = wishlistItems.find(i => i.id === a)
      const itemB = wishlistItems.find(i => i.id === b)
      return (itemA?.priority || 0) - (itemB?.priority || 0)
    })
  })

  return {
    participantsByUserId,
    teamsByParticipantId,
    picksByTeamId,
    wishlistItemsByParticipantId
  }
}

/**
 * Pre-compute snake draft order
 */
function computeDraftOrder(teams: Team[], maxRounds: number): number[] {
  if (teams.length === 0) return []

  const sortedTeams = [...teams].sort((a, b) => a.draftOrder - b.draftOrder)
  const totalTeams = sortedTeams.length
  const draftOrder: number[] = []

  for (let round = 0; round < maxRounds; round++) {
    if (round % 2 === 0) {
      // Normal order (1, 2, 3, 4...)
      for (let i = 0; i < totalTeams; i++) {
        draftOrder.push(sortedTeams[i].draftOrder)
      }
    } else {
      // Reverse order (4, 3, 2, 1...)
      for (let i = totalTeams - 1; i >= 0; i--) {
        draftOrder.push(sortedTeams[i].draftOrder)
      }
    }
  }

  return draftOrder
}

/**
 * Validate action inputs
 */
function validateTeamExists(
  teamsById: Record<string, Team>,
  teamId: string,
  actionName: string
): boolean {
  if (!teamsById[teamId]) {
    console.error(`[${actionName}] Team not found: ${teamId}`)
    return false
  }
  return true
}

function validateBudget(
  teamsById: Record<string, Team>,
  teamId: string,
  cost: number,
  actionName: string
): boolean {
  const team = teamsById[teamId]
  if (!team) return false

  if (team.budgetRemaining < cost) {
    console.error(
      `[${actionName}] Insufficient budget. Required: ${cost}, Available: ${team.budgetRemaining}`
    )
    return false
  }
  return true
}

// ============================================
// ZUSTAND STORE
// ============================================

export const useDraftStore = create<DraftStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      ...initialState,

      // ============================================
      // BATCH UPDATE (Preferred for real-time sync)
      // ============================================
      setDraftState: (state) => {
        set((draft) => {
          // Update draft
          if (state.draft) {
            draft.draft = state.draft
          }

          // Normalize teams
          if (state.teams) {
            const { byId, ids } = normalizeEntities(state.teams)
            draft.teamsById = byId
            draft.teamIds = ids

            // Pre-compute draft order
            const maxRounds = state.draft?.settings?.maxPokemonPerTeam || draft.draft?.settings?.maxPokemonPerTeam || 10
            draft.draftOrder = computeDraftOrder(state.teams, maxRounds)
          }

          // Normalize participants
          if (state.participants) {
            const { byId, ids } = normalizeEntities(state.participants)
            draft.participantsById = byId
            draft.participantIds = ids
          }

          // Normalize picks
          if (state.picks) {
            const { byId, ids } = normalizeEntities(state.picks)
            draft.picksById = byId
            draft.pickIds = ids
          }

          // Normalize auctions
          if (state.auctions) {
            const { byId, ids } = normalizeEntities(state.auctions)
            draft.auctionsById = byId
            draft.auctionIds = ids

            // Update current auction
            const activeAuction = state.auctions.find(a => a.status === 'active')
            draft.currentAuction = activeAuction || null
          }

          // Normalize wishlist items
          if (state.wishlistItems) {
            const { byId, ids } = normalizeEntities(state.wishlistItems)
            draft.wishlistItemsById = byId
            draft.wishlistItemIds = ids
          }

          // Normalize pokemon tiers
          if (state.pokemonTiers) {
            const { byId, ids } = normalizeEntities(state.pokemonTiers)
            draft.pokemonTiersById = byId
            draft.pokemonTierIds = ids
          }

          // Rebuild indexes
          const participants = state.participants || Object.values(draft.participantsById)
          const picks = state.picks || Object.values(draft.picksById)
          const wishlistItems = state.wishlistItems || Object.values(draft.wishlistItemsById)

          const indexes = buildIndexes(participants, picks, wishlistItems)
          draft.participantsByUserId = indexes.participantsByUserId
          draft.teamsByParticipantId = indexes.teamsByParticipantId
          draft.picksByTeamId = indexes.picksByTeamId
          draft.wishlistItemsByParticipantId = indexes.wishlistItemsByParticipantId
        })
      },

      // ============================================
      // INDIVIDUAL SETTERS
      // ============================================
      setDraft: (draft) => {
        set((state) => {
          state.draft = draft
        })
      },

      setTeams: (teams) => {
        set((state) => {
          const { byId, ids } = normalizeEntities(teams)
          state.teamsById = byId
          state.teamIds = ids

          // Pre-compute draft order
          const maxRounds = state.draft?.settings?.maxPokemonPerTeam || 10
          state.draftOrder = computeDraftOrder(teams, maxRounds)
        })
      },

      setParticipants: (participants) => {
        set((state) => {
          const { byId, ids } = normalizeEntities(participants)
          state.participantsById = byId
          state.participantIds = ids

          // Update indexes
          participants.forEach(participant => {
            if (participant.userId) {
              state.participantsByUserId[participant.userId] = participant.id
            }
            if (participant.teamId) {
              state.teamsByParticipantId[participant.id] = participant.teamId
            }
          })
        })
      },

      setPicks: (picks) => {
        set((state) => {
          const { byId, ids } = normalizeEntities(picks)
          state.picksById = byId
          state.pickIds = ids

          // Rebuild pick index
          state.picksByTeamId = {}
          picks.forEach(pick => {
            if (!state.picksByTeamId[pick.teamId]) {
              state.picksByTeamId[pick.teamId] = []
            }
            state.picksByTeamId[pick.teamId].push(pick.id)
          })

          // Sort picks by pick order
          Object.keys(state.picksByTeamId).forEach(teamId => {
            state.picksByTeamId[teamId].sort((a, b) => {
              const pickA = state.picksById[a]
              const pickB = state.picksById[b]
              return (pickA?.pickOrder || 0) - (pickB?.pickOrder || 0)
            })
          })
        })
      },

      setCurrentAuction: (auction) => {
        set((state) => {
          state.currentAuction = auction
        })
      },

      setAvailablePokemon: (pokemon) => {
        set((state) => {
          state.availablePokemon = pokemon
        })
      },

      setPokemonTiers: (tiers) => {
        set((state) => {
          const { byId, ids } = normalizeEntities(tiers)
          state.pokemonTiersById = byId
          state.pokemonTierIds = ids
        })
      },

      setWishlistItems: (items) => {
        set((state) => {
          const { byId, ids } = normalizeEntities(items)
          state.wishlistItemsById = byId
          state.wishlistItemIds = ids

          // Rebuild wishlist index
          state.wishlistItemsByParticipantId = {}
          items.forEach(item => {
            if (!state.wishlistItemsByParticipantId[item.participantId]) {
              state.wishlistItemsByParticipantId[item.participantId] = []
            }
            state.wishlistItemsByParticipantId[item.participantId].push(item.id)
          })

          // Sort by priority
          Object.keys(state.wishlistItemsByParticipantId).forEach(participantId => {
            state.wishlistItemsByParticipantId[participantId].sort((a, b) => {
              const itemA = state.wishlistItemsById[a]
              const itemB = state.wishlistItemsById[b]
              return (itemA?.priority || 0) - (itemB?.priority || 0)
            })
          })
        })
      },

      // ============================================
      // OPTIMISTIC PICK ACTION
      // ============================================
      makePick: async (teamId, pickData) => {
        const state = get()

        // Validation
        if (!validateTeamExists(state.teamsById, teamId, 'makePick')) {
          throw new Error('Team not found')
        }

        if (!validateBudget(state.teamsById, teamId, pickData.cost, 'makePick')) {
          throw new Error('Insufficient budget')
        }

        // Create optimistic pick
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const optimisticPick: Pick = {
          ...pickData,
          id: tempId,
          draftId: state.draft?.id || '',
          createdAt: new Date().toISOString()
        }

        // 1. Optimistic update (instant UI feedback)
        set((draft) => {
          // Add pick
          draft.picksById[tempId] = optimisticPick
          draft.pickIds.push(tempId)

          // Update team picks index
          if (!draft.picksByTeamId[teamId]) {
            draft.picksByTeamId[teamId] = []
          }
          draft.picksByTeamId[teamId].push(tempId)

          // Update team budget
          const team = draft.teamsById[teamId]
          if (team) {
            team.budgetRemaining -= pickData.cost
          }

          // Mark Pokemon as drafted in wishlist
          Object.values(draft.wishlistItemsById).forEach(item => {
            if (item.pokemonId === pickData.pokemonId) {
              item.isAvailable = false
            }
          })
        })

        // 2. Server mutation would go here
        // This is a placeholder - actual implementation would call DraftService
        try {
          // const { data, error } = await supabase.from('picks').insert(...)
          // if (error) throw error

          // 3. Replace optimistic with real data (if needed)
          // For now, we'll assume the optimistic pick is correct

          // In production, you would:
          // set((draft) => {
          //   delete draft.picksById[tempId]
          //   draft.picksById[data.id] = data
          //   draft.pickIds = draft.pickIds.map(id => id === tempId ? data.id : id)
          //   // Update indexes...
          // })
        } catch (error) {
          // 4. Revert optimistic update on error
          set((draft) => {
            // Remove pick
            delete draft.picksById[tempId]
            draft.pickIds = draft.pickIds.filter(id => id !== tempId)

            // Remove from team picks index
            if (draft.picksByTeamId[teamId]) {
              draft.picksByTeamId[teamId] = draft.picksByTeamId[teamId].filter(id => id !== tempId)
            }

            // Restore team budget
            const team = draft.teamsById[teamId]
            if (team) {
              team.budgetRemaining += pickData.cost
            }

            // Restore wishlist availability
            Object.values(draft.wishlistItemsById).forEach(item => {
              if (item.pokemonId === pickData.pokemonId) {
                item.isAvailable = true
              }
            })
          })

          throw error
        }
      },

      // ============================================
      // PICK ACTIONS
      // ============================================
      addPick: (teamId, pick) => {
        set((state) => {
          if (!validateTeamExists(state.teamsById, teamId, 'addPick')) {
            return
          }

          // Add pick
          state.picksById[pick.id] = pick
          state.pickIds.push(pick.id)

          // Update team picks index
          if (!state.picksByTeamId[teamId]) {
            state.picksByTeamId[teamId] = []
          }
          state.picksByTeamId[teamId].push(pick.id)

          // Sort picks by pick order
          state.picksByTeamId[teamId].sort((a, b) => {
            const pickA = state.picksById[a]
            const pickB = state.picksById[b]
            return (pickA?.pickOrder || 0) - (pickB?.pickOrder || 0)
          })

          // Update team budget
          const team = state.teamsById[teamId]
          if (team) {
            team.budgetRemaining -= pick.cost
          }

          // Mark Pokemon as drafted in wishlist
          Object.values(state.wishlistItemsById).forEach(item => {
            if (item.pokemonId === pick.pokemonId) {
              item.isAvailable = false
            }
          })
        })
      },

      removePick: (pickId) => {
        set((state) => {
          const pick = state.picksById[pickId]
          if (!pick) return

          // Restore team budget
          const team = state.teamsById[pick.teamId]
          if (team) {
            team.budgetRemaining += pick.cost
          }

          // Remove from team picks index
          if (state.picksByTeamId[pick.teamId]) {
            state.picksByTeamId[pick.teamId] = state.picksByTeamId[pick.teamId].filter(
              id => id !== pickId
            )
          }

          // Restore wishlist availability
          Object.values(state.wishlistItemsById).forEach(item => {
            if (item.pokemonId === pick.pokemonId) {
              item.isAvailable = true
            }
          })

          // Remove pick
          delete state.picksById[pickId]
          state.pickIds = state.pickIds.filter(id => id !== pickId)
        })
      },

      updatePick: (pickId, updates) => {
        set((state) => {
          const pick = state.picksById[pickId]
          if (!pick) return

          state.picksById[pickId] = { ...pick, ...updates }
        })
      },

      // ============================================
      // TEAM ACTIONS
      // ============================================
      updateTeam: (teamId, updates) => {
        set((state) => {
          if (!validateTeamExists(state.teamsById, teamId, 'updateTeam')) {
            return
          }

          const team = state.teamsById[teamId]
          state.teamsById[teamId] = { ...team, ...updates }

          // Validate budget doesn't go negative
          if (updates.budgetRemaining !== undefined && updates.budgetRemaining < 0) {
            console.error('[updateTeam] Budget cannot be negative:', updates.budgetRemaining)
            state.teamsById[teamId].budgetRemaining = 0
          }
        })
      },

      updateTeamBudget: (teamId, budgetChange) => {
        set((state) => {
          if (!validateTeamExists(state.teamsById, teamId, 'updateTeamBudget')) {
            return
          }

          const team = state.teamsById[teamId]
          const newBudget = team.budgetRemaining + budgetChange

          if (newBudget < 0) {
            console.error('[updateTeamBudget] Budget cannot go negative:', newBudget)
            return
          }

          team.budgetRemaining = newBudget
        })
      },

      // ============================================
      // WISHLIST ACTIONS
      // ============================================
      addWishlistItem: (item) => {
        set((state) => {
          state.wishlistItemsById[item.id] = item
          state.wishlistItemIds.push(item.id)

          // Update index
          if (!state.wishlistItemsByParticipantId[item.participantId]) {
            state.wishlistItemsByParticipantId[item.participantId] = []
          }
          state.wishlistItemsByParticipantId[item.participantId].push(item.id)

          // Sort by priority
          state.wishlistItemsByParticipantId[item.participantId].sort((a, b) => {
            const itemA = state.wishlistItemsById[a]
            const itemB = state.wishlistItemsById[b]
            return (itemA?.priority || 0) - (itemB?.priority || 0)
          })
        })
      },

      removeWishlistItem: (itemId) => {
        set((state) => {
          const item = state.wishlistItemsById[itemId]
          if (!item) return

          // Remove from index
          if (state.wishlistItemsByParticipantId[item.participantId]) {
            state.wishlistItemsByParticipantId[item.participantId] =
              state.wishlistItemsByParticipantId[item.participantId].filter(id => id !== itemId)
          }

          // Remove item
          delete state.wishlistItemsById[itemId]
          state.wishlistItemIds = state.wishlistItemIds.filter(id => id !== itemId)
        })
      },

      updateWishlistItem: (itemId, updates) => {
        set((state) => {
          const item = state.wishlistItemsById[itemId]
          if (!item) return

          state.wishlistItemsById[itemId] = { ...item, ...updates }

          // Re-sort if priority changed
          if (updates.priority !== undefined && state.wishlistItemsByParticipantId[item.participantId]) {
            state.wishlistItemsByParticipantId[item.participantId].sort((a, b) => {
              const itemA = state.wishlistItemsById[a]
              const itemB = state.wishlistItemsById[b]
              return (itemA?.priority || 0) - (itemB?.priority || 0)
            })
          }
        })
      },

      reorderWishlist: (participantId, reorderedItems) => {
        set((state) => {
          // Update all items with new priorities
          reorderedItems.forEach((item, index) => {
            if (state.wishlistItemsById[item.id]) {
              state.wishlistItemsById[item.id] = { ...item, priority: index }
            }
          })

          // Update index
          state.wishlistItemsByParticipantId[participantId] = reorderedItems.map(item => item.id)
        })
      },

      markPokemonDrafted: (pokemonId) => {
        set((state) => {
          Object.values(state.wishlistItemsById).forEach(item => {
            if (item.pokemonId === pokemonId) {
              item.isAvailable = false
            }
          })
        })
      },

      // ============================================
      // AUCTION ACTIONS
      // ============================================
      addAuction: (auction) => {
        set((state) => {
          state.auctionsById[auction.id] = auction
          state.auctionIds.push(auction.id)

          if (auction.status === 'active') {
            state.currentAuction = auction
          }
        })
      },

      updateAuction: (auctionId, updates) => {
        set((state) => {
          const auction = state.auctionsById[auctionId]
          if (!auction) return

          state.auctionsById[auctionId] = { ...auction, ...updates }

          // Update current auction if it's the active one
          if (state.currentAuction?.id === auctionId) {
            state.currentAuction = state.auctionsById[auctionId]
          }
        })
      },

      removeAuction: (auctionId) => {
        set((state) => {
          delete state.auctionsById[auctionId]
          state.auctionIds = state.auctionIds.filter(id => id !== auctionId)

          if (state.currentAuction?.id === auctionId) {
            state.currentAuction = null
          }
        })
      },

      // ============================================
      // POKEMON ACTIONS
      // ============================================
      removePokemon: (pokemonId) => {
        set((state) => {
          state.availablePokemon = state.availablePokemon.filter(p => p.id !== pokemonId)
        })
      },

      // ============================================
      // UTILITY ACTIONS
      // ============================================
      setLoading: (isLoading) => {
        set((state) => {
          state.isLoading = isLoading
        })
      },

      setError: (error) => {
        set((state) => {
          state.error = error
        })
      },

      reset: () => set(initialState)
    }))
  )
)
