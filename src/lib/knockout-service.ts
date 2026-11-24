import { supabase } from './supabase'
import type { League, Team, Match, Pick } from '@/types'
import type { LeagueRow, MatchRow, TeamRow, PickRow } from '@/types/supabase-helpers'
import type { Tournament } from './tournament-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('KnockoutService')

function mapMatchRow(m: MatchRow): Match {
  return {
    id: m.id,
    leagueId: m.league_id,
    weekNumber: m.week_number,
    matchNumber: m.match_number,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    scheduledDate: m.scheduled_date,
    status: m.status,
    homeScore: m.home_score,
    awayScore: m.away_score,
    winnerTeamId: m.winner_team_id,
    battleFormat: m.battle_format,
    notes: m.notes,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    completedAt: m.completed_at,
  }
}

function mapLeagueRow(row: LeagueRow): League {
  return {
    id: row.id,
    draftId: row.draft_id,
    name: row.name,
    leagueType: row.league_type,
    seasonNumber: row.season_number,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    currentWeek: row.current_week,
    totalWeeks: row.total_weeks,
    settings: row.settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class KnockoutService {
  /** Max supported players */
  static readonly MAX_PLAYERS = 32

  /**
   * Create a knockout tournament from a completed draft. Runs server-side
   * (host check + idempotent reconcile on retry); see
   * /api/tournament/create-from-draft.
   */
  static async createFromDraft(
    draftId: string,
    config: {
      name: string
      matchFormat?: 'best_of_1' | 'best_of_3'
      seedByDraftOrder?: boolean
    }
  ): Promise<{ league: League; tournament: Tournament }> {
    const response = await fetch('/api/tournament/create-from-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId, ...config }),
    })
    const payload = await response.json().catch(() => null) as
      { league?: LeagueRow; tournament?: Tournament; error?: string } | null
    if (!response.ok || !payload?.league || !payload.tournament) {
      throw new Error(payload?.error || 'Failed to create tournament')
    }

    // Initialize Pokemon status
    try {
      const { LeagueService } = await import('./league-service')
      await LeagueService.initializeLeaguePokemonStatus(payload.league.id)
    } catch (err) {
      log.error('Failed to initialize Pokemon status:', err)
    }

    return { league: mapLeagueRow(payload.league), tournament: payload.tournament }
  }

  /**
   * Get tournament state for a league
   */
  static async getTournament(leagueId: string): Promise<Tournament | null> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .maybeSingle()

    if (error) throw new Error(`Could not load tournament: ${error.message}`)
    if (!data?.settings) return null
    const settings = data.settings as Record<string, unknown>
    if (!settings.tournament) return null

    const t = settings.tournament as Tournament
    // Restore Date objects
    t.createdAt = new Date(t.createdAt)
    if (t.startedAt) t.startedAt = new Date(t.startedAt)
    if (t.completedAt) t.completedAt = new Date(t.completedAt)

    return t
  }

  /**
   * Get tournament with full league data
   */
  static async getFullTournament(leagueId: string): Promise<{
    league: League & { teams: Team[] }
    tournament: Tournament
    matches: (Match & { homeTeam: Team; awayTeam: Team })[]
  } | null> {
    if (!supabase) throw new Error('Supabase not configured')

    // Fetch league with teams
    const { data: rawLeague, error: leagueError } = await supabase
      .from('leagues')
      .select('*, league_teams(team:teams(*))')
      .eq('id', leagueId)
      .maybeSingle()

    if (leagueError) throw new Error(`Could not load tournament: ${leagueError.message}`)
    if (!rawLeague) return null

    const leagueRow = rawLeague as unknown as LeagueRow & {
      league_teams: Array<{ team: TeamRow }>
    }

    const teams: Team[] = leagueRow.league_teams.map(lt => ({
      id: lt.team.id,
      draftId: lt.team.draft_id,
      name: lt.team.name,
      ownerId: lt.team.owner_id,
      budgetRemaining: lt.team.budget_remaining,
      draftOrder: lt.team.draft_order,
      undosRemaining: lt.team.undos_remaining,
      picks: [],
    }))

    const league: League & { teams: Team[] } = {
      ...mapLeagueRow(leagueRow),
      teams,
    }

    // Get tournament state
    const settings = leagueRow.settings as Record<string, unknown>
    if (!settings?.tournament) return null

    const tournament = settings.tournament as Tournament
    tournament.createdAt = new Date(tournament.createdAt)
    if (tournament.startedAt) tournament.startedAt = new Date(tournament.startedAt)
    if (tournament.completedAt) tournament.completedAt = new Date(tournament.completedAt)

    // Get matches
    const { data: rawMatchRows, error: matchesError } = await supabase
      .from('matches')
      .select('id, league_id, week_number, match_number, home_team_id, away_team_id, scheduled_date, status, home_score, away_score, winner_team_id, battle_format, youtube_url, notes, created_at, updated_at, completed_at')
      .eq('league_id', leagueId)
      .order('week_number')
      .order('match_number')

    if (matchesError) throw new Error(`Could not load tournament matches: ${matchesError.message}`)

    const teamMap = new Map(teams.map(t => [t.id, t]))
    const defaultTeam = (id: string): Team => ({
      id, draftId: '', name: 'Unknown', ownerId: null,
      budgetRemaining: 0, draftOrder: 0, undosRemaining: 0, picks: [],
    })
    const matches = (rawMatchRows || []).map((m: MatchRow) => ({
      ...mapMatchRow(m),
      homeTeam: teamMap.get(m.home_team_id) || defaultTeam(m.home_team_id),
      awayTeam: teamMap.get(m.away_team_id) || defaultTeam(m.away_team_id),
    }))

    return { league, tournament, matches }
  }

  /**
   * Report a knockout match result and advance the bracket
   */
  static async reportResult(
    leagueId: string,
    matchId: string,
    winnerId: string,
    score: { home: number; away: number }
  ): Promise<Tournament> {
    // Server-side: leagues.settings (where the bracket lives) is
    // commissioner-only under RLS, so a participant's client-side save
    // silently updated 0 rows and the bracket never advanced. The API route
    // verifies the caller is in the match (or is the host) and persists with
    // the service role.
    const response = await fetch('/api/tournament/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagueId, matchId, winnerId, score }),
    })

    const payload = await response.json().catch(() => null) as { tournament?: Tournament; error?: string } | null
    if (!response.ok || !payload?.tournament) {
      throw new Error(payload?.error || 'Failed to report match result')
    }
    return payload.tournament
  }

  /**
   * Check if user is the tournament commissioner
   */
  static async isCommissioner(leagueId: string, userId: string): Promise<boolean> {
    if (!supabase) return false

    const { data, error } = await supabase
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .maybeSingle()

    if (error) {
      log.warn('Could not check tournament commissioner:', error)
      return false
    }
    if (!data?.settings) return false
    const settings = data.settings as Record<string, unknown>
    return settings.commissionerId === userId
  }

  /**
   * Get team rosters (picks) for the tournament
   */
  static async getTeamPicks(teamIds: string[]): Promise<Record<string, Pick[]>> {
    if (!supabase) return {}

    const { data } = await supabase
      .from('picks')
      .select('id, draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round, created_at')
      .in('team_id', teamIds)
      .order('pick_order')

    if (!data) return {}

    const result: Record<string, Pick[]> = {}
    for (const row of data as PickRow[]) {
      const pick: Pick = {
        id: row.id,
        draftId: row.draft_id,
        teamId: row.team_id,
        pokemonId: row.pokemon_id,
        pokemonName: row.pokemon_name,
        cost: row.cost,
        pickOrder: row.pick_order,
        round: row.round,
        createdAt: row.created_at,
      }
      if (!result[pick.teamId]) result[pick.teamId] = []
      result[pick.teamId].push(pick)
    }

    return result
  }
}
