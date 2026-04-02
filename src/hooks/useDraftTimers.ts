import { useState, useEffect, useRef, useCallback } from 'react'
import { DraftService } from '@/lib/draft-service'
import { AutoSkipService } from '@/lib/auto-skip-service'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'

const log = createLogger('useDraftTimers')

export interface DraftTimersResult {
  pickTimeRemaining: number
  handleAutoSkip: () => Promise<void>
}

interface UseDraftTimersParams {
  turnStartedAt?: string
  timeLimit: number
  isDrafting: boolean
  isUserTurn: boolean
  draftId?: string
  currentTeamId?: string
  roomCode: string
}

export function useDraftTimers({
  turnStartedAt,
  timeLimit,
  isDrafting,
  isUserTurn,
  draftId,
  currentTeamId,
  roomCode,
}: UseDraftTimersParams): DraftTimersResult {
  const [pickTimeRemaining, setPickTimeRemaining] = useState(0)

  // Pick timer countdown effect
  useEffect(() => {
    if (!isDrafting || !turnStartedAt || timeLimit <= 0) {
      setPickTimeRemaining(0)
      return
    }

    const calculateRemaining = () => {
      const elapsed = Math.floor((Date.now() - new Date(turnStartedAt).getTime()) / 1000)
      return Math.max(0, timeLimit - elapsed)
    }

    setPickTimeRemaining(calculateRemaining())

    const interval = setInterval(() => {
      setPickTimeRemaining(calculateRemaining())
    }, 1000)

    return () => clearInterval(interval)
  }, [turnStartedAt, timeLimit, isDrafting])

  // Server time synchronization
  useEffect(() => {
    if (!roomCode) return

    const syncTime = async () => {
      try {
        await DraftService.getServerTime(roomCode.toLowerCase())
        // Offset is computed but not consumed externally — kept for future use
      } catch (error) {
        log.error('Failed to sync server time:', error)
      }
    }

    syncTime()
    const interval = setInterval(syncTime, 300000)
    return () => clearInterval(interval)
  }, [roomCode])

  // Auto-skip logic
  const autoSkipInFlightRef = useRef(false)
  const handleAutoSkip = useCallback(async () => {
    if (!draftId || !currentTeamId || timeLimit <= 0) return
    if (autoSkipInFlightRef.current) return
    autoSkipInFlightRef.current = true

    try {
      log.info('Timer expired — auto-skipping turn', { draftId, currentTeamId })
      const result = await AutoSkipService.handleTimeExpired(draftId, currentTeamId)

      if (result.autoPickMade) {
        notify.info('Auto-Pick', `${result.pokemonName} was auto-picked from wishlist`)
      } else if (result.skipped) {
        notify.warning('Turn Skipped', result.reason, { duration: 5000 })
      }

      if (roomCode) {
        const refreshed = await DraftService.getDraftState(roomCode)
        if (refreshed) {
          // Force a re-render via the caller's state setter
        }
      }
    } catch (err) {
      log.info('Auto-skip did not apply (likely already advanced):', err)
    } finally {
      setTimeout(() => { autoSkipInFlightRef.current = false }, 2000)
    }
  }, [draftId, currentTeamId, timeLimit, roomCode])

  // Auto-skip effect: ANY connected client can trigger the skip when the timer hits 0.
  const autoSkipTimerRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (autoSkipTimerRef.current) {
      clearTimeout(autoSkipTimerRef.current)
      autoSkipTimerRef.current = null
    }

    if (!isDrafting || timeLimit <= 0 || pickTimeRemaining > 0) return

    const delay = isUserTurn ? 500 : 1000 + Math.random() * 2000

    autoSkipTimerRef.current = setTimeout(() => {
      handleAutoSkip()
    }, delay)

    return () => {
      if (autoSkipTimerRef.current) {
        clearTimeout(autoSkipTimerRef.current)
        autoSkipTimerRef.current = null
      }
    }
  }, [pickTimeRemaining, isDrafting, timeLimit, isUserTurn, handleAutoSkip])

  return {
    pickTimeRemaining,
    handleAutoSkip,
  }
}
