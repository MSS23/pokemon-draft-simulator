// User Session Management - Persistent sessions across browser restarts
// Handles user identification, draft participation tracking, and session recovery
// Now integrated with Supabase authentication

import { supabase } from './supabase'

export interface UserSession {
  userId: string
  displayName: string
  createdAt: string
  lastActivity: string
  isAuthenticated: boolean
  email?: string
}

export interface DraftParticipation {
  draftId: string
  userId: string
  teamId: string | null
  teamName: string | null
  displayName: string
  isHost: boolean
  status: 'active' | 'completed' | 'abandoned' | 'spectator'
  lastActivity: string
  joinedAt: string
}

const USER_SESSION_KEY = 'pokemon-draft-user-session'
const DRAFT_PARTICIPATION_KEY = 'pokemon-draft-participation'

export class UserSessionService {
  /**
   * Get or create a persistent user session
   * Now prioritizes Supabase authenticated users
   */
  static async getOrCreateSession(displayName?: string): Promise<UserSession> {
    if (typeof window === 'undefined') {
      // Server-side fallback
      return {
        userId: `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        displayName: displayName || 'Guest',
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        isAuthenticated: false
      }
    }

    // Check if user is authenticated with Supabase
    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const session: UserSession = {
            userId: user.id,
            displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
            email: user.email,
            createdAt: user.created_at,
            lastActivity: new Date().toISOString(),
            isAuthenticated: true
          }

          // Store in localStorage for caching
          try {
            localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session))
          } catch (error) {
            console.warn('Failed to save authenticated session to localStorage:', error)
          }

          return session
        }
      } catch (error) {
        console.warn('Failed to get authenticated user:', error)
      }
    }

    // Fallback to localStorage session (no longer creates new guest sessions)
    try {
      const stored = localStorage.getItem(USER_SESSION_KEY)
      if (stored) {
        const session = JSON.parse(stored) as UserSession
        session.lastActivity = new Date().toISOString()

        // Mark as not authenticated if it's a guest session
        if (!session.isAuthenticated) {
          session.isAuthenticated = false
        }

        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session))
        return session
      }
    } catch (error) {
      console.warn('Failed to load user session from localStorage:', error)
    }

    // No authenticated user and no stored session - return unauthenticated session
    return {
      userId: '',
      displayName: displayName || 'Guest',
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      isAuthenticated: false
    }
  }

  /**
   * Alias for getOrCreateSession for backward compatibility
   */
  static async getSession(displayName?: string): Promise<UserSession> {
    return this.getOrCreateSession(displayName)
  }

  /**
   * Update user session activity timestamp
   */
  static updateActivity(): void {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem(USER_SESSION_KEY)
      if (stored) {
        const session = JSON.parse(stored) as UserSession
        session.lastActivity = new Date().toISOString()
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session))
      }
    } catch (error) {
      console.warn('Failed to update user session activity:', error)
    }
  }

  /**
   * Get current user session without creating a new one
   */
  static getCurrentSession(): UserSession | null {
    if (typeof window === 'undefined') return null

    try {
      const stored = localStorage.getItem(USER_SESSION_KEY)
      if (stored) {
        return JSON.parse(stored) as UserSession
      }
    } catch (error) {
      console.warn('Failed to get current user session:', error)
    }

    return null
  }

  /**
   * Clear the current user session
   */
  static clearSession(): void {
    if (typeof window === 'undefined') return

    try {
      localStorage.removeItem(USER_SESSION_KEY)
    } catch (error) {
      console.warn('Failed to clear user session:', error)
    }
  }

  /**
   * Record participation in a draft
   */
  static recordDraftParticipation(participation: Omit<DraftParticipation, 'lastActivity' | 'joinedAt'>): void {
    if (typeof window === 'undefined') return

    const fullParticipation: DraftParticipation = {
      ...participation,
      lastActivity: new Date().toISOString(),
      joinedAt: new Date().toISOString()
    }

    try {
      const stored = localStorage.getItem(DRAFT_PARTICIPATION_KEY)
      const participations = stored ? JSON.parse(stored) as DraftParticipation[] : []

      // Remove any existing participation for this draft
      const filtered = participations.filter(p => p.draftId !== participation.draftId)

      // Add new participation
      filtered.push(fullParticipation)

      // Keep only last 20 participations
      const sorted = filtered.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      const limited = sorted.slice(0, 20)

      localStorage.setItem(DRAFT_PARTICIPATION_KEY, JSON.stringify(limited))
    } catch (error) {
      console.warn('Failed to record draft participation:', error)
    }
  }

  /**
   * Update draft participation status
   */
  static updateDraftParticipation(draftId: string, updates: Partial<DraftParticipation>): void {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem(DRAFT_PARTICIPATION_KEY)
      if (!stored) return

      const participations = JSON.parse(stored) as DraftParticipation[]
      const index = participations.findIndex(p => p.draftId === draftId)

      if (index >= 0) {
        participations[index] = {
          ...participations[index],
          ...updates,
          lastActivity: new Date().toISOString()
        }

        localStorage.setItem(DRAFT_PARTICIPATION_KEY, JSON.stringify(participations))
      }
    } catch (error) {
      console.warn('Failed to update draft participation:', error)
    }
  }

  /**
   * Get all draft participations for the current user
   */
  static getDraftParticipations(): DraftParticipation[] {
    if (typeof window === 'undefined') return []

    try {
      const stored = localStorage.getItem(DRAFT_PARTICIPATION_KEY)
      if (stored) {
        const participations = JSON.parse(stored) as DraftParticipation[]
        return participations.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      }
    } catch (error) {
      console.warn('Failed to get draft participations:', error)
    }

    return []
  }

  /**
   * Get active (non-completed) draft participations
   */
  static getActiveDraftParticipations(): DraftParticipation[] {
    return this.getDraftParticipations().filter(p => p.status === 'active')
  }

  /**
   * Get non-abandoned draft participations (for display in My Drafts)
   * Filters out abandoned drafts but keeps active, completed, and spectator drafts
   */
  static getVisibleDraftParticipations(): DraftParticipation[] {
    return this.getDraftParticipations().filter(p => p.status !== 'abandoned')
  }

  /**
   * Remove all abandoned draft participations from local storage
   */
  static cleanupAbandonedDrafts(): void {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem(DRAFT_PARTICIPATION_KEY)
      if (!stored) return

      const participations = JSON.parse(stored) as DraftParticipation[]
      const nonAbandoned = participations.filter(p => p.status !== 'abandoned')

      if (nonAbandoned.length !== participations.length) {
        localStorage.setItem(DRAFT_PARTICIPATION_KEY, JSON.stringify(nonAbandoned))
        console.log(`Cleaned up ${participations.length - nonAbandoned.length} abandoned draft(s)`)
      }
    } catch (error) {
      console.warn('Failed to cleanup abandoned drafts:', error)
    }
  }

  /**
   * Get a specific draft participation
   */
  static getDraftParticipation(draftId: string): DraftParticipation | null {
    const participations = this.getDraftParticipations()
    return participations.find(p => p.draftId === draftId) || null
  }

  /**
   * Generate a user ID for a specific draft room (fallback for existing system)
   */
  static getUserIdForDraft(draftId: string): string {
    const session = this.getCurrentSession()
    if (session) {
      return session.userId
    }

    // Fallback to sessionStorage for backward compatibility
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`draft-user-${draftId}`)
      if (stored) return stored
    }

    // Generate new ID
    const newId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Store in sessionStorage for backward compatibility
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`draft-user-${draftId}`, newId)
    }

    return newId
  }

  /**
   * Remove a specific draft participation from local storage
   */
  static removeDraftParticipation(draftId: string): void {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem(DRAFT_PARTICIPATION_KEY)
      if (!stored) return

      const participations = JSON.parse(stored) as DraftParticipation[]
      const filtered = participations.filter(p => p.draftId !== draftId)

      localStorage.setItem(DRAFT_PARTICIPATION_KEY, JSON.stringify(filtered))
    } catch (error) {
      console.warn('Failed to remove draft participation:', error)
    }
  }

  /**
   * Clean up old draft participations (remove ones older than 30 days)
   */
  static cleanupOldParticipations(): void {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem(DRAFT_PARTICIPATION_KEY)
      if (!stored) return

      const participations = JSON.parse(stored) as DraftParticipation[]
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const recent = participations.filter(p => new Date(p.lastActivity) > thirtyDaysAgo)

      if (recent.length !== participations.length) {
        localStorage.setItem(DRAFT_PARTICIPATION_KEY, JSON.stringify(recent))
      }
    } catch (error) {
      console.warn('Failed to cleanup old participations:', error)
    }
  }
}

// Auto-cleanup on service import
if (typeof window !== 'undefined') {
  UserSessionService.cleanupOldParticipations()
  UserSessionService.cleanupAbandonedDrafts()
}