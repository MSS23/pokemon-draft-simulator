import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'

export interface DraftSessionResult {
  userId: string
  isHost: boolean
  isSpectator: boolean
  isAdmin: boolean
  /** Auth modal for join-from-link flow */
  showJoinAuthModal: boolean
  setShowJoinAuthModal: (v: boolean) => void
  isJoiningFromLink: boolean
  setIsJoiningFromLink: (v: boolean) => void
  authUser: ReturnType<typeof useAuth>['user']
}

interface UseDraftSessionParams {
  roomCode: string
  isHostParam: boolean
  isSpectatorParam: boolean
  /** Participant list from draft state, used to derive isAdmin */
  participants?: Array<{
    userId: string | null
    is_admin?: boolean
  }>
}

export function useDraftSession({
  roomCode,
  isHostParam,
  isSpectatorParam,
  participants,
}: UseDraftSessionParams): DraftSessionResult {
  const { user: authUser } = useAuth()

  const [showJoinAuthModal, setShowJoinAuthModal] = useState(false)
  const [isJoiningFromLink, setIsJoiningFromLink] = useState(false)

  // Priority: 1) Supabase auth ID, 2) stored participation, 3) stored session, 4) sessionStorage, 5) guest ID
  const userId = useMemo(() => {
    if (authUser?.id) {
      return authUser.id
    }

    const participation = UserSessionService.getDraftParticipation(roomCode?.toLowerCase() || '')
    if (participation && participation.userId) {
      return participation.userId
    }

    const currentSession = UserSessionService.getCurrentSession()
    if (currentSession && currentSession.userId) {
      return currentSession.userId
    }

    if (typeof window !== 'undefined' && roomCode) {
      const draftSessionKey = `draft-user-${roomCode.toLowerCase()}`
      const storedId = sessionStorage.getItem(draftSessionKey)
      if (storedId) {
        return storedId
      }
    }

    const guestId = `guest-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

    if (typeof window !== 'undefined' && roomCode) {
      const draftSessionKey = `draft-user-${roomCode.toLowerCase()}`
      sessionStorage.setItem(draftSessionKey, guestId)
    }

    return guestId
  }, [authUser?.id, roomCode])

  const isAdmin = useMemo(() => {
    if (!participants || !userId) return false
    const me = participants.find(p => p.userId === userId)
    return me?.is_admin === true
  }, [participants, userId])

  return {
    userId,
    isHost: isHostParam,
    isSpectator: isSpectatorParam,
    isAdmin,
    showJoinAuthModal,
    setShowJoinAuthModal,
    isJoiningFromLink,
    setIsJoiningFromLink,
    authUser: authUser ?? null,
  }
}
