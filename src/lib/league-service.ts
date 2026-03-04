import { supabase } from './supabase'
import type {
  League,
  Match,
  Standing,
  Team,
  TeamWithPokemonStatus,
  ExtendedLeagueSettings,
} from '@/types'
import type {
  DraftRow,
  LeagueRow,
  LeagueTeamRow,
  MatchRow,
  StandingRow,
  PickRow,
  TeamRow,
} from '@/types/supabase-helpers'
import { MatchKOService } from './match-ko-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('LeagueService')

/** Shape returned by a draft query with joined teams */
type DraftWithTeams = DraftRow & { teams: TeamRow[] }

/** Shape returned by a match query with joined league and teams */
type MatchWithJoins = MatchRow & {
  league: LeagueRow
  home_team: TeamRow
  away_team: TeamRow
}

/** Shape returned by a match query with joined teams (no league) */
type MatchWithTeams = MatchRow & {
  home_team: TeamRow
  away_team: TeamRow
}

/** Shape returned by a standings query with joined team */
type StandingWithTeam = StandingRow & { team: TeamRow }

/** Shape returned by a league query with joined league_teams containing nested team */
type LeagueWithTeams = LeagueRow & {
  league_teams: Array<{ team: TeamRow }>
}

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
      maxMatchesPerWeek?: number
    }
  ): Promise<{ leagues: League[]; matches: Match[] }> {
    if (!supabase) throw new Error('Supabase not configured')

    // Guard: prevent duplicate leagues for the same draft
    const { data: existingLeague } = await supabase
      .from('leagues')
      .select('id')
      .eq('draft_id', draftId)
      .limit(1)
      .maybeSingle()

    if (existingLeague) {
      throw new Error('A league already exists for this draft')
    }

    // Fetch draft and teams — join query returns nested data not typed by Supabase Relationships
    const { data: rawDraft } = await supabase
      .from('drafts')
      .select('*, teams(*)')
      .eq('id', draftId)
      .single()

    if (!rawDraft) throw new Error('Draft not found')

    // Cast to access joined teams since Relationships config is empty
    const draft = rawDraft as unknown as DraftWithTeams

    if (draft.status !== 'completed') throw new Error('Draft must be completed to create league')

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

      // Generate intra-conference schedules
      const matchesA = await this.generateSchedule(leagueA.id, conferenceATeams, leagueConfig)
      const matchesB = await this.generateSchedule(leagueB.id, conferenceBTeams, leagueConfig)
      allMatches.push(...matchesA, ...matchesB)

      // Generate 1 cross-conference match per team (stored in Conference A's league)
      const crossMatches = await this.generateCrossConferenceMatches(
        leagueA.id, conferenceATeams, conferenceBTeams, leagueConfig
      )
      allMatches.push(...crossMatches)
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
      maxMatchesPerWeek?: number
    }
  ): Promise<League> {
    if (!supabase) throw new Error('Supabase not configured')

    // Create league as active immediately (draft is already completed)
    // Look up draft host to set as commissioner
    const { data: draftInfo } = await supabase
      .from('drafts')
      .select('host_id')
      .eq('id', draftId)
      .single()

    const { data: league, error: leagueError } = await supabase
      .from('leagues')
      .insert({
        draft_id: draftId,
        name,
        league_type: leagueType,
        status: 'active',
        total_weeks: config.totalWeeks,
        start_date: config.startDate?.toISOString(),
        settings: {
          matchFormat: config.matchFormat || 'best_of_3',
          pointsPerWin: 3,
          pointsPerDraw: 1,
          commissionerId: draftInfo?.host_id || null,
        }
      })
      .select()
      .single()

    if (leagueError || !league) throw new Error('Failed to create league')

    // Add teams to league
    const leagueTeams = teams.map((team, index) => ({
      league_id: league.id,
      team_id: team.id,
      seed: team.draftOrder || index + 1
    }))

    const { error: teamsError } = await supabase
      .from('league_teams')
      .insert(leagueTeams)

    if (teamsError) throw new Error('Failed to add teams to league')

    return mapLeagueRow(league)
  }

  /**
   * Generate a proper round-robin schedule for a league.
   *
   * Rules:
   * - Every team plays each other team at least once
   * - Each team plays exactly 1 match per week
   * - If totalWeeks > unique matchups, rematches fill remaining weeks
   * - 2 teams with 4 weeks = 4 matches (play every week)
   * - Odd team count: one team gets a bye each week
   */
  private static async generateSchedule(
    leagueId: string,
    teams: Team[],
    config: {
      totalWeeks: number
      startDate?: Date
      matchFormat?: 'best_of_1' | 'best_of_3' | 'best_of_5'
      maxMatchesPerWeek?: number
    }
  ): Promise<Match[]> {
    if (!supabase) throw new Error('Supabase not configured')

    // Build all unique matchup pairs (round-robin)
    const allPairs: [Team, Team][] = []
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        allPairs.push([teams[i], teams[j]])
      }
    }

    // Shuffle pairs for randomization
    for (let i = allPairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]]
    }

    // Use circle method for round-robin scheduling (handles even/odd teams)
    const roundRobinRounds = this.buildRoundRobinRounds(teams)

    // Fill weeks: first exhaust round-robin rounds, then cycle for rematches
    const weeklyMatchups: [Team, Team][][] = []
    for (let week = 0; week < config.totalWeeks; week++) {
      const roundIndex = week % roundRobinRounds.length
      weeklyMatchups.push(roundRobinRounds[roundIndex])
    }

    // Build match records
    const matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>[] = []
    let matchNumber = 1

    for (let week = 0; week < weeklyMatchups.length; week++) {
      const weekNumber = week + 1
      const weekDate = config.startDate
        ? new Date(config.startDate.getTime() + week * 7 * 24 * 60 * 60 * 1000)
        : null

      for (const [team1, team2] of weeklyMatchups[week]) {
        // Randomize home/away
        const homeFirst = Math.random() > 0.5
        matches.push({
          leagueId,
          weekNumber,
          matchNumber: matchNumber++,
          homeTeamId: homeFirst ? team1.id : team2.id,
          awayTeamId: homeFirst ? team2.id : team1.id,
          scheduledDate: weekDate?.toISOString() || null,
          status: 'scheduled',
          homeScore: 0,
          awayScore: 0,
          winnerTeamId: null,
          battleFormat: config.matchFormat || 'best_of_3',
          notes: null
        })
      }
    }

    // Insert matches into database
    const { data: insertedMatches, error } = await supabase
      .from('matches')
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

    return insertedMatches.map((m: MatchRow) => mapMatchRow(m))
  }

  /**
   * Circle method for round-robin: produces N-1 rounds (N if odd) where
   * every team plays exactly once per round and every pair meets exactly once.
   */
  private static buildRoundRobinRounds(teams: Team[]): [Team, Team][][] {
    const list = [...teams]
    // If odd number of teams, add a dummy "bye" entry
    const hasBye = list.length % 2 !== 0
    if (hasBye) {
      list.push({ id: 'BYE', name: 'BYE', draftId: '', ownerId: '', budgetRemaining: 0, draftOrder: 0, undosRemaining: 0, picks: [] } as Team)
    }

    const n = list.length
    const rounds: [Team, Team][][] = []

    // Fix the first team, rotate the rest (circle method)
    const fixed = list[0]
    const rotating = list.slice(1)

    for (let round = 0; round < n - 1; round++) {
      const roundMatches: [Team, Team][] = []

      // First match: fixed vs first in rotating list
      if (rotating[0].id !== 'BYE' && fixed.id !== 'BYE') {
        roundMatches.push([fixed, rotating[0]])
      }

      // Pair remaining: i-th from top with i-th from bottom
      for (let i = 1; i < n / 2; i++) {
        const team1 = rotating[i]
        const team2 = rotating[n - 2 - i]
        if (team1.id !== 'BYE' && team2.id !== 'BYE') {
          roundMatches.push([team1, team2])
        }
      }

      rounds.push(roundMatches)

      // Rotate: move last element to front
      rotating.unshift(rotating.pop()!)
    }

    // Shuffle round order for variety
    for (let i = rounds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rounds[i], rounds[j]] = [rounds[j], rounds[i]]
    }

    return rounds
  }

  /**
   * Generate exactly 1 cross-conference match per team.
   * Each team from Conference A plays 1 team from Conference B.
   */
  private static async generateCrossConferenceMatches(
    leagueId: string,
    conferenceA: Team[],
    conferenceB: Team[],
    config: {
      totalWeeks: number
      startDate?: Date
      matchFormat?: 'best_of_1' | 'best_of_3' | 'best_of_5'
    }
  ): Promise<Match[]> {
    if (!supabase) throw new Error('Supabase not configured')

    // Shuffle B so pairings are random
    const shuffledB = [...conferenceB].sort(() => Math.random() - 0.5)

    const matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>[] = []
    const pairCount = Math.min(conferenceA.length, shuffledB.length)

    // Schedule cross-conference matches in the last available weeks
    const startWeek = config.totalWeeks // append after regular season
    let matchNumber = 9000 // high offset to avoid collisions

    for (let i = 0; i < pairCount; i++) {
      const homeFirst = Math.random() > 0.5
      const weekDate = config.startDate
        ? new Date(config.startDate.getTime() + (startWeek + Math.floor(i / Math.max(1, Math.floor(pairCount / 2)))) * 7 * 24 * 60 * 60 * 1000)
        : null

      matches.push({
        leagueId,
        weekNumber: startWeek + 1 + Math.floor(i / Math.max(1, Math.floor(pairCount / 2))),
        matchNumber: matchNumber++,
        homeTeamId: homeFirst ? conferenceA[i].id : shuffledB[i].id,
        awayTeamId: homeFirst ? shuffledB[i].id : conferenceA[i].id,
        scheduledDate: weekDate?.toISOString() || null,
        status: 'scheduled',
        homeScore: 0,
        awayScore: 0,
        winnerTeamId: null,
        battleFormat: config.matchFormat || 'best_of_3',
        notes: 'Cross-conference'
      })
    }

    const { data: insertedMatches, error } = await supabase
      .from('matches')
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

    if (error || !insertedMatches) throw new Error('Failed to create cross-conference matches')

    return insertedMatches.map((m: MatchRow) => mapMatchRow(m))
  }

  /**
   * Initialize standings for all teams in a league
   */
  private static async initializeStandings(leagueId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // Get all teams in this league
    const { data: leagueTeams, error: fetchError } = await supabase
      .from('league_teams')
      .select('team_id')
      .eq('league_id', leagueId)

    if (fetchError) {
      log.error('Error fetching league teams for standings:', fetchError)
      throw new Error(`Failed to fetch league teams: ${fetchError.message}`)
    }

    if (!leagueTeams || leagueTeams.length === 0) return

    // Create initial standings records
    const standings = leagueTeams.map((lt: Pick<LeagueTeamRow, 'team_id'>) => ({
      league_id: leagueId,
      team_id: lt.team_id,
      wins: 0,
      losses: 0,
      draws: 0,
      points_for: 0,
      points_against: 0
    }))

    const { error: insertError } = await supabase.from('standings').insert(standings)
    if (insertError) {
      log.error('Error initializing standings:', insertError)
      throw new Error(`Failed to initialize standings: ${insertError.message}`)
    }
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

    const teamIds = userTeams.map((t: Pick<TeamRow, 'id' | 'draft_id'>) => t.id)

    // Get all matches for these teams — join query with nested relations
    const { data: rawMatches } = await supabase
      .from('matches')
      .select(`
        *,
        league:leagues(*),
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `)
      .or(`home_team_id.in.(${teamIds.join(',')}),away_team_id.in.(${teamIds.join(',')})`)
      .order('scheduled_date', { ascending: true })

    if (!rawMatches) return { matches: [] }

    // Cast to access joined relations since Supabase Relationships config is empty
    const matches = rawMatches as unknown as MatchWithJoins[]

    return {
      matches: matches.map((m: MatchWithJoins) => ({
        ...mapMatchRow(m),
        league: mapLeagueRow(m.league),
        homeTeam: m.home_team as unknown as Team,
        awayTeam: m.away_team as unknown as Team,
      }))
    }
  }

  /**
   * Get standings for a league
   */
  static async getStandings(leagueId: string): Promise<(Standing & { team: Team })[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: rawStandings } = await supabase
      .from('standings')
      .select(`
        *,
        team:teams(*)
      `)
      .eq('league_id', leagueId)
      .order('rank', { ascending: true, nullsFirst: false })

    if (!rawStandings) return []

    // Cast to access joined team since Supabase Relationships config is empty
    const standings = rawStandings as unknown as StandingWithTeam[]

    return standings.map((s: StandingWithTeam) => ({
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
      team: s.team as unknown as Team
    }))
  }

  /**
   * Update match result (direct update, used internally)
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

    const { error } = await supabase
      .from('matches')
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

    // Auto-update standings when a match is completed
    if (result.status === 'completed' || !result.status) {
      // Get the match to find its league_id
      const { data: matchRow } = await supabase
        .from('matches')
        .select('league_id')
        .eq('id', matchId)
        .single()

      if (matchRow) {
        try {
          await this.updateStandings(matchRow.league_id)
        } catch (err) {
          log.error('Failed to update standings after match result:', err)
        }
      }
    }
  }

  /**
   * Submit match result from one team's perspective (dual-confirmation flow).
   * When both teams submit matching results, the match is auto-confirmed.
   * If results conflict, the match is flagged as disputed.
   */
  static async submitMatchResult(
    matchId: string,
    submittingTeamId: string,
    result: {
      homeScore: number
      awayScore: number
      winnerTeamId: string | null
    }
  ): Promise<{ status: 'pending' | 'confirmed' | 'disputed' }> {
    if (!supabase) throw new Error('Supabase not configured')

    // Fetch current match
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single()

    if (!match) throw new Error('Match not found')

    const isHome = submittingTeamId === match.home_team_id
    const isAway = submittingTeamId === match.away_team_id
    if (!isHome && !isAway) throw new Error('Team is not part of this match')

    // Read existing notes as submission state
    const notes = match.notes ? JSON.parse(match.notes) : {}
    const submissions = notes.submissions || {}

    // Store this team's submission
    const side = isHome ? 'home' : 'away'
    submissions[side] = {
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winnerTeamId: result.winnerTeamId,
      submittedAt: new Date().toISOString(),
    }

    const otherSide = isHome ? 'away' : 'home'

    // Check if the other team has already submitted
    if (submissions[otherSide]) {
      const otherResult = submissions[otherSide]
      const resultsMatch =
        otherResult.homeScore === result.homeScore &&
        otherResult.awayScore === result.awayScore &&
        otherResult.winnerTeamId === result.winnerTeamId

      if (resultsMatch) {
        // Both agree - auto-confirm match
        await this.updateMatchResult(matchId, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          winnerTeamId: result.winnerTeamId,
          status: 'completed',
        })

        // Update notes with confirmed status
        const { error } = await supabase
          .from('matches')
          .update({
            notes: JSON.stringify({ ...notes, submissions, confirmationStatus: 'confirmed' }),
          })
          .eq('id', matchId)
        if (error) log.error('Failed to update match notes:', error)

        // Update standings after confirmed match
        try {
          await this.updateStandings(match.league_id)
        } catch (err) {
          log.error('Failed to update standings after match confirmation:', err)
        }

        return { status: 'confirmed' }
      } else {
        // Results conflict - flag as disputed
        const { error } = await supabase
          .from('matches')
          .update({
            notes: JSON.stringify({ ...notes, submissions, confirmationStatus: 'disputed' }),
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchId)
        if (error) log.error('Failed to update match notes:', error)

        return { status: 'disputed' }
      }
    }

    // Only one submission so far - save and wait for other team
    const { error } = await supabase
      .from('matches')
      .update({
        notes: JSON.stringify({ ...notes, submissions, confirmationStatus: 'pending' }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId)
    if (error) throw new Error('Failed to save submission')

    return { status: 'pending' }
  }

  /**
   * Get match submission status (which teams have submitted, any disputes)
   */
  static async getMatchSubmissionStatus(matchId: string): Promise<{
    homeSubmitted: boolean
    awaySubmitted: boolean
    confirmationStatus: 'none' | 'pending' | 'confirmed' | 'disputed'
    homeSubmission?: { homeScore: number; awayScore: number; winnerTeamId: string | null }
    awaySubmission?: { homeScore: number; awayScore: number; winnerTeamId: string | null }
  }> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: match } = await supabase
      .from('matches')
      .select('notes')
      .eq('id', matchId)
      .single()

    if (!match?.notes) {
      return { homeSubmitted: false, awaySubmitted: false, confirmationStatus: 'none' }
    }

    try {
      const notes = JSON.parse(match.notes)
      const submissions = notes.submissions || {}
      return {
        homeSubmitted: !!submissions.home,
        awaySubmitted: !!submissions.away,
        confirmationStatus: notes.confirmationStatus || 'none',
        homeSubmission: submissions.home,
        awaySubmission: submissions.away,
      }
    } catch {
      return { homeSubmitted: false, awaySubmitted: false, confirmationStatus: 'none' }
    }
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

    const { data: rawMatch } = await supabase
      .from('matches')
      .select(`
        *,
        league:leagues(*),
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `)
      .eq('id', matchId)
      .single()

    if (!rawMatch) return null

    // Cast to access joined relations since Supabase Relationships config is empty
    const match = rawMatch as unknown as MatchWithJoins

    return {
      ...mapMatchRow(match),
      league: mapLeagueRow(match.league),
      homeTeam: match.home_team as unknown as Team,
      awayTeam: match.away_team as unknown as Team,
    }
  }

  /**
   * Get league with teams
   */
  static async getLeague(leagueId: string): Promise<(League & { teams: Team[] }) | null> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: rawLeague } = await supabase
      .from('leagues')
      .select(`
        *,
        league_teams(
          team:teams(*)
        )
      `)
      .eq('id', leagueId)
      .single()

    if (!rawLeague) return null

    // Cast to access joined relations since Supabase Relationships config is empty
    const league = rawLeague as unknown as LeagueWithTeams

    return {
      ...mapLeagueRow(league),
      teams: league.league_teams.map((lt: { team: TeamRow }) => lt.team as unknown as Team)
    }
  }

  /**
   * Get the sibling conference league (e.g. Conference B when viewing Conference A)
   * Returns null if this is a single league (not split into conferences)
   */
  static async getSiblingConference(leagueId: string): Promise<(League & { teams: Team[] }) | null> {
    if (!supabase) throw new Error('Supabase not configured')

    // First get this league to find its draft_id and type
    const currentLeague = await this.getLeague(leagueId)
    if (!currentLeague) return null

    // Only split conferences have siblings
    if (currentLeague.leagueType === 'single') return null

    const siblingType = currentLeague.leagueType === 'split_conference_a'
      ? 'split_conference_b'
      : 'split_conference_a'

    const { data: rawSibling } = await supabase
      .from('leagues')
      .select(`
        *,
        league_teams(
          team:teams(*)
        )
      `)
      .eq('draft_id', currentLeague.draftId)
      .eq('league_type', siblingType)
      .single()

    if (!rawSibling) return null

    const sibling = rawSibling as unknown as LeagueWithTeams

    return {
      ...mapLeagueRow(sibling),
      teams: sibling.league_teams.map((lt: { team: TeamRow }) => lt.team as unknown as Team)
    }
  }

  /**
   * Get league with Pokemon status for all teams
   */
  static async getLeagueWithPokemonStatus(
    leagueId: string
  ): Promise<(League & { teams: TeamWithPokemonStatus[] }) | null> {
    if (!supabase) throw new Error('Supabase not configured')

    // Get base league with teams
    const league = await this.getLeague(leagueId)
    if (!league) return null

    // Get Pokemon status for each team
    const teamsWithStatus: TeamWithPokemonStatus[] = await Promise.all(
      league.teams.map(async (team) => {
        const statuses = await MatchKOService.getTeamPokemonStatuses(team.id, leagueId)

        const alivePokemon = statuses.filter(s => s.status === 'alive').length
        const deadPokemon = statuses.filter(s => s.status === 'dead').length

        return {
          ...team,
          pokemonStatuses: statuses,
          alivePokemon,
          deadPokemon,
        }
      })
    )

    return {
      ...league,
      teams: teamsWithStatus,
    }
  }

  /**
   * Get all matches for a specific week in a league
   */
  static async getWeekFixtures(
    leagueId: string,
    weekNumber: number
  ): Promise<(Match & { homeTeam: Team; awayTeam: Team })[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: rawMatches } = await supabase
      .from('matches')
      .select(`
        *,
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `)
      .eq('league_id', leagueId)
      .eq('week_number', weekNumber)
      .order('match_number', { ascending: true })

    if (!rawMatches) return []

    // Cast to access joined relations since Supabase Relationships config is empty
    const matches = rawMatches as unknown as MatchWithTeams[]

    return matches.map((m: MatchWithTeams) => ({
      ...mapMatchRow(m),
      homeTeam: m.home_team as unknown as Team,
      awayTeam: m.away_team as unknown as Team,
    }))
  }

  /**
   * Get league settings with extended options
   */
  static async getLeagueSettings(leagueId: string): Promise<ExtendedLeagueSettings> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: league } = await supabase
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .single()

    if (!league) {
      throw new Error('League not found')
    }

    // Cast to ExtendedLeagueSettings since the JSON column stores extended fields
    const s = league.settings as unknown as Partial<ExtendedLeagueSettings> | null

    return {
      matchFormat: s?.matchFormat || 'best_of_3',
      pointsPerWin: s?.pointsPerWin || 3,
      pointsPerDraw: s?.pointsPerDraw || 1,
      commissionerId: s?.commissionerId ?? undefined,
      freeAgentPicksAllowed: s?.freeAgentPicksAllowed ?? 3,
      enableTrades: s?.enableTrades || false,
      tradeDeadlineWeek: s?.tradeDeadlineWeek ?? undefined,
      requireCommissionerApproval: s?.requireCommissionerApproval || false,
    }
  }

  /**
   * Get the commissioner user ID for a league.
   * Checks settings first, falls back to the draft host_id.
   */
  static async getCommissionerId(leagueId: string): Promise<string | null> {
    if (!supabase) throw new Error('Supabase not configured')

    // Check settings first
    const settings = await this.getLeagueSettings(leagueId)
    if (settings.commissionerId) return settings.commissionerId

    // Fallback: look up draft host_id
    const league = await this.getLeague(leagueId)
    if (!league) return null

    const { data: draft } = await supabase
      .from('drafts')
      .select('host_id')
      .eq('id', league.draftId)
      .single()

    return draft?.host_id || null
  }

  /**
   * Check if a user is the league commissioner.
   * Compares against both auth user ID and guest session ID.
   */
  static async isLeagueCommissioner(leagueId: string, userId: string): Promise<boolean> {
    const commissionerId = await this.getCommissionerId(leagueId)
    return commissionerId === userId
  }

  /**
   * Update league settings
   */
  static async updateLeagueSettings(
    leagueId: string,
    settings: Partial<ExtendedLeagueSettings>
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // Get current settings
    const currentSettings = await this.getLeagueSettings(leagueId)

    // Merge with new settings
    const updatedSettings = {
      ...currentSettings,
      ...settings,
    }

    // Update in database
    const { error } = await supabase
      .from('leagues')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leagueId)

    if (error) {
      throw new Error(`Failed to update league settings: ${error.message}`)
    }
  }

  /**
   * Save playoff bracket state to league settings JSONB
   */
  static async savePlayoffState(leagueId: string, playoffData: unknown): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    const currentSettings = await this.getLeagueSettings(leagueId)

    const { error } = await supabase
      .from('leagues')
      .update({
        settings: { ...currentSettings, playoff: playoffData },
        updated_at: new Date().toISOString(),
      })
      .eq('id', leagueId)

    if (error) {
      throw new Error(`Failed to save playoff state: ${error.message}`)
    }
  }

  /**
   * Get playoff bracket state from league settings
   */
  static async getPlayoffState(leagueId: string): Promise<unknown | null> {
    const settings = await this.getLeagueSettings(leagueId)
    return (settings as Record<string, unknown>).playoff ?? null
  }

  /**
   * Initialize Pokemon status for all teams in a league
   * Should be called after league creation
   */
  static async initializeLeaguePokemonStatus(leagueId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // Get all teams in league
    const league = await this.getLeague(leagueId)
    if (!league) {
      throw new Error('League not found')
    }

    // For each team, get their picks and initialize status
    for (const team of league.teams) {
      const { data: picks } = await supabase
        .from('picks')
        .select('*')
        .eq('team_id', team.id)

      if (picks && picks.length > 0) {
        await MatchKOService.initializePokemonStatus(
          leagueId,
          team.id,
          picks.map((p: PickRow) => ({
            id: p.id,
            draftId: p.draft_id,
            teamId: p.team_id,
            pokemonId: p.pokemon_id,
            pokemonName: p.pokemon_name,
            cost: p.cost,
            pickOrder: p.pick_order,
            round: p.round,
            createdAt: p.created_at,
          }))
        )
      }
    }
  }

  /**
   * Get league by draft ID
   */
  static async getLeagueByDraftId(draftId: string): Promise<League | null> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: league } = await supabase
      .from('leagues')
      .select('*')
      .eq('draft_id', draftId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!league) return null

    return mapLeagueRow(league)
  }

  /**
   * Advance league to next week
   * Should be called when all matches for current week are completed
   */
  static async advanceToNextWeek(leagueId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // Get current league state
    const { data: league } = await supabase
      .from('leagues')
      .select('current_week, total_weeks, status')
      .eq('id', leagueId)
      .single()

    if (!league) {
      throw new Error('League not found')
    }

    // Check if all matches for current week are completed
    const weekFixtures = await this.getWeekFixtures(leagueId, league.current_week)
    const allCompleted = weekFixtures.every(m => m.status === 'completed')

    if (!allCompleted) {
      throw new Error('Cannot advance to next week - not all matches are completed')
    }

    // Generate weekly highlights before advancing
    try {
      const { WeeklyHighlightsService } = await import('./weekly-highlights-service')
      await WeeklyHighlightsService.generateWeeklySummary(leagueId, league.current_week)
      await WeeklyHighlightsService.autoGenerateHighlights(leagueId, league.current_week)
    } catch (error) {
      log.error('Error generating weekly highlights:', error)
      // Continue even if highlights fail
    }

    const nextWeek = league.current_week + 1

    // Check if season is complete
    if (nextWeek > league.total_weeks) {
      // Mark league as completed
      await supabase
        .from('leagues')
        .update({
          status: 'completed',
          end_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', leagueId)
    } else {
      // Advance to next week
      await supabase
        .from('leagues')
        .update({
          current_week: nextWeek,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leagueId)
    }
  }

  /**
   * Get user's upcoming matches across all active leagues for the current week.
   * Returns match details with league context and opponent info.
   */
  static async getUpcomingMatches(userId: string): Promise<{
    league: League
    match: Match & { homeTeam: Team; awayTeam: Team }
    userTeamId: string
    userTeamName: string
    opponentTeamId: string
    opponentTeamName: string
    userTeamPicks: { pokemonId: string; pokemonName: string }[]
    opponentTeamPicks: { pokemonId: string; pokemonName: string }[]
  }[]> {
    if (!supabase) throw new Error('Supabase not configured')

    // Find all league_teams where the user owns the team, joined with league info
    type LeagueTeamJoin = LeagueTeamRow & {
      teams: TeamRow
      leagues: LeagueRow
    }

    const { data: rawLeagueTeams } = await supabase
      .from('league_teams')
      .select(`
        *,
        teams!inner(*),
        leagues!inner(*)
      `)
      .eq('teams.owner_id', userId)

    if (!rawLeagueTeams || rawLeagueTeams.length === 0) return []

    const leagueTeams = rawLeagueTeams as unknown as LeagueTeamJoin[]

    // Filter to active leagues only
    const activeLeagueTeams = leagueTeams.filter(
      lt => lt.leagues.status === 'active'
    )

    if (activeLeagueTeams.length === 0) return []

    // For each active league, fetch this week's fixtures
    const results: {
      league: League
      match: Match & { homeTeam: Team; awayTeam: Team }
      userTeamId: string
      userTeamName: string
      opponentTeamId: string
      opponentTeamName: string
      userTeamPicks: { pokemonId: string; pokemonName: string }[]
      opponentTeamPicks: { pokemonId: string; pokemonName: string }[]
    }[] = []

    for (const lt of activeLeagueTeams) {
      const league = mapLeagueRow(lt.leagues)
      const weekFixtures = await this.getWeekFixtures(league.id, league.currentWeek)

      // Find matches involving this user's team
      for (const match of weekFixtures) {
        const isHome = match.homeTeamId === lt.team_id
        const isAway = match.awayTeamId === lt.team_id
        if (!isHome && !isAway) continue

        const userTeam = isHome ? match.homeTeam : match.awayTeam
        const opponentTeam = isHome ? match.awayTeam : match.homeTeam

        // Fetch picks for both teams
        const [userPicksRes, opponentPicksRes] = await Promise.all([
          supabase.from('picks').select('pokemon_id, pokemon_name').eq('team_id', lt.team_id).order('pick_order'),
          supabase.from('picks').select('pokemon_id, pokemon_name').eq('team_id', opponentTeam.id).order('pick_order'),
        ])

        results.push({
          league,
          match,
          userTeamId: lt.team_id,
          userTeamName: userTeam.name,
          opponentTeamId: opponentTeam.id,
          opponentTeamName: opponentTeam.name,
          userTeamPicks: (userPicksRes.data ?? []).map(p => ({ pokemonId: p.pokemon_id, pokemonName: p.pokemon_name })),
          opponentTeamPicks: (opponentPicksRes.data ?? []).map(p => ({ pokemonId: p.pokemon_id, pokemonName: p.pokemon_name })),
        })
      }
    }

    return results
  }

  /**
   * Get user's league standings across all active leagues.
   */
  static async getUserLeagueStandings(userId: string): Promise<{
    league: League
    userTeamId: string
    userTeamName: string
    wins: number
    losses: number
    draws: number
    rank: number | null
    currentStreak: string | null
  }[]> {
    if (!supabase) throw new Error('Supabase not configured')

    type LeagueTeamJoin = LeagueTeamRow & {
      teams: TeamRow
      leagues: LeagueRow
    }

    const { data: rawLeagueTeams } = await supabase
      .from('league_teams')
      .select(`
        *,
        teams!inner(*),
        leagues!inner(*)
      `)
      .eq('teams.owner_id', userId)

    if (!rawLeagueTeams || rawLeagueTeams.length === 0) return []

    const leagueTeams = rawLeagueTeams as unknown as LeagueTeamJoin[]
    const activeLeagueTeams = leagueTeams.filter(
      lt => lt.leagues.status === 'active' || lt.leagues.status === 'completed' || lt.leagues.status === 'scheduled'
    )

    const results: {
      league: League
      userTeamId: string
      userTeamName: string
      wins: number
      losses: number
      draws: number
      rank: number | null
      currentStreak: string | null
    }[] = []

    for (const lt of activeLeagueTeams) {
      const standings = await this.getStandings(lt.leagues.id)
      const userStanding = standings.find(s => s.teamId === lt.team_id)

      results.push({
        league: mapLeagueRow(lt.leagues),
        userTeamId: lt.team_id,
        userTeamName: lt.teams.name,
        wins: userStanding?.wins ?? 0,
        losses: userStanding?.losses ?? 0,
        draws: userStanding?.draws ?? 0,
        rank: userStanding?.rank ?? null,
        currentStreak: userStanding?.currentStreak ?? null,
      })
    }

    return results
  }

  /**
   * Recalculate standings for all teams in a league based on completed matches.
   * Updates W/L/D, points_for/against, point_differential, rank, and streak.
   */
  static async updateStandings(leagueId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // Get league settings for point values
    const settings = await this.getLeagueSettings(leagueId)
    const pointsPerWin = settings.pointsPerWin ?? 3
    const pointsPerDraw = settings.pointsPerDraw ?? 1

    // Get all completed matches
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('league_id', leagueId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: true })

    if (!matches) return

    // Get all standings records
    const { data: standingRows } = await supabase
      .from('standings')
      .select('id, team_id')
      .eq('league_id', leagueId)

    if (!standingRows || standingRows.length === 0) return

    // Build a map of team stats
    const teamStats = new Map<string, {
      wins: number; losses: number; draws: number
      pointsFor: number; pointsAgainst: number
      results: ('W' | 'L' | 'D')[]
    }>()

    for (const row of standingRows) {
      teamStats.set(row.team_id, {
        wins: 0, losses: 0, draws: 0,
        pointsFor: 0, pointsAgainst: 0,
        results: [],
      })
    }

    // Tally match results
    for (const m of matches) {
      const home = teamStats.get(m.home_team_id)
      const away = teamStats.get(m.away_team_id)
      if (!home || !away) continue

      home.pointsFor += m.home_score
      home.pointsAgainst += m.away_score
      away.pointsFor += m.away_score
      away.pointsAgainst += m.home_score

      if (m.winner_team_id === m.home_team_id) {
        home.wins++; home.results.push('W')
        away.losses++; away.results.push('L')
      } else if (m.winner_team_id === m.away_team_id) {
        away.wins++; away.results.push('W')
        home.losses++; home.results.push('L')
      } else {
        // Draw
        home.draws++; home.results.push('D')
        away.draws++; away.results.push('D')
      }
    }

    // Compute streak from most recent results
    const computeStreak = (results: ('W' | 'L' | 'D')[]): string | null => {
      if (results.length === 0) return null
      const last = results[results.length - 1]
      let count = 0
      for (let i = results.length - 1; i >= 0 && results[i] === last; i--) {
        count++
      }
      return `${last}${count}`
    }

    // Sort teams for ranking: by wins desc, then point differential desc
    const sortedTeams = [...teamStats.entries()]
      .map(([teamId, stats]) => ({
        teamId,
        ...stats,
        totalPoints: stats.wins * pointsPerWin + stats.draws * pointsPerDraw,
        diff: stats.pointsFor - stats.pointsAgainst,
      }))
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
        if (b.diff !== a.diff) return b.diff - a.diff
        return b.wins - a.wins
      })

    // Update each standing row
    const now = new Date().toISOString()
    for (let i = 0; i < sortedTeams.length; i++) {
      const t = sortedTeams[i]
      const standingRow = standingRows.find(s => s.team_id === t.teamId)
      if (!standingRow) continue

      const { error } = await supabase
        .from('standings')
        .update({
          wins: t.wins,
          losses: t.losses,
          draws: t.draws,
          points_for: t.pointsFor,
          points_against: t.pointsAgainst,
          point_differential: t.diff,
          rank: i + 1,
          current_streak: computeStreak(t.results),
          updated_at: now,
        })
        .eq('id', standingRow.id)

      if (error) {
        log.error(`Failed to update standing for team ${t.teamId}:`, error)
      }
    }
  }

  /**
   * Recalculate standings from scratch using server-side RPC.
   * Falls back to client-side recalculation if RPC is not available.
   */
  static async recalculateStandings(leagueId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('recalculate_league_standings', {
      p_league_id: leagueId,
    })

    if (error) {
      log.warn('RPC recalculate_league_standings not available, falling back to client-side:', error)
      await this.updateStandings(leagueId)
    }
  }

  /**
   * Get full season schedule grouped by week
   */
  static async getFullSchedule(leagueId: string): Promise<{
    weekNumber: number
    matches: (Match & { homeTeam: Team; awayTeam: Team })[]
  }[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: rawMatches } = await supabase
      .from('matches')
      .select(`
        *,
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `)
      .eq('league_id', leagueId)
      .order('week_number', { ascending: true })
      .order('match_number', { ascending: true })

    if (!rawMatches) return []

    const matches = rawMatches as unknown as MatchWithTeams[]

    // Group by week
    const weekMap = new Map<number, (Match & { homeTeam: Team; awayTeam: Team })[]>()
    for (const m of matches) {
      const mapped = {
        ...mapMatchRow(m),
        homeTeam: m.home_team as unknown as Team,
        awayTeam: m.away_team as unknown as Team,
      }
      if (!weekMap.has(m.week_number)) weekMap.set(m.week_number, [])
      weekMap.get(m.week_number)!.push(mapped)
    }

    return Array.from(weekMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([weekNumber, matches]) => ({ weekNumber, matches }))
  }

  /**
   * Check if all matches for current week are completed
   */
  static async canAdvanceWeek(leagueId: string, currentWeek: number): Promise<boolean> {
    const weekFixtures = await this.getWeekFixtures(leagueId, currentWeek)
    return weekFixtures.length > 0 && weekFixtures.every(m => m.status === 'completed')
  }

  /**
   * Delete a league and all associated data (matches, standings, etc.)
   * Only the draft host (league admin) can delete a league.
   */
  static async deleteLeague(leagueId: string, userId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // Verify league exists and user is admin (draft host)
    const { data: league, error: fetchErr } = await supabase
      .from('leagues')
      .select('id, draft_id')
      .eq('id', leagueId)
      .single()

    if (fetchErr || !league) {
      throw new Error('League not found')
    }

    const { data: draft } = await supabase
      .from('drafts')
      .select('host_id')
      .eq('id', league.draft_id)
      .single()

    if (!draft || draft.host_id !== userId) {
      throw new Error('Only the league admin can delete this league')
    }

    // Delete the league first (references draft_id)
    const { error } = await supabase
      .from('leagues')
      .delete()
      .eq('id', leagueId)

    if (error) {
      throw new Error(`Failed to delete league: ${error.message}`)
    }

    // Also delete the associated draft so it no longer appears on the dashboard
    const { error: draftErr } = await supabase
      .from('drafts')
      .delete()
      .eq('id', league.draft_id)

    if (draftErr) {
      log.warn('League deleted but failed to delete associated draft:', draftErr)
    }
  }
}
