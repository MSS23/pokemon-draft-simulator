/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { DraftService } from '@/lib/draft-service'
import { supabase } from '@/lib/supabase'
import { mockAuthUser } from './utils/test-data'

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (password: string) => `hashed_${password}`),
    compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`),
  },
}))

// Mock Supabase - use factory function to avoid hoisting issues
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
    channel: vi.fn(),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
  },
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

// Mock draft utils
vi.mock('@/utils/draft', () => ({
  generateSnakeDraftOrder: vi.fn((teams: any[], maxRounds: number) => {
    // Simple snake: for 4 teams, round 1: [1,2,3,4], round 2: [4,3,2,1], etc.
    const order: number[] = []
    for (let round = 0; round < maxRounds; round++) {
      const teamOrders = teams.map((t: any) => t.draft_order).sort((a: number, b: number) => a - b)
      if (round % 2 === 0) {
        order.push(...teamOrders)
      } else {
        order.push(...teamOrders.reverse())
      }
    }
    return order
  }),
  getCurrentPick: vi.fn(),
}))

// Mock formats
vi.mock('@/lib/formats', () => ({
  getFormatById: vi.fn(() => null),
  DEFAULT_FORMAT: 'vgc-reg-h',
}))

// ---- Snake_case mock data matching Database types ----
const mockDraftDb = {
  id: 'draft-uuid-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  name: 'Test Draft',
  host_id: 'user-1',
  format: 'snake' as const,
  ruleset: 'vgc-reg-h',
  budget_per_team: 100,
  max_teams: 4,
  status: 'active' as const,
  current_turn: 1,
  current_round: 1,
  turn_started_at: null,
  settings: {
    timeLimit: 60,
    pokemonPerTeam: 6,
    maxPokemonPerTeam: 6,
  },
  room_code: 'test01',
  is_public: false,
  spectator_count: 0,
  description: null,
  tags: null,
  password: null,
  custom_format_id: null,
  deleted_at: null,
  deleted_by: null,
}

const mockTeamsDb = [
  {
    id: 'team-1',
    draft_id: 'draft-uuid-1',
    name: 'Team Alpha',
    owner_id: 'user-1',
    draft_order: 1,
    budget_remaining: 100,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'team-2',
    draft_id: 'draft-uuid-1',
    name: 'Team Beta',
    owner_id: 'user-2',
    draft_order: 2,
    budget_remaining: 100,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'team-3',
    draft_id: 'draft-uuid-1',
    name: 'Team Gamma',
    owner_id: 'user-3',
    draft_order: 3,
    budget_remaining: 100,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'team-4',
    draft_id: 'draft-uuid-1',
    name: 'Team Delta',
    owner_id: 'user-4',
    draft_order: 4,
    budget_remaining: 100,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
]

const mockParticipantsDb = [
  {
    id: 'participant-1',
    draft_id: 'draft-uuid-1',
    user_id: 'user-1',
    display_name: 'Player One',
    team_id: 'team-1',
    is_host: true,
    last_seen: '2025-01-01T00:00:00Z',
  },
  {
    id: 'participant-2',
    draft_id: 'draft-uuid-1',
    user_id: 'user-2',
    display_name: 'Player Two',
    team_id: 'team-2',
    is_host: false,
    last_seen: '2025-01-01T00:00:00Z',
  },
  {
    id: 'participant-3',
    draft_id: 'draft-uuid-1',
    user_id: 'user-3',
    display_name: 'Player Three',
    team_id: 'team-3',
    is_host: false,
    last_seen: '2025-01-01T00:00:00Z',
  },
  {
    id: 'participant-4',
    draft_id: 'draft-uuid-1',
    user_id: 'user-4',
    display_name: 'Player Four',
    team_id: 'team-4',
    is_host: false,
    last_seen: '2025-01-01T00:00:00Z',
  },
]

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
      ;(vi.mocked(supabase).auth.getUser as any).mockResolvedValue({
        data: { user: mockAuthUser },
        error: null,
      })
    })

    it('should create draft with correct settings', async () => {
      const mockInsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { ...mockDraftDb, id: 'new-draft-id' },
        error: null,
      })

      vi.mocked(supabase).from.mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
      } as any)

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
      ;(vi.mocked(supabase).auth.getUser as any).mockResolvedValue({
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

      vi.mocked(supabase).from.mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
      } as any)

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
      // Mock supabase.from to handle each table
      vi.mocked(supabase).from.mockImplementation((table: string) => {
        if (table === 'user_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { display_name: 'Player Three' },
                  error: null,
                }),
              })),
            })),
          } as any
        }
        if (table === 'drafts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    ...mockDraftDb,
                    status: 'setup',
                    teams: mockTeamsDb.slice(0, 2), // Only 2 teams joined
                    participants: mockParticipantsDb.slice(0, 2),
                  },
                  error: null,
                }),
              })),
            })),
          } as any
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
          } as any
        }
        if (table === 'participants') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: { id: 'new-participant-id' },
              error: null,
            }),
          } as any
        }
        return {} as any
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
      vi.mocked(supabase).from.mockImplementation((table: string) => {
        if (table === 'user_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { display_name: 'Player Three' },
                  error: null,
                }),
              })),
            })),
          } as any
        }
        if (table === 'drafts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Not found' },
                }),
              })),
            })),
          } as any
        }
        return {} as any
      })

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
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          ...mockDraftDb,
          teams: mockTeamsDb,
          participants: mockParticipantsDb,
          picks: [],
          auctions: [],
        },
        error: null,
      })

      const mockEq = vi.fn().mockReturnValue({
        maybeSingle: mockMaybeSingle,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
      }))

      vi.mocked(supabase).from.mockReturnValue({ select: mockSelect } as any)

      const result = await DraftService.getDraftState('TEST01')

      expect(result).not.toBeNull()
      expect(result?.draft).toBeDefined()
      expect(result?.teams).toHaveLength(4)
      expect(result?.participants).toHaveLength(4)
    })

    it('should return null if draft not found', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })

      const mockEq = vi.fn().mockReturnValue({
        maybeSingle: mockMaybeSingle,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
      }))

      vi.mocked(supabase).from.mockReturnValue({ select: mockSelect } as any)

      const result = await DraftService.getDraftState('INVALID')

      expect(result).toBeNull()
    })
  })

  describe('startDraft', () => {
    beforeEach(() => {
      // Mock getDraftState to return setup-status draft
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: { ...mockDraftDb, status: 'setup' as const } as any,
        teams: mockTeamsDb as any,
        participants: mockParticipantsDb as any,
        picks: [],
      })
    })

    it('should start draft and set status to active', async () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      // Second .eq() call returns the final resolved value
      mockEq.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      vi.mocked(supabase).from.mockReturnValue({
        update: mockUpdate,
      } as any)

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
        draft: { ...mockDraftDb, status: 'active' as const, current_turn: 1 } as any,
        teams: mockTeamsDb as any,
        participants: mockParticipantsDb as any,
        picks: [],
      })

      // Mock getUserTeam
      vi.spyOn(DraftService, 'getUserTeam' as any).mockResolvedValue('team-1')

      // Mock validatePokemonInFormat (private method)
      vi.spyOn(DraftService as any, 'validatePokemonInFormat').mockResolvedValue({
        isValid: true,
        validatedCost: 10,
      })
    })

    it('should make pick successfully via RPC', async () => {
      vi.mocked(supabase as any).rpc.mockResolvedValue({
        data: {
          success: true,
          pickId: 'new-pick-id',
          newBudget: 90,
          nextTurn: 2,
          isComplete: false,
        },
        error: null,
      })

      const result = await DraftService.makePick('draft-1', 'user-1', '1', 'Bulbasaur', 10)

      expect(result.pickId).toBe('new-pick-id')
      expect(result.newBudget).toBe(90)
      expect((supabase as any).rpc).toHaveBeenCalledWith('make_draft_pick', expect.objectContaining({
        p_pokemon_id: '1',
        p_pokemon_name: 'Bulbasaur',
        p_cost: 10,
      }))
    })

    it('should throw error if insufficient budget', async () => {
      vi.mocked(supabase as any).rpc.mockResolvedValue({
        data: {
          success: false,
          error: 'Insufficient budget',
          budgetRemaining: 5,
          cost: 10,
        },
        error: null,
      })

      await expect(
        DraftService.makePick('draft-1', 'user-1', '1', 'Bulbasaur', 10)
      ).rejects.toThrow('Insufficient budget')
    })

    it('should throw error if not users turn', async () => {
      vi.mocked(supabase as any).rpc.mockResolvedValue({
        data: {
          success: false,
          error: 'Not your turn',
        },
        error: null,
      })

      await expect(
        DraftService.makePick('draft-1', 'user-2', '1', 'Bulbasaur', 10)
      ).rejects.toThrow('Not your turn')
    })
  })

  describe('validateUserCanPick', () => {
    beforeEach(() => {
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: { ...mockDraftDb, status: 'active' as const, current_turn: 1 } as any,
        teams: mockTeamsDb as any,
        participants: mockParticipantsDb as any,
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
        draft: { ...mockDraftDb, status: 'setup' as const, current_turn: 1 } as any,
        teams: mockTeamsDb as any,
        participants: mockParticipantsDb as any,
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
        data: { password: 'hashed_correct-password' },
        error: null,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
      }))

      mockEq.mockReturnValue({
        single: mockSingle,
      })

      vi.mocked(supabase).from.mockReturnValue({ select: mockSelect } as any)

      const result = await DraftService.verifyDraftPassword({
        roomCode: 'TEST01',
        password: 'correct-password',
      })

      expect(result).toBe(true)
    })

    it('should return false for incorrect password', async () => {
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { password: 'hashed_correct-password' },
        error: null,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
      }))

      mockEq.mockReturnValue({
        single: mockSingle,
      })

      vi.mocked(supabase).from.mockReturnValue({ select: mockSelect } as any)

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

      vi.mocked(supabase).from.mockReturnValue({ select: mockSelect } as any)

      const result = await DraftService.verifyDraftPassword({
        roomCode: 'TEST01',
        password: 'any-password',
      })

      expect(result).toBe(true)
    })
  })

  describe('pauseDraft', () => {
    it('should pause draft', async () => {
      // Mock getDraftState
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: mockDraftDb as any,
        teams: mockTeamsDb as any,
        participants: mockParticipantsDb as any,
        picks: [],
      })

      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })

      vi.mocked(supabase).from.mockReturnValue({
        update: mockUpdate,
      } as any)

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
      // Mock getDraftState
      vi.spyOn(DraftService, 'getDraftState').mockResolvedValue({
        draft: mockDraftDb as any,
        teams: mockTeamsDb as any,
        participants: mockParticipantsDb as any,
        picks: [],
      })

      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })

      vi.mocked(supabase).from.mockReturnValue({
        update: mockUpdate,
      } as any)

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
        draft: mockDraftDb as any,
        teams: mockTeamsDb as any,
        participants: mockParticipantsDb as any,
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

      vi.mocked(supabase).from.mockImplementation((table: string) => {
        if (table === 'picks' || table === 'auctions' || table === 'bid_history') {
          return {
            delete: mockDelete,
          } as any
        }
        return {
          update: mockUpdate,
        } as any
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
