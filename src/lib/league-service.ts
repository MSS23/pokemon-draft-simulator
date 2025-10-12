import { supabase } from './supabase'
import type { League, LeagueTeam, Match, Standing, Team } from '@/types'

export class LeagueService {
  /**
   * Create league(s) from a completed draft
   * @param draftId - The ID of the completed draft
   * @param leagueConfig - Configuration for league creation
   */
  static async createLeagueFromDraft(
    draftId: string,
    leagueConfig: {
      splitIntoConferences: boolean
      leagueName?: string
      totalWeeks: number
      startDate?: Date
      matchFormat?: 'best_of_1' | 'best_of_3' | 'best_of_5'
    }
  ): Promise<{ leagues: League[]; matches: Match[] }> {
    if (!supabase) throw new Error('Supabase not configured')

    // Fetch draft and teams
    const { data: draft } = await (supabase
      .from('drafts') as any)
      .select('*, teams(*)')
      .eq('id', draftId)
      .single()

    if (!draft) throw new Error('Draft not found')
    if ((draft as any).status !== 'completed') throw new Error('Draft must be completed to create league')

    const teams = (draft as any).teams as Team[]
    if (teams.length < 2) throw new Error('Need at least 2 teams to create league')

    const leagues: League[] = []
    const allMatches: Match[] = []

    if (leagueConfig.splitIntoConferences && teams.length >= 4) {
      // Split into two conferences
      const midpoint = Math.floor(teams.length / 2)
      const conferenceATeams = teams.slice(0, midpoint)
      const conferenceBTeams = teams.slice(midpoint)

      // Create Conference A
      const leagueA = await this.createSingleLeague(
        draftId,
        `${leagueConfig.leagueName || draft.name} - Conference A`,
        'split_conference_a',
        conferenceATeams,
        leagueConfig
      )
      leagues.push(leagueA)

      // Create Conference B
      const leagueB = await this.createSingleLeague(
        draftId,
        `${leagueConfig.leagueName || draft.name} - Conference B`,
        'split_conference_b',
        conferenceBTeams,
        leagueConfig
      )
      leagues.push(leagueB)

      // Generate schedules for both conferences
      const matchesA = await this.generateSchedule(leagueA.id, conferenceATeams, leagueConfig)
      const matchesB = await this.generateSchedule(leagueB.id, conferenceBTeams, leagueConfig)
      allMatches.push(...matchesA, ...matchesB)
    } else {
      // Create single league
      const league = await this.createSingleLeague(
        draftId,
        leagueConfig.leagueName || `${draft.name} League`,
        'single',
        teams,
        leagueConfig
      )
      leagues.push(league)

      // Generate schedule
      const matches = await this.generateSchedule(league.id, teams, leagueConfig)
      allMatches.push(...matches)
    }

    // Initialize standings for all leagues
    for (const league of leagues) {
      await this.initializeStandings(league.id)
    }

    return { leagues, matches: allMatches }
  }

  /**
   * Create a single league
   */
  private static async createSingleLeague(
    draftId: string,
    name: string,
    leagueType: 'single' | 'split_conference_a' | 'split_conference_b',
    teams: Team[],
    config: {
      totalWeeks: number
      startDate?: Date
      matchFormat?: 'best_of_1' | 'best_of_3' | 'best_of_5'
    }
  ): Promise<League> {
    if (!supabase) throw new Error('Supabase not configured')

    // Create league
    const { data: league, error: leagueError } = await (supabase
      .from('leagues') as any)
      .insert({
        draft_id: draftId,
        name,
        league_type: leagueType,
        total_weeks: config.totalWeeks,
        start_date: config.startDate?.toISOString(),
        settings: {
          matchFormat: config.matchFormat || 'best_of_3',
          pointsPerWin: 3,
          pointsPerDraw: 1
        }
      })
      .select()
      .single()

    if (leagueError || !league) throw new Error('Failed to create league')

    // Add teams to league
    const leagueTeams = teams.map((team, index) => ({
      league_id: (league as any).id,
      team_id: team.id,
      seed: team.draftOrder || index + 1
    }))

    const { error: teamsError } = await (supabase
      .from('league_teams') as any)
      .insert(leagueTeams)

    if (teamsError) throw new Error('Failed to add teams to league')

    return {
      id: (league as any).id,
      draftId: (league as any).draft_id,
      name: (league as any).name,
      leagueType: (league as any).league_type,
      seasonNumber: (league as any).season_number,
      status: (league as any).status,
      startDate: (league as any).start_date,
      endDate: (league as any).end_date,
      currentWeek: (league as any).current_week,
      totalWeeks: (league as any).total_weeks,
      settings: (league as any).settings,
      createdAt: (league as any).created_at,
      updatedAt: (league as any).updated_at
    }
  }

  /**
   * Generate round-robin schedule for a league
   */
  private static async generateSchedule(
    leagueId: string,
    teams: Team[],
    config: {
      totalWeeks: number
      startDate?: Date
      matchFormat?: 'best_of_1' | 'best_of_3' | 'best_of_5'
    }
  ): Promise<Match[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>[] = []
    const teamCount = teams.length

    // Round-robin algorithm (circle method)
    const rounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount
    const teamsForScheduling = teamCount % 2 === 0 ? [...teams] : [...teams, null as any]
    const totalTeams = teamsForScheduling.length

    let matchNumber = 1

    for (let round = 0; round < Math.min(rounds, config.totalWeeks); round++) {
      const weekNumber = round + 1
      const weekDate = config.startDate
        ? new Date(config.startDate.getTime() + round * 7 * 24 * 60 * 60 * 1000)
        : null

      // Generate matches for this week
      for (let i = 0; i < totalTeams / 2; i++) {
        const home = teamsForScheduling[i]
        const away = teamsForScheduling[totalTeams - 1 - i]

        // Skip if either team is the "bye" team (null)
        if (!home || !away) continue

        matches.push({
          leagueId,
          weekNumber,
          matchNumber: matchNumber++,
          homeTeamId: home.id,
          awayTeamId: away.id,
          scheduledDate: weekDate?.toISOString() || null,
          status: 'scheduled',
          homeScore: 0,
          awayScore: 0,
          winnerTeamId: null,
          battleFormat: config.matchFormat || 'best_of_3',
          notes: null
        })
      }

      // Rotate teams for next round (keep first team fixed)
      if (round < rounds - 1) {
        const lastTeam = teamsForScheduling.pop()!
        teamsForScheduling.splice(1, 0, lastTeam)
      }
    }

    // Insert matches into database
    const { data: insertedMatches, error } = await (supabase
      .from('matches') as any)
      .insert(
        matches.map(m => ({
          league_id: m.leagueId,
          week_number: m.weekNumber,
          match_number: m.matchNumber,
          home_team_id: m.homeTeamId,
          away_team_id: m.awayTeamId,
          scheduled_date: m.scheduledDate,
          status: m.status,
          home_score: m.homeScore,
          away_score: m.awayScore,
          winner_team_id: m.winnerTeamId,
          battle_format: m.battleFormat,
          notes: m.notes
        }))
      )
      .select()

    if (error || !insertedMatches) throw new Error('Failed to create schedule')

    return insertedMatches.map((m: any) => ({
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
      completedAt: m.completed_at
    }))
  }

  /**
   * Initialize standings for all teams in a league
   */
  private static async initializeStandings(leagueId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // Get all teams in this league
    const { data: leagueTeams } = await (supabase
      .from('league_teams') as any)
      .select('team_id')
      .eq('league_id', leagueId)

    if (!leagueTeams) return

    // Create initial standings records
    const standings = leagueTeams.map((lt: any) => ({
      league_id: leagueId,
      team_id: lt.team_id,
      wins: 0,
      losses: 0,
      draws: 0,
      points_for: 0,
      points_against: 0
    }))

    await (supabase.from('standings') as any).insert(standings)
  }

  /**
   * Get user's matches across all their teams
   */
  static async getUserMatches(userId: string): Promise<{
    matches: (Match & { league: League; homeTeam: Team; awayTeam: Team })[]
  }> {
    if (!supabase) throw new Error('Supabase not configured')

    // Find all teams owned by user
    const { data: userTeams } = await supabase
      .from('teams')
      .select('id, draft_id')
      .eq('owner_id', userId)

    if (!userTeams || userTeams.length === 0) {
      return { matches: [] }
    }

    const teamIds = userTeams.map((t: any) => t.id)

    // Get all matches for these teams
    const { data: matches } = await (supabase
      .from('matches') as any)
      .select(`
        *,
        league:leagues(*),
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `)
      .or(`home_team_id.in.(${teamIds.join(',')}),away_team_id.in.(${teamIds.join(',')})`)
      .order('scheduled_date', { ascending: true })

    if (!matches) return { matches: [] }

    return {
      matches: matches.map((m: any) => ({
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
        league: {
          id: m.league.id,
          draftId: m.league.draft_id,
          name: m.league.name,
          leagueType: m.league.league_type,
          seasonNumber: m.league.season_number,
          status: m.league.status,
          startDate: m.league.start_date,
          endDate: m.league.end_date,
          currentWeek: m.league.current_week,
          totalWeeks: m.league.total_weeks,
          settings: m.league.settings,
          createdAt: m.league.created_at,
          updatedAt: m.league.updated_at
        },
        homeTeam: m.home_team,
        awayTeam: m.away_team
      }))
    }
  }

  /**
   * Get standings for a league
   */
  static async getStandings(leagueId: string): Promise<(Standing & { team: Team })[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: standings } = await (supabase
      .from('standings') as any)
      .select(`
        *,
        team:teams(*)
      `)
      .eq('league_id', leagueId)
      .order('rank', { ascending: true, nullsFirst: false })

    if (!standings) return []

    return standings.map((s: any) => ({
      id: s.id,
      leagueId: s.league_id,
      teamId: s.team_id,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      pointsFor: s.points_for,
      pointsAgainst: s.points_against,
      pointDifferential: s.point_differential,
      rank: s.rank,
      currentStreak: s.current_streak,
      updatedAt: s.updated_at,
      team: s.team
    }))
  }

  /**
   * Update match result
   */
  static async updateMatchResult(
    matchId: string,
    result: {
      homeScore: number
      awayScore: number
      winnerTeamId: string | null
      status?: 'completed' | 'in_progress'
    }
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    const { error } = await (supabase
      .from('matches') as any)
      .update({
        home_score: result.homeScore,
        away_score: result.awayScore,
        winner_team_id: result.winnerTeamId,
        status: result.status || 'completed',
        completed_at: result.status === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', matchId)

    if (error) throw new Error('Failed to update match result')
  }

  /**
   * Get match details with teams
   */
  static async getMatch(matchId: string): Promise<(Match & {
    league: League
    homeTeam: Team
    awayTeam: Team
  }) | null> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: match } = await (supabase
      .from('matches') as any)
      .select(`
        *,
        league:leagues(*),
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `)
      .eq('id', matchId)
      .single()

    if (!match) return null

    return {
      id: match.id,
      leagueId: match.league_id,
      weekNumber: match.week_number,
      matchNumber: match.match_number,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      scheduledDate: match.scheduled_date,
      status: match.status,
      homeScore: match.home_score,
      awayScore: match.away_score,
      winnerTeamId: match.winner_team_id,
      battleFormat: match.battle_format,
      notes: match.notes,
      createdAt: match.created_at,
      updatedAt: match.updated_at,
      completedAt: match.completed_at,
      league: {
        id: match.league.id,
        draftId: match.league.draft_id,
        name: match.league.name,
        leagueType: match.league.league_type,
        seasonNumber: match.league.season_number,
        status: match.league.status,
        startDate: match.league.start_date,
        endDate: match.league.end_date,
        currentWeek: match.league.current_week,
        totalWeeks: match.league.total_weeks,
        settings: match.league.settings,
        createdAt: match.league.created_at,
        updatedAt: match.league.updated_at
      },
      homeTeam: match.home_team,
      awayTeam: match.away_team
    }
  }

  /**
   * Get league with teams
   */
  static async getLeague(leagueId: string): Promise<(League & { teams: Team[] }) | null> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: league } = await (supabase
      .from('leagues') as any)
      .select(`
        *,
        league_teams(
          team:teams(*)
        )
      `)
      .eq('id', leagueId)
      .single()

    if (!league) return null

    return {
      id: league.id,
      draftId: league.draft_id,
      name: league.name,
      leagueType: league.league_type,
      seasonNumber: league.season_number,
      status: league.status,
      startDate: league.start_date,
      endDate: league.end_date,
      currentWeek: league.current_week,
      totalWeeks: league.total_weeks,
      settings: league.settings,
      createdAt: league.created_at,
      updatedAt: league.updated_at,
      teams: league.league_teams.map((lt: any) => lt.team)
    }
  }
}
