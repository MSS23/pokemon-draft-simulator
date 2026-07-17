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
  const { teams } = draftState

  // Calculate whose turn it is to nominate from the authoritative auction turn.
  // This advances even when an auction ends without a winning bidder.
  const totalTeams = teams.length

  if (totalTeams === 0) {
    return { canNominate: false, teamId: userTeamId, reason: 'No teams in draft' }
  }

  // Determine current nominating team using round-robin
  // Each team nominates once per round in order
  const currentNominatorIndex = (Math.max(draftState.draft.current_turn ?? 1, 1) - 1) % totalTeams
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

  const { data, error } = await supabase.rpc('nominate_auction', {
    p_draft_id: draftState.draft.id,
    p_pokemon_id: pokemonId,
    p_pokemon_name: pokemonName,
    p_starting_bid: startingBid,
    p_duration_seconds: auctionDurationSeconds,
  })

  if (error) {
    log.error('nominate_auction RPC failed:', error)
    throw new Error(error.message || 'Failed to nominate Pokemon')
  }
  if (!data?.success) {
    throw new Error(data?.error || 'Failed to nominate Pokemon')
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

  // Resolve the caller's team, then let the row-locking RPC perform every
  // mutable validation (expiry, current bid, budget and roster capacity).
  const userTeamId = await getUserTeamLazy(draftId, userId)
  if (!userTeamId) {
    throw new Error('You are not part of this draft')
  }

  const { error } = await supabase.rpc('place_bid', {
    auction_id: auctionId,
    bidder_team_id: userTeamId,
    bid_amount: bidAmount,
  })
  if (error) {
    log.error('place_bid RPC failed:', error)
    throw new Error(error.message || 'Failed to place bid')
  }
}

/**
 * Resolve an expired auction.
 *
 * SERVER-AUTHORITATIVE + IDEMPOTENT: delegates to the resolve_auction Postgres
 * RPC, which row-locks the auction, re-checks status='active' and expiry, then
 * awards the mon to the standing high bidder, deducts budget, and advances the
 * turn — all in one transaction. This is safe for EVERY connected client to
 * call at timer=0: the first effective caller finalizes, the rest no-op. The
 * previous implementation ran a non-atomic multi-step sequence on every client
 * simultaneously, which duplicated picks and corrupted budgets under real load.
 */
export async function resolveAuction(draftId: string, auctionId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }
  const internalId = draftState.draft.id

  const { data, error } = await supabase.rpc('resolve_auction', {
    p_draft_id: internalId,
    p_auction_id: auctionId,
  })

  if (error) {
    log.error('resolve_auction RPC failed:', error)
    throw new Error('Failed to resolve auction')
  }

  // `resolved: false` is a normal, expected outcome when another client already
  // finalized this auction, or when it is not yet expired — not an error.
  if (data && !data.resolved) {
    log.info('resolve_auction no-op', { reason: data.reason })
  }
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
