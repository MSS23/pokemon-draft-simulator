import { useEffect, useRef } from 'react'
import { useDraftStore } from '@/stores/draftStore'
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
  const { setWishlistItems, wishlistItems } = useDraftStore()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSyncRef = useRef<number>(0)

  // Initialize wishlist data
  useEffect(() => {
    if (!enabled || !draftId || !supabase) return

    const loadInitialWishlist = async () => {
      try {
        // Load all wishlist items for the draft
        if (!supabase) return
        const { data, error } = await supabase
          .from('wishlist_items')
          .select('*')
          .eq('draft_id', draftId)
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

    const setupSubscription = () => {
      // Clean up existing channel
      if (channelRef.current) {
        channelRef.current.unsubscribe()
      }

      if (!supabase) return
      const channel = supabase
        .channel(`wishlist_${draftId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'wishlist_items',
            filter: `draft_id=eq.${draftId}`
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

  // Get user's wishlist items
  const userWishlist = participantId
    ? wishlistItems
        .filter(item => item.participantId === participantId)
        .sort((a, b) => a.priority - b.priority)
    : []

  // Check if a Pokemon is in user's wishlist
  const isInWishlist = (pokemonId: string) => {
    return participantId
      ? wishlistItems.some(
          item => item.participantId === participantId && item.pokemonId === pokemonId
        )
      : false
  }

  // Get wishlist Pokemon IDs (for grid display)
  const wishlistPokemonIds = participantId
    ? wishlistItems
        .filter(item => item.participantId === participantId)
        .map(item => item.pokemonId)
    : []

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