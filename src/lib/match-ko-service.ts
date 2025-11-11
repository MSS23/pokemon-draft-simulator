/**
 * Match KO Service
 *
 * Handles Pokemon knockout tracking, death recording (Nuzlocke), and status management
 * during league matches.
 */

import { supabase } from './supabase'
import type {
  MatchPokemonKO,
  TeamPokemonStatus,
  Pick
} from '@/types'

export class MatchKOService {
  /**
   * Record a Pokemon KO/faint during a match
   *
   * @param matchId - Match UUID
   * @param gameNumber - Which game in best-of-X (1, 2, 3, etc.)
   * @param pickId - Pick UUID (identifies the Pokemon on a team)
   * @param koCount - Number of times this Pokemon fainted in this game
   * @param isDeath - Whether this KO resulted in permanent death (Nuzlocke)
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
      .single() as any

    if (pickResponse.error || !pickResponse.data) {
      throw new Error(`Failed to find pick: ${pickResponse.error?.message || 'Not found'}`)
    }

    const pick = pickResponse.data

    // Insert KO record
    const koResponse = (await supabase
      .from('match_pokemon_kos')
      .insert({
        match_id: matchId,
        game_number: gameNumber,
        pick_id: pickId,
        pokemon_id: pick.pokemon_id,
        ko_count: koCount,
        is_death: isDeath,
        ko_details: details || null,
      } as any)
      .select()
      .single()) as any

    const data = koResponse?.data
    const error = koResponse?.error

    if (error) {
      throw new Error(`Failed to record Pokemon KO: ${error.message}`)
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
   * Mark a Pokemon as permanently dead (Nuzlocke rules)
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
    const statusResponse = await (supabase
      .from('team_pokemon_status') as any)
      .update({
        status: 'dead',
        death_match_id: matchId,
        death_date: new Date().toISOString(),
        death_details: details || null,
      })
      .eq('pick_id', pickId)
      .select()
      .single()

    const data = statusResponse?.data
    const error = statusResponse?.error

    if (error) {
      throw new Error(`Failed to mark Pokemon as dead: ${error.message}`)
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
      throw new Error(`Failed to get Pokemon status: ${error.message}`)
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

    const response = await supabase
      .from('match_pokemon_kos')
      .select('*')
      .eq('match_id', matchId)
      .order('game_number', { ascending: true })
      .order('created_at', { ascending: true }) as any

    const data = response?.data
    const error = response?.error

    if (error) {
      throw new Error(`Failed to get match KOs: ${error.message}`)
    }

    return data.map((ko: any) => ({
      id: ko.id,
      matchId: ko.match_id,
      gameNumber: ko.game_number,
      pokemonId: ko.pokemon_id,
      pickId: ko.pick_id,
      koCount: ko.ko_count,
      isDeath: ko.is_death,
      koDetails: ko.ko_details,
      createdAt: ko.created_at,
      updatedAt: ko.updated_at,
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
      team_id: teamId,
      league_id: leagueId,
      status: 'alive',
      total_kos: 0,
      matches_played: 0,
      matches_won: 0,
    }))

    const response = await (supabase
      .from('team_pokemon_status') as any)
      .upsert(statusRecords, {
        onConflict: 'pick_id,league_id',
        ignoreDuplicates: false,
      })

    const error = response?.error

    if (error) {
      throw new Error(`Failed to initialize Pokemon status: ${error.message}`)
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
      throw new Error(`Failed to get team Pokemon statuses: ${error.message}`)
    }

    return data.map(this.mapToTeamPokemonStatus)
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
    const { error } = await (supabase as any).rpc('increment_pokemon_match_stats', {
      p_pick_id: pickId,
      p_won: won,
    })

    // If RPC doesn't exist, use manual update
    if (error && error.code === '42883') {
      const { data: current, error: fetchError } = await (supabase as any)
        .from('team_pokemon_status')
        .select('matches_played, matches_won')
        .eq('pick_id', pickId)
        .single()

      if (fetchError) {
        throw new Error(`Failed to fetch Pokemon stats: ${fetchError.message}`)
      }

      const { error: updateError } = await (supabase as any)
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
      throw new Error(`Failed to update Pokemon match stats: ${error.message}`)
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

    const { data: current, error: fetchError } = await (supabase as any)
      .from('team_pokemon_status')
      .select('total_kos')
      .eq('pick_id', pickId)
      .single()

    if (fetchError) {
      // If status doesn't exist yet, skip (will be initialized later)
      return
    }

    const { error: updateError } = await (supabase as any)
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
  private static mapToTeamPokemonStatus(data: any): TeamPokemonStatus {
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
    totalKos: number
    teamId: string
  }>> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const { data, error } = await (supabase as any)
      .from('team_pokemon_status')
      .select('pick_id, team_id, total_kos, picks!inner(pokemon_id)')
      .eq('league_id', leagueId)
      .order('total_kos', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to get KO leaderboard: ${error.message}`)
    }

    return data.map((record: any) => ({
      pickId: record.pick_id,
      pokemonId: (record as any).picks.pokemon_id,
      totalKos: record.total_kos || 0,
      teamId: record.team_id,
    }))
  }

  /**
   * Get all dead Pokemon in a league (Nuzlocke memorial)
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
      throw new Error(`Failed to get dead Pokemon: ${error.message}`)
    }

    return data.map(this.mapToTeamPokemonStatus)
  }
}
