import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { DraftService } from '@/lib/draft-service'
import { mockDraft, mockTeams, mockParticipants, mockAuthUser, mockUserProfile } from './utils/test-data'

// Mock Supabase
const mockSupabase = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
  channel: vi.fn(),
  removeChannel: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
}))

// Mock UserSessionService
vi.mock('@/lib/user-session', () => ({
  UserSessionService: {
    recordDraftParticipation: vi.fn(),
    updateDraftParticipation: vi.fn(),
    getDraftParticipation: vi.fn(),
    getActiveDraftParticipations: vi.fn(),
  },
}))

// Mock room-utils
vi.mock('@/lib/room-utils', () => ({
  generateRoomCode: vi.fn(() => 'TEST01'),
}))

// Mock format rules
vi.mock('@/domain/rules', () => ({
  createFormatRulesEngine: vi.fn(async () => ({
    validatePokemon: vi.fn(async () => ({
      isLegal: true,
      cost: 10,
    })),
  })),
}))

// Mock pokemon-api
vi.mock('@/lib/pokemon-api', () => ({
  fetchPokemon: vi.fn(async (id: string) => ({
    id,
    name: 'Bulbasaur',
    types: ['grass', 'poison'],
    stats: {
      hp: 45,
      attack: 49,
      defense: 49,
      specialAttack: 65,
      specialDefense: 65,
      speed: 45,
    },
    baseStatTotal: 318,
  })),
}))

describe('DraftService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('generateRoomCode', () => {
    it('should generate a room code', () => {
      const roomCode = DraftService.generateRoomCode()

      expect(roomCode).toBeDefined()
      expect(typeof roomCode).toBe('string')
    })
  })

  describe('createDraft', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockAuthUser },
        error: null,
      })
    })

    it('should create draft with correct settings', async () => {
      const mockInsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { ...mockDraft, id: 'new-draft-id' },
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
      })

      mockInsert.mockReturnValue({
        select: mockSelect,
      })

      mockSelect.mockReturnValue({
        single: mockSingle,
      })

      const result = await DraftService.createDraft({
        name: 'Test Draft',
        hostName: 'Host Player',
        teamName: 'Host Team',
        settings: {
          maxTeams: 4,
          draftType: 'snake',
          timeLimit: 60,
          pokemonPerTeam: 6,
          budgetPerTeam: 100,
        },
      })

      expect(result.roomCode).toBe('TEST01')
      expect(result.draftId).toBe('test01')
      expect(mockInsert).toHaveBeenCalled()
    })

    it('should throw error if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })

      await expect(
        DraftService.createDraft({
          name: 'Test Draft',
          hostName: 'Host Player',
          teamName: 'Host Team',
          settings: {
            maxTeams: 4,
            draftType: 'snake',
            timeLimit: 60,
            pokemonPerTeam: 6,
            budgetPerTeam: 100,
          },
        })
      ).rejects.toThrow('You must be logged in')
    })

    it('should throw error if snake draft has less than 6 Pokemon per team', async () => {
      await expect(
        DraftService.createDraft({
          name: 'Test Draft',
          hostName: 'Host Player',
          teamName: 'Host Team',
          settings: {
            maxTeams: 4,
            draftType: 'snake',
            timeLimit: 60,
            pokemonPerTeam: 4, // Too few
            budgetPerTeam: 100,
          },
        })
      ).rejects.toThrow('Snake drafts require at least 6 Pokémon')
    })

    it('should handle database errors gracefully', async () => {
      const mockInsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })

      mockSupabase.from.mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
      })

      mockInsert.mockReturnValue({
        select: mockSelect,
      })

      mockSelect.mockReturnValue({
        single: mockSingle,
      })

      await expect(
        DraftService.createDraft({
          name: 'Test Draft',
          hostName: 'Host Player',
          teamName: 'Host Team',
          settings: {
            maxTeams: 4,
            draftType: 'snake',
            timeLimit: 60,
            pokemonPerTeam: 6,
            budgetPerTeam: 100,
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('joinDraft', () => {
    beforeEach(() => {
      // Mock draft query
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          ...mockDraft,
          teams: mockTeams.slice(0, 2), // Only 2 teams joined
          participants: mockParticipants.slice(0, 2),
        },
        error: null,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
      }))

      mockEq.mockReturnValue({
        single: mockSingle,
      })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'drafts') {
          return { select: mockSelect }
        }
        if (table === 'user_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: mockUserProfile,
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'teams') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'new-team-id', name: 'New Team' },
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'participants') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: { id: 'new-participant-id' },
              error: null,
            }),
          }
        }
      })
    })

    it('should join draft successfully', async () => {
      const result = await DraftService.joinDraft({
        roomCode: 'TEST01',
        userId: 'user-3',
        teamName: 'New Team',
      })

      expect(result.draftId).toBe('test01')
      expect(result.teamId).toBe('new-team-id')
    })

    it('should throw error if draft not found', async () => {
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
          }),
        })),
      }))

      mockSupabase.from.mockReturnValue({ select: mockSelect })

      await expect(
        DraftService.joinDraft({
          roomCode: 'INVALID',
          userId: 'user-3',
          teamName: 'New Team',
        })
      ).rejects.toThrow('Draft room not found')
    })

    it('should throw error if team name is already taken', async () => {
      await expect(
        DraftService.joinDraft({
          roomCode: 'TEST01',
          userId: 'user-3',
          teamName: 'Team Alpha', // Already exists
        })
      ).rejects.toThrow('Team name "Team Alpha" is already taken')
    })
  })

  describe('getDraftState', () => {
    it('should fetch draft state with all relations', async () => {
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          ...mockDraft,
          teams: mockTeams,
          participants: mockParticipants,
          picks: [],
          auctions: [],
        },
        error: null,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
      }))

      mockEq.mockReturnValue({
        single: mockSingle,
      })

      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await DraftService.getDraftState('TEST01')

      expect(result).not.toBeNull()
      expect(result?.draft).toBeDefined()
      expect(result?.teams).toHaveLength(4)
      expect(result?.participants).toHaveLength(4)
    })

    it('should return null if draft not found', async () => {
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
          }),
        })),
      }))

      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await DraftService.getDraftState('INVALID')

      expect(result).toBeNull()
    })
  })

  describe('startDraft', () => {
    beforeEach(() => {
      // Mock getDraftState
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: mockDraft,
        teams: mockTeams,
        participants: mockParticipants,
        picks: [],
      })
    })

    it('should start draft and set status to active', async () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        update: mockUpdate,
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })

      await DraftService.startDraft('TEST01')

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          current_turn: 1,
        })
      )
    })

    it('should throw error if draft not found', async () => {
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue(null)

      await expect(DraftService.startDraft('INVALID')).rejects.toThrow('Draft not found')
    })
  })

  describe('makePick', () => {
    beforeEach(() => {
      // Mock getDraftState
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: { ...mockDraft, status: 'active', currentTurn: 1 },
        teams: mockTeams,
        participants: mockParticipants,
        picks: [],
      })

      // Mock validateUserCanPick
      vi.spyOn(DraftService, 'validateUserCanPick' as any).mockResolvedValue({
        canPick: true,
        teamId: 'team-1',
      })
    })

    it('should make pick successfully', async () => {
      const mockInsert = vi.fn().mockResolvedValue({
        data: { id: 'new-pick-id' },
        error: null,
      })

      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'picks') {
          return { insert: mockInsert }
        }
        if (table === 'teams') {
          return {
            update: mockUpdate,
          }
        }
        if (table === 'drafts') {
          return {
            update: mockUpdate,
          }
        }
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })

      await DraftService.makePick('draft-1', 'user-1', '1', 'Bulbasaur', 10)

      expect(mockInsert).toHaveBeenCalled()
    })

    it('should throw error if insufficient budget', async () => {
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: { ...mockDraft, status: 'active', currentTurn: 1 },
        teams: [{ ...mockTeams[0], budgetRemaining: 5 }],
        participants: mockParticipants,
        picks: [],
      })

      await expect(
        DraftService.makePick('draft-1', 'user-1', '1', 'Bulbasaur', 10)
      ).rejects.toThrow('Insufficient budget')
    })

    it('should throw error if not users turn', async () => {
      vi.spyOn(DraftService, 'validateUserCanPick' as any).mockResolvedValue({
        canPick: false,
        teamId: 'team-1',
        reason: 'It is not your turn',
      })

      await expect(
        DraftService.makePick('draft-1', 'user-2', '1', 'Bulbasaur', 10)
      ).rejects.toThrow('It is not your turn')
    })
  })

  describe('validateUserCanPick', () => {
    beforeEach(() => {
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: { ...mockDraft, status: 'active', currentTurn: 1 },
        teams: mockTeams,
        participants: mockParticipants,
        picks: [],
      })

      vi.spyOn(DraftService, 'getUserTeam' as any).mockResolvedValue('team-1')
    })

    it('should return canPick true if users turn', async () => {
      const result = await DraftService.validateUserCanPick('draft-1', 'user-1')

      expect(result.canPick).toBe(true)
      expect(result.teamId).toBe('team-1')
    })

    it('should return canPick false if draft is not active', async () => {
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: { ...mockDraft, status: 'setup', currentTurn: 1 },
        teams: mockTeams,
        participants: mockParticipants,
        picks: [],
      })

      const result = await DraftService.validateUserCanPick('draft-1', 'user-1')

      expect(result.canPick).toBe(false)
      expect(result.reason).toBe('Draft is not active')
    })

    it('should return canPick false if not users turn', async () => {
      vi.spyOn(DraftService, 'getUserTeam' as any).mockResolvedValue('team-2')

      const result = await DraftService.validateUserCanPick('draft-1', 'user-2')

      expect(result.canPick).toBe(false)
      expect(result.reason).toBe('It is not your turn')
    })
  })

  describe('verifyDraftPassword', () => {
    it('should return true for correct password', async () => {
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { password: 'correct-password' },
        error: null,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
      }))

      mockEq.mockReturnValue({
        single: mockSingle,
      })

      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await DraftService.verifyDraftPassword({
        roomCode: 'TEST01',
        password: 'correct-password',
      })

      expect(result).toBe(true)
    })

    it('should return false for incorrect password', async () => {
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { password: 'correct-password' },
        error: null,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
      }))

      mockEq.mockReturnValue({
        single: mockSingle,
      })

      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await DraftService.verifyDraftPassword({
        roomCode: 'TEST01',
        password: 'wrong-password',
      })

      expect(result).toBe(false)
    })

    it('should return true if draft has no password', async () => {
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { password: null },
        error: null,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
      }))

      mockEq.mockReturnValue({
        single: mockSingle,
      })

      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await DraftService.verifyDraftPassword({
        roomCode: 'TEST01',
        password: 'any-password',
      })

      expect(result).toBe(true)
    })
  })

  describe('pauseDraft', () => {
    it('should pause draft', async () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        update: mockUpdate,
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })

      await DraftService.pauseDraft('draft-1')

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'paused',
        })
      )
    })
  })

  describe('endDraft', () => {
    it('should end draft', async () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        update: mockUpdate,
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })

      await DraftService.endDraft('draft-1')

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        })
      )
    })
  })

  describe('resetDraft', () => {
    beforeEach(() => {
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: mockDraft,
        teams: mockTeams,
        participants: mockParticipants,
        picks: [],
      })
    })

    it('should reset draft to setup status', async () => {
      const mockDelete = vi.fn().mockReturnThis()
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'picks' || table === 'auctions' || table === 'bid_history') {
          return {
            delete: mockDelete,
          }
        }
        return {
          update: mockUpdate,
        }
      })

      mockDelete.mockReturnValue({
        eq: mockEq,
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })

      await DraftService.resetDraft('draft-1')

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'setup',
        })
      )
    })
  })
})
