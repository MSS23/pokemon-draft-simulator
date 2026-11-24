import { useState, useEffect, useRef, useCallback } from 'react'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'
import { draftSounds } from '@/lib/draft-sounds'
import { calculatePickTimeRemaining } from '@/lib/draft-timer'
import {
  getServerClockOffsetMs,
  syncServerClockOffset,
  SERVER_CLOCK_MAX_AGE_MS,
} from '@/lib/server-clock'

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
  roomCode,
}: UseDraftTimersParams): DraftTimersResult {
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(getServerClockOffsetMs)
  const [pickTimeRemaining, setPickTimeRemaining] = useState(() =>
    calculatePickTimeRemaining({ turnStartedAt, timeLimitSeconds: timeLimit }),
  )

  // Pick timer countdown effect
  useEffect(() => {
    if (!isDrafting || !turnStartedAt || timeLimit <= 0) {
      setPickTimeRemaining(0)
      return
    }

    const calculateRemaining = () => calculatePickTimeRemaining({
      turnStartedAt,
      timeLimitSeconds: timeLimit,
      serverClockOffsetMs,
    })

    setPickTimeRemaining(calculateRemaining())

    const interval = setInterval(() => {
      setPickTimeRemaining(calculateRemaining())
    }, 1000)

    return () => clearInterval(interval)
  }, [turnStartedAt, timeLimit, isDrafting, serverClockOffsetMs])

  // Timer sound effects
  const lastSoundTimeRef = useRef<number | null>(null)
  useEffect(() => {
    if (!isDrafting || timeLimit <= 0 || pickTimeRemaining <= 0) {
      lastSoundTimeRef.current = null
      return
    }

    // Buzzer at 0 is handled by the auto-skip effect (pickTimeRemaining === 0)
    // Play tick at 30s
    if (pickTimeRemaining === 30 && lastSoundTimeRef.current !== 30) {
      lastSoundTimeRef.current = 30
      draftSounds.play('tick')
    }
    // Play rapid-tick every second under 10s
    else if (pickTimeRemaining <= 10 && pickTimeRemaining > 0) {
      if (lastSoundTimeRef.current !== pickTimeRemaining) {
        lastSoundTimeRef.current = pickTimeRemaining
        draftSounds.play('rapid-tick')
      }
    }
  }, [pickTimeRemaining, isDrafting, timeLimit])

  // Buzzer when timer hits 0
  const buzzerFiredRef = useRef(false)
  useEffect(() => {
    if (!isDrafting || timeLimit <= 0) {
      buzzerFiredRef.current = false
      return
    }
    if (pickTimeRemaining === 0 && !buzzerFiredRef.current) {
      buzzerFiredRef.current = true
      draftSounds.play('buzzer')
    }
    if (pickTimeRemaining > 0) {
      buzzerFiredRef.current = false
    }
  }, [pickTimeRemaining, isDrafting, timeLimit])

  // Server time synchronization — shared, cached page-wide (see server-clock.ts)
  // so the whole draft page makes one /api/time call per 5 minutes, not one per
  // hook per auction change.
  useEffect(() => {
    if (!roomCode) return
    let cancelled = false

    const syncTime = async () => {
      const offset = await syncServerClockOffset()
      if (!cancelled) setServerClockOffsetMs(offset)
    }

    syncTime()
    const interval = setInterval(syncTime, SERVER_CLOCK_MAX_AGE_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [roomCode])

  // Auto-skip logic.
  //
  // Turn-timeout progression is SERVER-AUTHORITATIVE: any connected client that
  // sees the timer hit 0 POSTs to /api/draft/[id]/tick, which runs the auto-pick
  // /skip on the server (service role, idempotent). This replaces the old
  // client-side AutoSkipService path, which could no longer work anyway — a
  // non-owner client cannot pick for an absent player under the hardened
  // make_draft_pick / RLS. The Vercel cron backstop covers the all-tabs-closed
  // case. Concurrent client ticks are harmless (the server no-ops all but one).
  const autoSkipInFlightRef = useRef(false)
  const handleAutoSkip = useCallback(async () => {
    if (!draftId || timeLimit <= 0) return
    if (autoSkipInFlightRef.current) return
    autoSkipInFlightRef.current = true

    try {
      log.info('Timer expired — requesting server tick', { draftId })
      const res = await fetch(`/api/draft/${draftId}/tick`, { method: 'POST' })
      if (res.ok) {
        const result = (await res.json()) as { action?: string; detail?: string }
        if (result.action === 'auto_picked') {
          notify.info('Auto-Pick', result.detail ? `${result.detail} was auto-picked from wishlist` : 'A Pokémon was auto-picked from the wishlist')
        } else if (result.action === 'skipped') {
          notify.warning('Turn Skipped', 'A turn was skipped due to inactivity', { duration: 5000 })
        }
      }
      // The resulting state change propagates via the realtime subscription.
    } catch (err) {
      log.info('Auto-skip tick failed (cron backstop will retry):', err)
    } finally {
      setTimeout(() => { autoSkipInFlightRef.current = false }, 2000)
    }
  }, [draftId, timeLimit])

  // Auto-skip effect: ANY connected client can trigger the skip when the timer hits 0.
  const autoSkipTimerRef = useRef<NodeJS.Timeout | null>(null)
  const expiredTurnHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (autoSkipTimerRef.current) {
      clearTimeout(autoSkipTimerRef.current)
      autoSkipTimerRef.current = null
    }

    if (!isDrafting || timeLimit <= 0 || pickTimeRemaining > 0 || !turnStartedAt) return
    if (expiredTurnHandledRef.current === turnStartedAt) return
    expiredTurnHandledRef.current = turnStartedAt

    // COST: every connected client used to POST within 1–3s of expiry, so a
    // timed-out turn cost one function invocation per participant. The realtime
    // turn_started_at update cancels this timer (cleanup below), so giving
    // non-turn clients a wider, later window means the on-turn client (or the
    // first of the others) advances the draft and the rest never fire. The
    // per-minute cron remains the backstop if nobody is connected.
    const delay = isUserTurn ? 500 : 2500 + Math.random() * 4000

    autoSkipTimerRef.current = setTimeout(() => {
      handleAutoSkip()
    }, delay)

    return () => {
      if (autoSkipTimerRef.current) {
        clearTimeout(autoSkipTimerRef.current)
        autoSkipTimerRef.current = null
      }
    }
  }, [pickTimeRemaining, isDrafting, timeLimit, isUserTurn, handleAutoSkip, turnStartedAt])

  return {
    pickTimeRemaining,
    handleAutoSkip,
  }
}
