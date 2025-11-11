import { describe, it, expect, beforeEach } from 'vitest'
import { useDraftStore } from '@/stores/draftStore'
import { selectCurrentTeam, selectUserTeam, selectIsUserTurn } from '@/stores/selectors'
import { createMockDraft, createMockTeam, createMockParticipant } from './utils/test-helpers'
import type { Pick } from '@/types'

describe('DraftStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useDraftStore.getState().reset()
  })

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useDraftStore.getState()

      expect(state.draft).toBeNull()
      expect(state.teamsById).toEqual({})
      expect(state.participantsById).toEqual({})
      expect(state.picksById).toEqual({})
      expect(state.teamIds).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })
  })

  describe('setDraft', () => {
    it('should update draft', () => {
      const draft = createMockDraft({ id: 'draft-1', name: 'Test Draft' })

      useDraftStore.getState().setDraft(draft)

      const state = useDraftStore.getState()
      expect(state.draft).toEqual(draft)
      expect(state.draft?.name).toBe('Test Draft')
    })
  })

  describe('setTeams', () => {
    it('should normalize teams and compute draft order', () => {
      const teams = [
        createMockTeam({ id: 'team-1', name: 'Team Alpha', draftOrder: 1 }),
        createMockTeam({ id: 'team-2', name: 'Team Beta', draftOrder: 2 }),
        createMockTeam({ id: 'team-3', name: 'Team Gamma', draftOrder: 3 }),
        createMockTeam({ id: 'team-4', name: 'Team Delta', draftOrder: 4 }),
      ]

      useDraftStore.getState().setTeams(teams)

      const state = useDraftStore.getState()
      expect(state.teamIds).toEqual(['team-1', 'team-2', 'team-3', 'team-4'])
      expect(state.teamsById['team-1'].name).toBe('Team Alpha')
      expect(state.draftOrder).toHaveLength(40) // 4 teams * 10 rounds default
    })

    it('should compute snake draft order correctly', () => {
      const draft = createMockDraft({
        settings: { maxPokemonPerTeam: 2, timeLimit: 60, pokemonPerTeam: 2, formatId: 'vgc-reg-h' }
      })
      const teams = [
        createMockTeam({ id: 'team-1', draftOrder: 1 }),
        createMockTeam({ id: 'team-2', draftOrder: 2 }),
      ]

      useDraftStore.getState().setDraft(draft)
      useDraftStore.getState().setTeams(teams)

      const state = useDraftStore.getState()
      // Round 1: 1, 2
      // Round 2: 2, 1 (reversed)
      expect(state.draftOrder).toEqual([1, 2, 2, 1])
    })
  })

  describe('setParticipants', () => {
    it('should normalize participants and build indexes', () => {
      const participants = [
        createMockParticipant({ id: 'p-1', userId: 'user-1', teamId: 'team-1' }),
        createMockParticipant({ id: 'p-2', userId: 'user-2', teamId: 'team-2' }),
      ]

      useDraftStore.getState().setParticipants(participants)

      const state = useDraftStore.getState()
      expect(state.participantIds).toEqual(['p-1', 'p-2'])
      expect(state.participantsByUserId['user-1']).toBe('p-1')
      expect(state.teamsByParticipantId['p-1']).toBe('team-1')
    })
  })

  describe('addPick', () => {
    beforeEach(() => {
      const draft = createMockDraft({ id: 'draft-1' })
      const teams = [
        createMockTeam({ id: 'team-1', budgetRemaining: 100 }),
      ]
      useDraftStore.getState().setDraft(draft)
      useDraftStore.getState().setTeams(teams)
    })

    it('should add pick to team', () => {
      const pick: Pick = {
        id: 'pick-1',
        draftId: 'draft-1',
        teamId: 'team-1',
        pokemonId: '1',
        pokemonName: 'Bulbasaur',
        cost: 10,
        pickOrder: 1,
        round: 1,
        createdAt: new Date().toISOString(),
      }

      useDraftStore.getState().addPick('team-1', pick)

      const state = useDraftStore.getState()
      expect(state.picksById['pick-1']).toEqual(pick)
      expect(state.picksByTeamId['team-1']).toContain('pick-1')
    })

    it('should update team budget when adding pick', () => {
      const pick: Pick = {
        id: 'pick-1',
        draftId: 'draft-1',
        teamId: 'team-1',
        pokemonId: '1',
        pokemonName: 'Bulbasaur',
        cost: 15,
        pickOrder: 1,
        round: 1,
        createdAt: new Date().toISOString(),
      }

      useDraftStore.getState().addPick('team-1', pick)

      const state = useDraftStore.getState()
      expect(state.teamsById['team-1'].budgetRemaining).toBe(85) // 100 - 15
    })

    it('should sort picks by pickOrder', () => {
      const pick1: Pick = {
        id: 'pick-1',
        draftId: 'draft-1',
        teamId: 'team-1',
        pokemonId: '1',
        pokemonName: 'Bulbasaur',
        cost: 10,
        pickOrder: 2,
        round: 1,
        createdAt: new Date().toISOString(),
      }

      const pick2: Pick = {
        id: 'pick-2',
        draftId: 'draft-1',
        teamId: 'team-1',
        pokemonId: '4',
        pokemonName: 'Charmander',
        cost: 10,
        pickOrder: 1,
        round: 1,
        createdAt: new Date().toISOString(),
      }

      useDraftStore.getState().addPick('team-1', pick1)
      useDraftStore.getState().addPick('team-1', pick2)

      const state = useDraftStore.getState()
      // Should be sorted by pickOrder
      expect(state.picksByTeamId['team-1']).toEqual(['pick-2', 'pick-1'])
    })
  })

  describe('removePick', () => {
    beforeEach(() => {
      const draft = createMockDraft({ id: 'draft-1' })
      const teams = [
        createMockTeam({ id: 'team-1', budgetRemaining: 100 }),
      ]
      const pick: Pick = {
        id: 'pick-1',
        draftId: 'draft-1',
        teamId: 'team-1',
        pokemonId: '1',
        pokemonName: 'Bulbasaur',
        cost: 15,
        pickOrder: 1,
        round: 1,
        createdAt: new Date().toISOString(),
      }

      useDraftStore.getState().setDraft(draft)
      useDraftStore.getState().setTeams(teams)
      useDraftStore.getState().addPick('team-1', pick)
    })

    it('should remove pick from store', () => {
      useDraftStore.getState().removePick('pick-1')

      const state = useDraftStore.getState()
      expect(state.picksById['pick-1']).toBeUndefined()
      expect(state.picksByTeamId['team-1']).not.toContain('pick-1')
    })

    it('should restore team budget when removing pick', () => {
      useDraftStore.getState().removePick('pick-1')

      const state = useDraftStore.getState()
      expect(state.teamsById['team-1'].budgetRemaining).toBe(100) // 85 + 15
    })
  })

  describe('updateTeam', () => {
    beforeEach(() => {
      const teams = [
        createMockTeam({ id: 'team-1', name: 'Original Name', budgetRemaining: 100 }),
      ]
      useDraftStore.getState().setTeams(teams)
    })

    it('should update team properties', () => {
      useDraftStore.getState().updateTeam('team-1', { name: 'Updated Name' })

      const state = useDraftStore.getState()
      expect(state.teamsById['team-1'].name).toBe('Updated Name')
    })

    it('should prevent negative budget', () => {
      useDraftStore.getState().updateTeam('team-1', { budgetRemaining: -10 })

      const state = useDraftStore.getState()
      expect(state.teamsById['team-1'].budgetRemaining).toBe(0)
    })
  })

  describe('updateTeamBudget', () => {
    beforeEach(() => {
      const teams = [
        createMockTeam({ id: 'team-1', budgetRemaining: 100 }),
      ]
      useDraftStore.getState().setTeams(teams)
    })

    it('should add to team budget', () => {
      useDraftStore.getState().updateTeamBudget('team-1', 20)

      const state = useDraftStore.getState()
      expect(state.teamsById['team-1'].budgetRemaining).toBe(120)
    })

    it('should subtract from team budget', () => {
      useDraftStore.getState().updateTeamBudget('team-1', -30)

      const state = useDraftStore.getState()
      expect(state.teamsById['team-1'].budgetRemaining).toBe(70)
    })

    it('should not allow negative budget', () => {
      useDraftStore.getState().updateTeamBudget('team-1', -150)

      const state = useDraftStore.getState()
      expect(state.teamsById['team-1'].budgetRemaining).toBe(100) // Should not change
    })
  })

  describe('Selectors', () => {
    beforeEach(() => {
      const draft = createMockDraft({
        id: 'draft-1',
        currentTurn: 1,
        settings: { maxPokemonPerTeam: 2, timeLimit: 60, pokemonPerTeam: 2, formatId: 'vgc-reg-h' }
      })
      const teams = [
        createMockTeam({ id: 'team-1', draftOrder: 1, ownerId: 'user-1' }),
        createMockTeam({ id: 'team-2', draftOrder: 2, ownerId: 'user-2' }),
      ]
      const participants = [
        createMockParticipant({ id: 'p-1', userId: 'user-1', teamId: 'team-1' }),
        createMockParticipant({ id: 'p-2', userId: 'user-2', teamId: 'team-2' }),
      ]

      useDraftStore.getState().setDraft(draft)
      useDraftStore.getState().setTeams(teams)
      useDraftStore.getState().setParticipants(participants)
    })

    describe('selectCurrentTeam', () => {
      it('should return team for current turn', () => {
        const state = useDraftStore.getState()
        const currentTeam = selectCurrentTeam(state)

        expect(currentTeam).not.toBeNull()
        expect(currentTeam?.draftOrder).toBe(1)
      })

      it('should return correct team for turn 2 (still team 2 in snake)', () => {
        useDraftStore.getState().setDraft(createMockDraft({
          currentTurn: 2,
          settings: { maxPokemonPerTeam: 2, timeLimit: 60, pokemonPerTeam: 2, formatId: 'vgc-reg-h' }
        }))

        const state = useDraftStore.getState()
        const currentTeam = selectCurrentTeam(state)

        expect(currentTeam?.draftOrder).toBe(2)
      })

      it('should return correct team for turn 3 (reversed to team 2)', () => {
        useDraftStore.getState().setDraft(createMockDraft({
          currentTurn: 3,
          settings: { maxPokemonPerTeam: 2, timeLimit: 60, pokemonPerTeam: 2, formatId: 'vgc-reg-h' }
        }))

        const state = useDraftStore.getState()
        const currentTeam = selectCurrentTeam(state)

        expect(currentTeam?.draftOrder).toBe(2)
      })

      it('should return null if turn exceeds draft length', () => {
        useDraftStore.getState().setDraft(createMockDraft({
          currentTurn: 999,
          settings: { maxPokemonPerTeam: 2, timeLimit: 60, pokemonPerTeam: 2, formatId: 'vgc-reg-h' }
        }))

        const state = useDraftStore.getState()
        const currentTeam = selectCurrentTeam(state)

        expect(currentTeam).toBeNull()
      })
    })

    describe('selectUserTeam', () => {
      it('should return team for user', () => {
        const state = useDraftStore.getState()
        const userTeam = selectUserTeam('user-1')(state)

        expect(userTeam).not.toBeNull()
        expect(userTeam?.id).toBe('team-1')
      })

      it('should return null for non-existent user', () => {
        const state = useDraftStore.getState()
        const userTeam = selectUserTeam('user-999')(state)

        expect(userTeam).toBeNull()
      })
    })

    describe('selectIsUserTurn', () => {
      it('should return true if it is users turn', () => {
        const state = useDraftStore.getState()
        const isUserTurn = selectIsUserTurn('user-1')(state)

        expect(isUserTurn).toBe(true)
      })

      it('should return false if it is not users turn', () => {
        const state = useDraftStore.getState()
        const isUserTurn = selectIsUserTurn('user-2')(state)

        expect(isUserTurn).toBe(false)
      })
    })
  })

  describe('reset', () => {
    it('should reset store to initial state', () => {
      // Add some data
      const draft = createMockDraft()
      const teams = [createMockTeam()]
      useDraftStore.getState().setDraft(draft)
      useDraftStore.getState().setTeams(teams)

      // Reset
      useDraftStore.getState().reset()

      const state = useDraftStore.getState()
      expect(state.draft).toBeNull()
      expect(state.teamsById).toEqual({})
      expect(state.teamIds).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })
  })

  describe('setLoading', () => {
    it('should update loading state', () => {
      useDraftStore.getState().setLoading(true)

      const state = useDraftStore.getState()
      expect(state.isLoading).toBe(true)
    })
  })

  describe('setError', () => {
    it('should update error state', () => {
      useDraftStore.getState().setError('Test error')

      const state = useDraftStore.getState()
      expect(state.error).toBe('Test error')
    })

    it('should clear error when set to null', () => {
      useDraftStore.getState().setError('Test error')
      useDraftStore.getState().setError(null)

      const state = useDraftStore.getState()
      expect(state.error).toBeNull()
    })
  })
})
