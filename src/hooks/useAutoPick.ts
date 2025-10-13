import { useState, useEffect, useRef, useCallback } from 'react'
import { useDraftStore } from '@/stores/draftStore'
import { selectIsUserTurn, selectNextAutoPickPokemon } from '@/stores/selectors'
import { Pokemon, WishlistItem } from '@/types'

interface UseAutoPickOptions {
  participantId: string
  userId: string
  enabled?: boolean
  countdownDuration?: number // in seconds
  onAutoPick?: (pokemon: WishlistItem) => void
  onCountdownStart?: () => void
  onCountdownCancel?: () => void
}

interface AutoPickState {
  isCountingDown: boolean
  timeRemaining: number
  nextPokemon: WishlistItem | null
  canAutoPick: boolean
}

export function useAutoPick({
  participantId,
  userId,
  enabled = true,
  countdownDuration = 10,
  onAutoPick,
  onCountdownStart,
  onCountdownCancel
}: UseAutoPickOptions) {
  const [isCountingDown, setIsCountingDown] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [hasStartedCountdown, setHasStartedCountdown] = useState(false)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const wasUserTurnRef = useRef(false)

  const { draft } = useDraftStore()
  const isUserTurn = useDraftStore(selectIsUserTurn(userId))
  const nextPokemon = useDraftStore(selectNextAutoPickPokemon(participantId))

  const canAutoPick = Boolean(
    enabled &&
    isUserTurn &&
    nextPokemon &&
    nextPokemon.isAvailable &&
    draft?.status === 'active'
  )

  const startCountdown = useCallback(() => {
    if (!canAutoPick || isCountingDown) return

    setIsCountingDown(true)
    setTimeRemaining(countdownDuration)
    setHasStartedCountdown(true)
    onCountdownStart?.()

    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Auto-pick the Pokemon
          if (nextPokemon && onAutoPick) {
            onAutoPick(nextPokemon)
          }
          setIsCountingDown(false)
          setHasStartedCountdown(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [canAutoPick, isCountingDown, countdownDuration, nextPokemon, onAutoPick, onCountdownStart])

  const cancelCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsCountingDown(false)
    setTimeRemaining(0)
    setHasStartedCountdown(false)
    onCountdownCancel?.()
  }, [onCountdownCancel])

  const restartCountdown = useCallback(() => {
    cancelCountdown()
    setTimeout(() => startCountdown(), 100) // Small delay to ensure cleanup
  }, [cancelCountdown, startCountdown])

  // Monitor turn changes
  useEffect(() => {
    const wasUserTurn = wasUserTurnRef.current
    wasUserTurnRef.current = isUserTurn

    if (isUserTurn && !wasUserTurn && canAutoPick && !hasStartedCountdown) {
      // User's turn just started and they have auto-pick available
      startCountdown()
    } else if (!isUserTurn && isCountingDown) {
      // User's turn ended, cancel countdown
      cancelCountdown()
    }
  }, [isUserTurn, canAutoPick, hasStartedCountdown, isCountingDown, startCountdown, cancelCountdown])

  // Monitor next Pokemon changes
  useEffect(() => {
    if (isCountingDown && !nextPokemon?.isAvailable) {
      // The next Pokemon is no longer available, cancel countdown
      cancelCountdown()
    }
  }, [nextPokemon?.isAvailable, isCountingDown, cancelCountdown])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  const state: AutoPickState = {
    isCountingDown,
    timeRemaining,
    nextPokemon,
    canAutoPick
  }

  return {
    ...state,
    startCountdown,
    cancelCountdown,
    restartCountdown,
    formatTimeRemaining: () => {
      const minutes = Math.floor(timeRemaining / 60)
      const seconds = timeRemaining % 60
      return minutes > 0
        ? `${minutes}:${seconds.toString().padStart(2, '0')}`
        : seconds.toString()
    }
  }
}