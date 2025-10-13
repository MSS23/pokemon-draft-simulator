import { supabase } from './supabase'
import { DraftService } from './draft-service'
import { DraftError, DraftErrorCode, DraftErrors } from './draft-errors'
import { generateSnakeDraftOrder, getCurrentPick } from '@/utils/draft'

export interface AutoSkipResult {
  skipped: boolean
  autoPickMade: boolean
  pokemonId?: string
  pokemonName?: string
  reason: string
}

/**
 * Auto-Skip Service
 * Handles automatic turn advancement when timer expires
 *
 * Features:
 * - Checks wishlist for auto-pick fallback
 * - Validates budget and legality before auto-pick
 * - Skips turn if no valid wishlist picks available
 * - Logs skip events for draft history
 */
export class AutoSkipService {
  /**
   * Handle timer expiration for current turn
   * 1. Get current team and check wishlist
   * 2. Try to make auto-pick from wishlist
   * 3. If no valid picks, skip turn
   * 4. Advance to next turn
   */
  static async handleTimeExpired(
    draftId: string,
    teamId: string
  ): Promise<AutoSkipResult> {
    if (!supabase) {
      throw DraftErrors.supabaseNotAvailable()
    }

    // Get draft state
    const draftState = await DraftService.getDraftState(draftId)
    if (!draftState) {
      throw DraftErrors.draftNotFound(draftId)
    }

    // Verify draft is active
    if (draftState.draft.status !== 'active') {
      throw DraftErrors.draftNotActive(draftId, draftState.draft.status)
    }

    // Get team info
    const team = draftState.teams.find(t => t.id === teamId)
    if (!team) {
      throw new DraftError(
        'Team not found',
        DraftErrorCode.TEAM_NOT_FOUND,
        { teamId, draftId }
      )
    }

    console.log(`[AutoSkip] Timer expired for team ${team.name} in draft ${draftId}`)

    // Try to get wishlist items for this team
    try {
      const autoPickResult = await this.tryAutoPickFromWishlist(
        draftId,
        teamId,
        team,
        draftState
      )

      if (autoPickResult.success) {
        console.log(`[AutoSkip] Auto-picked ${autoPickResult.pokemonName} from wishlist`)

        // Advance turn (this happens automatically in makePick, but we log it)
        return {
          skipped: false,
          autoPickMade: true,
          pokemonId: autoPickResult.pokemonId,
          pokemonName: autoPickResult.pokemonName,
          reason: 'Auto-picked from wishlist due to timer expiration'
        }
      }
    } catch (error) {
      console.error('[AutoSkip] Failed to auto-pick from wishlist:', error)
    }

    // No valid wishlist picks - skip turn
    console.log(`[AutoSkip] No valid wishlist picks for ${team.name}, skipping turn`)

    // Advance turn without making a pick
    await DraftService.advanceTurn(draftId)

    // Log skip event
    await this.logSkipEvent(draftId, teamId, team.name)

    return {
      skipped: true,
      autoPickMade: false,
      reason: `${team.name}'s turn was skipped due to inactivity (no valid wishlist picks)`
    }
  }

  /**
   * Try to auto-pick from wishlist
   * Returns the first affordable, legal, available Pokemon from wishlist
   */
  private static async tryAutoPickFromWishlist(
    draftId: string,
    teamId: string,
    team: any,
    draftState: any
  ): Promise<{ success: boolean; pokemonId?: string; pokemonName?: string; cost?: number }> {
    // Get wishlist items for this team's participant
    const participant = draftState.participants.find(
      (p: any) => p.team_id === teamId
    )

    if (!participant) {
      return { success: false }
    }

    const { data: wishlistItems, error: wishlistError } = await supabase
      .from('wishlist_items')
      .select('*')
      .eq('draft_id', draftId)
      .eq('participant_id', participant.id)
      .eq('is_available', true)
      .order('priority', { ascending: true })

    if (wishlistError || !wishlistItems || wishlistItems.length === 0) {
      console.log('[AutoSkip] No wishlist items available')
      return { success: false }
    }

    // Get all already picked Pokemon IDs
    const pickedPokemonIds = new Set(draftState.picks.map((p: any) => p.pokemon_id))

    // Try each wishlist item in priority order
    for (const item of wishlistItems as any[]) {
      // Skip if already drafted
      if (pickedPokemonIds.has(item.pokemon_id)) {
        continue
      }

      // Check budget
      if (team.budget_remaining < item.cost) {
        console.log(`[AutoSkip] Cannot afford ${item.pokemon_name} (${item.cost} > ${team.budget_remaining})`)
        continue
      }

      // Check pick limit
      const maxPokemonPerTeam = draftState.draft.settings?.maxPokemonPerTeam || 10
      const currentPickCount = draftState.picks.filter((p: any) => p.team_id === teamId).length
      if (currentPickCount >= maxPokemonPerTeam) {
        console.log(`[AutoSkip] Team has reached pick limit (${maxPokemonPerTeam})`)
        return { success: false }
      }

      // Try to make the pick
      try {
        // Get user ID for the team owner
        const { data: ownerData } = await supabase
          .from('teams')
          .select('owner_id')
          .eq('id', teamId)
          .single()

        if (!(ownerData as any)?.owner_id) {
          console.error('[AutoSkip] No owner found for team')
          continue
        }

        await DraftService.makePick(
          draftId,
          (ownerData as any).owner_id,
          item.pokemon_id,
          item.pokemon_name,
          item.cost
        )

        return {
          success: true,
          pokemonId: item.pokemon_id,
          pokemonName: item.pokemon_name,
          cost: item.cost
        }
      } catch (error) {
        console.error(`[AutoSkip] Failed to pick ${item.pokemon_name}:`, error)
        continue
      }
    }

    return { success: false }
  }

  /**
   * Log skip event for draft history
   */
  private static async logSkipEvent(
    draftId: string,
    teamId: string,
    teamName: string
  ): Promise<void> {
    try {
      // You could add a skip_events table for this, but for now we'll just log it
      console.log(`[AutoSkip] Logged skip event for ${teamName} in draft ${draftId}`)

      // Optionally, you could insert into spectator_events table
      if (supabase) {
        await supabase
          .from('spectator_events')
          .insert({
            draft_id: draftId,
            event_type: 'turn_skipped',
            spectator_id: null,
            metadata: {
              team_id: teamId,
              team_name: teamName,
              reason: 'Timer expired'
            }
          } as any)
      }
    } catch (error) {
      console.error('[AutoSkip] Failed to log skip event:', error)
    }
  }

  /**
   * Check if auto-skip is enabled for a draft
   */
  static isAutoSkipEnabled(draftSettings: any): boolean {
    // Auto-skip is enabled if there's a time limit
    return draftSettings?.pickTimeLimitSeconds && draftSettings.pickTimeLimitSeconds > 0
  }

  /**
   * Get remaining time for current turn
   */
  static async getRemainingTime(draftId: string): Promise<number> {
    const draftState = await DraftService.getDraftState(draftId)
    if (!draftState || draftState.draft.status !== 'active') {
      return 0
    }

    const timeLimit = draftState.draft.settings?.pickTimeLimitSeconds || 0
    if (timeLimit === 0) {
      return Infinity // No time limit
    }

    const turnStartedAt = new Date(draftState.draft.updated_at).getTime()
    const now = Date.now()
    const elapsed = Math.floor((now - turnStartedAt) / 1000)
    const remaining = Math.max(0, timeLimit - elapsed)

    return remaining
  }

  /**
   * Check if current turn has expired
   */
  static async isTurnExpired(draftId: string): Promise<boolean> {
    const remaining = await this.getRemainingTime(draftId)
    return remaining === 0
  }

  /**
   * Schedule auto-skip for current turn (client-side timer)
   * This would typically be called from a React component with useEffect
   */
  static scheduleAutoSkip(
    draftId: string,
    teamId: string,
    delaySeconds: number,
    callback: (result: AutoSkipResult) => void
  ): () => void {
    const timeoutId = setTimeout(async () => {
      try {
        const result = await this.handleTimeExpired(draftId, teamId)
        callback(result)
      } catch (error) {
        console.error('[AutoSkip] Scheduled auto-skip failed:', error)
      }
    }, delaySeconds * 1000)

    // Return cleanup function
    return () => clearTimeout(timeoutId)
  }

  /**
   * Get wishlist summary for a team (for UI display)
   */
  static async getWishlistSummary(
    draftId: string,
    participantId: string
  ): Promise<{
    totalItems: number
    availableItems: number
    affordableItems: number
    topPick: { pokemonId: string; pokemonName: string; cost: number } | null
  }> {
    if (!supabase) {
      throw DraftErrors.supabaseNotAvailable()
    }

    const { data: wishlistItems } = await supabase
      .from('wishlist_items')
      .select('*')
      .eq('draft_id', draftId)
      .eq('participant_id', participantId)
      .order('priority', { ascending: true })

    if (!wishlistItems || wishlistItems.length === 0) {
      return {
        totalItems: 0,
        availableItems: 0,
        affordableItems: 0,
        topPick: null
      }
    }

    // Get team budget
    const { data: participant } = await supabase
      .from('participants')
      .select('team_id')
      .eq('id', participantId)
      .single()

    let budget = 0
    if ((participant as any)?.team_id) {
      const { data: team } = await supabase
        .from('teams')
        .select('budget_remaining')
        .eq('id', (participant as any).team_id)
        .single()
      budget = (team as any)?.budget_remaining || 0
    }

    const availableItems = (wishlistItems as any[]).filter((item: any) => item.is_available)
    const affordableItems = availableItems.filter((item: any) => item.cost <= budget)
    const topPick = affordableItems.length > 0 ? affordableItems[0] : null

    return {
      totalItems: wishlistItems.length,
      availableItems: availableItems.length,
      affordableItems: affordableItems.length,
      topPick: topPick
        ? {
            pokemonId: topPick.pokemon_id,
            pokemonName: topPick.pokemon_name,
            cost: topPick.cost
          }
        : null
    }
  }
}
