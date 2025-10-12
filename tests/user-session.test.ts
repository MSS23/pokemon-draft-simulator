import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserSessionService } from '@/lib/user-session'
import type { DraftParticipation } from '@/lib/user-session'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: null,
      })),
    },
  },
}))

describe('UserSessionService', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('getOrCreateSession', () => {
    it('should return unauthenticated session when no user is logged in', async () => {
      const session = await UserSessionService.getOrCreateSession('TestUser')

      expect(session.displayName).toBe('TestUser')
      expect(session.isAuthenticated).toBe(false)
      expect(session.userId).toBe('')
    })

    it('should return stored session from localStorage if exists', async () => {
      // Set up stored session
      const storedSession = {
        userId: 'guest-123',
        displayName: 'StoredUser',
        createdAt: '2025-01-01T00:00:00Z',
        lastActivity: '2025-01-01T00:00:00Z',
        isAuthenticated: false,
      }
      localStorage.setItem('pokemon-draft-user-session', JSON.stringify(storedSession))

      const session = await UserSessionService.getOrCreateSession()

      expect(session.userId).toBe('guest-123')
      expect(session.displayName).toBe('StoredUser')
      expect(session.isAuthenticated).toBe(false)
    })

    it('should update lastActivity when returning stored session', async () => {
      const oldTime = '2025-01-01T00:00:00Z'
      const storedSession = {
        userId: 'guest-123',
        displayName: 'TestUser',
        createdAt: oldTime,
        lastActivity: oldTime,
        isAuthenticated: false,
      }
      localStorage.setItem('pokemon-draft-user-session', JSON.stringify(storedSession))

      const session = await UserSessionService.getOrCreateSession()

      expect(new Date(session.lastActivity).getTime()).toBeGreaterThan(new Date(oldTime).getTime())
    })

    it('should handle malformed localStorage data gracefully', async () => {
      localStorage.setItem('pokemon-draft-user-session', 'invalid-json')

      const session = await UserSessionService.getOrCreateSession('FallbackUser')

      expect(session.displayName).toBe('FallbackUser')
      expect(session.isAuthenticated).toBe(false)
    })
  })

  describe('updateActivity', () => {
    it('should update lastActivity timestamp', async () => {
      const storedSession = {
        userId: 'guest-123',
        displayName: 'TestUser',
        createdAt: '2025-01-01T00:00:00Z',
        lastActivity: '2025-01-01T00:00:00Z',
        isAuthenticated: false,
      }
      localStorage.setItem('pokemon-draft-user-session', JSON.stringify(storedSession))

      UserSessionService.updateActivity()

      const updated = JSON.parse(localStorage.getItem('pokemon-draft-user-session')!)
      expect(new Date(updated.lastActivity).getTime()).toBeGreaterThan(new Date('2025-01-01T00:00:00Z').getTime())
    })

    it('should not throw if no session exists', () => {
      expect(() => UserSessionService.updateActivity()).not.toThrow()
    })
  })

  describe('getCurrentSession', () => {
    it('should return current session if exists', () => {
      const storedSession = {
        userId: 'guest-123',
        displayName: 'TestUser',
        createdAt: '2025-01-01T00:00:00Z',
        lastActivity: '2025-01-01T00:00:00Z',
        isAuthenticated: false,
      }
      localStorage.setItem('pokemon-draft-user-session', JSON.stringify(storedSession))

      const session = UserSessionService.getCurrentSession()

      expect(session).not.toBeNull()
      expect(session?.userId).toBe('guest-123')
    })

    it('should return null if no session exists', () => {
      const session = UserSessionService.getCurrentSession()

      expect(session).toBeNull()
    })
  })

  describe('clearSession', () => {
    it('should remove session from localStorage', () => {
      const storedSession = {
        userId: 'guest-123',
        displayName: 'TestUser',
        createdAt: '2025-01-01T00:00:00Z',
        lastActivity: '2025-01-01T00:00:00Z',
        isAuthenticated: false,
      }
      localStorage.setItem('pokemon-draft-user-session', JSON.stringify(storedSession))

      UserSessionService.clearSession()

      expect(localStorage.getItem('pokemon-draft-user-session')).toBeNull()
    })
  })

  describe('recordDraftParticipation', () => {
    it('should store draft participation', () => {
      const participation: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        displayName: 'Player One',
        isHost: true,
        status: 'active',
      }

      UserSessionService.recordDraftParticipation(participation)

      const stored = JSON.parse(localStorage.getItem('pokemon-draft-participation')!)
      expect(stored).toHaveLength(1)
      expect(stored[0].draftId).toBe('draft-1')
      expect(stored[0].teamName).toBe('Team Alpha')
    })

    it('should replace existing participation for same draft', () => {
      const participation1: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        displayName: 'Player One',
        isHost: true,
        status: 'active',
      }

      const participation2: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-2',
        teamName: 'Team Beta',
        displayName: 'Player One',
        isHost: false,
        status: 'active',
      }

      UserSessionService.recordDraftParticipation(participation1)
      UserSessionService.recordDraftParticipation(participation2)

      const stored = JSON.parse(localStorage.getItem('pokemon-draft-participation')!)
      expect(stored).toHaveLength(1)
      expect(stored[0].teamName).toBe('Team Beta')
    })

    it('should limit to 20 participations', () => {
      // Add 25 participations
      for (let i = 0; i < 25; i++) {
        const participation: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
          draftId: `draft-${i}`,
          userId: 'user-1',
          teamId: `team-${i}`,
          teamName: `Team ${i}`,
          displayName: 'Player One',
          isHost: false,
          status: 'active',
        }
        UserSessionService.recordDraftParticipation(participation)
      }

      const stored = JSON.parse(localStorage.getItem('pokemon-draft-participation')!)
      expect(stored).toHaveLength(20)
    })
  })

  describe('updateDraftParticipation', () => {
    it('should update existing participation', () => {
      const participation: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        displayName: 'Player One',
        isHost: true,
        status: 'active',
      }
      UserSessionService.recordDraftParticipation(participation)

      UserSessionService.updateDraftParticipation('draft-1', { status: 'completed' })

      const stored = JSON.parse(localStorage.getItem('pokemon-draft-participation')!)
      expect(stored[0].status).toBe('completed')
    })

    it('should not throw if participation does not exist', () => {
      expect(() => UserSessionService.updateDraftParticipation('draft-1', { status: 'completed' })).not.toThrow()
    })
  })

  describe('getDraftParticipations', () => {
    it('should return all participations sorted by lastActivity', () => {
      const participation1: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        displayName: 'Player One',
        isHost: true,
        status: 'active',
      }

      const participation2: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-2',
        userId: 'user-1',
        teamId: 'team-2',
        teamName: 'Team Beta',
        displayName: 'Player One',
        isHost: false,
        status: 'completed',
      }

      UserSessionService.recordDraftParticipation(participation1)
      UserSessionService.recordDraftParticipation(participation2)

      const participations = UserSessionService.getDraftParticipations()

      expect(participations).toHaveLength(2)
      // Most recent should be first
      expect(participations[0].draftId).toBe('draft-2')
    })

    it('should return empty array if no participations', () => {
      const participations = UserSessionService.getDraftParticipations()

      expect(participations).toHaveLength(0)
    })
  })

  describe('getActiveDraftParticipations', () => {
    it('should return only active participations', () => {
      const participation1: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        displayName: 'Player One',
        isHost: true,
        status: 'active',
      }

      const participation2: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-2',
        userId: 'user-1',
        teamId: 'team-2',
        teamName: 'Team Beta',
        displayName: 'Player One',
        isHost: false,
        status: 'completed',
      }

      UserSessionService.recordDraftParticipation(participation1)
      UserSessionService.recordDraftParticipation(participation2)

      const activeParticipations = UserSessionService.getActiveDraftParticipations()

      expect(activeParticipations).toHaveLength(1)
      expect(activeParticipations[0].draftId).toBe('draft-1')
    })
  })

  describe('getVisibleDraftParticipations', () => {
    it('should exclude abandoned participations', () => {
      const participation1: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        displayName: 'Player One',
        isHost: true,
        status: 'active',
      }

      const participation2: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-2',
        userId: 'user-1',
        teamId: 'team-2',
        teamName: 'Team Beta',
        displayName: 'Player One',
        isHost: false,
        status: 'abandoned',
      }

      UserSessionService.recordDraftParticipation(participation1)
      UserSessionService.recordDraftParticipation(participation2)

      const visibleParticipations = UserSessionService.getVisibleDraftParticipations()

      expect(visibleParticipations).toHaveLength(1)
      expect(visibleParticipations[0].draftId).toBe('draft-1')
    })
  })

  describe('cleanupAbandonedDrafts', () => {
    it('should remove abandoned participations', () => {
      const participation1: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        displayName: 'Player One',
        isHost: true,
        status: 'active',
      }

      const participation2: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-2',
        userId: 'user-1',
        teamId: 'team-2',
        teamName: 'Team Beta',
        displayName: 'Player One',
        isHost: false,
        status: 'abandoned',
      }

      UserSessionService.recordDraftParticipation(participation1)
      UserSessionService.recordDraftParticipation(participation2)

      UserSessionService.cleanupAbandonedDrafts()

      const stored = JSON.parse(localStorage.getItem('pokemon-draft-participation')!)
      expect(stored).toHaveLength(1)
      expect(stored[0].draftId).toBe('draft-1')
    })
  })

  describe('getDraftParticipation', () => {
    it('should return specific draft participation', () => {
      const participation: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        displayName: 'Player One',
        isHost: true,
        status: 'active',
      }
      UserSessionService.recordDraftParticipation(participation)

      const found = UserSessionService.getDraftParticipation('draft-1')

      expect(found).not.toBeNull()
      expect(found?.draftId).toBe('draft-1')
      expect(found?.teamName).toBe('Team Alpha')
    })

    it('should return null if participation not found', () => {
      const found = UserSessionService.getDraftParticipation('draft-999')

      expect(found).toBeNull()
    })
  })

  describe('removeDraftParticipation', () => {
    it('should remove specific participation', () => {
      const participation: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'> = {
        draftId: 'draft-1',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        displayName: 'Player One',
        isHost: true,
        status: 'active',
      }
      UserSessionService.recordDraftParticipation(participation)

      UserSessionService.removeDraftParticipation('draft-1')

      const stored = localStorage.getItem('pokemon-draft-participation')
      expect(stored).toBe('[]')
    })
  })

  describe('getUserIdForDraft', () => {
    it('should return userId from current session if exists', () => {
      const storedSession = {
        userId: 'user-123',
        displayName: 'TestUser',
        createdAt: '2025-01-01T00:00:00Z',
        lastActivity: '2025-01-01T00:00:00Z',
        isAuthenticated: false,
      }
      localStorage.setItem('pokemon-draft-user-session', JSON.stringify(storedSession))

      const userId = UserSessionService.getUserIdForDraft('draft-1')

      expect(userId).toBe('user-123')
    })

    it('should generate new userId if no session exists', () => {
      const userId = UserSessionService.getUserIdForDraft('draft-1')

      expect(userId).toMatch(/^guest-\d+-[a-z0-9]+$/)
    })

    it('should store generated userId in sessionStorage', () => {
      const userId = UserSessionService.getUserIdForDraft('draft-1')

      const stored = sessionStorage.getItem('draft-user-draft-1')
      expect(stored).toBe(userId)
    })
  })

  describe('cleanupOldParticipations', () => {
    it('should remove participations older than 30 days', () => {
      const oldParticipation = {
        draftId: 'draft-old',
        userId: 'user-1',
        teamId: 'team-1',
        teamName: 'Old Team',
        displayName: 'Player One',
        isHost: true,
        status: 'completed',
        lastActivity: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        joinedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      }

      const recentParticipation = {
        draftId: 'draft-recent',
        userId: 'user-1',
        teamId: 'team-2',
        teamName: 'Recent Team',
        displayName: 'Player One',
        isHost: false,
        status: 'active',
        lastActivity: new Date().toISOString(),
        joinedAt: new Date().toISOString(),
      }

      localStorage.setItem('pokemon-draft-participation', JSON.stringify([oldParticipation, recentParticipation]))

      UserSessionService.cleanupOldParticipations()

      const stored = JSON.parse(localStorage.getItem('pokemon-draft-participation')!)
      expect(stored).toHaveLength(1)
      expect(stored[0].draftId).toBe('draft-recent')
    })
  })
})
