/**
 * Weekly Highlights Service
 *
 * Manages weekly summaries and highlights for league play.
 * Automatically generates summaries when weeks complete.
 */

import { supabase } from './supabase'
import type { Pick } from '@/types'

export interface WeeklySummary {
  id: string
  leagueId: string
  weekNumber: number

  headline?: string
  summaryText?: string

  topPerformerTeamId?: string
  topPerformerReason?: string

  mostKosPokemonId?: string
  mostKosPickId?: string
  mostKosCount: number

  biggestUpsetMatchId?: string
  biggestUpsetDescription?: string

  totalMatches: number
  totalKos: number
  totalDeaths: number
  totalTrades: number

  createdAt: string
  updatedAt: string
}

export interface WeeklyHighlight {
  id: string
  leagueId: string
  weekNumber: number

  type: 'top_performance' | 'upset_victory' | 'dominant_win' | 'comeback_win' |
        'high_scoring' | 'shutout' | 'pokemon_milestone' | 'team_milestone' |
        'tragic_death' | 'blockbuster_trade'

  title: string
  description: string
  icon?: string

  teamId?: string
  matchId?: string
  pickId?: string
  tradeId?: string

  displayOrder: number
  isPinned: boolean

  createdAt: string
  updatedAt: string
}

export class WeeklyHighlightsService {
  /**
   * Generate weekly summary for a completed week
   */
  static async generateWeeklySummary(leagueId: string, weekNumber: number): Promise<WeeklySummary | null> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      // Call database function to generate summary
      const { data, error } = await (supabase as any)
        .rpc('generate_week_summary', {
          p_league_id: leagueId,
          p_week_number: weekNumber
        })

      if (error) throw error

      // Fetch the generated summary
      return await this.getWeeklySummary(leagueId, weekNumber)
    } catch (error) {
      console.error('Error generating weekly summary:', error)
      throw error
    }
  }

  /**
   * Get weekly summary for a specific week
   */
  static async getWeeklySummary(leagueId: string, weekNumber: number): Promise<WeeklySummary | null> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const { data, error } = await (supabase as any)
        .from('weekly_summaries')
        .select('*')
        .eq('league_id', leagueId)
        .eq('week_number', weekNumber)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null // Not found
        throw error
      }

      return {
        id: data.id,
        leagueId: data.league_id,
        weekNumber: data.week_number,
        headline: data.headline,
        summaryText: data.summary_text,
        topPerformerTeamId: data.top_performer_team_id,
        topPerformerReason: data.top_performer_reason,
        mostKosPokemonId: data.most_kos_pokemon_id,
        mostKosPickId: data.most_kos_pick_id,
        mostKosCount: data.most_kos_count || 0,
        biggestUpsetMatchId: data.biggest_upset_match_id,
        biggestUpsetDescription: data.biggest_upset_description,
        totalMatches: data.total_matches || 0,
        totalKos: data.total_kos || 0,
        totalDeaths: data.total_deaths || 0,
        totalTrades: data.total_trades || 0,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }
    } catch (error) {
      console.error('Error fetching weekly summary:', error)
      throw error
    }
  }

  /**
   * Get all highlights for a specific week
   */
  static async getWeeklyHighlights(leagueId: string, weekNumber: number): Promise<WeeklyHighlight[]> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const { data, error } = await (supabase as any)
        .from('weekly_highlights')
        .select('*')
        .eq('league_id', leagueId)
        .eq('week_number', weekNumber)
        .order('is_pinned', { ascending: false })
        .order('display_order', { ascending: true })

      if (error) throw error

      return (data || []).map((h: any) => ({
        id: h.id,
        leagueId: h.league_id,
        weekNumber: h.week_number,
        type: h.type,
        title: h.title,
        description: h.description,
        icon: h.icon,
        teamId: h.team_id,
        matchId: h.match_id,
        pickId: h.pick_id,
        tradeId: h.trade_id,
        displayOrder: h.display_order,
        isPinned: h.is_pinned,
        createdAt: h.created_at,
        updatedAt: h.updated_at
      }))
    } catch (error) {
      console.error('Error fetching weekly highlights:', error)
      throw error
    }
  }

  /**
   * Create a custom highlight
   */
  static async createHighlight(
    leagueId: string,
    weekNumber: number,
    highlight: {
      type: WeeklyHighlight['type']
      title: string
      description: string
      icon?: string
      teamId?: string
      matchId?: string
      pickId?: string
      tradeId?: string
      isPinned?: boolean
    }
  ): Promise<WeeklyHighlight> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const { data, error } = await (supabase as any)
        .from('weekly_highlights')
        .insert({
          league_id: leagueId,
          week_number: weekNumber,
          type: highlight.type,
          title: highlight.title,
          description: highlight.description,
          icon: highlight.icon,
          team_id: highlight.teamId,
          match_id: highlight.matchId,
          pick_id: highlight.pickId,
          trade_id: highlight.tradeId,
          is_pinned: highlight.isPinned || false
        })
        .select()
        .single()

      if (error) throw error

      return {
        id: data.id,
        leagueId: data.league_id,
        weekNumber: data.week_number,
        type: data.type,
        title: data.title,
        description: data.description,
        icon: data.icon,
        teamId: data.team_id,
        matchId: data.match_id,
        pickId: data.pick_id,
        tradeId: data.trade_id,
        displayOrder: data.display_order,
        isPinned: data.is_pinned,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }
    } catch (error) {
      console.error('Error creating highlight:', error)
      throw error
    }
  }

  /**
   * Auto-generate highlights based on match results
   */
  static async autoGenerateHighlights(leagueId: string, weekNumber: number): Promise<WeeklyHighlight[]> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    const highlights: WeeklyHighlight[] = []

    try {
      // Get all completed matches for the week
      const { data: matches } = await (supabase as any)
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(id, name),
          away_team:teams!matches_away_team_id_fkey(id, name)
        `)
        .eq('league_id', leagueId)
        .eq('week_number', weekNumber)
        .eq('status', 'completed')

      if (!matches || matches.length === 0) return []

      for (const match of matches) {
        const homeScore = match.home_score || 0
        const awayScore = match.away_score || 0
        const scoreDiff = Math.abs(homeScore - awayScore)

        // Dominant win (3+ game difference)
        if (scoreDiff >= 3) {
          const winner = match.winner_team_id === match.home_team_id
            ? match.home_team
            : match.away_team
          const loser = match.winner_team_id === match.home_team_id
            ? match.away_team
            : match.home_team

          const highlight = await this.createHighlight(leagueId, weekNumber, {
            type: 'dominant_win',
            title: `${winner.name} Dominates!`,
            description: `${winner.name} crushes ${loser.name} ${homeScore}-${awayScore} in a dominant performance`,
            icon: '💪',
            teamId: winner.id,
            matchId: match.id
          })
          highlights.push(highlight)
        }

        // High scoring match (8+ total games)
        if (homeScore + awayScore >= 8) {
          const highlight = await this.createHighlight(leagueId, weekNumber, {
            type: 'high_scoring',
            title: 'Epic Battle!',
            description: `${match.home_team.name} and ${match.away_team.name} put on a show with a ${homeScore}-${awayScore} thriller`,
            icon: '🔥',
            matchId: match.id
          })
          highlights.push(highlight)
        }

        // Shutout
        if (homeScore === 0 || awayScore === 0) {
          const winner = homeScore > 0 ? match.home_team : match.away_team
          const highlight = await this.createHighlight(leagueId, weekNumber, {
            type: 'shutout',
            title: 'Perfect Defense!',
            description: `${winner.name} delivers a flawless shutout victory`,
            icon: '🛡️',
            teamId: winner.id,
            matchId: match.id
          })
          highlights.push(highlight)
        }
      }

      // Get Pokemon with most KOs this week
      const { data: topKOs } = await (supabase as any)
        .from('match_pokemon_kos')
        .select(`
          pick_id,
          ko_count,
          matches!inner(league_id, week_number),
          picks!inner(pokemon_name, team_id, teams(name))
        `)
        .eq('matches.league_id', leagueId)
        .eq('matches.week_number', weekNumber)
        .order('ko_count', { ascending: false })
        .limit(1)
        .single()

      if (topKOs) {
        const highlight = await this.createHighlight(leagueId, weekNumber, {
          type: 'pokemon_milestone',
          title: 'KO Leader!',
          description: `${topKOs.picks.pokemon_name} from ${topKOs.picks.teams.name} racks up ${topKOs.ko_count} KOs this week`,
          icon: '⚡',
          pickId: topKOs.pick_id,
          teamId: topKOs.picks.team_id
        })
        highlights.push(highlight)
      }

      // Check for deaths (Nuzlocke)
      const { data: deaths } = await (supabase as any)
        .from('match_pokemon_kos')
        .select(`
          pick_id,
          matches!inner(league_id, week_number),
          picks!inner(pokemon_name, team_id, teams(name))
        `)
        .eq('matches.league_id', leagueId)
        .eq('matches.week_number', weekNumber)
        .eq('is_death', true)

      if (deaths && deaths.length > 0) {
        for (const death of deaths) {
          const highlight = await this.createHighlight(leagueId, weekNumber, {
            type: 'tragic_death',
            title: 'Fallen Warrior',
            description: `RIP ${death.picks.pokemon_name} from ${death.picks.teams.name} - taken too soon`,
            icon: '💀',
            pickId: death.pick_id,
            teamId: death.picks.team_id
          })
          highlights.push(highlight)
        }
      }

      return highlights
    } catch (error) {
      console.error('Error auto-generating highlights:', error)
      return highlights
    }
  }

  /**
   * Get all summaries for a league (for history view)
   */
  static async getLeagueSummaries(leagueId: string): Promise<WeeklySummary[]> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const { data, error } = await (supabase as any)
        .from('weekly_summaries')
        .select('*')
        .eq('league_id', leagueId)
        .order('week_number', { ascending: false })

      if (error) throw error

      return (data || []).map((d: any) => ({
        id: d.id,
        leagueId: d.league_id,
        weekNumber: d.week_number,
        headline: d.headline,
        summaryText: d.summary_text,
        topPerformerTeamId: d.top_performer_team_id,
        topPerformerReason: d.top_performer_reason,
        mostKosPokemonId: d.most_kos_pokemon_id,
        mostKosPickId: d.most_kos_pick_id,
        mostKosCount: d.most_kos_count || 0,
        biggestUpsetMatchId: d.biggest_upset_match_id,
        biggestUpsetDescription: d.biggest_upset_description,
        totalMatches: d.total_matches || 0,
        totalKos: d.total_kos || 0,
        totalDeaths: d.total_deaths || 0,
        totalTrades: d.total_trades || 0,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }))
    } catch (error) {
      console.error('Error fetching league summaries:', error)
      throw error
    }
  }
}
