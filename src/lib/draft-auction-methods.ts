/**
 * Draft Auction Methods — Auction-related methods extracted from DraftService
 *
 * Standalone functions for auction nominations, bidding, resolution,
 * and auction draft progression.
 */
import { supabase } from './supabase'
import type { AuctionRow } from '@/types/supabase-helpers'
import { createLogger } from '@/lib/logger'
import type { DraftState } from './draft-service'

const log = createLogger('DraftAuctionMethods')

type Auction = AuctionRow

// Lazy import to avoid circular deps
async function getDraftStateLazy(draftId: string): Promise<DraftState | null> {
  const { DraftService } = await import('./draft-service')
  return DraftService.getDraftState(draftId)
}

// Import validatePokemonInFormat from picks service lazily
async function validatePokemonInFormatLazy(
  draft: DraftState['draft'],
  pokemonId: string,
  pokemonName: string,
  proposedCost: number
) {
  const { validatePokemonInFormat } = await import('./draft-picks-service')
  return validatePokemonInFormat(draft, pokemonId, pokemonName, proposedCost)
}

// Import getUserTeam from picks service lazily
async function getUserTeamLazy(draftId: string, userId: string) {
  const { getUserTeam } = await import('./draft-picks-service')
  return getUserTeam(draftId, userId)
}

/**
 * Validate if user can nominate in auction draft
 */
export async function validateUserCanNominate(
  draftId: string,
  userId: string
): Promise<{ canNominate: boolean; teamId: string | null; reason?: string }> {
  // Get draft state
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    return { canNominate: false, teamId: null, reason: 'Draft not found' }
  }

  // Check if draft is active
  if (draftState.draft.status !== 'active') {
    return { canNominate: false, teamId: null, reason: 'Draft is not active' }
  }

  // Check if this is an auction draft
  if (draftState.draft.format !== 'auction') {
    return { canNominate: false, teamId: null, reason: 'This is not an auction draft' }
  }

  // Get user's team
  const userTeamId = await getUserTeamLazy(draftId, userId)
  if (!userTeamId) {
    return { canNominate: false, teamId: null, reason: 'You are not part of this draft' }
  }

  // Check if there's already an active auction
  const currentAuction = await getCurrentAuction(draftId)
  if (currentAuction) {
    return { canNominate: false, teamId: userTeamId, reason: 'There is already an active auction' }
  }

  // Implement turn-based nomination logic for auction drafts
  const { teams, picks } = draftState

  // Calculate whose turn it is to nominate
  const totalPicks = picks.length
  const totalTeams = teams.length

  if (totalTeams === 0) {
    return { canNominate: false, teamId: userTeamId, reason: 'No teams in draft' }
  }

  // Determine current nominating team using round-robin
  // Each team nominates once per round in order
  const currentNominatorIndex = totalPicks % totalTeams
  const sortedTeams = [...teams].sort((a, b) => a.draft_order - b.draft_order)
  const currentNominatingTeam = sortedTeams[currentNominatorIndex]

  if (!currentNominatingTeam) {
    return { canNominate: false, teamId: userTeamId, reason: 'Could not determine current turn' }
  }

  const isUserTurn = currentNominatingTeam.id === userTeamId

  if (!isUserTurn) {
    return {
      canNominate: false,
      teamId: userTeamId,
      reason: `It's ${currentNominatingTeam.name}'s turn to nominate`
    }
  }

  return { canNominate: true, teamId: userTeamId }
}

/**
 * Nominate a Pokemon for auction
 */
export async function nominatePokemon(
  draftId: string,
  userId: string,
  pokemonId: string,
  pokemonName: string,
  startingBid: number = 1,
  auctionDurationSeconds: number = 60
): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Validate user can nominate
  const validation = await validateUserCanNominate(draftId, userId)
  if (!validation.canNominate) {
    throw new Error(validation.reason || 'Cannot nominate Pokemon')
  }

  const teamId = validation.teamId!
  const auctionEnd = new Date(Date.now() + auctionDurationSeconds * 1000)

  // Get draft state to validate Pokemon against format
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  // Validate Pokemon against format rules
  const formatValidation = await validatePokemonInFormatLazy(
    draftState.draft,
    pokemonId,
    pokemonName,
    startingBid
  )
  if (!formatValidation.isValid) {
    throw new Error(formatValidation.reason || 'Pokemon is not legal in this format')
  }

  // Create auction
  const { error } = await (supabase
    .from('auctions'))
    .insert({
      draft_id: draftState.draft.id,
      pokemon_id: pokemonId,
      pokemon_name: pokemonName,
      nominated_by: teamId,
      current_bid: startingBid,
      current_bidder: null,
      auction_end: auctionEnd.toISOString(),
      status: 'active'
    })

  if (error) {
    log.error('Error creating auction:', error)
    throw new Error('Failed to nominate Pokemon')
  }
}

/**
 * Place a bid on an active auction
 */
export async function placeBid(
  draftId: string,
  userId: string,
  auctionId: string,
  bidAmount: number
): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }
  const internalId = draftState.draft.id

  // Get user's team first (doesn't change during auction)
  const userTeamId = await getUserTeamLazy(draftId, userId)
  if (!userTeamId) {
    throw new Error('You are not part of this draft')
  }

  // Validate budget
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('budget_remaining')
    .eq('id', userTeamId)
    .single()

  if (teamError || !team) {
    throw new Error('Team not found')
  }

  if (bidAmount > team.budget_remaining) {
    throw new Error(`Bid exceeds your remaining budget of $${team.budget_remaining}`)
  }

  // Retry loop with optimistic locking to handle concurrent bids from 20+ players
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Read current auction state
    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', auctionId)
      .eq('draft_id', internalId)
      .single()

    if (auctionError || !auction) {
      throw new Error('Auction not found')
    }

    if (auction.status !== 'active') {
      throw new Error('Auction is not active')
    }

    if (new Date() > new Date(auction.auction_end)) {
      throw new Error('Auction has expired')
    }

    if (bidAmount <= auction.current_bid) {
      throw new Error(`Bid must be higher than current bid of $${auction.current_bid}`)
    }

    // Optimistic lock: only update if current_bid hasn't changed since we read it.
    // This prevents a lower bid from overwriting a higher concurrent bid.
    const { data: updated, error: updateError } = await supabase
      .from('auctions')
      .update({
        current_bid: bidAmount,
        current_bidder: userTeamId,
        updated_at: new Date().toISOString()
      })
      .eq('id', auctionId)
      .eq('current_bid', auction.current_bid) // optimistic lock
      .select()

    if (updateError) {
      log.error('Error placing bid:', updateError)
      throw new Error('Failed to place bid')
    }

    // If no rows updated, another bid landed between our read and write
    if (!updated || updated.length === 0) {
      if (attempt < MAX_RETRIES - 1) {
        log.info(`Bid conflict on attempt ${attempt + 1}, retrying...`)
        continue // Re-read auction and re-validate
      }

      // On final retry failure, re-read to give the user accurate info
      const { data: latest } = await supabase
        .from('auctions')
        .select('current_bid')
        .eq('id', auctionId)
        .single()

      if (latest && bidAmount <= latest.current_bid) {
        throw new Error(`Someone else bid higher! Current bid is now $${latest.current_bid}`)
      }
      throw new Error('Bid failed due to high traffic. Please try again.')
    }

    // Bid succeeded
    return
  }
}

/**
 * Resolve an expired auction
 */
export async function resolveAuction(draftId: string, auctionId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }
  const internalId = draftState.draft.id

  // Get auction details
  const { data: auction, error: auctionError } = await supabase
    .from('auctions')
    .select('*')
    .eq('id', auctionId)
    .eq('draft_id', internalId)
    .single()

  if (auctionError || !auction) {
    throw new Error('Auction not found')
  }

  if (auction.status !== 'active') {
    throw new Error('Auction is not active')
  }

  // Check if there was a winning bidder
  if (auction.current_bidder) {

    const pickOrder = draftState.picks.length + 1
    const currentRound = Math.floor(pickOrder / draftState.teams.length) + 1

    // Create the pick
    const { error: pickError } = await supabase
      .from('picks')
      .insert({
        draft_id: internalId,
        team_id: auction.current_bidder,
        pokemon_id: auction.pokemon_id,
        pokemon_name: auction.pokemon_name,
        cost: auction.current_bid,
        pick_order: pickOrder,
        round: currentRound
      })

    if (pickError) {
      log.error('Error creating pick from auction:', pickError)
      throw new Error('Failed to create pick from auction')
    }

    // Update team budget with optimistic locking
    const { data: team, error: teamFetchError} = await supabase
      .from('teams')
      .select('budget_remaining')
      .eq('id', auction.current_bidder)
      .single()

    if (teamFetchError || !team) {
      log.error('Error fetching team budget after auction:', teamFetchError)
      throw new Error('Failed to fetch team budget after auction')
    }

    const oldBudget = team.budget_remaining
    const newBudget = oldBudget - auction.current_bid

    // Use optimistic locking to prevent budget race conditions
    const { data: budgetUpdateResult, error: teamError } = await supabase
      .from('teams')
      .update({ budget_remaining: newBudget })
      .eq('id', auction.current_bidder)
      .eq('budget_remaining', oldBudget) // Optimistic lock
      .select()

    if (teamError || !budgetUpdateResult || budgetUpdateResult.length === 0) {
      log.error('Error updating team budget after auction (possible race condition):', teamError)
      throw new Error('Failed to update team budget after auction. Budget may have been modified.')
    }

    // Verify budget didn't go negative
    if (budgetUpdateResult[0].budget_remaining < 0) {
      log.error(`Budget went negative for team ${auction.current_bidder}`)
      // Rollback budget
      await supabase
        .from('teams')
        .update({ budget_remaining: oldBudget })
        .eq('id', auction.current_bidder)
      throw new Error('Insufficient budget for auction win')
    }
  }

  // Mark auction as completed
  const { error: updateError } = await supabase
    .from('auctions')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', auctionId)

  if (updateError) {
    log.error('Error completing auction:', updateError)
    throw new Error('Failed to complete auction')
  }

  // Check if draft should advance to next nomination or end
  await checkAuctionDraftProgress(draftId)
}

/**
 * Extend auction time (host only)
 */
export async function extendAuctionTime(
  draftId: string,
  auctionId: string,
  additionalSeconds: number
): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }
  const internalId = draftState.draft.id

  const { data: auction, error: auctionError } = await supabase
    .from('auctions')
    .select('auction_end')
    .eq('id', auctionId)
    .eq('draft_id', internalId)
    .single()

  if (auctionError || !auction) {
    throw new Error('Auction not found')
  }

  const newEndTime = new Date(new Date(auction.auction_end).getTime() + additionalSeconds * 1000)

  const { error } = await supabase
    .from('auctions')
    .update({
      auction_end: newEndTime.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', auctionId)

  if (error) {
    log.error('Error extending auction time:', error)
    throw new Error('Failed to extend auction time')
  }
}

/**
 * Get current active auction for a draft
 */
export async function getCurrentAuction(draftId: string): Promise<Auction | null> {
  if (!supabase) return null

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) return null

  const { data: auction, error } = await supabase
    .from('auctions')
    .select('*')
    .eq('draft_id', draftState.draft.id)
    .eq('status', 'active')
    .single()

  if (error) {
    log.error('Error fetching current auction:', error)
    return null
  }

  return auction
}

/**
 * Set default auction timer duration (admin/host only)
 */
export async function setAuctionTimerDuration(
  draftId: string,
  durationSeconds: number
): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  if (durationSeconds < 10) {
    throw new Error('Auction duration must be at least 10 seconds')
  }

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const internalId = draftState.draft.id

  // Get current settings
  const { data: draft, error: fetchError } = await supabase
    .from('drafts')
    .select('settings')
    .eq('id', internalId)
    .single()

  if (fetchError) {
    throw new Error('Failed to fetch draft settings')
  }

  // Update settings with new auction duration
  const currentSettings = draft.settings || {}
  const updatedSettings = {
    ...currentSettings,
    auctionDurationSeconds: durationSeconds
  }

  const { error } = await (supabase
    .from('drafts'))
    .update({
      settings: updatedSettings,
      updated_at: new Date().toISOString()
    })
    .eq('id', internalId)

  if (error) {
    log.error('Error setting auction timer duration:', error)
    throw new Error('Failed to set auction timer duration')
  }
}

/**
 * Check auction draft progress and advance if needed
 */
export async function checkAuctionDraftProgress(draftId: string): Promise<void> {
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) return
  if (!supabase) return

  const internalId = draftState.draft.id
  const maxPicks = Number(draftState.draft.settings?.pokemonPerTeam || 10)
  const totalPossiblePicks = draftState.teams.length * maxPicks
  const currentPicks = draftState.picks.length

  // Check if draft is complete
  if (currentPicks >= totalPossiblePicks) {
    const { error } = await supabase
      .from('drafts')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', internalId)

    if (error) {
      log.error('Error completing auction draft:', error)
    }

    // League creation is handled on the results page so the host can configure settings first
  }

  // Update current turn/round for auction drafts
  const currentTurn = currentPicks + 1
  const currentRound = Math.floor(currentPicks / draftState.teams.length) + 1

  const { error: turnError } = await supabase
    .from('drafts')
    .update({
      current_turn: currentTurn,
      current_round: currentRound,
      updated_at: new Date().toISOString()
    })
    .eq('id', internalId)

  if (turnError) {
    log.error('Error updating auction draft turn:', turnError)
  }
}
