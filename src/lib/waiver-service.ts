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
import type { WaiverClaim, Pick } from '@/types'



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

    // Advisory pre-checks for friendlier errors — the RPC re-checks all of
    // these atomically and is the actual gate.
    const settings = await this.getWaiverSettings(leagueId)
    if (settings.rosterLocked) {
      throw new Error('Rosters are currently locked by the commissioner')
    }
    if (settings.waiverDeadline && Date.now() > new Date(settings.waiverDeadline).getTime()) {
      throw new Error('The free agency deadline has passed')
    }
    if (!settings.allowInSeasonWaivers) {
      // Pre-season window: locked once any match has been played
      const firstGamePlayed = await this.hasFirstGameBeenPlayed(leagueId)
      if (firstGamePlayed) {
        throw new Error('Free agent claims are locked once the first match has been played')
      }
    }
    const maxClaims = settings.freeAgentPicksAllowed ?? settings.maxWaiverClaimsPerSeason ?? 3
    const existingClaims = await this.getTeamClaimsThisSeason(teamId, leagueId)
    if (existingClaims >= maxClaims) {
      throw new Error(`Free agent pick limit reached (${maxClaims} allowed before first game)`)
    }

    // Atomic server-side claim: verifies team ownership, drop-pick ownership,
    // budget, claim limits, and swaps the roster + budget in one transaction.
    // (The old client-side flow was FK-blocked on the pick delete and
    // permission-denied on the budget update, both silently.)
    const { data: claimId, error } = await supabase.rpc('process_waiver_claim' as never, {
      p_league_id: leagueId,
      p_team_id: teamId,
      p_pokemon_id: pokemonId,
      p_pokemon_name: pokemonName,
      p_pokemon_cost: pokemonCost,
      p_drop_pick_id: dropPickId,
    } as never)

    if (error) throw new Error(`Failed to submit claim: ${error?.message || 'Unknown error'}`)

    // Broadcast roster invalidation so league pages refresh
    try {
      const ch = supabase.channel(`league-roster-invalidate:${leagueId}`, { config: { private: true } })
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.send({ type: 'broadcast', event: 'trade_update', payload: { event: 'waiver_completed', claimId } })
            .catch(() => {})
            .finally(() => supabase!.removeChannel(ch))
        }
      })
    } catch { /* non-critical */ }

    const { data: rawClaim } = await supabase
      .from('waiver_claims')
      .select('id, league_id, team_id, claimed_pokemon_id, claimed_pokemon_name, dropped_pick_id, status, waiver_priority, claimed_at, processed_at, notes, created_at')
      .eq('id', claimId as unknown as string)
      .single()

    if (!rawClaim) throw new Error('Claim processed but could not be reloaded')
    return this.mapClaim(rawClaim as WaiverClaimRow)
  }

  /**
   * Get waiver transaction history for a league
   */
  static async getWaiverHistory(leagueId: string): Promise<WaiverClaim[]> {
    if (!supabase) throw new Error('Supabase not available')

    const { data, error } = await supabase
      .from('waiver_claims')
      .select('id, league_id, team_id, claimed_pokemon_id, claimed_pokemon_name, dropped_pick_id, status, waiver_priority, claimed_at, processed_at, notes, created_at')
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
      // 'pending' excluded: a claim that failed mid-processing must not burn a slot
      .in('status', ['completed', 'approved'])

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
      .select('id, draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round, created_at')
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

  static async getWaiverSettings(leagueId: string): Promise<{
    enableWaivers: boolean
    maxWaiverClaimsPerSeason: number
    freeAgentPicksAllowed: number | undefined
    waiverPriority: 'fcfs' | 'inverse_standings'
    allowInSeasonWaivers: boolean
    waiverDeadline: string | null
    rosterLocked: boolean
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
      allowInSeasonWaivers: (settings.allowInSeasonWaivers as boolean) ?? false,
      waiverDeadline: (settings.waiverDeadline as string) || null,
      rosterLocked: (settings.rosterLocked as boolean) ?? false,
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
