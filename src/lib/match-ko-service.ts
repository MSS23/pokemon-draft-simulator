/**
 * Match KO Service
 *
 * Handles Pokemon knockout tracking and status management for VGC draft leagues
 * during league matches.
 */

import { supabase } from './supabase'
import { createLogger } from './logger'

const log = createLogger('MatchKOService')
import type {
  MatchPokemonKO,
  TeamPokemonStatus,
  Pick
} from '@/types'
import type { TeamPokemonStatusRow } from '@/types/supabase-helpers'

export class MatchKOService {
  /**
   * Record a Pokemon KO/faint during a match
   *
   * @param matchId - Match UUID
   * @param gameNumber - Which game in best-of-X (1, 2, 3, etc.)
   * @param pickId - Pick UUID (identifies the Pokemon on a team)
   * @param koCount - Number of times this Pokemon fainted in this game
   * @param isDeath - Reserved for future use
   * @param details - Optional battle details (opponent, move, turn, etc.)
   */
  static async recordPokemonKO(
    matchId: string,
    gameNumber: number,
    pickId: string,
    koCount: number = 1,
    isDeath: boolean = false,
    details?: {
      opponentPokemon?: string
      moveUsed?: string
      turnNumber?: number
      damage?: number
      [key: string]: unknown
    }
  ): Promise<MatchPokemonKO> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Get pick details to find pokemon_id
    const pickResponse = await supabase
      .from('picks')
      .select('pokemon_id')
      .eq('id', pickId)
      .single()

    if (pickResponse.error || !pickResponse.data) {
      throw new Error(`Failed to find pick: ${pickResponse.error?.message || 'Not found'}`)
    }

    const pick = pickResponse.data

    // Insert KO record
    const { data, error } = await supabase
      .from('match_pokemon_kos')
      .insert({
        match_id: matchId,
        game_number: gameNumber,
        pick_id: pickId,
        pokemon_id: pick.pokemon_id,
        ko_count: koCount,
        is_death: isDeath,
        ko_details: details || null,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to record Pokemon KO: ${error?.message || 'Unknown error'}`)
    }

    // If death, mark Pokemon as dead in status table
    if (isDeath) {
      await this.markPokemonDead(pickId, matchId, details)
    } else {
      // Otherwise, update KO stats in status table
      await this.incrementKOCount(pickId, koCount)
    }

    return {
      id: data.id,
      matchId: data.match_id,
      gameNumber: data.game_number,
      pokemonId: data.pokemon_id,
      pickId: data.pick_id,
      koCount: data.ko_count,
      isDeath: data.is_death,
      koDetails: data.ko_details,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  /**
   * Mark a Pokemon as inactive (removed from roster)
   *
   * @param pickId - Pick UUID
   * @param matchId - Match where Pokemon died
   * @param details - Death details (opponent, move, etc.)
   */
  static async markPokemonDead(
    pickId: string,
    matchId: string,
    details?: {
      opponentTeam?: string
      opponentPokemon?: string
      moveUsed?: string
      [key: string]: unknown
    }
  ): Promise<TeamPokemonStatus> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Update status to 'dead'
    const { data, error } = await supabase
      .from('team_pokemon_status')
      .update({
        status: 'dead' as const,
        death_match_id: matchId,
        death_date: new Date().toISOString(),
        death_details: details || null,
      })
      .eq('pick_id', pickId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to mark Pokemon as dead: ${error?.message || 'Unknown error'}`)
    }

    return this.mapToTeamPokemonStatus(data)
  }

  /**
   * Get Pokemon status for a specific pick in a league
   *
   * @param pickId - Pick UUID
   * @param leagueId - League UUID
   */
  static async getPokemonStatus(
    pickId: string,
    leagueId: string
  ): Promise<TeamPokemonStatus | null> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const { data, error } = await supabase
      .from('team_pokemon_status')
      .select('*')
      .eq('pick_id', pickId)
      .eq('league_id', leagueId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found - return null
        return null
      }
      throw new Error(`Failed to get Pokemon status: ${error?.message || 'Unknown error'}`)
    }

    return this.mapToTeamPokemonStatus(data)
  }

  /**
   * Get all Pokemon KOs for a specific match
   *
   * @param matchId - Match UUID
   */
  static async getMatchKOs(matchId: string): Promise<MatchPokemonKO[]> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const { data, error } = await supabase
      .from('match_pokemon_kos')
      .select('*')
      .eq('match_id', matchId)
      .order('game_number', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to get match KOs: ${error?.message || 'Unknown error'}`)
    }

    return (data ?? []).map((ko: Record<string, unknown>) => ({
      id: ko.id as string,
      matchId: ko.match_id as string,
      gameNumber: ko.game_number as number,
      pokemonId: ko.pokemon_id as string,
      pickId: (ko.pick_id as string) || '',
      koCount: (ko.ko_count as number) || 1,
      isDeath: (ko.is_death as boolean) || false,
      koDetails: (ko.ko_details as Record<string, unknown>) || null,
      createdAt: ko.created_at as string,
      updatedAt: (ko.updated_at as string) || ko.created_at as string,
    }))
  }

  /**
   * Initialize Pokemon status records for all picks in a league team
   *
   * @param leagueId - League UUID
   * @param teamId - Team UUID
   * @param picks - Array of picks to initialize
   */
  static async initializePokemonStatus(
    leagueId: string,
    teamId: string,
    picks: Pick[]
  ): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const statusRecords = picks.map(pick => ({
      pick_id: pick.id,
      pokemon_id: pick.pokemonId,
      pokemon_name: pick.pokemonName,
      team_id: teamId,
      league_id: leagueId,
      status: 'alive' as const,
      total_kos: 0,
      matches_played: 0,
      matches_won: 0,
    }))

    const { error } = await supabase
      .from('team_pokemon_status')
      .upsert(statusRecords, {
        onConflict: 'pick_id,league_id',
        ignoreDuplicates: false,
      })

    if (error) {
      throw new Error(`Failed to initialize Pokemon status: ${error?.message || 'Unknown error'}`)
    }
  }

  /**
   * Get all Pokemon status records for a team in a league
   *
   * @param teamId - Team UUID
   * @param leagueId - League UUID
   */
  static async getTeamPokemonStatuses(
    teamId: string,
    leagueId: string
  ): Promise<TeamPokemonStatus[]> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const { data, error } = await supabase
      .from('team_pokemon_status')
      .select('*')
      .eq('team_id', teamId)
      .eq('league_id', leagueId)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to get team Pokemon statuses: ${error?.message || 'Unknown error'}`)
    }

    return (data ?? []).map(this.mapToTeamPokemonStatus)
  }

  /**
   * Update Pokemon match statistics after a match completes
   *
   * @param pickId - Pick UUID
   * @param won - Whether the team won the match
   */
  static async updatePokemonMatchStats(
    pickId: string,
    won: boolean
  ): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Increment matches_played and optionally matches_won
    const { error } = await supabase.rpc('increment_pokemon_match_stats', {
      p_pick_id: pickId,
      p_won: won,
    })

    // If RPC doesn't exist, use manual update
    if (error && error.code === '42883') {
      const { data: current, error: fetchError } = await supabase
        .from('team_pokemon_status')
        .select('matches_played, matches_won')
        .eq('pick_id', pickId)
        .single()

      if (fetchError) {
        throw new Error(`Failed to fetch Pokemon stats: ${fetchError.message}`)
      }

      const { error: updateError } = await supabase
        .from('team_pokemon_status')
        .update({
          matches_played: (current.matches_played || 0) + 1,
          matches_won: won ? (current.matches_won || 0) + 1 : current.matches_won,
        })
        .eq('pick_id', pickId)

      if (updateError) {
        throw new Error(`Failed to update Pokemon match stats: ${updateError.message}`)
      }
    } else if (error) {
      throw new Error(`Failed to update Pokemon match stats: ${error?.message || 'Unknown error'}`)
    }
  }

  /**
   * Increment KO count for a Pokemon
   *
   * @private
   */
  private static async incrementKOCount(pickId: string, koCount: number): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const { data: current, error: fetchError } = await supabase
      .from('team_pokemon_status')
      .select('total_kos')
      .eq('pick_id', pickId)
      .single()

    if (fetchError) {
      // If status doesn't exist yet, skip (will be initialized later)
      log.warn('KO count status not found for pick, skipping:', fetchError.message)
      return
    }

    const { error: updateError } = await supabase
      .from('team_pokemon_status')
      .update({
        total_kos: (current.total_kos || 0) + koCount,
      })
      .eq('pick_id', pickId)

    if (updateError) {
      throw new Error(`Failed to increment KO count: ${updateError.message}`)
    }
  }

  /**
   * Map database record to TeamPokemonStatus type
   *
   * @private
   */
  private static mapToTeamPokemonStatus(data: TeamPokemonStatusRow): TeamPokemonStatus {
    return {
      id: data.id,
      pickId: data.pick_id,
      teamId: data.team_id,
      leagueId: data.league_id,
      status: data.status,
      totalKos: data.total_kos || 0,
      matchesPlayed: data.matches_played || 0,
      matchesWon: data.matches_won || 0,
      deathMatchId: data.death_match_id,
      deathDate: data.death_date,
      deathDetails: data.death_details,
      notes: data.notes,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  /**
   * Get Pokemon with most KOs in a league (leaderboard)
   *
   * @param leagueId - League UUID
   * @param limit - Number of results to return
   */
  static async getKOLeaderboard(
    leagueId: string,
    limit: number = 10
  ): Promise<Array<{
    pickId: string
    pokemonId: string
    pokemonName: string
    totalKos: number
    matchesPlayed: number
    teamId: string
  }>> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Join query returns a shape not in generated types, so we cast the result
    type LeaderboardRecord = {
      pick_id: string
      team_id: string
      total_kos: number
      matches_played: number
      picks: { pokemon_id: string; pokemon_name: string }
    }

    const { data, error } = await supabase
      .from('team_pokemon_status')
      .select('pick_id, team_id, total_kos, matches_played, picks!inner(pokemon_id, pokemon_name)')
      .eq('league_id', leagueId)
      .gt('total_kos', 0)
      .order('total_kos', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to get KO leaderboard: ${error?.message || 'Unknown error'}`)
    }

    const records = (data ?? []) as unknown as LeaderboardRecord[]

    return records.map((record) => ({
      pickId: record.pick_id,
      pokemonId: record.picks.pokemon_id,
      pokemonName: record.picks.pokemon_name,
      totalKos: record.total_kos || 0,
      matchesPlayed: record.matches_played || 0,
      teamId: record.team_id,
    }))
  }

  /**
   * Get total faint/death counts for all Pokemon in a league
   *
   * Returns a map of pickId -> total times that Pokemon was KO'd (fainted)
   *
   * @param leagueId - League UUID
   */
  static async getDeathCounts(
    leagueId: string
  ): Promise<Map<string, number>> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Get all match IDs for this league
    const { data: matches, error: matchError } = await supabase
      .from('matches')
      .select('id')
      .eq('league_id', leagueId)

    if (matchError) {
      throw new Error(`Failed to get league matches: ${matchError.message}`)
    }

    if (!matches || matches.length === 0) {
      return new Map()
    }

    const matchIds = matches.map(m => m.id)

    // Query match_pokemon_kos for all league matches.
    // pick_id = the Pokemon that was KO'd/fainted, ko_count = number of faints.
    const { data: koData, error: koError } = await supabase
      .from('match_pokemon_kos')
      .select('pick_id, ko_count')
      .in('match_id', matchIds)

    if (koError) {
      throw new Error(`Failed to get death counts: ${koError.message}`)
    }

    const deathMap = new Map<string, number>()
    for (const ko of koData ?? []) {
      if (ko.pick_id) {
        deathMap.set(ko.pick_id, (deathMap.get(ko.pick_id) || 0) + (ko.ko_count || 1))
      }
    }

    return deathMap
  }

  /**
   * Get all inactive Pokemon in a league
   *
   * @param leagueId - League UUID
   */
  static async getDeadPokemon(leagueId: string): Promise<TeamPokemonStatus[]> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const { data, error } = await supabase
      .from('team_pokemon_status')
      .select('*')
      .eq('league_id', leagueId)
      .eq('status', 'dead')
      .order('death_date', { ascending: false })

    if (error) {
      throw new Error(`Failed to get dead Pokemon: ${error?.message || 'Unknown error'}`)
    }

    return (data ?? []).map(this.mapToTeamPokemonStatus)
  }
}
