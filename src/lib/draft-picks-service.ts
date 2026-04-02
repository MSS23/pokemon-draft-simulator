/**
 * Draft Picks Service — Pick flow methods extracted from DraftService
 *
 * Standalone functions for making picks, validating turns, undoing picks,
 * advancing turns, and auto-skipping.
 */
import { supabase } from './supabase'
import { generateSnakeDraftOrder } from '@/utils/draft'
import { getFormatById, DEFAULT_FORMAT } from '@/lib/formats'
import { createFormatRulesEngine as createNewFormatRulesEngine } from '@/domain/rules'
import { Team as AppTeam } from '@/types'
import { fetchPokemon } from '@/lib/pokemon-api'
import type { DraftRow, TeamRow, PickRow, ParticipantRow } from '@/types/supabase-helpers'
import { createLogger } from '@/lib/logger'
import type { DraftState } from './draft-service'

const log = createLogger('DraftPicksService')

type Draft = DraftRow

// Re-export getDraftState and cache helpers from the main service at call time
// to avoid circular imports. We use a lazy import pattern.
async function getDraftStateLazy(draftId: string): Promise<DraftState | null> {
  const { DraftService } = await import('./draft-service')
  return DraftService.getDraftState(draftId)
}

async function invalidateCacheLazy(draftId?: string): Promise<void> {
  const { DraftService } = await import('./draft-service')
  DraftService.invalidateDraftStateCache(draftId)
}

async function getUserTeamViaService(draftId: string, userId: string): Promise<string | null> {
  // Call through the DraftService class so that vi.spyOn(DraftService, 'getUserTeam')
  // in tests can intercept the call. Direct calls bypass class-level spies.
  const { DraftService } = await import('./draft-service')
  return DraftService.getUserTeam(draftId, userId)
}

async function validatePokemonViaService(
  draft: Draft,
  pokemonId: string,
  pokemonName: string,
  proposedCost: number
): Promise<{ isValid: boolean; reason?: string; validatedCost: number }> {
  // Route through DraftService so test spies on the private method still work
  const mod = await import('./draft-service') as Record<string, unknown>
  const svc = mod.DraftService as { validatePokemonInFormat?: typeof validatePokemonInFormat }
  // DraftService.validatePokemonInFormat is private but assigned as a static property,
  // so test spies can intercept it. Fall back to the standalone function if not present.
  const fn = svc.validatePokemonInFormat || validatePokemonInFormat
  return fn(draft, pokemonId, pokemonName, proposedCost)
}

/**
 * Validate a Pokemon pick against the draft's format rules
 */
export async function validatePokemonInFormat(
  draft: Draft,
  pokemonId: string,
  pokemonName: string,
  proposedCost: number
): Promise<{ isValid: boolean; reason?: string; validatedCost: number }> {
  try {
    // Get format from draft settings
    const formatId = draft.settings?.formatId || DEFAULT_FORMAT
    const format = getFormatById(formatId)

    if (!format) {
      return {
        isValid: false,
        reason: `Invalid format: ${formatId}`,
        validatedCost: proposedCost
      }
    }

    // Fetch the Pokemon object to validate
    const pokemon = await fetchPokemon(pokemonId)

    // Use NEW format rules engine to validate (async)
    const rulesEngine = await createNewFormatRulesEngine(format.id)
    const validation = await rulesEngine.validatePokemon(pokemon)

    if (!validation.isLegal) {
      return {
        isValid: false,
        reason: validation.reason,
        validatedCost: proposedCost
      }
    }

    // Return validated cost from format rules
    return {
      isValid: true,
      validatedCost: validation.cost
    }
  } catch (error) {
    log.error('Error validating Pokemon in format:', error)
    return {
      isValid: false,
      reason: 'Failed to validate Pokemon against format rules',
      validatedCost: proposedCost
    }
  }
}

/**
 * Make a pick using the atomic database function.
 * This eliminates race conditions by performing all operations in a single transaction.
 */
export async function makePick(draftId: string, userId: string, pokemonId: string, pokemonName: string, cost: number): Promise<{
  pickId: string
  newBudget: number
  nextTurn: number
  isComplete: boolean
}> {
  if (!supabase) throw new Error('Supabase not available')

  // Get draft state to resolve room_code to UUID and get team info
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const draftUuid = draftState.draft.id
  const currentTurn = draftState.draft.current_turn || 1

  // Get user's team
  const teamId = await getUserTeamViaService(draftId, userId)
  if (!teamId) {
    throw new Error('User not in this draft')
  }

  // Validate Pokemon against format rules (client-side pre-check)
  // Routed via DraftService so test spies can intercept
  const formatValidation = await validatePokemonViaService(draftState.draft, pokemonId, pokemonName, cost)
  if (!formatValidation.isValid) {
    throw new Error(formatValidation.reason || 'Pokemon is not legal in this format')
  }

  const validatedCost = formatValidation.validatedCost

  // Tier budget validation for tiered scoring system
  const scoringSystem = draftState.draft.settings?.scoringSystem
  let pickCost = validatedCost
  if (scoringSystem === 'tiered') {
    const tierConfig = draftState.draft.settings?.tierConfig as { tiers: import('@/types').TierDefinition[] } | undefined
    if (tierConfig?.tiers?.length) {
      const { getPokemonTier } = await import('@/lib/tier-utils')
      const tier = getPokemonTier(validatedCost, tierConfig.tiers)
      if (!tier) {
        throw new Error(`${pokemonName} doesn't fit into any tier in this draft.`)
      }
      // In tiered drafts the deducted cost is the tier's point cost, not the raw format cost
      pickCost = tier.cost
      const team = draftState.teams.find(t => t.id === teamId)
      if (team && team.budget_remaining < pickCost) {
        throw new Error(`Not enough budget. ${tier.label} costs ${pickCost} pts and you have ${team.budget_remaining} pts remaining.`)
      }
    }
  }

  // Call the atomic database function
  // This performs all validation and updates in a single transaction with row-level locking
  const { data, error } = await supabase.rpc('make_draft_pick', {
    p_draft_id: draftUuid,
    p_team_id: teamId,
    p_user_id: userId,
    p_pokemon_id: pokemonId,
    p_pokemon_name: pokemonName,
    p_cost: pickCost,
    p_expected_turn: currentTurn
  })

  if (error) {
    log.error('Database RPC error:', error)
    throw new Error(error?.message || 'Failed to make pick')
  }

  // The function returns a JSONB object with success/error info
  if (!data) {
    throw new Error('No response from pick function')
  }

  // Cast RPC JSONB response to expected shape
  const result = data as Record<string, unknown>

  if (!result.success) {
    // The atomic function returned an error (validation failed)
    const errorMessage = (result.error as string) || 'Failed to make pick'
    log.error('Atomic function error:', errorMessage, result)

    // Provide user-friendly error messages
    if (errorMessage.includes('Not your turn')) {
      throw new Error('Not your turn! The turn may have changed. Please wait for your turn.')
    }
    if (errorMessage.includes('Insufficient budget')) {
      throw new Error(`Insufficient budget! You have ${result.budgetRemaining || 0} points but this costs ${result.cost || validatedCost} points.`)
    }
    if (errorMessage.includes('Maximum picks reached')) {
      throw new Error(`Your team has reached the maximum number of picks (${result.maxPicks || 6}).`)
    }
    if (errorMessage.includes('already drafted')) {
      throw new Error('This Pokemon has already been drafted by your team.')
    }
    if (errorMessage.includes('not active')) {
      throw new Error('Draft is not active. It may have been paused or completed.')
    }

    throw new Error(errorMessage)
  }

  log.info('Success:', {
    pickId: result.pickId,
    newBudget: result.newBudget,
    nextTurn: result.nextTurn,
    isComplete: result.isComplete
  })

  // Invalidate cache so the next getDraftState fetches fresh data
  await invalidateCacheLazy(draftId)

  return {
    pickId: result.pickId as string,
    newBudget: result.newBudget as number,
    nextTurn: result.nextTurn as number,
    isComplete: result.isComplete as boolean
  }
}

export async function makeProxyPick(draftId: string, hostUserId: string, targetTeamId: string, pokemonId: string, pokemonName: string, cost: number): Promise<void> {
  // Validate format rules for proxy pick too
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const formatValidation = await validatePokemonInFormat(draftState.draft, pokemonId, pokemonName, cost)
  if (!formatValidation.isValid) {
    throw new Error(formatValidation.reason || 'Pokemon is not legal in this format')
  }

  // For production Supabase implementation - verify host permissions and make pick for target team
  // This would need to be implemented when moving beyond demo mode
  throw new Error('Proxy picking not yet implemented for production mode')
}

export async function validateUserTeam(draftId: string, userId: string, teamId: string): Promise<boolean> {
  if (!supabase) return false

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) return false

  const { data: participant } = await supabase
    .from('participants')
    .select('team_id')
    .eq('draft_id', draftState.draft.id)
    .eq('user_id', userId)
    .single()

  return participant?.team_id === teamId
}

export async function getUserTeam(draftId: string, userId: string): Promise<string | null> {
  if (!supabase) return null

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) return null

  // Debug logging to help troubleshoot participant lookup issues
  log.info('Looking up participant:', {
    draftId,
    userId,
    draftUuid: draftState.draft.id
  })

  const { data: participant, error } = await supabase
    .from('participants')
    .select('team_id, user_id')
    .eq('draft_id', draftState.draft.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    log.error('Error looking up participant:', error)
    throw new Error(`Failed to look up participant: ${error?.message || 'Unknown error'}`)
  }

  if (!participant) {
    log.warn('No participant found for user. All participants in draft:',
      draftState.participants.map(p => ({
        userId: p.user_id,
        teamId: p.team_id,
        displayName: p.display_name
      }))
    )
  }

  return participant?.team_id || null
}

export async function validateUserCanPick(draftId: string, userId: string): Promise<{ canPick: boolean; teamId: string | null; reason?: string }> {
  // Get draft state
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    return { canPick: false, teamId: null, reason: 'Draft not found' }
  }

  // Check if draft is active
  if (draftState.draft.status !== 'active') {
    return { canPick: false, teamId: null, reason: 'Draft is not active' }
  }

  // Get user's team (via DraftService so test spies intercept)
  const userTeamId = await getUserTeamViaService(draftId, userId)
  if (!userTeamId) {
    return { canPick: false, teamId: null, reason: 'You are not part of this draft' }
  }

  // For auction drafts, different validation logic
  if (draftState.draft.format === 'auction') {
    return { canPick: false, teamId: userTeamId, reason: 'Use auction bidding for auction drafts' }
  }

  // Check if it's user's turn (snake draft logic)
  const maxRounds = draftState.draft.settings?.maxPokemonPerTeam || 10
  const currentTurn = draftState.draft.current_turn || 1

  const draftOrder = generateSnakeDraftOrder(draftState.teams as unknown as AppTeam[], maxRounds)
  if (currentTurn > draftOrder.length) {
    return { canPick: false, teamId: userTeamId, reason: 'Draft is complete' }
  }

  const currentTeamOrder = draftOrder[currentTurn - 1]
  const currentTeam = draftState.teams.find(team => team.draft_order === currentTeamOrder)

  if (!currentTeam || currentTeam.id !== userTeamId) {
    return { canPick: false, teamId: userTeamId, reason: 'It is not your turn' }
  }

  return { canPick: true, teamId: userTeamId }
}

/**
 * Undo the last pick in a draft (only if allowUndos is enabled in settings)
 */
export async function undoLastPick(draftId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Get draft state and check if undos are allowed
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  if (!draftState.draft.settings?.allowUndos) {
    throw new Error('Undo is not enabled for this draft')
  }

  // Check if user is host (only host can undo)
  const participant = draftState.participants.find(p => p.user_id === userId)
  if (!participant?.is_host) {
    throw new Error('Only the host can undo picks')
  }

  // Get the last pick
  const lastPick = draftState.picks.sort((a, b) => b.pick_order - a.pick_order)[0]
  if (!lastPick) {
    throw new Error('No picks to undo')
  }

  // Delete the pick
  const { error: deleteError } = await (supabase
    .from('picks'))
    .delete()
    .eq('id', lastPick.id)

  if (deleteError) {
    log.error('Error deleting pick:', deleteError)
    throw new Error('Failed to undo pick')
  }

  // Restore team budget (read-update pattern since supabase-js doesn't support SQL expressions)
  const { data: teamBudgetData, error: teamFetchError } = await supabase
    .from('teams')
    .select('budget_remaining')
    .eq('id', lastPick.team_id)
    .single()

  if (teamFetchError || !teamBudgetData) {
    log.error('Error fetching team budget for undo:', teamFetchError)
  } else {
    const newBudget = teamBudgetData.budget_remaining + lastPick.cost
    const { error: budgetError } = await supabase
      .from('teams')
      .update({ budget_remaining: newBudget })
      .eq('id', lastPick.team_id)

    if (budgetError) {
      log.error('Error restoring budget:', budgetError)
    }
  }

  // Revert draft turn
  const newTurn = Math.max(1, (draftState.draft.current_turn || 1) - 1)
  const totalTeams = draftState.teams.length
  const newRound = Math.floor((newTurn - 1) / totalTeams) + 1

  await (supabase
    .from('drafts'))
    .update({
      current_turn: newTurn,
      current_round: newRound,
      status: 'active' // Revert from completed if needed
    })
    .eq('id', draftState.draft.id)
}

/**
 * Undo a specific pick by ID (for more control)
 */
export async function undoPickById(draftId: string, userId: string, pickId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Get draft state and check if undos are allowed
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  if (!draftState.draft.settings?.allowUndos) {
    throw new Error('Undo is not enabled for this draft')
  }

  // Check if user is host
  const participant = draftState.participants.find(p => p.user_id === userId)
  if (!participant?.is_host) {
    throw new Error('Only the host can undo picks')
  }

  // Get the specific pick
  const pick = draftState.picks.find(p => p.id === pickId)
  if (!pick) {
    throw new Error('Pick not found')
  }

  // Don't allow undoing old picks that would break the sequence
  const lastPick = draftState.picks.sort((a, b) => b.pick_order - a.pick_order)[0]
  if (pick.pick_order !== lastPick.pick_order) {
    throw new Error('Can only undo the most recent pick')
  }

  // Use the same logic as undoLastPick
  await undoLastPick(draftId, userId)
}

/**
 * Auto-skip a turn when time expires (AFK handling)
 */
export async function autoSkipTurn(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  try {
    // Get current draft state
    const draftState = await getDraftStateLazy(draftId)
    if (!draftState) {
      log.warn(`Auto-skip aborted: Draft ${draftId} not found or has ended`)
      return // Don't throw, just return silently
    }

    if (draftState.draft.status !== 'active') {
      log.warn(`Auto-skip aborted: Draft ${draftId} is not active (status: ${draftState.draft.status})`)
      return // Don't throw for non-active drafts
    }

    // Simply advance to the next turn without making a pick
    // This effectively skips the current team's turn
    await advanceTurn(draftId)

    log.info(`Auto-skipped turn ${draftState.draft.current_turn} for draft ${draftId}`)
  } catch (error) {
    log.error(`Auto-skip failed for draft ${draftId}:`, error)
    // Re-throw only if it's not a "not found" error
    if (error instanceof Error && !error.message?.includes('not found')) {
      throw error
    }
  }
}

export async function advanceTurn(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const internalId = draftState.draft.id
  const totalTeams = draftState.teams.length
  const maxRounds = draftState.draft.settings?.maxPokemonPerTeam || 10
  const currentTurn = draftState.draft.current_turn || 1
  const nextTurn = currentTurn + 1
  const nextRound = Math.floor((nextTurn - 1) / totalTeams) + 1

  const isComplete = nextTurn > totalTeams * maxRounds

  // Apply any pending timer changes when advancing turn
  const currentSettings = draftState.draft.settings || {}
  let updatedSettings = currentSettings
  if (currentSettings.pendingTimerChange !== undefined) {
    updatedSettings = {
      ...currentSettings,
      timeLimit: currentSettings.pendingTimerChange,
      pendingTimerChange: undefined // Clear the pending flag
    }
  }

  const updateData = isComplete
    ? {
        status: 'completed' as const,
        updated_at: new Date().toISOString(),
        settings: updatedSettings,
        turn_started_at: null // Clear turn_started_at when draft completes
      }
    : {
        current_turn: nextTurn,
        current_round: nextRound,
        updated_at: new Date().toISOString(),
        settings: updatedSettings,
        turn_started_at: new Date().toISOString() // Track when turn started for disconnect handling
      }

  // Add optimistic locking to prevent concurrent turn advancements
  const { data: updateResult, error } = await (supabase
    .from('drafts'))
    .update(updateData)
    .eq('id', internalId)
    .eq('current_turn', currentTurn) // Optimistic lock: only update if turn hasn't changed
    .select()

  if (error) {
    log.error('Error advancing turn:', error)
    throw new Error('Failed to advance turn')
  }

  if (!updateResult || updateResult.length === 0) {
    // Optimistic lock failed - turn was already advanced by another process
    log.warn('Optimistic lock failed - turn was already advanced')
    throw new Error('Turn was already advanced by another process')
  }
}
