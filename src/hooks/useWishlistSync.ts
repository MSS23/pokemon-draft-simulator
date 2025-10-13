import { useEffect, useRef } from 'react'
import { useDraftStore } from '@/stores/draftStore'
import { selectUserWishlist } from '@/stores/selectors'
import { WishlistService } from '@/lib/wishlist-service'
import { supabase } from '@/lib/supabase'
import { WishlistItem } from '@/types'
import { RealtimeChannel } from '@supabase/supabase-js'

interface UseWishlistSyncOptions {
  draftId: string
  participantId?: string
  enabled?: boolean
}

export function useWishlistSync({
  draftId,
  participantId,
  enabled = true
}: UseWishlistSyncOptions) {
  const setWishlistItems = useDraftStore(state => state.setWishlistItems)
  const wishlistItemsById = useDraftStore(state => state.wishlistItemsById)
  const wishlistItemsByParticipantId = useDraftStore(state => state.wishlistItemsByParticipantId)
  const userWishlist = useDraftStore(participantId ? selectUserWishlist(participantId) : () => [])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSyncRef = useRef<number>(0)

  // Helper function to get draft UUID from room code
  const getDraftUuid = async (roomCode: string): Promise<string | null> => {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('drafts')
      .select('id')
      .eq('room_code', roomCode)
      .single()

    if (error) {
      console.error('Error loading draft UUID:', error)
      return null
    }

    if (!data) {
      return null
    }

    // Type assertion needed due to Supabase type inference limitations
    return (data as { id: string }).id
  }

  // Initialize wishlist data
  useEffect(() => {
    if (!enabled || !draftId || !supabase) return

    const loadInitialWishlist = async () => {
      try {
        // Load all wishlist items for the draft
        if (!supabase) return
        
        // First get the actual draft UUID from room code
        const { data: draftData, error: draftError } = await supabase
          .from('drafts')
          .select('id')
          .eq('room_code', draftId)
          .single()

        if (draftError) {
          console.error('Error loading draft:', draftError)
          return
        }

        if (!draftData) {
          console.error('Draft not found')
          return
        }

        const { data, error } = await supabase
          .from('wishlist_items')
          .select('*')
          .eq('draft_id', (draftData as { id: string }).id)
          .order('participant_id, priority')

        if (error) {
          console.error('Error loading initial wishlist:', error)
          return
        }

        const wishlistItems: WishlistItem[] = (data as any[])?.map(item => ({
          id: item.id,
          draftId: item.draft_id,
          participantId: item.participant_id,
          pokemonId: item.pokemon_id,
          pokemonName: item.pokemon_name,
          priority: item.priority,
          isAvailable: item.is_available,
          cost: item.cost,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        })) || []

        setWishlistItems(wishlistItems)
        lastSyncRef.current = Date.now()
      } catch (error) {
        console.error('Error loading initial wishlist:', error)
      }
    }

    loadInitialWishlist()
  }, [draftId, enabled, setWishlistItems])

  // Set up real-time subscription
  useEffect(() => {
    if (!enabled || !draftId || !supabase) return

    const setupSubscription = async () => {
      // Clean up existing channel
      if (channelRef.current) {
        channelRef.current.unsubscribe()
      }

      if (!supabase) return
      
      // Get the actual draft UUID
      const draftUuid = await getDraftUuid(draftId)
      if (!draftUuid) return
      
      const channel = supabase
        .channel(`wishlist_${draftId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'wishlist_items',
            filter: `draft_id=eq.${draftUuid}`
          },
          async (payload) => {
            // Debounce rapid changes
            const now = Date.now()
            if (now - lastSyncRef.current < 100) return
            lastSyncRef.current = now

            try {
              // Refetch all wishlist items to ensure consistency
              if (!supabase) return
              const { data, error } = await supabase
                .from('wishlist_items')
                .select('*')
                .eq('draft_id', draftId)
                .order('participant_id, priority')

              if (error) {
                console.error('Error syncing wishlist:', error)
                return
              }

              const updatedItems: WishlistItem[] = (data as any[])?.map(item => ({
                id: item.id,
                draftId: item.draft_id,
                participantId: item.participant_id,
                pokemonId: item.pokemon_id,
                pokemonName: item.pokemon_name,
                priority: item.priority,
                isAvailable: item.is_available,
                cost: item.cost,
                createdAt: item.created_at,
                updatedAt: item.updated_at
              })) || []

              setWishlistItems(updatedItems)
            } catch (error) {
              console.error('Error handling wishlist change:', error)
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'picks',
            filter: `draft_id=eq.${draftId}`
          },
          async (payload) => {
            // When a Pokemon is picked, mark it as unavailable in all wishlists
            try {
              const pick = payload.new
              if (pick?.pokemon_id) {
                await WishlistService.markPokemonDrafted(draftId, pick.pokemon_id)
              }
            } catch (error) {
              console.error('Error handling pick:', error)
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`Subscribed to wishlist changes for draft ${draftId}`)
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`Wishlist subscription error for draft ${draftId}`)
            // Retry subscription after delay
            setTimeout(setupSubscription, 2000)
          }
        })

      channelRef.current = channel
    }

    setupSubscription()

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [draftId, enabled, setWishlistItems])

  // Helper functions for common operations
  const addToWishlist = async (pokemon: any) => {
    if (!participantId) return null

    try {
      const result = await WishlistService.addToWishlist(
        draftId,
        participantId,
        pokemon
      )
      return result
    } catch (error) {
      console.error('Error adding to wishlist:', error)
      return null
    }
  }

  const removeFromWishlist = async (pokemonId: string) => {
    if (!participantId) return false

    try {
      const result = await WishlistService.removeFromWishlist(
        draftId,
        participantId,
        pokemonId
      )
      return result
    } catch (error) {
      console.error('Error removing from wishlist:', error)
      return false
    }
  }

  const reorderWishlist = async (reorderedItems: WishlistItem[]) => {
    if (!participantId) return false

    try {
      const result = await WishlistService.updateWishlistOrder(
        draftId,
        participantId,
        reorderedItems
      )
      return result
    } catch (error) {
      console.error('Error reordering wishlist:', error)
      return false
    }
  }

  const getNextAutoPickPokemon = async () => {
    if (!participantId) return null

    try {
      const result = await WishlistService.getNextAutoPickPokemon(
        draftId,
        participantId
      )
      return result
    } catch (error) {
      console.error('Error getting next auto-pick Pokemon:', error)
      return null
    }
  }

  // Check if a Pokemon is in user's wishlist
  const isInWishlist = (pokemonId: string) => {
    if (!participantId) return false
    const itemIds = wishlistItemsByParticipantId[participantId] || []
    return itemIds.some(itemId => {
      const item = wishlistItemsById[itemId]
      return item && item.pokemonId === pokemonId
    })
  }

  // Get wishlist Pokemon IDs (for grid display)
  const wishlistPokemonIds = userWishlist.map(item => item.pokemonId)

  // Get all wishlist items
  const wishlistItems = Object.values(wishlistItemsById)

  return {
    wishlistItems,
    userWishlist,
    wishlistPokemonIds,
    isInWishlist,
    addToWishlist,
    removeFromWishlist,
    reorderWishlist,
    getNextAutoPickPokemon,
    isConnected: channelRef.current?.state === 'joined'
  }
}