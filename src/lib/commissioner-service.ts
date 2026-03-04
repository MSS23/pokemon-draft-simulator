/**
 * Commissioner Service
 *
 * Operations restricted to league commissioners:
 * - Match result overrides
 * - Force advance week
 * - Announcements
 * - Standings adjustments
 */

import { supabase } from './supabase'
import { createLogger } from '@/lib/logger'
import { LeagueService } from './league-service'

const log = createLogger('CommissionerService')

export interface Announcement {
  id: string
  title: string
  body: string
  pinned: boolean
  createdAt: string
}

export class CommissionerService {
  /**
   * Override a match result (commissioner only)
   */
  static async overrideMatchResult(
    matchId: string,
    homeScore: number,
    awayScore: number,
    winnerId: string | null
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const { error } = await supabase
      .from('matches')
      .update({
        home_score: homeScore,
        away_score: awayScore,
        winner_team_id: winnerId,
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId)

    if (error) throw new Error(`Failed to override match: ${error.message}`)

    // Get league ID to recalculate standings
    const { data: match } = await supabase
      .from('matches')
      .select('league_id')
      .eq('id', matchId)
      .single()

    if (match) {
      await LeagueService.recalculateStandings(match.league_id)
    }

    log.info(`Match ${matchId} overridden: ${homeScore}-${awayScore}`)
  }

  /**
   * Force advance week (skips incomplete match check)
   */
  static async forceAdvanceWeek(leagueId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const { data: league } = await supabase
      .from('leagues')
      .select('current_week, total_weeks')
      .eq('id', leagueId)
      .single()

    if (!league) throw new Error('League not found')

    // Cancel any incomplete matches for the current week
    await supabase
      .from('matches')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('league_id', leagueId)
      .eq('week_number', league.current_week)
      .eq('status', 'scheduled')

    const nextWeek = league.current_week + 1

    if (nextWeek > league.total_weeks) {
      await supabase
        .from('leagues')
        .update({
          status: 'completed',
          end_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', leagueId)
    } else {
      await supabase
        .from('leagues')
        .update({
          current_week: nextWeek,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leagueId)
    }

    log.info(`League ${leagueId} force-advanced to week ${nextWeek}`)
  }

  /**
   * Get league announcements (stored in league settings JSONB)
   */
  static async getAnnouncements(leagueId: string): Promise<Announcement[]> {
    if (!supabase) throw new Error('Supabase not available')

    const { data } = await supabase
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .single()

    const settings = (data?.settings || {}) as Record<string, unknown>
    return (settings.announcements || []) as Announcement[]
  }

  /**
   * Post an announcement
   */
  static async postAnnouncement(
    leagueId: string,
    title: string,
    body: string,
    pinned: boolean = false
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const announcements = await this.getAnnouncements(leagueId)

    const newAnnouncement: Announcement = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      body,
      pinned,
      createdAt: new Date().toISOString(),
    }

    const updated = [newAnnouncement, ...announcements]

    const settings = await LeagueService.getLeagueSettings(leagueId)
    const { error } = await supabase
      .from('leagues')
      .update({
        settings: { ...settings, announcements: updated },
        updated_at: new Date().toISOString(),
      })
      .eq('id', leagueId)

    if (error) throw new Error(`Failed to post announcement: ${error.message}`)
  }

  /**
   * Delete an announcement
   */
  static async deleteAnnouncement(leagueId: string, announcementId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const announcements = await this.getAnnouncements(leagueId)
    const updated = announcements.filter(a => a.id !== announcementId)

    const settings = await LeagueService.getLeagueSettings(leagueId)
    const { error } = await supabase
      .from('leagues')
      .update({
        settings: { ...settings, announcements: updated },
        updated_at: new Date().toISOString(),
      })
      .eq('id', leagueId)

    if (error) throw new Error(`Failed to delete announcement: ${error.message}`)
  }

  /**
   * Toggle pin on an announcement
   */
  static async togglePinAnnouncement(leagueId: string, announcementId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const announcements = await this.getAnnouncements(leagueId)
    const updated = announcements.map(a =>
      a.id === announcementId ? { ...a, pinned: !a.pinned } : a
    )

    const settings = await LeagueService.getLeagueSettings(leagueId)
    const { error } = await supabase
      .from('leagues')
      .update({
        settings: { ...settings, announcements: updated },
        updated_at: new Date().toISOString(),
      })
      .eq('id', leagueId)

    if (error) throw new Error(`Failed to toggle pin: ${error.message}`)
  }

  /**
   * Adjust team standings points manually
   */
  static async adjustStandingsPoints(
    leagueId: string,
    teamId: string,
    winsAdjust: number,
    lossesAdjust: number
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get current standing
    const { data: standing } = await supabase
      .from('standings')
      .select('*')
      .eq('league_id', leagueId)
      .eq('team_id', teamId)
      .single()

    if (!standing) throw new Error('Standing not found')

    const { error } = await supabase
      .from('standings')
      .update({
        wins: standing.wins + winsAdjust,
        losses: standing.losses + lossesAdjust,
        updated_at: new Date().toISOString(),
      })
      .eq('league_id', leagueId)
      .eq('team_id', teamId)

    if (error) throw new Error(`Failed to adjust standings: ${error.message}`)

    log.info(`Standings adjusted for team ${teamId}: +${winsAdjust}W, +${lossesAdjust}L`)
  }

  /**
   * Get all matches for a league with full details
   */
  static async getAllMatches(leagueId: string): Promise<Array<{
    id: string
    weekNumber: number
    status: string
    homeTeamId: string
    awayTeamId: string
    homeTeamName: string
    awayTeamName: string
    homeScore: number
    awayScore: number
    winnerTeamId: string | null
  }>> {
    if (!supabase) throw new Error('Supabase not available')

    type MatchWithTeams = {
      id: string
      week_number: number
      status: string
      home_team_id: string
      away_team_id: string
      home_score: number
      away_score: number
      winner_team_id: string | null
      home_team: { name: string }
      away_team: { name: string }
    }

    const { data, error } = await supabase
      .from('matches')
      .select('id, week_number, status, home_team_id, away_team_id, home_score, away_score, winner_team_id, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)')
      .eq('league_id', leagueId)
      .order('week_number', { ascending: true })

    if (error) throw new Error(`Failed to get matches: ${error.message}`)

    return ((data || []) as unknown as MatchWithTeams[]).map(m => ({
      id: m.id,
      weekNumber: m.week_number,
      status: m.status,
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      homeTeamName: m.home_team.name,
      awayTeamName: m.away_team.name,
      homeScore: m.home_score || 0,
      awayScore: m.away_score || 0,
      winnerTeamId: m.winner_team_id,
    }))
  }
}
