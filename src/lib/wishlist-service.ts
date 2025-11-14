import { supabase } from '@/lib/supabase'
import { WishlistItem, Pokemon } from '@/types'

export class WishlistService {
  /**
   * Helper method to resolve draft ID from room code if needed
   */
  private static async resolveDraftId(draftId: string): Promise<string> {
    if (!supabase) {
      throw new Error('Supabase not configured')
    }

    // If it looks like a UUID (contains hyphens), return as-is
    if (draftId.includes('-')) {
      return draftId
    }

    // Otherwise, look up the UUID by room code
    const { data: draftData, error: draftError } = await supabase
      .from('drafts')
      .select('id')
      .eq('room_code', draftId)
      .single()

    if (draftError) {
      throw new Error(`Draft lookup error: ${draftError.message}`)
    }

    if (!draftData) {
      throw new Error('Draft not found')
    }

    return (draftData as { id: string }).id
  }

  /**
   * Add a Pokemon to a participant's wishlist
   */
  static async addToWishlist(
    draftId: string,
    participantId: string,
    pokemon: Pokemon
  ): Promise<WishlistItem | null> {
    if (!supabase) {
      console.warn('Supabase not configured')
      return null
    }

    try {
      // Resolve draft ID from room code if needed
      const actualDraftId = await this.resolveDraftId(draftId)

      // Get current max priority for this participant
      const { data: existingItems } = await supabase
        .from('wishlist_items')
        .select('priority')
        .eq('draft_id', actualDraftId)
        .eq('participant_id', participantId)
        .order('priority', { ascending: false })
        .limit(1)

      const nextPriority = existingItems && existingItems.length > 0
        ? (existingItems[0] as any).priority + 1
        : 1

      const newItem = {
        draft_id: actualDraftId,
        participant_id: participantId,
        pokemon_id: pokemon.id,
        pokemon_name: pokemon.name,
        priority: nextPriority,
        is_available: true,
        cost: pokemon.cost
      }

      const { data, error } = await supabase
        .from('wishlist_items')
        .insert(newItem as any)
        .select()
        .single()

      if (error) {
        console.error('Error adding to wishlist:', error)
        return null
      }

      return {
        id: (data as any).id,
        draftId: (data as any).draft_id,
        participantId: (data as any).participant_id,
        pokemonId: (data as any).pokemon_id,
        pokemonName: (data as any).pokemon_name,
        priority: (data as any).priority,
        isAvailable: (data as any).is_available,
        cost: (data as any).cost,
        createdAt: (data as any).created_at,
        updatedAt: (data as any).updated_at
      }
    } catch (error) {
      console.error('Error adding to wishlist:', error)
      return null
    }
  }

  /**
   * Remove a Pokemon from a participant's wishlist
   */
  static async removeFromWishlist(
    draftId: string,
    participantId: string,
    pokemonId: string
  ): Promise<boolean> {
    if (!supabase) {
      console.warn('Supabase not configured')
      return false
    }

    try {
      // Resolve draft ID from room code if needed
      const actualDraftId = await this.resolveDraftId(draftId)

      const { error } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('draft_id', actualDraftId)
        .eq('participant_id', participantId)
        .eq('pokemon_id', pokemonId)

      if (error) {
        console.error('Error removing from wishlist:', error)
        return false
      }

      // Reorder remaining items to close gaps
      await this.reorderWishlist(actualDraftId, participantId)

      return true
    } catch (error) {
      console.error('Error removing from wishlist:', error)
      return false
    }
  }

  /**
   * Reorder a participant's wishlist items
   */
  static async updateWishlistOrder(
    draftId: string,
    participantId: string,
    reorderedItems: WishlistItem[]
  ): Promise<boolean> {
    if (!supabase) {
      console.warn('Supabase not configured')
      return false
    }

    try {
      // Update each item with its new priority
      const updates = reorderedItems.map((item, index) => ({
        id: item.id,
        priority: index + 1,
        updated_at: new Date().toISOString()
      }))

      const { error } = await supabase
        .from('wishlist_items')
        .upsert(updates as any, { onConflict: 'id' })

      if (error) {
        console.error('Error updating wishlist order:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error updating wishlist order:', error)
      return false
    }
  }

  /**
   * Get a participant's wishlist
   */
  static async getWishlist(
    draftId: string,
    participantId: string
  ): Promise<WishlistItem[]> {
    if (!supabase) {
      console.warn('Supabase not configured')
      return []
    }

    try {
      // Resolve draft ID from room code if needed
      const actualDraftId = await this.resolveDraftId(draftId)

      const { data, error } = await supabase
        .from('wishlist_items')
        .select('*')
        .eq('draft_id', actualDraftId)
        .eq('participant_id', participantId)
        .order('priority', { ascending: true })

      if (error) {
        console.error('Error getting wishlist:', error)
        return []
      }

      return data.map(item => ({
        id: (item as any).id,
        draftId: (item as any).draft_id,
        participantId: (item as any).participant_id,
        pokemonId: (item as any).pokemon_id,
        pokemonName: (item as any).pokemon_name,
        priority: (item as any).priority,
        isAvailable: (item as any).is_available,
        cost: (item as any).cost,
        createdAt: (item as any).created_at,
        updatedAt: (item as any).updated_at
      }))
    } catch (error) {
      console.error('Error getting wishlist:', error)
      return []
    }
  }

  /**
   * Mark Pokemon as unavailable when they are drafted
   */
  static async markPokemonDrafted(
    draftId: string,
    pokemonId: string
  ): Promise<boolean> {
    if (!supabase) {
      console.warn('Supabase not configured')
      return false
    }

    try {
      // Resolve draft ID from room code if needed
      const actualDraftId = await this.resolveDraftId(draftId)

      const updateData = {
        is_available: false,
        updated_at: new Date().toISOString()
      }

      const { error } = await (supabase as any)
        .from('wishlist_items')
        .update(updateData)
        .eq('draft_id', actualDraftId)
        .eq('pokemon_id', pokemonId)

      if (error) {
        console.error('Error marking Pokemon as drafted:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error marking Pokemon as drafted:', error)
      return false
    }
  }

  /**
   * Get the next available Pokemon for auto-pick
   */
  static async getNextAutoPickPokemon(
    draftId: string,
    participantId: string
  ): Promise<WishlistItem | null> {
    if (!supabase) {
      console.warn('Supabase not configured')
      return null
    }

    try {
      // Resolve draft ID from room code if needed
      const actualDraftId = await this.resolveDraftId(draftId)

      const { data, error } = await supabase
        .from('wishlist_items')
        .select('*')
        .eq('draft_id', actualDraftId)
        .eq('participant_id', participantId)
        .eq('is_available', true)
        .order('priority', { ascending: true })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error getting next auto-pick Pokemon:', error)
        return null
      }

      if (!data) return null

      return {
        id: (data as any).id,
        draftId: (data as any).draft_id,
        participantId: (data as any).participant_id,
        pokemonId: (data as any).pokemon_id,
        pokemonName: (data as any).pokemon_name,
        priority: (data as any).priority,
        isAvailable: (data as any).is_available,
        cost: (data as any).cost,
        createdAt: (data as any).created_at,
        updatedAt: (data as any).updated_at
      }
    } catch (error) {
      console.error('Error getting next auto-pick Pokemon:', error)
      return null
    }
  }

  /**
   * Subscribe to wishlist changes for real-time updates
   */
  static subscribeToWishlistChanges(
    draftId: string,
    callback: (items: WishlistItem[]) => void
  ) {
    if (!supabase) {
      console.warn('Supabase not configured')
      return null
    }

    return supabase
      .channel(`wishlist_${draftId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wishlist_items',
          filter: `draft_id=eq.${draftId}`
        },
        () => {
          // Refetch all wishlist items for this draft
          this.getAllWishlistItems(draftId).then(callback)
        }
      )
      .subscribe()
  }

  /**
   * Get all wishlist items for a draft (for real-time updates)
   */
  private static async getAllWishlistItems(draftId: string): Promise<WishlistItem[]> {
    if (!supabase) return []

    try {
      // Resolve draft ID from room code if needed
      const actualDraftId = await this.resolveDraftId(draftId)

      const { data, error } = await (supabase as any)
        .from('wishlist_items')
        .select('*')
        .eq('draft_id', actualDraftId)
        .order('participant_id, priority')

      if (error) {
        console.error('Error getting all wishlist items:', error)
        return []
      }

      return (data || []).map((item: any) => ({
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
    } catch (error) {
      console.error('Error getting all wishlist items:', error)
      return []
    }
  }

  /**
   * Helper to reorder wishlist items after removal
   */
  private static async reorderWishlist(
    draftId: string,
    participantId: string
  ): Promise<void> {
    if (!supabase) return

    try {
      // Resolve draft ID from room code if needed
      const actualDraftId = await this.resolveDraftId(draftId)

      const { data, error } = await (supabase as any)
        .from('wishlist_items')
        .select('*')
        .eq('draft_id', actualDraftId)
        .eq('participant_id', participantId)
        .order('priority', { ascending: true })

      if (error || !data) return

      // Update priorities to be sequential
      const updates = (data || []).map((item: any, index: number) => ({
        id: item.id,
        priority: index + 1,
        updated_at: new Date().toISOString()
      }))

      await (supabase as any)
        .from('wishlist_items')
        .upsert(updates, { onConflict: 'id' })
    } catch (error) {
      console.error('Error reordering wishlist:', error)
    }
  }
}