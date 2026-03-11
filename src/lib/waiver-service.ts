/**
 * Waiver Wire / Free Agent Service
 *
 * Handles mid-season roster changes:
 * - Browse available (undrafted) Pokemon
 * - Claim free agents with optional drop
 * - Budget validation for claims
 * - Waiver history tracking
 *
 * Note: waiver_claims is fully typed in the Database type in supabase.ts.
 */

import { supabase } from './supabase'
import { createLogger } from '@/lib/logger'
import type { WaiverClaim, Pick } from '@/types'

const log = createLogger('WaiverService')


interface WaiverClaimRow {
  id: string
  league_id: string
  team_id: string
  claimed_pokemon_id: string
  claimed_pokemon_name: string
  dropped_pick_id: string | null
  status: string
  waiver_priority: number | null
  claimed_at: string
  processed_at: string | null
  notes: string | null
  created_at: string
}

export class WaiverService {
  /**
   * Get all Pokemon IDs currently picked by any team in this draft
   */
  static async getDraftedPokemonIds(draftId: string): Promise<Set<string>> {
    if (!supabase) throw new Error('Supabase not available')

    const { data, error } = await supabase
      .from('picks')
      .select('pokemon_id')
      .eq('draft_id', draftId)

    if (error) throw new Error(`Failed to get drafted Pokemon: ${error?.message || 'Unknown error'}`)

    return new Set((data || []).map(p => p.pokemon_id))
  }

  /**
   * Submit a waiver claim (pick up a free agent, optionally dropping a roster Pokemon)
   */
  static async claimPokemon(
    leagueId: string,
    teamId: string,
    pokemonId: string,
    pokemonName: string,
    pokemonCost: number,
    dropPickId: string
  ): Promise<WaiverClaim> {
    if (!supabase) throw new Error('Supabase not available')

    if (!dropPickId) {
      throw new Error('You must drop a Pokemon to claim a free agent')
    }

    // Validate team budget
    const { data: team } = await supabase
      .from('teams')
      .select('budget_remaining, draft_id')
      .eq('id', teamId)
      .single()

    if (!team) throw new Error('Team not found')

    // Calculate refund from dropped Pokemon
    const { data: dropPick } = await supabase
      .from('picks')
      .select('cost')
      .eq('id', dropPickId)
      .single()

    if (!dropPick) throw new Error('Drop pick not found')

    const dropRefund = dropPick.cost || 0
    const netCost = pokemonCost - dropRefund

    if (netCost > 0 && (team.budget_remaining || 0) < netCost) {
      throw new Error(`Insufficient budget. Need ${netCost} pts extra (${pokemonCost} claim - ${dropRefund} refund), have ${team.budget_remaining || 0} pts`)
    }

    // Check if first game has been played — locks free agent claims
    const firstGamePlayed = await this.hasFirstGameBeenPlayed(leagueId)
    if (firstGamePlayed) {
      throw new Error('Free agent claims are locked once the first match has been played')
    }

    // Check claim limits
    const settings = await this.getWaiverSettings(leagueId)
    const maxClaims = settings.freeAgentPicksAllowed ?? settings.maxWaiverClaimsPerSeason ?? 3
    const existingClaims = await this.getTeamClaimsThisSeason(teamId, leagueId)
    if (existingClaims >= maxClaims) {
      throw new Error(`Free agent pick limit reached (${maxClaims} allowed before first game)`)
    }

    const { data: claim, error } = await supabase
      .from('waiver_claims')
      .insert({
        league_id: leagueId,
        team_id: teamId,
        claimed_pokemon_id: pokemonId,
        claimed_pokemon_name: pokemonName,
        dropped_pick_id: dropPickId || null,
        status: 'pending',
        claimed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to submit claim: ${error?.message || 'Unknown error'}`)

    const claimRow = claim as WaiverClaimRow

    // Auto-process FCFS claims immediately
    if (settings.waiverPriority === 'fcfs' || !settings.waiverPriority) {
      await this.processWaiverClaim(claimRow.id, team.draft_id, pokemonCost, dropRefund)
    }

    return this.mapClaim(claimRow)
  }

  /**
   * Process (execute) a waiver claim
   */
  static async processWaiverClaim(
    claimId: string,
    draftId: string,
    pokemonCost: number,
    dropRefund: number
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get claim details
    const { data: rawClaim } = await supabase
      .from('waiver_claims')
      .select('*')
      .eq('id', claimId)
      .single()

    const claim = rawClaim as WaiverClaimRow | null
    if (!claim) throw new Error('Claim not found')
    if (claim.status !== 'pending') throw new Error('Claim already processed')

    // Delete dropped pick if applicable
    if (claim.dropped_pick_id) {
      await supabase
        .from('picks')
        .delete()
        .eq('id', claim.dropped_pick_id)
    }

    // Insert new pick
    const { data: maxOrder } = await supabase
      .from('picks')
      .select('pick_order')
      .eq('draft_id', draftId)
      .order('pick_order', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = ((maxOrder?.pick_order) || 0) + 1

    const { error: pickError } = await supabase
      .from('picks')
      .insert({
        draft_id: draftId,
        team_id: claim.team_id,
        pokemon_id: claim.claimed_pokemon_id,
        pokemon_name: claim.claimed_pokemon_name,
        cost: pokemonCost,
        pick_order: nextOrder,
        round: 0, // Waiver round
      })

    if (pickError) throw new Error(`Failed to insert pick: ${pickError.message}`)

    // Update team budget via direct SQL
    const netCost = pokemonCost - dropRefund
    const { data: currentTeam } = await supabase
      .from('teams')
      .select('budget_remaining')
      .eq('id', claim.team_id)
      .single()

    if (currentTeam) {
      await supabase
        .from('teams')
        .update({
          budget_remaining: (currentTeam.budget_remaining || 0) - netCost,
        })
        .eq('id', claim.team_id)
    }

    // Mark claim as completed
    await supabase
      .from('waiver_claims')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', claimId)

    log.info(`Waiver claim ${claimId} processed: ${claim.claimed_pokemon_name} to team ${claim.team_id}`)
  }

  /**
   * Get waiver transaction history for a league
   */
  static async getWaiverHistory(leagueId: string): Promise<WaiverClaim[]> {
    if (!supabase) throw new Error('Supabase not available')

    const { data, error } = await supabase
      .from('waiver_claims')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(`Failed to get waiver history: ${error?.message || 'Unknown error'}`)

    return ((data || []) as WaiverClaimRow[]).map(this.mapClaim)
  }

  /**
   * Count claims a team has made this season
   */
  static async getTeamClaimsThisSeason(teamId: string, leagueId: string): Promise<number> {
    if (!supabase) throw new Error('Supabase not available')

    const { count, error } = await supabase
      .from('waiver_claims')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('team_id', teamId)
      .in('status', ['completed', 'pending', 'approved'])

    if (error) throw new Error(`Failed to count claims: ${error?.message || 'Unknown error'}`)

    return (count as number) || 0
  }

  /**
   * Get team's picks (for drop selection)
   */
  static async getTeamPicks(teamId: string): Promise<Pick[]> {
    if (!supabase) throw new Error('Supabase not available')

    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .eq('team_id', teamId)
      .order('pick_order', { ascending: true })

    if (error) throw new Error(`Failed to get team picks: ${error?.message || 'Unknown error'}`)

    return (data || []).map(p => ({
      id: p.id,
      draftId: p.draft_id,
      teamId: p.team_id,
      pokemonId: p.pokemon_id,
      pokemonName: p.pokemon_name,
      cost: p.cost || 0,
      pickOrder: p.pick_order || 0,
      round: p.round || 1,
      createdAt: p.created_at,
    }))
  }

  /**
   * Get waiver settings from league
   */
  /**
   * Check if any match in this league has been played (completed or in_progress)
   */
  static async hasFirstGameBeenPlayed(leagueId: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase not available')

    const { count, error } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .in('status', ['completed', 'in_progress'])

    if (error) throw new Error(`Failed to check match status: ${error?.message || 'Unknown error'}`)
    return (count ?? 0) > 0
  }

  private static async getWaiverSettings(leagueId: string): Promise<{
    enableWaivers: boolean
    maxWaiverClaimsPerSeason: number
    freeAgentPicksAllowed: number | undefined
    waiverPriority: 'fcfs' | 'inverse_standings'
  }> {
    if (!supabase) throw new Error('Supabase not available')

    const { data } = await supabase
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .single()

    const settings = (data?.settings || {}) as Record<string, unknown>

    return {
      enableWaivers: (settings.enableWaivers as boolean) ?? true,
      maxWaiverClaimsPerSeason: (settings.maxWaiverClaimsPerSeason as number) ?? 3,
      freeAgentPicksAllowed: settings.freeAgentPicksAllowed as number | undefined,
      waiverPriority: (settings.waiverPriority as 'fcfs' | 'inverse_standings') ?? 'fcfs',
    }
  }

  private static mapClaim(row: WaiverClaimRow): WaiverClaim {
    return {
      id: row.id,
      leagueId: row.league_id,
      teamId: row.team_id,
      claimedPokemonId: row.claimed_pokemon_id,
      claimedPokemonName: row.claimed_pokemon_name,
      droppedPickId: row.dropped_pick_id,
      status: row.status as WaiverClaim['status'],
      waiverPriority: row.waiver_priority,
      claimedAt: row.claimed_at,
      processedAt: row.processed_at,
      notes: row.notes,
      createdAt: row.created_at,
    }
  }
}
