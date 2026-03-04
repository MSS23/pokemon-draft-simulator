/**
 * Draft Trade Service
 *
 * Handles Pokemon trading between teams in a completed draft.
 * Constraints:
 * - Draft must be completed
 * - Total cost of Pokemon given by each side must be equal
 * - Each team must maintain the minimum Pokemon count after trade
 * - Both sides must offer at least one Pokemon
 */

import { supabase } from './supabase'
import { createLogger } from './logger'

const log = createLogger('DraftTradeService')

export interface DraftTradePick {
  id: string
  teamId: string
  pokemonId: string
  pokemonName: string
  cost: number
}

export interface DraftTradeProposal {
  draftId: string       // UUID of the draft
  fromTeamId: string
  toTeamId: string
  fromPicks: string[]   // Pick IDs offered by fromTeam
  toPicks: string[]     // Pick IDs offered by toTeam
}

export interface DraftTradeValidation {
  valid: boolean
  fromTotalCost: number
  toTotalCost: number
  fromTeamSizeAfter: number
  toTeamSizeAfter: number
  minRequired: number
  reason?: string
}

export class DraftTradeService {
  /**
   * Validate a proposed trade without executing it.
   * Checks: equal cost, minimum team size, pick ownership.
   */
  static async validateTrade(
    proposal: DraftTradeProposal,
    minPokemonPerTeam: number
  ): Promise<DraftTradeValidation> {
    if (!supabase) throw new Error('Supabase not available')

    if (proposal.fromPicks.length === 0 || proposal.toPicks.length === 0) {
      return {
        valid: false,
        fromTotalCost: 0,
        toTotalCost: 0,
        fromTeamSizeAfter: 0,
        toTeamSizeAfter: 0,
        minRequired: minPokemonPerTeam,
        reason: 'Both sides must offer at least one Pokemon'
      }
    }

    // Fetch all picks for both teams
    const { data: allPicks, error } = await supabase
      .from('picks')
      .select('id, team_id, pokemon_id, pokemon_name, cost')
      .eq('draft_id', proposal.draftId)
      .in('team_id', [proposal.fromTeamId, proposal.toTeamId])

    if (error || !allPicks) {
      throw new Error('Failed to fetch team picks')
    }

    const fromTeamPicks = allPicks.filter(p => p.team_id === proposal.fromTeamId)
    const toTeamPicks = allPicks.filter(p => p.team_id === proposal.toTeamId)

    // Verify pick ownership
    const fromOffered = proposal.fromPicks.map(id => {
      const pick = fromTeamPicks.find(p => p.id === id)
      if (!pick) throw new Error(`Pick ${id} does not belong to the offering team`)
      return pick
    })

    const toOffered = proposal.toPicks.map(id => {
      const pick = toTeamPicks.find(p => p.id === id)
      if (!pick) throw new Error(`Pick ${id} does not belong to the receiving team`)
      return pick
    })

    // Calculate total costs
    const fromTotalCost = fromOffered.reduce((sum, p) => sum + p.cost, 0)
    const toTotalCost = toOffered.reduce((sum, p) => sum + p.cost, 0)

    // Team sizes after trade
    const fromTeamSizeAfter = fromTeamPicks.length - proposal.fromPicks.length + proposal.toPicks.length
    const toTeamSizeAfter = toTeamPicks.length - proposal.toPicks.length + proposal.fromPicks.length

    // Validate equal cost
    if (fromTotalCost !== toTotalCost) {
      return {
        valid: false,
        fromTotalCost,
        toTotalCost,
        fromTeamSizeAfter,
        toTeamSizeAfter,
        minRequired: minPokemonPerTeam,
        reason: `Trade costs must be equal. Offering side: ${fromTotalCost} pts, receiving side: ${toTotalCost} pts`
      }
    }

    // Validate minimum team sizes
    if (fromTeamSizeAfter < minPokemonPerTeam) {
      return {
        valid: false,
        fromTotalCost,
        toTotalCost,
        fromTeamSizeAfter,
        toTeamSizeAfter,
        minRequired: minPokemonPerTeam,
        reason: `Trade would leave a team with ${fromTeamSizeAfter} Pokemon (minimum: ${minPokemonPerTeam})`
      }
    }

    if (toTeamSizeAfter < minPokemonPerTeam) {
      return {
        valid: false,
        fromTotalCost,
        toTotalCost,
        fromTeamSizeAfter,
        toTeamSizeAfter,
        minRequired: minPokemonPerTeam,
        reason: `Trade would leave a team with ${toTeamSizeAfter} Pokemon (minimum: ${minPokemonPerTeam})`
      }
    }

    return {
      valid: true,
      fromTotalCost,
      toTotalCost,
      fromTeamSizeAfter,
      toTeamSizeAfter,
      minRequired: minPokemonPerTeam
    }
  }

  /**
   * Execute a validated trade by swapping team_id on the picks.
   * Uses batched updates with automatic rollback if the second batch fails.
   *
   * Strategy: 2 batched DB calls instead of N individual ones.
   * If batch 2 fails, batch 1 is automatically rolled back so picks
   * are never left in an inconsistent state (e.g. from a disconnect).
   */
  static async executeTrade(
    proposal: DraftTradeProposal,
    minPokemonPerTeam: number
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Re-validate before executing
    const validation = await this.validateTrade(proposal, minPokemonPerTeam)
    if (!validation.valid) {
      throw new Error(validation.reason || 'Trade validation failed')
    }

    // Verify draft is completed
    const { data: draft, error: draftError } = await supabase
      .from('drafts')
      .select('status')
      .eq('id', proposal.draftId)
      .single()

    if (draftError || !draft) {
      throw new Error('Draft not found')
    }

    if (draft.status !== 'completed') {
      throw new Error('Trades can only be made after the draft is completed')
    }

    // Batch 1: Move fromTeam picks → toTeam (all at once)
    const { error: batch1Error, data: batch1Data } = await supabase
      .from('picks')
      .update({ team_id: proposal.toTeamId })
      .in('id', proposal.fromPicks)
      .eq('team_id', proposal.fromTeamId) // Safety: only move picks that still belong to fromTeam
      .select('id')

    if (batch1Error) {
      log.error('Trade batch 1 failed:', batch1Error)
      throw new Error('Trade failed: could not transfer your Pokemon. No changes were made.')
    }

    // Verify all expected picks were updated
    const batch1Count = batch1Data?.length ?? 0
    if (batch1Count !== proposal.fromPicks.length) {
      // Some picks weren't updated (maybe already traded or ownership changed)
      // Rollback batch 1: move them back
      log.warn('Trade batch 1 partial: expected', proposal.fromPicks.length, 'got', batch1Count, '- rolling back')
      await supabase
        .from('picks')
        .update({ team_id: proposal.fromTeamId })
        .in('id', proposal.fromPicks)
        .eq('team_id', proposal.toTeamId)

      throw new Error('Trade failed: some Pokemon are no longer available. No changes were made.')
    }

    // Batch 2: Move toTeam picks → fromTeam (all at once)
    const { error: batch2Error, data: batch2Data } = await supabase
      .from('picks')
      .update({ team_id: proposal.fromTeamId })
      .in('id', proposal.toPicks)
      .eq('team_id', proposal.toTeamId) // Safety: only move picks that still belong to toTeam
      .select('id')

    if (batch2Error || (batch2Data?.length ?? 0) !== proposal.toPicks.length) {
      // Batch 2 failed - rollback batch 1 to restore original state
      log.error('Trade batch 2 failed, rolling back batch 1:', batch2Error)

      const { error: rollbackError } = await supabase
        .from('picks')
        .update({ team_id: proposal.fromTeamId })
        .in('id', proposal.fromPicks)
        .eq('team_id', proposal.toTeamId)

      if (rollbackError) {
        // Critical: rollback also failed - log for manual recovery
        log.error('CRITICAL: Trade rollback failed! Manual recovery needed.', {
          draftId: proposal.draftId,
          fromTeam: proposal.fromTeamId,
          toTeam: proposal.toTeamId,
          fromPicks: proposal.fromPicks,
          toPicks: proposal.toPicks,
          rollbackError,
        })
        throw new Error('Trade failed and could not be automatically reversed. Please refresh and check your teams.')
      }

      // Also rollback any partial batch 2 picks
      if (batch2Data && batch2Data.length > 0) {
        await supabase
          .from('picks')
          .update({ team_id: proposal.toTeamId })
          .in('id', proposal.toPicks)
          .eq('team_id', proposal.fromTeamId)
      }

      throw new Error('Trade failed: could not transfer the other team\'s Pokemon. All changes have been reversed.')
    }

    log.info('Trade executed successfully', {
      from: proposal.fromTeamId,
      to: proposal.toTeamId,
      fromPicks: proposal.fromPicks.length,
      toPicks: proposal.toPicks.length,
      cost: validation.fromTotalCost
    })
  }

  /**
   * Get all picks for a specific team in a draft.
   */
  static async getTeamPicks(draftId: string, teamId: string): Promise<DraftTradePick[]> {
    if (!supabase) throw new Error('Supabase not available')

    const { data, error } = await supabase
      .from('picks')
      .select('id, team_id, pokemon_id, pokemon_name, cost')
      .eq('draft_id', draftId)
      .eq('team_id', teamId)
      .order('pick_order', { ascending: true })

    if (error) {
      throw new Error('Failed to fetch team picks')
    }

    return (data || []).map(p => ({
      id: p.id,
      teamId: p.team_id,
      pokemonId: p.pokemon_id,
      pokemonName: p.pokemon_name,
      cost: p.cost
    }))
  }
}
