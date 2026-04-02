import { supabase } from './supabase'
import type { League, Team, Match, Pick } from '@/types'
import type { LeagueRow, MatchRow, TeamRow, PickRow } from '@/types/supabase-helpers'
import {
  createTournament,
  startTournament,
  reportMatchResult,
  type Tournament,
  type TournamentFormat,
} from './tournament-service'
import { generateRoomCode } from '@/lib/room-utils'
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

type DraftWithTeams = { id: string; name: string; status: string; host_id: string; room_code: string | null; teams: TeamRow[] }

export class KnockoutService {
  /** Max supported players */
  static readonly MAX_PLAYERS = 32

  /**
   * Create a tournament lobby. Players join via room code.
   * No bracket is generated yet — that happens when the host starts.
   */
  static async createLobby(config: {
    name: string
    formatId: string
    tournamentType: 'single-elimination' | 'double-elimination'
    matchFormat: 'best_of_1' | 'best_of_3'
    hostId: string
    hostName: string
  }): Promise<{ league: League; roomCode: string }> {
    if (!supabase) throw new Error('Supabase not configured')

    const roomCode = generateRoomCode()

    // Create a placeholder draft for the FK constraint
    const { data: draftRow, error: draftError } = await supabase
      .from('drafts')
      .insert({
        name: `${config.name}`,
        host_id: config.hostId,
        format: 'snake',
        ruleset: config.formatId,
        budget_per_team: 0,
        max_teams: this.MAX_PLAYERS,
        status: 'setup',
        room_code: roomCode,
        settings: {
          draftType: 'points',
          formatId: config.formatId,
          tournamentOnly: true,
        } as Record<string, unknown>,
      })
      .select()
      .single()

    if (draftError || !draftRow) {
      log.error('Failed to create draft for tournament:', draftError)
      throw new Error('Failed to create tournament lobby')
    }

    // Create host's team
    const { error: teamError } = await supabase
      .from('teams')
      .insert({
        draft_id: draftRow.id,
        name: config.hostName,
        owner_id: config.hostId,
        budget_remaining: 0,
        draft_order: 1,
        undos_remaining: 0,
      })

    if (teamError) {
      log.error('Failed to create host team:', teamError)
    }

    // Create league in setup status (no bracket yet)
    const { data: leagueRow, error: leagueError } = await supabase
      .from('leagues')
      .insert({
        draft_id: draftRow.id,
        name: config.name,
        league_type: 'knockout',
        status: 'scheduled',
        current_week: 0,
        total_weeks: 0,
        settings: {
          matchFormat: config.matchFormat,
          tournamentType: config.tournamentType,
          commissionerId: config.hostId,
          formatId: config.formatId,
          roomCode,
        },
      })
      .select()
      .single()

    if (leagueError || !leagueRow) {
      log.error('Failed to create league:', leagueError)
      throw new Error('Failed to create tournament')
    }

    return {
      league: mapLeagueRow(leagueRow),
      roomCode,
    }
  }

  /**
   * Join a tournament lobby by room code
   */
  static async joinTournament(config: {
    roomCode: string
    playerName: string
    userId: string
  }): Promise<{ league: League; teamId: string }> {
    if (!supabase) throw new Error('Supabase not configured')

    // Find the draft by room code
    const { data: draftRow, error: draftErr } = await supabase
      .from('drafts')
      .select('id, name, host_id, status, settings')
      .eq('room_code', config.roomCode.toUpperCase())
      .is('deleted_at', null)
      .single()

    if (draftErr || !draftRow) throw new Error('Tournament not found. Check your room code.')

    const settings = (draftRow.settings ?? {}) as Record<string, unknown>
    if (!settings.tournamentOnly) throw new Error('This is a draft room, not a tournament.')

    // Find the league
    const { data: leagueRow, error: leagueErr } = await supabase
      .from('leagues')
      .select('id, draft_id, name, league_type, battle_type, season_number, status, start_date, end_date, current_week, total_weeks, settings, created_at, updated_at')
      .eq('draft_id', draftRow.id)
      .single()

    if (leagueErr || !leagueRow) throw new Error('Tournament not found')
    if (leagueRow.status !== 'scheduled') throw new Error('Tournament has already started')

    // Check if already joined
    const { data: existingTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('draft_id', draftRow.id)
      .eq('owner_id', config.userId)
      .maybeSingle()

    if (existingTeam) throw new Error('You have already joined this tournament')

    // Count current players
    const { count } = await supabase
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('draft_id', draftRow.id)

    if ((count ?? 0) >= this.MAX_PLAYERS) throw new Error('Tournament is full')

    // Create team
    const { data: teamRow, error: teamErr } = await supabase
      .from('teams')
      .insert({
        draft_id: draftRow.id,
        name: config.playerName.trim(),
        owner_id: config.userId,
        budget_remaining: 0,
        draft_order: (count ?? 0) + 1,
        undos_remaining: 0,
      })
      .select()
      .single()

    if (teamErr || !teamRow) throw new Error('Failed to join tournament')

    return {
      league: mapLeagueRow(leagueRow),
      teamId: teamRow.id,
    }
  }

  /**
   * Start the tournament — generates bracket from joined players
   */
  static async beginTournament(leagueId: string, hostId: string): Promise<{ league: League; tournament: Tournament }> {
    if (!supabase) throw new Error('Supabase not configured')

    // Fetch league
    const { data: leagueRow } = await supabase
      .from('leagues')
      .select('id, draft_id, name, league_type, battle_type, season_number, status, start_date, end_date, current_week, total_weeks, settings, created_at, updated_at')
      .eq('id', leagueId)
      .single()

    if (!leagueRow) throw new Error('Tournament not found')

    const settings = (leagueRow.settings ?? {}) as Record<string, unknown>
    if (settings.commissionerId !== hostId) throw new Error('Only the host can start the tournament')
    if (leagueRow.status !== 'scheduled') throw new Error('Tournament has already started')

    // Get teams
    const { data: teamRows } = await supabase
      .from('teams')
      .select('id, draft_id, name, owner_id, budget_remaining, draft_order, undos_remaining, created_at')
      .eq('draft_id', leagueRow.draft_id)
      .order('draft_order')

    if (!teamRows || teamRows.length < 2) throw new Error('Need at least 2 players to start')

    // Build bracket
    const tournamentType = (settings.tournamentType as TournamentFormat) || 'single-elimination'
    const matchFormat = (settings.matchFormat as string) || 'best_of_3'

    const participants = teamRows.map((t: TeamRow, i: number) => ({
      id: t.id,
      name: t.name,
      teamId: t.id,
      seed: i + 1,
    }))

    let tournament = createTournament(leagueRow.name, tournamentType, participants)
    tournament = startTournament(tournament)

    const totalRounds = Math.ceil(Math.log2(teamRows.length))

    // Update league to active
    const { data: updatedLeague, error: updateErr } = await supabase
      .from('leagues')
      .update({
        status: 'active',
        current_week: 1,
        total_weeks: totalRounds,
        settings: {
          ...settings,
          tournament: JSON.parse(JSON.stringify(tournament)),
        },
      })
      .eq('id', leagueId)
      .select()
      .single()

    if (updateErr || !updatedLeague) throw new Error('Failed to start tournament')

    // Update draft to completed
    await supabase
      .from('drafts')
      .update({ status: 'completed' })
      .eq('id', leagueRow.draft_id)

    // Add league_teams entries
    const leagueTeams = teamRows.map((t: TeamRow, i: number) => ({
      league_id: leagueId,
      team_id: t.id,
      seed: i + 1,
    }))

    await supabase.from('league_teams').insert(leagueTeams)

    // Sync bracket matches to DB
    await this.syncMatchesToDb(leagueId, tournament, matchFormat)

    return {
      league: mapLeagueRow(updatedLeague),
      tournament,
    }
  }

  /**
   * Get the lobby info for a tournament (before it starts)
   */
  static async getLobbyByRoomCode(roomCode: string): Promise<{
    league: League
    players: { id: string; name: string; ownerId: string | null }[]
    roomCode: string
  } | null> {
    if (!supabase) return null

    const { data: draftRow } = await supabase
      .from('drafts')
      .select('id')
      .eq('room_code', roomCode.toUpperCase())
      .is('deleted_at', null)
      .single()

    if (!draftRow) return null

    const { data: leagueRow } = await supabase
      .from('leagues')
      .select('id, draft_id, name, league_type, battle_type, season_number, status, start_date, end_date, current_week, total_weeks, settings, created_at, updated_at')
      .eq('draft_id', draftRow.id)
      .single()

    if (!leagueRow) return null

    const { data: teamRows } = await supabase
      .from('teams')
      .select('id, name, owner_id')
      .eq('draft_id', draftRow.id)
      .order('draft_order')

    return {
      league: mapLeagueRow(leagueRow),
      players: (teamRows || []).map(t => ({ id: t.id, name: t.name, ownerId: t.owner_id })),
      roomCode: roomCode.toUpperCase(),
    }
  }

  /**
   * Create a knockout tournament from a completed draft
   */
  static async createFromDraft(
    draftId: string,
    config: {
      name: string
      matchFormat?: 'best_of_1' | 'best_of_3'
      seedByDraftOrder?: boolean
    }
  ): Promise<{ league: League; tournament: Tournament }> {
    if (!supabase) throw new Error('Supabase not configured')

    // Guard: prevent duplicate
    const { data: existing } = await supabase
      .from('leagues')
      .select('id')
      .eq('draft_id', draftId)
      .limit(1)
      .maybeSingle()

    if (existing) throw new Error('A league or tournament already exists for this draft')

    // Fetch draft + teams
    const { data: rawDraft } = await supabase
      .from('drafts')
      .select('*, teams(*)')
      .eq('id', draftId)
      .single()

    if (!rawDraft) throw new Error('Draft not found')
    const draft = rawDraft as unknown as DraftWithTeams
    if (draft.status !== 'completed') throw new Error('Draft must be completed')

    const teams: Team[] = draft.teams.map((t: TeamRow) => ({
      id: t.id,
      draftId: t.draft_id,
      name: t.name,
      ownerId: t.owner_id,
      budgetRemaining: t.budget_remaining,
      draftOrder: t.draft_order,
      undosRemaining: t.undos_remaining,
      picks: [],
    }))

    if (teams.length < 2) throw new Error('Need at least 2 teams')
    if (teams.length > this.MAX_PLAYERS) throw new Error(`Max ${this.MAX_PLAYERS} teams supported`)

    // Sort by draft order for seeding
    const sorted = config.seedByDraftOrder !== false
      ? [...teams].sort((a, b) => a.draftOrder - b.draftOrder)
      : teams

    // Create tournament bracket
    const participants = sorted.map((t, i) => ({
      id: t.id,
      name: t.name,
      teamId: t.id,
      seed: i + 1,
    }))

    let tournament = createTournament(config.name, 'single-elimination', participants)
    tournament = startTournament(tournament)

    // Calculate total rounds
    const totalRounds = Math.ceil(Math.log2(teams.length))

    // Create league row
    const { data: leagueRow, error: leagueError } = await supabase
      .from('leagues')
      .insert({
        draft_id: draftId,
        name: config.name,
        league_type: 'knockout',
        status: 'active',
        current_week: 1,
        total_weeks: totalRounds,
        settings: {
          matchFormat: config.matchFormat || 'best_of_3',
          commissionerId: draft.host_id,
          tournament: JSON.parse(JSON.stringify(tournament)),
        },
      })
      .select()
      .single()

    if (leagueError || !leagueRow) throw new Error('Failed to create tournament')

    // Add teams
    const leagueTeams = sorted.map((team, index) => ({
      league_id: leagueRow.id,
      team_id: team.id,
      seed: index + 1,
    }))

    const { error: teamsError } = await supabase
      .from('league_teams')
      .insert(leagueTeams)

    if (teamsError) throw new Error('Failed to add teams to tournament')

    // Create match rows for round 1 (pending matches only)
    await this.syncMatchesToDb(leagueRow.id, tournament, config.matchFormat || 'best_of_3')

    // Initialize Pokemon status
    try {
      const { LeagueService } = await import('./league-service')
      await LeagueService.initializeLeaguePokemonStatus(leagueRow.id)
    } catch (err) {
      log.error('Failed to initialize Pokemon status:', err)
    }

    return {
      league: mapLeagueRow(leagueRow),
      tournament,
    }
  }

  /**
   * Get tournament state for a league
   */
  static async getTournament(leagueId: string): Promise<Tournament | null> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data } = await supabase
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .single()

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
    const { data: rawLeague } = await supabase
      .from('leagues')
      .select('*, league_teams(team:teams(*))')
      .eq('id', leagueId)
      .single()

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
    const { data: rawMatchRows } = await supabase
      .from('matches')
      .select('id, league_id, week_number, match_number, home_team_id, away_team_id, scheduled_date, status, home_score, away_score, winner_team_id, battle_format, youtube_url, notes, created_at, updated_at, completed_at')
      .eq('league_id', leagueId)
      .order('week_number')
      .order('match_number')

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
    if (!supabase) throw new Error('Supabase not configured')

    // Get current tournament state
    const tournament = await this.getTournament(leagueId)
    if (!tournament) throw new Error('Tournament not found')

    // Find the tournament match that corresponds to this DB match
    const { data: dbMatch } = await supabase
      .from('matches')
      .select('id, league_id, week_number, match_number, home_team_id, away_team_id, scheduled_date, status, home_score, away_score, winner_team_id, battle_format, youtube_url, notes, created_at, updated_at, completed_at')
      .eq('id', matchId)
      .single()

    if (!dbMatch) throw new Error('Match not found')

    // Find the tournament bracket match by participants
    const tournamentMatch = tournament.rounds
      .flatMap(r => r.matches)
      .find(m =>
        (m.participant1?.teamId === dbMatch.home_team_id && m.participant2?.teamId === dbMatch.away_team_id) ||
        (m.participant1?.teamId === dbMatch.away_team_id && m.participant2?.teamId === dbMatch.home_team_id)
      )

    if (!tournamentMatch) throw new Error('Bracket match not found')

    // Report result in tournament logic
    const p1Score = tournamentMatch.participant1?.teamId === dbMatch.home_team_id ? score.home : score.away
    const p2Score = tournamentMatch.participant1?.teamId === dbMatch.home_team_id ? score.away : score.home

    const updated = reportMatchResult(tournament, tournamentMatch.id, winnerId, {
      participant1: p1Score,
      participant2: p2Score,
    })

    // Update DB match
    const { error: matchError } = await supabase
      .from('matches')
      .update({
        status: 'completed',
        home_score: score.home,
        away_score: score.away,
        winner_team_id: winnerId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', matchId)

    if (matchError) throw new Error('Failed to update match')

    // Determine current round from tournament state
    const currentRound = this.getCurrentRound(updated)

    // Update settings JSONB — read current to preserve other fields
    const { data: currentLeague } = await supabase
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .single()

    if (currentLeague) {
      const existingSettings = (currentLeague.settings || {}) as Record<string, unknown>
      const { error: updateError } = await supabase
        .from('leagues')
        .update({
          current_week: currentRound,
          status: updated.status === 'completed' ? 'completed' : 'active',
          settings: {
            ...existingSettings,
            tournament: JSON.parse(JSON.stringify(updated)),
          },
        })
        .eq('id', leagueId)

      if (updateError) throw new Error('Failed to save bracket state')
    }

    // Create DB matches for newly-unlocked bracket matches
    const settings = (currentLeague?.settings || {}) as Record<string, unknown>
    const matchFormat = (settings.matchFormat as string) || 'best_of_3'
    await this.syncMatchesToDb(leagueId, updated, matchFormat)

    return updated
  }

  /**
   * Get current active round number
   */
  private static getCurrentRound(tournament: Tournament): number {
    for (const round of tournament.rounds) {
      const hasPending = round.matches.some(
        m => m.status === 'pending' || m.status === 'in-progress'
      )
      if (hasPending) return round.roundNumber
    }
    // All done — return last round
    return tournament.rounds.length
  }

  /**
   * Sync tournament bracket matches to the DB matches table.
   * Only creates match rows for matches where both participants are known
   * and a DB row doesn't already exist.
   */
  private static async syncMatchesToDb(
    leagueId: string,
    tournament: Tournament,
    matchFormat: string
  ): Promise<void> {
    if (!supabase) return

    // Get existing DB matches for this league
    const { data: existingMatches } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id')
      .eq('league_id', leagueId)

    const existingPairs = new Set(
      (existingMatches || []).map(m => `${m.home_team_id}-${m.away_team_id}`)
    )

    const newMatches: Array<{
      league_id: string
      week_number: number
      match_number: number
      home_team_id: string
      away_team_id: string
      status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
      home_score: number
      away_score: number
      winner_team_id: null
      battle_format: string
      scheduled_date: null
      notes: null
    }> = []

    let matchNum = (existingMatches?.length || 0) + 1

    for (const round of tournament.rounds) {
      for (const match of round.matches) {
        if (!match.participant1?.teamId || !match.participant2?.teamId) continue
        if (match.participant2.name === 'BYE') continue

        const homeId = match.participant1.teamId
        const awayId = match.participant2.teamId
        const pairKey = `${homeId}-${awayId}`
        const reversePairKey = `${awayId}-${homeId}`

        if (existingPairs.has(pairKey) || existingPairs.has(reversePairKey)) continue

        newMatches.push({
          league_id: leagueId,
          week_number: round.roundNumber,
          match_number: matchNum++,
          home_team_id: homeId,
          away_team_id: awayId,
          status: 'scheduled',
          home_score: 0,
          away_score: 0,
          winner_team_id: null,
          battle_format: matchFormat,
          scheduled_date: null,
          notes: null,
        })
      }
    }

    if (newMatches.length > 0) {
      const { error } = await supabase.from('matches').insert(newMatches)
      if (error) log.error('Failed to sync matches to DB:', error)
    }
  }

  /**
   * Check if user is the tournament commissioner
   */
  static async isCommissioner(leagueId: string, userId: string): Promise<boolean> {
    if (!supabase) return false

    const { data } = await supabase
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .single()

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
