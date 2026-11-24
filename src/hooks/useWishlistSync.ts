import { useEffect, useRef, useMemo } from 'react'
import { useDraftStore } from '@/stores/draftStore'
import { selectUserWishlist } from '@/stores/selectors'
import { WishlistService } from '@/lib/wishlist-service'
import { supabase } from '@/lib/supabase'
import { WishlistItem } from '@/types'
import { RealtimeChannel } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'

const log = createLogger('UseWishlistSync')

// Stable empty array reference to prevent infinite re-renders
const EMPTY_WISHLIST: WishlistItem[] = []
const EMPTY_SELECTOR = () => EMPTY_WISHLIST

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
  // Memoize selector to prevent creating new function references on every render
  const wishlistSelector = useMemo(
    () => participantId ? selectUserWishlist(participantId) : EMPTY_SELECTOR,
    [participantId]
  )
  const userWishlist = useDraftStore(wishlistSelector)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const draftUuidRef = useRef<string | null>(null)

  // Helper function to get draft UUID from room code
  const getDraftUuid = async (roomCode: string): Promise<string | null> => {
    // Return cached UUID if available
    if (draftUuidRef.current) return draftUuidRef.current
    if (!supabase) return null

    const { data, error } = await supabase
      .from('drafts')
      .select('id')
      .eq('room_code', roomCode)
      .single()

    if (error) {
      log.error('Error loading draft UUID:', error)
      return null
    }

    if (!data) {
      return null
    }

    // Cache and return
    const uuid = (data as { id: string }).id
    draftUuidRef.current = uuid
    return uuid
  }

  // Initialize wishlist data
  useEffect(() => {
    if (!enabled || !draftId || !supabase) return

    const loadInitialWishlist = async () => {
      try {
        // Load all wishlist items for the draft
        if (!supabase) return

        // Resolve room code to UUID
        const draftUuid = await getDraftUuid(draftId)
        if (!draftUuid) {
          log.error('Draft not found for room code:', draftId)
          return
        }

        const { data, error } = await supabase
          .from('wishlist_items')
          .select('*')
          .eq('draft_id', draftUuid)
          .order('participant_id, priority')

        if (error) {
          log.error('Error loading initial wishlist:', error)
          return
        }

        const wishlistItems: WishlistItem[] = (data ?? []).map(item => ({
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
        }))

        setWishlistItems(wishlistItems)
      } catch (error) {
        log.error('Error loading initial wishlist:', error)
      }
    }

    loadInitialWishlist()
  }, [draftId, enabled, setWishlistItems])

  // Set up real-time subscription
  useEffect(() => {
    if (!enabled || !draftId || !supabase) return

    let cancelled = false
    let refetchTimer: ReturnType<typeof setTimeout> | null = null

    const refetchWishlist = async () => {
      try {
        // Refetch all wishlist items to ensure consistency
        if (!supabase || cancelled) return
        const uuid = draftUuidRef.current || await getDraftUuid(draftId)
        if (!uuid || cancelled) return
        const { data, error } = await supabase
          .from('wishlist_items')
          .select('*')
          .eq('draft_id', uuid)
          .order('participant_id, priority')

        if (error) {
          log.error('Error syncing wishlist:', error)
          return
        }
        if (cancelled) return

        const updatedItems: WishlistItem[] = (data ?? []).map(item => ({
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
        }))

        setWishlistItems(updatedItems)
      } catch (error) {
        log.error('Error handling wishlist change:', error)
      }
    }

    const setupSubscription = async () => {
      if (!supabase) return

      // Get the actual draft UUID
      const draftUuid = await getDraftUuid(draftId)
      if (!draftUuid || cancelled) return

      const channel = supabase
        // private: true — gated by realtime.messages RLS (migration 029):
        // only participants of this draft can subscribe to wishlist events.
        // Per-user wishlist privacy is still enforced at the
        // public.wishlist_items SELECT policy layer (sec-p1).
        // Topic must carry the draft UUID: the realtime.messages policy
        // authorises `wishlist_<uuid>`, not the room code.
        .channel(`wishlist_${draftUuid}`, { config: { private: true } })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'wishlist_items',
            filter: `draft_id=eq.${draftUuid}`
          },
          () => {
            // Trailing debounce: a burst of row changes ends in one refetch
            // that sees the final state.
            if (refetchTimer) clearTimeout(refetchTimer)
            refetchTimer = setTimeout(() => {
              refetchTimer = null
              void refetchWishlist()
            }, 150)
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'picks',
            // draftId is the room code; picks.draft_id is a uuid. A non-uuid
            // filter value makes Realtime reject the whole channel subscription.
            filter: `draft_id=eq.${draftUuid}`
          },
          async (payload) => {
            // When a Pokemon is picked, mark it as unavailable in all wishlists
            try {
              const pick = payload.new
              if (pick?.pokemon_id) {
                await WishlistService.markPokemonDrafted(draftId, pick.pokemon_id)
              }
            } catch (error) {
              log.error('Error handling pick:', error)
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            log.info(`Subscribed to wishlist changes for draft ${draftId}`)
          } else if (status === 'CHANNEL_ERROR') {
            // realtime-js rejoins errored channels itself; no manual retry.
            log.error(`Wishlist subscription error for draft ${draftId}`)
          }
        })

      channelRef.current = channel
    }

    setupSubscription()

    // Cleanup on unmount
    return () => {
      cancelled = true
      if (refetchTimer) clearTimeout(refetchTimer)
      if (channelRef.current) {
        // removeChannel (not just unsubscribe) so a remount does not get this
        // stale channel back from supabase.channel(topic).
        void supabase?.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [draftId, enabled, setWishlistItems])

  // Helper functions for common operations
  const addToWishlist = async (pokemon: import('@/types').Pokemon) => {
    if (!participantId) return null

    try {
      const result = await WishlistService.addToWishlist(
        draftId,
        participantId,
        pokemon
      )
      return result
    } catch (error) {
      log.error('Error adding to wishlist:', error)
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
      log.error('Error removing from wishlist:', error)
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
      log.error('Error reordering wishlist:', error)
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
      log.error('Error getting next auto-pick Pokemon:', error)
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