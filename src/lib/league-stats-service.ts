/**
 * League Statistics Service
 *
 * Advanced statistics and analytics for league play:
 * - Individual Pokemon statistics
 * - Head-to-head records
 * - Form indicators
 * - Offensive/defensive efficiency
 * - Streak tracking
 */

import { supabase } from './supabase'

export interface PokemonDetailedStats {
  pickId: string
  pokemonId: string
  pokemonName: string
  teamId: string
  teamName: string

  // Match stats
  matchesPlayed: number
  matchesWon: number
  matchesLost: number
  matchesDrawn: number
  winRate: number

  // KO stats
  totalKOsGiven: number    // KOs this Pokemon caused
  totalKOsTaken: number    // Times this Pokemon was KO'd
  koRatio: number          // KOs given / KOs taken

  // Status
  status: 'alive' | 'fainted' | 'dead'
  deathMatch?: {
    matchId: string
    date: string
    opponent: string
  }

  // Match history
  history: Array<{
    matchId: string
    weekNumber: number
    date: string
    opponent: string
    opponentTeam: string
    result: 'won' | 'lost' | 'draw'
    kosGiven: number
    kosTaken: number
  }>
}

export interface HeadToHeadRecord {
  teamAId: string
  teamAName: string
  teamBId: string
  teamBName: string

  // Overall record
  wins: number
  losses: number
  draws: number

  // Scoring
  pointsFor: number
  pointsAgainst: number
  avgPointsFor: number
  avgPointsAgainst: number

  // Matches
  totalMatches: number
  matches: Array<{
    matchId: string
    weekNumber: number
    date: string
    homeTeam: string
    awayTeam: string
    homeScore: number
    awayScore: number
    winner: 'team_a' | 'team_b' | 'draw'
  }>

  lastMeeting?: {
    date: string
    score: string
    winner: string
  }
}

export interface TeamFormIndicator {
  teamId: string
  teamName: string

  // Current form (last 5 matches)
  form: Array<'W' | 'L' | 'D'>
  formString: string  // e.g., "W-W-L-D-W"
  formType: 'hot' | 'neutral' | 'cold'

  // Current streak
  streak: {
    type: 'win' | 'loss' | 'draw'
    count: number
    displayText: string  // e.g., "3W" or "2L"
  }

  // Recent performance
  last5Wins: number
  last5Losses: number
  last5Draws: number
  last5PointsFor: number
  last5PointsAgainst: number
}

export interface AdvancedTeamStats {
  teamId: string
  teamName: string

  // Overall record
  wins: number
  losses: number
  draws: number
  matchesPlayed: number

  // Offensive stats
  totalPointsFor: number
  avgPointsFor: number
  totalKOsGiven: number
  avgKOsGiven: number
  offensiveRating: number  // Points per match * KO efficiency

  // Defensive stats
  totalPointsAgainst: number
  avgPointsAgainst: number
  totalKOsTaken: number
  avgKOsTaken: number
  defensiveRating: number  // Inverse of points allowed

  // Efficiency
  pointDifferential: number
  avgPointDifferential: number
  pythagoreanExpectation: number  // Expected win%

  // Pokemon stats
  activePokemon: number
  faintedPokemon: number
  deadPokemon: number
  healthyRosterPercentage: number
}

export class LeagueStatsService {
  /**
   * Get detailed statistics for a specific Pokemon
   */
  static async getPokemonDetailedStats(pickId: string): Promise<PokemonDetailedStats | null> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      // Get Pokemon basic info and status
      const pickResponse = await supabase
        .from('picks')
        .select(`
          id,
          pokemon_id,
          pokemon_name,
          team_id,
          teams!inner(name)
        `)
        .eq('id', pickId)
        .single() as any

      if (pickResponse.error) throw pickResponse.error
      if (!pickResponse.data) return null

      const pick = pickResponse.data

      const statusResponse = await supabase
        .from('team_pokemon_status')
        .select('*')
        .eq('pick_id', pickId)
        .single() as any

      const status = statusResponse?.data

      // Get all KOs this Pokemon has given
      const kosGivenResponse = await supabase
        .from('match_pokemon_kos')
        .select('ko_count')
        .eq('pick_id', pickId) as any

      const kosGiven = kosGivenResponse?.data

      // Get all KOs this Pokemon has taken (opponent's KOs)
      const kosTakenResponse = await supabase
        .from('match_pokemon_kos')
        .select(`
          ko_count,
          match:matches!inner(
            home_team_id,
            away_team_id
          )
        `)
        .neq('pick_id', pickId) as any  // KOs by OTHER Pokemon

      const kosTaken = kosTakenResponse?.data

      // Get match history
      const matchesResponse = await supabase
        .from('matches')
        .select(`
          id,
          week_number,
          scheduled_date,
          home_team_id,
          away_team_id,
          home_score,
          away_score,
          winner_team_id,
          home_team:teams!matches_home_team_id_fkey(id, name),
          away_team:teams!matches_away_team_id_fkey(id, name)
        `)
        .or(`home_team_id.eq.${pick.team_id},away_team_id.eq.${pick.team_id}`)
        .order('week_number', { ascending: true }) as any

      const matches = matchesResponse?.data

      const totalKOsGiven = kosGiven?.reduce((sum: number, ko: any) => sum + ko.ko_count, 0) || 0
      const totalKOsTaken = kosTaken?.reduce((sum: number, ko: any) => sum + ko.ko_count, 0) || 0

      const matchHistory = (matches || []).map((match: any) => {
        const isHome = match.home_team_id === pick.team_id
        const opponent = isHome ? match.away_team : match.home_team
        const teamScore = isHome ? match.home_score : match.away_score
        const oppScore = isHome ? match.away_score : match.home_score

        let result: 'won' | 'lost' | 'draw' = 'draw'
        if (match.winner_team_id) {
          result = match.winner_team_id === pick.team_id ? 'won' : 'lost'
        }

        // Get KOs for this specific match
        const matchKOs = kosGiven?.filter((ko: any) =>
          matches?.some((m: any) => m.id === match.id)
        ) || []
        const matchKOsGiven = matchKOs.reduce((sum: number, ko: any) => sum + ko.ko_count, 0)

        return {
          matchId: match.id,
          weekNumber: match.week_number,
          date: match.scheduled_date || '',
          opponent: opponent.name,
          opponentTeam: opponent.name,
          result,
          kosGiven: matchKOsGiven,
          kosTaken: 0  // Would need more complex query
        }
      })

      const matchesWon = matchHistory.filter((m: any) => m.result === 'won').length
      const matchesLost = matchHistory.filter((m: any) => m.result === 'lost').length
      const matchesDrawn = matchHistory.filter((m: any) => m.result === 'draw').length

      return {
        pickId: pick.id,
        pokemonId: pick.pokemon_id,
        pokemonName: pick.pokemon_name,
        teamId: pick.team_id,
        teamName: pick.teams.name,
        matchesPlayed: status?.matches_played || 0,
        matchesWon,
        matchesLost,
        matchesDrawn,
        winRate: status?.matches_played ? matchesWon / status.matches_played : 0,
        totalKOsGiven,
        totalKOsTaken,
        koRatio: totalKOsTaken > 0 ? totalKOsGiven / totalKOsTaken : totalKOsGiven,
        status: status?.status || 'alive',
        deathMatch: status?.death_match_id ? {
          matchId: status.death_match_id,
          date: status.death_date || '',
          opponent: 'Unknown'
        } : undefined,
        history: matchHistory
      }
    } catch (error) {
      console.error('Error fetching Pokemon detailed stats:', error)
      throw error
    }
  }

  /**
   * Get head-to-head record between two teams
   */
  static async getHeadToHeadRecord(teamAId: string, teamBId: string): Promise<HeadToHeadRecord | null> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const teamsResponse = await supabase
        .from('teams')
        .select('id, name')
        .in('id', [teamAId, teamBId]) as any

      const teams = teamsResponse?.data

      if (!teams || teams.length !== 2) return null

      const teamA = teams.find((t: any) => t.id === teamAId)!
      const teamB = teams.find((t: any) => t.id === teamBId)!

      // Get all matches between these teams
      const matchesResponse = await supabase
        .from('matches')
        .select(`
          id,
          week_number,
          scheduled_date,
          home_team_id,
          away_team_id,
          home_score,
          away_score,
          winner_team_id,
          status
        `)
        .or(`and(home_team_id.eq.${teamAId},away_team_id.eq.${teamBId}),and(home_team_id.eq.${teamBId},away_team_id.eq.${teamAId})`)
        .eq('status', 'completed')
        .order('week_number', { ascending: true }) as any

      const matches = matchesResponse?.data

      if (!matches) {
        return {
          teamAId,
          teamAName: teamA.name,
          teamBId,
          teamBName: teamB.name,
          wins: 0,
          losses: 0,
          draws: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          avgPointsFor: 0,
          avgPointsAgainst: 0,
          totalMatches: 0,
          matches: []
        }
      }

      let wins = 0
      let losses = 0
      let draws = 0
      let pointsFor = 0
      let pointsAgainst = 0

      const matchHistory = matches.map((match: any) => {
        const isTeamAHome = match.home_team_id === teamAId
        const teamAScore = isTeamAHome ? match.home_score : match.away_score
        const teamBScore = isTeamAHome ? match.away_score : match.home_score

        pointsFor += teamAScore || 0
        pointsAgainst += teamBScore || 0

        let winner: 'team_a' | 'team_b' | 'draw' = 'draw'
        if (match.winner_team_id === teamAId) {
          wins++
          winner = 'team_a'
        } else if (match.winner_team_id === teamBId) {
          losses++
          winner = 'team_b'
        } else {
          draws++
        }

        return {
          matchId: match.id,
          weekNumber: match.week_number,
          date: match.scheduled_date || '',
          homeTeam: isTeamAHome ? teamA.name : teamB.name,
          awayTeam: isTeamAHome ? teamB.name : teamA.name,
          homeScore: match.home_score || 0,
          awayScore: match.away_score || 0,
          winner
        }
      })

      const lastMatch = matchHistory[matchHistory.length - 1]

      return {
        teamAId,
        teamAName: teamA.name,
        teamBId,
        teamBName: teamB.name,
        wins,
        losses,
        draws,
        pointsFor,
        pointsAgainst,
        avgPointsFor: matches.length > 0 ? pointsFor / matches.length : 0,
        avgPointsAgainst: matches.length > 0 ? pointsAgainst / matches.length : 0,
        totalMatches: matches.length,
        matches: matchHistory,
        lastMeeting: lastMatch ? {
          date: lastMatch.date,
          score: `${lastMatch.homeScore}-${lastMatch.awayScore}`,
          winner: lastMatch.winner === 'team_a' ? teamA.name :
                  lastMatch.winner === 'team_b' ? teamB.name : 'Draw'
        } : undefined
      }
    } catch (error) {
      console.error('Error fetching head-to-head record:', error)
      throw error
    }
  }

  /**
   * Get team form indicator (last 5 matches)
   */
  static async getTeamForm(teamId: string): Promise<TeamFormIndicator | null> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const teamResponse = await supabase
        .from('teams')
        .select('id, name')
        .eq('id', teamId)
        .single() as any

      const team = teamResponse?.data

      if (!team) return null

      // Get last 5 completed matches
      const matchesResponse = await supabase
        .from('matches')
        .select('id, home_team_id, away_team_id, home_score, away_score, winner_team_id')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .eq('status', 'completed')
        .order('week_number', { ascending: false })
        .limit(5) as any

      const matches = matchesResponse?.data

      if (!matches || matches.length === 0) {
        return {
          teamId,
          teamName: team.name,
          form: [],
          formString: 'N/A',
          formType: 'neutral',
          streak: { type: 'win', count: 0, displayText: '-' },
          last5Wins: 0,
          last5Losses: 0,
          last5Draws: 0,
          last5PointsFor: 0,
          last5PointsAgainst: 0
        }
      }

      const form: Array<'W' | 'L' | 'D'> = []
      let wins = 0
      let losses = 0
      let draws = 0
      let pointsFor = 0
      let pointsAgainst = 0

      matches.reverse().forEach((match: any) => {
        const isHome = match.home_team_id === teamId
        const teamScore = isHome ? match.home_score : match.away_score
        const oppScore = isHome ? match.away_score : match.home_score

        pointsFor += teamScore || 0
        pointsAgainst += oppScore || 0

        if (match.winner_team_id === teamId) {
          form.push('W')
          wins++
        } else if (match.winner_team_id && match.winner_team_id !== teamId) {
          form.push('L')
          losses++
        } else {
          form.push('D')
          draws++
        }
      })

      // Determine form type
      let formType: 'hot' | 'neutral' | 'cold' = 'neutral'
      if (wins >= 4) formType = 'hot'
      else if (losses >= 4) formType = 'cold'
      else if (wins >= 3 && losses <= 1) formType = 'hot'
      else if (losses >= 3 && wins <= 1) formType = 'cold'

      // Calculate current streak
      let streakType: 'win' | 'loss' | 'draw' = 'win'
      let streakCount = 0

      if (form.length > 0) {
        const lastResult = form[form.length - 1]
        streakType = lastResult === 'W' ? 'win' : lastResult === 'L' ? 'loss' : 'draw'
        streakCount = 1

        for (let i = form.length - 2; i >= 0; i--) {
          if ((form[i] === 'W' && streakType === 'win') ||
              (form[i] === 'L' && streakType === 'loss') ||
              (form[i] === 'D' && streakType === 'draw')) {
            streakCount++
          } else {
            break
          }
        }
      }

      return {
        teamId,
        teamName: team.name,
        form,
        formString: form.join('-'),
        formType,
        streak: {
          type: streakType,
          count: streakCount,
          displayText: streakCount > 0 ?
            `${streakCount}${streakType === 'win' ? 'W' : streakType === 'loss' ? 'L' : 'D'}` : '-'
        },
        last5Wins: wins,
        last5Losses: losses,
        last5Draws: draws,
        last5PointsFor: pointsFor,
        last5PointsAgainst: pointsAgainst
      }
    } catch (error) {
      console.error('Error fetching team form:', error)
      throw error
    }
  }

  /**
   * Get advanced statistics for a team
   */
  static async getAdvancedTeamStats(teamId: string): Promise<AdvancedTeamStats | null> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const teamResponse = await supabase
        .from('teams')
        .select('id, name')
        .eq('id', teamId)
        .single() as any

      const team = teamResponse?.data

      if (!team) return null

      // Get team standing for W-L-D record
      const standingResponse = await supabase
        .from('standings')
        .select('wins, losses, draws, points_for, points_against')
        .eq('team_id', teamId)
        .single() as any

      const standing = standingResponse?.data

      // Get all completed matches
      const matchesResponse = await supabase
        .from('matches')
        .select('id, home_team_id, away_team_id, home_score, away_score, winner_team_id')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .eq('status', 'completed') as any

      const matches = matchesResponse?.data

      // Get Pokemon KO stats
      const picksResponse = await supabase
        .from('picks')
        .select('id')
        .eq('team_id', teamId) as any

      const picks = picksResponse?.data
      const pickIds = picks?.map((p: any) => p.id) || []

      const kosGivenResponse = await supabase
        .from('match_pokemon_kos')
        .select('ko_count')
        .in('pick_id', pickIds) as any

      const kosGiven = kosGivenResponse?.data

      // Get Pokemon status counts
      const pokemonStatusesResponse = await supabase
        .from('team_pokemon_status')
        .select('status')
        .eq('team_id', teamId) as any

      const pokemonStatuses = pokemonStatusesResponse?.data

      const activePokemon = pokemonStatuses?.filter((p: any) => p.status === 'alive').length || 0
      const faintedPokemon = pokemonStatuses?.filter((p: any) => p.status === 'fainted').length || 0
      const deadPokemon = pokemonStatuses?.filter((p: any) => p.status === 'dead').length || 0
      const totalPokemon = pokemonStatuses?.length || 1

      const totalKOsGiven = kosGiven?.reduce((sum: number, ko: any) => sum + ko.ko_count, 0) || 0

      const wins = standing?.wins || 0
      const losses = standing?.losses || 0
      const draws = standing?.draws || 0
      const matchesPlayed = wins + losses + draws

      const totalPointsFor = standing?.points_for || 0
      const totalPointsAgainst = standing?.points_against || 0
      const pointDifferential = totalPointsFor - totalPointsAgainst

      const avgPointsFor = matchesPlayed > 0 ? totalPointsFor / matchesPlayed : 0
      const avgPointsAgainst = matchesPlayed > 0 ? totalPointsAgainst / matchesPlayed : 0
      const avgKOsGiven = matchesPlayed > 0 ? totalKOsGiven / matchesPlayed : 0

      // Offensive rating: Points per match * (1 + KO efficiency)
      const offensiveRating = avgPointsFor * (1 + avgKOsGiven / 10)

      // Defensive rating: Inverse of points allowed (higher is better)
      const defensiveRating = avgPointsAgainst > 0 ? 100 / avgPointsAgainst : 100

      // Pythagorean expectation: Expected win% based on points scored/allowed
      const pythagoreanExpectation = totalPointsFor > 0 || totalPointsAgainst > 0 ?
        Math.pow(totalPointsFor, 2) / (Math.pow(totalPointsFor, 2) + Math.pow(totalPointsAgainst, 2)) : 0

      return {
        teamId,
        teamName: team.name,
        wins,
        losses,
        draws,
        matchesPlayed,
        totalPointsFor,
        avgPointsFor,
        totalKOsGiven,
        avgKOsGiven,
        offensiveRating,
        totalPointsAgainst,
        avgPointsAgainst,
        totalKOsTaken: 0,  // Would need opponent KO query
        avgKOsTaken: 0,
        defensiveRating,
        pointDifferential,
        avgPointDifferential: matchesPlayed > 0 ? pointDifferential / matchesPlayed : 0,
        pythagoreanExpectation,
        activePokemon,
        faintedPokemon,
        deadPokemon,
        healthyRosterPercentage: (activePokemon / totalPokemon) * 100
      }
    } catch (error) {
      console.error('Error fetching advanced team stats:', error)
      throw error
    }
  }

  /**
   * Get all team forms for a league (for power rankings)
   */
  static async getAllTeamForms(leagueId: string): Promise<TeamFormIndicator[]> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const teamsResponse = await supabase
        .from('teams')
        .select('id')
        .eq('draft_id', leagueId) as any

      const teams = teamsResponse?.data

      if (!teams) return []

      const forms = await Promise.all(
        teams.map((team: any) => this.getTeamForm(team.id))
      )

      return forms.filter((f): f is TeamFormIndicator => f !== null)
    } catch (error) {
      console.error('Error fetching all team forms:', error)
      throw error
    }
  }
}
