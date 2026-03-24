import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
  },
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { WishlistService } from '@/lib/wishlist-service'
import { supabase } from '@/lib/supabase'

const mockSupabase = supabase as never as {
  from: ReturnType<typeof vi.fn>
  channel: ReturnType<typeof vi.fn>
}

describe('WishlistService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // addToWishlist
  // =========================================================================
  describe('addToWishlist', () => {
    it('should return null when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await WishlistService.addToWishlist(
        'draft-uuid-1',
        'participant-1',
        { id: 'poke-25', name: 'Pikachu', cost: 5 } as never
      )

      expect(result).toBeNull()

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should add pokemon with correct priority (next after existing)', async () => {
      // First call: get existing priority
      const mockPriorityLimit = vi.fn().mockResolvedValue({
        data: [{ priority: 3 }],
        error: null,
      })
      const mockPriorityOrder = vi.fn().mockReturnValue({ limit: mockPriorityLimit })
      const mockPriorityEq2 = vi.fn().mockReturnValue({ order: mockPriorityOrder })
      const mockPriorityEq1 = vi.fn().mockReturnValue({ eq: mockPriorityEq2 })
      const mockPrioritySelect = vi.fn().mockReturnValue({ eq: mockPriorityEq1 })

      // Second call: insert new item
      const insertedData = {
        id: 'wishlist-item-1',
        draft_id: 'draft-uuid-1',
        participant_id: 'participant-1',
        pokemon_id: 'poke-25',
        pokemon_name: 'Pikachu',
        priority: 4,
        is_available: true,
        cost: 5,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }
      const mockInsertSingle = vi.fn().mockResolvedValue({ data: insertedData, error: null })
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockInsertSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect })

      let fromCallCount = 0
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++
        if (fromCallCount === 1) {
          return { select: mockPrioritySelect }
        }
        return { insert: mockInsert }
      })

      const result = await WishlistService.addToWishlist(
        'draft-uuid-1',
        'participant-1',
        { id: 'poke-25', name: 'Pikachu', cost: 5 } as never
      )

      expect(result).not.toBeNull()
      expect(result!.pokemonId).toBe('poke-25')
      expect(result!.pokemonName).toBe('Pikachu')
      expect(result!.priority).toBe(4)
      expect(result!.isAvailable).toBe(true)
    })

    it('should set priority to 1 when wishlist is empty', async () => {
      // First call: no existing items
      const mockPriorityLimit = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      })
      const mockPriorityOrder = vi.fn().mockReturnValue({ limit: mockPriorityLimit })
      const mockPriorityEq2 = vi.fn().mockReturnValue({ order: mockPriorityOrder })
      const mockPriorityEq1 = vi.fn().mockReturnValue({ eq: mockPriorityEq2 })
      const mockPrioritySelect = vi.fn().mockReturnValue({ eq: mockPriorityEq1 })

      // Second call: insert
      const insertedData = {
        id: 'wishlist-item-1',
        draft_id: 'draft-uuid-1',
        participant_id: 'participant-1',
        pokemon_id: 'poke-1',
        pokemon_name: 'Bulbasaur',
        priority: 1,
        is_available: true,
        cost: 3,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }
      const mockInsertSingle = vi.fn().mockResolvedValue({ data: insertedData, error: null })
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockInsertSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect })

      let fromCallCount = 0
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++
        if (fromCallCount === 1) {
          return { select: mockPrioritySelect }
        }
        return { insert: mockInsert }
      })

      const result = await WishlistService.addToWishlist(
        'draft-uuid-1',
        'participant-1',
        { id: 'poke-1', name: 'Bulbasaur', cost: 3 } as never
      )

      expect(result).not.toBeNull()
      expect(result!.priority).toBe(1)
    })

    it('should return null when insert fails', async () => {
      // Priority fetch
      const mockPriorityLimit = vi.fn().mockResolvedValue({ data: [], error: null })
      const mockPriorityOrder = vi.fn().mockReturnValue({ limit: mockPriorityLimit })
      const mockPriorityEq2 = vi.fn().mockReturnValue({ order: mockPriorityOrder })
      const mockPriorityEq1 = vi.fn().mockReturnValue({ eq: mockPriorityEq2 })
      const mockPrioritySelect = vi.fn().mockReturnValue({ eq: mockPriorityEq1 })

      // Insert fails
      const mockInsertSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Duplicate entry' },
      })
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockInsertSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect })

      let fromCallCount = 0
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++
        if (fromCallCount === 1) {
          return { select: mockPrioritySelect }
        }
        return { insert: mockInsert }
      })

      const result = await WishlistService.addToWishlist(
        'draft-uuid-1',
        'participant-1',
        { id: 'poke-25', name: 'Pikachu', cost: 5 } as never
      )

      expect(result).toBeNull()
    })

    it('should resolve draft ID from room code when no hyphens', async () => {
      // First: room code resolution
      const mockRoomSingle = vi.fn().mockResolvedValue({
        data: { id: 'draft-uuid-resolved' },
        error: null,
      })
      const mockRoomEq = vi.fn().mockReturnValue({ single: mockRoomSingle })
      const mockRoomSelect = vi.fn().mockReturnValue({ eq: mockRoomEq })

      // Second: priority fetch
      const mockPriorityLimit = vi.fn().mockResolvedValue({ data: [], error: null })
      const mockPriorityOrder = vi.fn().mockReturnValue({ limit: mockPriorityLimit })
      const mockPriorityEq2 = vi.fn().mockReturnValue({ order: mockPriorityOrder })
      const mockPriorityEq1 = vi.fn().mockReturnValue({ eq: mockPriorityEq2 })
      const mockPrioritySelect = vi.fn().mockReturnValue({ eq: mockPriorityEq1 })

      // Third: insert
      const insertedData = {
        id: 'wl-1',
        draft_id: 'draft-uuid-resolved',
        participant_id: 'p-1',
        pokemon_id: 'poke-1',
        pokemon_name: 'Bulbasaur',
        priority: 1,
        is_available: true,
        cost: 3,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }
      const mockInsertSingle = vi.fn().mockResolvedValue({ data: insertedData, error: null })
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockInsertSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect })

      let fromCallCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        fromCallCount++
        if (table === 'drafts') {
          return { select: mockRoomSelect }
        }
        if (fromCallCount <= 2) {
          return { select: mockPrioritySelect }
        }
        return { insert: mockInsert }
      })

      const result = await WishlistService.addToWishlist(
        'ABCDEF', // room code, no hyphens
        'p-1',
        { id: 'poke-1', name: 'Bulbasaur', cost: 3 } as never
      )

      expect(result).not.toBeNull()
      expect(result!.draftId).toBe('draft-uuid-resolved')
    })
  })

  // =========================================================================
  // removeFromWishlist
  // =========================================================================
  describe('removeFromWishlist', () => {
    it('should return false when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await WishlistService.removeFromWishlist(
        'draft-uuid-1', 'participant-1', 'poke-25'
      )

      expect(result).toBe(false)

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should delete item and reorder remaining wishlist', async () => {
      // Delete call
      const mockDeleteEq3 = vi.fn().mockResolvedValue({ error: null })
      const mockDeleteEq2 = vi.fn().mockReturnValue({ eq: mockDeleteEq3 })
      const mockDeleteEq1 = vi.fn().mockReturnValue({ eq: mockDeleteEq2 })
      const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq1 })

      // Reorder: fetch remaining items
      const remainingItems = [
        {
          id: 'wl-2', draft_id: 'draft-uuid-1', participant_id: 'p-1',
          pokemon_id: 'poke-4', pokemon_name: 'Charmander', cost: 4,
          priority: 3, is_available: true, created_at: '', updated_at: '',
        },
      ]
      const mockReorderOrder = vi.fn().mockResolvedValue({ data: remainingItems, error: null })
      const mockReorderEq2 = vi.fn().mockReturnValue({ order: mockReorderOrder })
      const mockReorderEq1 = vi.fn().mockReturnValue({ eq: mockReorderEq2 })
      const mockReorderSelect = vi.fn().mockReturnValue({ eq: mockReorderEq1 })

      // Reorder: upsert
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })

      let fromCallCount = 0
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++
        if (fromCallCount === 1) {
          return { delete: mockDelete }
        }
        if (fromCallCount === 2) {
          return { select: mockReorderSelect }
        }
        return { upsert: mockUpsert }
      })

      const result = await WishlistService.removeFromWishlist(
        'draft-uuid-1', 'p-1', 'poke-25'
      )

      expect(result).toBe(true)
      expect(mockDelete).toHaveBeenCalled()
    })

    it('should return false when delete fails', async () => {
      const mockDeleteEq3 = vi.fn().mockResolvedValue({
        error: { message: 'Delete failed' },
      })
      const mockDeleteEq2 = vi.fn().mockReturnValue({ eq: mockDeleteEq3 })
      const mockDeleteEq1 = vi.fn().mockReturnValue({ eq: mockDeleteEq2 })
      const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq1 })
      mockSupabase.from.mockReturnValue({ delete: mockDelete })

      const result = await WishlistService.removeFromWishlist(
        'draft-uuid-1', 'p-1', 'poke-25'
      )

      expect(result).toBe(false)
    })
  })

  // =========================================================================
  // updateWishlistOrder
  // =========================================================================
  describe('updateWishlistOrder', () => {
    it('should return false when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await WishlistService.updateWishlistOrder(
        'draft-uuid-1', 'p-1', []
      )

      expect(result).toBe(false)

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should upsert items with sequential priorities', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({ upsert: mockUpsert })

      const items = [
        { id: 'wl-3', pokemonId: 'poke-7', pokemonName: 'Squirtle', cost: 4, draftId: 'draft-uuid-1', participantId: 'p-1', priority: 5, isAvailable: true, createdAt: '', updatedAt: '' },
        { id: 'wl-1', pokemonId: 'poke-1', pokemonName: 'Bulbasaur', cost: 3, draftId: 'draft-uuid-1', participantId: 'p-1', priority: 1, isAvailable: true, createdAt: '', updatedAt: '' },
      ]

      const result = await WishlistService.updateWishlistOrder(
        'draft-uuid-1', 'p-1', items as never
      )

      expect(result).toBe(true)
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'wl-3', priority: 1 }),
          expect.objectContaining({ id: 'wl-1', priority: 2 }),
        ]),
        { onConflict: 'id' }
      )
    })

    it('should return false when upsert fails', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({
        error: { message: 'Upsert failed' },
      })
      mockSupabase.from.mockReturnValue({ upsert: mockUpsert })

      const result = await WishlistService.updateWishlistOrder(
        'draft-uuid-1', 'p-1', [
          { id: 'wl-1', pokemonId: 'poke-1', pokemonName: 'Bulbasaur', cost: 3, draftId: 'draft-uuid-1', participantId: 'p-1', priority: 1, isAvailable: true, createdAt: '', updatedAt: '' },
        ] as never
      )

      expect(result).toBe(false)
    })
  })

  // =========================================================================
  // getWishlist
  // =========================================================================
  describe('getWishlist', () => {
    it('should return empty array when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await WishlistService.getWishlist('draft-uuid-1', 'p-1')
      expect(result).toEqual([])

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should return wishlist items sorted by priority', async () => {
      const wishlistData = [
        {
          id: 'wl-1', draft_id: 'draft-uuid-1', participant_id: 'p-1',
          pokemon_id: 'poke-1', pokemon_name: 'Bulbasaur', priority: 1,
          is_available: true, cost: 3, created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'wl-2', draft_id: 'draft-uuid-1', participant_id: 'p-1',
          pokemon_id: 'poke-25', pokemon_name: 'Pikachu', priority: 2,
          is_available: true, cost: 5, created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ]

      const mockOrder = vi.fn().mockResolvedValue({ data: wishlistData, error: null })
      const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await WishlistService.getWishlist('draft-uuid-1', 'p-1')

      expect(result).toHaveLength(2)
      expect(result[0].pokemonName).toBe('Bulbasaur')
      expect(result[0].priority).toBe(1)
      expect(result[1].pokemonName).toBe('Pikachu')
      expect(result[1].priority).toBe(2)
      // Verify camelCase mapping
      expect(result[0].pokemonId).toBe('poke-1')
      expect(result[0].isAvailable).toBe(true)
    })

    it('should return empty array when query fails', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Query failed' },
      })
      const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await WishlistService.getWishlist('draft-uuid-1', 'p-1')
      expect(result).toEqual([])
    })
  })

  // =========================================================================
  // getNextAutoPickPokemon
  // =========================================================================
  describe('getNextAutoPickPokemon', () => {
    it('should return null when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await WishlistService.getNextAutoPickPokemon('draft-uuid-1', 'p-1')
      expect(result).toBeNull()

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should return the highest-priority available pokemon', async () => {
      const topPick = {
        id: 'wl-1',
        draft_id: 'draft-uuid-1',
        participant_id: 'p-1',
        pokemon_id: 'poke-1',
        pokemon_name: 'Bulbasaur',
        priority: 1,
        is_available: true,
        cost: 3,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }

      const mockSingle = vi.fn().mockResolvedValue({ data: topPick, error: null })
      const mockLimit = vi.fn().mockReturnValue({ single: mockSingle })
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockEq3 = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 })
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await WishlistService.getNextAutoPickPokemon('draft-uuid-1', 'p-1')

      expect(result).not.toBeNull()
      expect(result!.pokemonName).toBe('Bulbasaur')
      expect(result!.priority).toBe(1)
      expect(result!.isAvailable).toBe(true)
    })

    it('should return null when no available pokemon in wishlist', async () => {
      // PGRST116 = no rows returned
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' },
      })
      const mockLimit = vi.fn().mockReturnValue({ single: mockSingle })
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockEq3 = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 })
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await WishlistService.getNextAutoPickPokemon('draft-uuid-1', 'p-1')

      expect(result).toBeNull()
    })
  })

  // =========================================================================
  // markPokemonDrafted
  // =========================================================================
  describe('markPokemonDrafted', () => {
    it('should return false when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await WishlistService.markPokemonDrafted('draft-uuid-1', 'poke-25')
      expect(result).toBe(false)

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should mark pokemon as unavailable', async () => {
      const mockEq2 = vi.fn().mockResolvedValue({ error: null })
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
      mockSupabase.from.mockReturnValue({ update: mockUpdate })

      const result = await WishlistService.markPokemonDrafted('draft-uuid-1', 'poke-25')

      expect(result).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ is_available: false })
      )
    })

    it('should return false when update fails', async () => {
      const mockEq2 = vi.fn().mockResolvedValue({
        error: { message: 'Update failed' },
      })
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
      mockSupabase.from.mockReturnValue({ update: mockUpdate })

      const result = await WishlistService.markPokemonDrafted('draft-uuid-1', 'poke-25')
      expect(result).toBe(false)
    })
  })

  // =========================================================================
  // subscribeToWishlistChanges
  // =========================================================================
  describe('subscribeToWishlistChanges', () => {
    it('should return null when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = WishlistService.subscribeToWishlistChanges('draft-1', vi.fn())
      expect(result).toBeNull()

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should create a channel subscription', () => {
      const mockSubscribe = vi.fn().mockReturnValue('subscription')
      const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe })
      mockSupabase.channel.mockReturnValue({ on: mockOn })

      const callback = vi.fn()
      const result = WishlistService.subscribeToWishlistChanges('draft-uuid-1', callback)

      expect(mockSupabase.channel).toHaveBeenCalledWith('wishlist_draft-uuid-1')
      expect(mockOn).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'wishlist_items',
          filter: 'draft_id=eq.draft-uuid-1',
        }),
        expect.any(Function)
      )
      expect(result).toBe('subscription')
    })
  })
})
