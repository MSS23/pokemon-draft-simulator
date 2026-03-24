import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock match-ko-service
vi.mock('@/lib/match-ko-service', () => ({
  MatchKOService: {
    getTeamPokemonStatuses: vi.fn().mockResolvedValue([]),
    initializePokemonStatus: vi.fn().mockResolvedValue(undefined),
  },
}))

import { LeagueService } from '@/lib/league-service'
import { supabase } from '@/lib/supabase'

const mockSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
}

describe('LeagueService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // createLeagueFromDraft
  // =========================================================================
  describe('createLeagueFromDraft', () => {
    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(
        LeagueService.createLeagueFromDraft('draft-1', {
          splitIntoConferences: false,
          totalWeeks: 4,
        })
      ).rejects.toThrow('Supabase not configured')

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should throw when a league already exists for the draft', async () => {
      // maybeSingle returns existing league
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'league-existing' },
        error: null,
      })
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockEq = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      await expect(
        LeagueService.createLeagueFromDraft('draft-1', {
          splitIntoConferences: false,
          totalWeeks: 4,
        })
      ).rejects.toThrow('A league already exists for this draft')
    })

    it('should throw when draft is not found', async () => {
      // First call: leagues check (no existing league)
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockEqLeagues = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockSelectLeagues = vi.fn().mockReturnValue({ eq: mockEqLeagues })

      // Second call: drafts fetch (not found)
      const mockSingleDraft = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockEqDraft = vi.fn().mockReturnValue({ single: mockSingleDraft })
      const mockSelectDraft = vi.fn().mockReturnValue({ eq: mockEqDraft })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (table === 'leagues' || callCount === 1) {
          return { select: mockSelectLeagues }
        }
        // drafts table
        return { select: mockSelectDraft }
      })

      await expect(
        LeagueService.createLeagueFromDraft('nonexistent-draft', {
          splitIntoConferences: false,
          totalWeeks: 4,
        })
      ).rejects.toThrow('Draft not found')
    })

    it('should throw when draft is not completed', async () => {
      // First call: leagues check (no existing league)
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockEqLeagues = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockSelectLeagues = vi.fn().mockReturnValue({ eq: mockEqLeagues })

      // Second call: drafts fetch (status = active, not completed)
      const mockSingleDraft = vi.fn().mockResolvedValue({
        data: {
          id: 'draft-1',
          name: 'Test Draft',
          status: 'active',
          teams: [
            { id: 'team-1', draft_id: 'draft-1', name: 'Team 1', owner_id: 'u1', budget_remaining: 100, draft_order: 1, undos_remaining: 3 },
            { id: 'team-2', draft_id: 'draft-1', name: 'Team 2', owner_id: 'u2', budget_remaining: 100, draft_order: 2, undos_remaining: 3 },
          ],
        },
        error: null,
      })
      const mockEqDraft = vi.fn().mockReturnValue({ single: mockSingleDraft })
      const mockSelectDraft = vi.fn().mockReturnValue({ eq: mockEqDraft })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (table === 'leagues' || callCount === 1) {
          return { select: mockSelectLeagues }
        }
        return { select: mockSelectDraft }
      })

      await expect(
        LeagueService.createLeagueFromDraft('draft-1', {
          splitIntoConferences: false,
          totalWeeks: 4,
        })
      ).rejects.toThrow('Draft must be completed to create league')
    })

    it('should throw when draft has fewer than 2 teams', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockEqLeagues = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockSelectLeagues = vi.fn().mockReturnValue({ eq: mockEqLeagues })

      const mockSingleDraft = vi.fn().mockResolvedValue({
        data: {
          id: 'draft-1',
          name: 'Test Draft',
          status: 'completed',
          teams: [
            { id: 'team-1', draft_id: 'draft-1', name: 'Team 1', owner_id: 'u1', budget_remaining: 100, draft_order: 1, undos_remaining: 3 },
          ],
        },
        error: null,
      })
      const mockEqDraft = vi.fn().mockReturnValue({ single: mockSingleDraft })
      const mockSelectDraft = vi.fn().mockReturnValue({ eq: mockEqDraft })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (table === 'leagues' || callCount === 1) {
          return { select: mockSelectLeagues }
        }
        return { select: mockSelectDraft }
      })

      await expect(
        LeagueService.createLeagueFromDraft('draft-1', {
          splitIntoConferences: false,
          totalWeeks: 4,
        })
      ).rejects.toThrow('Need at least 2 teams to create league')
    })
  })

  // =========================================================================
  // getLeague
  // =========================================================================
  describe('getLeague', () => {
    it('should return null when league is not found', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await LeagueService.getLeague('nonexistent-league')
      expect(result).toBeNull()
    })

    it('should return league with teams when found', async () => {
      const leagueRow = {
        id: 'league-1',
        draft_id: 'draft-1',
        name: 'Test League',
        league_type: 'single',
        season_number: 1,
        status: 'active',
        start_date: '2025-01-01T00:00:00Z',
        end_date: null,
        current_week: 1,
        total_weeks: 4,
        settings: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        league_teams: [
          {
            team: {
              id: 'team-1',
              draft_id: 'draft-1',
              name: 'Team Alpha',
              owner_id: 'u1',
              budget_remaining: 50,
              draft_order: 1,
              undos_remaining: 3,
            },
          },
          {
            team: {
              id: 'team-2',
              draft_id: 'draft-1',
              name: 'Team Beta',
              owner_id: 'u2',
              budget_remaining: 75,
              draft_order: 2,
              undos_remaining: 3,
            },
          },
        ],
      }

      const mockSingle = vi.fn().mockResolvedValue({ data: leagueRow, error: null })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await LeagueService.getLeague('league-1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('league-1')
      expect(result!.name).toBe('Test League')
      expect(result!.teams).toHaveLength(2)
      expect(result!.teams[0].name).toBe('Team Alpha')
      expect(result!.teams[1].name).toBe('Team Beta')
    })

    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(LeagueService.getLeague('league-1')).rejects.toThrow(
        'Supabase not configured'
      )

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })
  })

  // =========================================================================
  // getStandings
  // =========================================================================
  describe('getStandings', () => {
    it('should return empty array when no standings exist', async () => {
      const mockOrder = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await LeagueService.getStandings('league-1')
      expect(result).toEqual([])
    })

    it('should return standings with team data mapped correctly', async () => {
      const standingRows = [
        {
          id: 'standing-1',
          league_id: 'league-1',
          team_id: 'team-1',
          wins: 3,
          losses: 1,
          draws: 0,
          points_for: 9,
          points_against: 3,
          point_differential: 6,
          rank: 1,
          current_streak: 'W2',
          updated_at: '2025-01-15T00:00:00Z',
          team: {
            id: 'team-1',
            draft_id: 'draft-1',
            name: 'Team Alpha',
            owner_id: 'u1',
            budget_remaining: 50,
            draft_order: 1,
            undos_remaining: 3,
          },
        },
        {
          id: 'standing-2',
          league_id: 'league-1',
          team_id: 'team-2',
          wins: 1,
          losses: 3,
          draws: 0,
          points_for: 3,
          points_against: 9,
          point_differential: -6,
          rank: 2,
          current_streak: 'L1',
          updated_at: '2025-01-15T00:00:00Z',
          team: {
            id: 'team-2',
            draft_id: 'draft-1',
            name: 'Team Beta',
            owner_id: 'u2',
            budget_remaining: 75,
            draft_order: 2,
            undos_remaining: 3,
          },
        },
      ]

      const mockOrder = vi.fn().mockResolvedValue({ data: standingRows, error: null })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await LeagueService.getStandings('league-1')

      expect(result).toHaveLength(2)
      expect(result[0].wins).toBe(3)
      expect(result[0].rank).toBe(1)
      expect(result[0].team.name).toBe('Team Alpha')
      expect(result[1].losses).toBe(3)
      expect(result[1].team.name).toBe('Team Beta')
    })
  })

  // =========================================================================
  // updateMatchResult
  // =========================================================================
  describe('updateMatchResult', () => {
    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(
        LeagueService.updateMatchResult('match-1', {
          homeScore: 2,
          awayScore: 1,
          winnerTeamId: 'team-1',
          status: 'completed',
        })
      ).rejects.toThrow('Supabase not configured')

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should throw when update fails', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        error: { message: 'Update failed' },
      })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ update: mockUpdate })

      await expect(
        LeagueService.updateMatchResult('match-1', {
          homeScore: 2,
          awayScore: 1,
          winnerTeamId: 'team-1',
          status: 'completed',
        })
      ).rejects.toThrow('Failed to update match result')
    })
  })

  // =========================================================================
  // getLeagueByDraftId
  // =========================================================================
  describe('getLeagueByDraftId', () => {
    it('should return null when no league exists for draft', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await LeagueService.getLeagueByDraftId('draft-999')
      expect(result).toBeNull()
    })

    it('should return league when found by draft ID', async () => {
      const leagueRow = {
        id: 'league-1',
        draft_id: 'draft-1',
        name: 'Test League',
        league_type: 'single',
        season_number: 1,
        status: 'active',
        start_date: null,
        end_date: null,
        current_week: 2,
        total_weeks: 6,
        settings: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-10T00:00:00Z',
      }

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: leagueRow, error: null })
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await LeagueService.getLeagueByDraftId('draft-1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('league-1')
      expect(result!.draftId).toBe('draft-1')
      expect(result!.currentWeek).toBe(2)
    })
  })

  // =========================================================================
  // submitMatchResult (dual confirmation)
  // =========================================================================
  describe('submitMatchResult', () => {
    it('should throw when team is not part of the match', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'match-1',
          home_team_id: 'team-1',
          away_team_id: 'team-2',
          notes: null,
          league_id: 'league-1',
        },
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      await expect(
        LeagueService.submitMatchResult('match-1', 'team-outsider', {
          homeScore: 2,
          awayScore: 1,
          winnerTeamId: 'team-1',
        })
      ).rejects.toThrow('Team is not part of this match')
    })

    it('should return pending when only one team has submitted', async () => {
      // First call: match fetch
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'match-1',
          home_team_id: 'team-1',
          away_team_id: 'team-2',
          notes: null,
          league_id: 'league-1',
        },
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelectFirst = vi.fn().mockReturnValue({ eq: mockEq })

      // Second call: match update (save submission)
      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

      let callCount = 0
      mockSupabase.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return { select: mockSelectFirst }
        }
        return { update: mockUpdate }
      })

      const result = await LeagueService.submitMatchResult('match-1', 'team-1', {
        homeScore: 2,
        awayScore: 1,
        winnerTeamId: 'team-1',
      })

      expect(result.status).toBe('pending')
    })
  })

  // =========================================================================
  // getMatchSubmissionStatus
  // =========================================================================
  describe('getMatchSubmissionStatus', () => {
    it('should return none status when no notes exist', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { notes: null },
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await LeagueService.getMatchSubmissionStatus('match-1')

      expect(result.homeSubmitted).toBe(false)
      expect(result.awaySubmitted).toBe(false)
      expect(result.confirmationStatus).toBe('none')
    })

    it('should return submission status from parsed notes', async () => {
      const notes = JSON.stringify({
        submissions: {
          home: { homeScore: 2, awayScore: 1, winnerTeamId: 'team-1' },
        },
        confirmationStatus: 'pending',
      })

      const mockSingle = vi.fn().mockResolvedValue({
        data: { notes },
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await LeagueService.getMatchSubmissionStatus('match-1')

      expect(result.homeSubmitted).toBe(true)
      expect(result.awaySubmitted).toBe(false)
      expect(result.confirmationStatus).toBe('pending')
      expect(result.homeSubmission?.homeScore).toBe(2)
    })
  })
})
