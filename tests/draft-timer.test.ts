import { describe, expect, it } from 'vitest'
import {
  calculateDeadlineTimeRemaining,
  calculatePickTimeRemaining,
  estimateServerClockOffset,
} from '@/lib/draft-timer'

describe('draft timer clock', () => {
  const turnStartedAt = '2026-07-17T12:00:00.000Z'

  it('counts down to the server-authoritative expiry', () => {
    expect(calculatePickTimeRemaining({
      turnStartedAt,
      timeLimitSeconds: 60,
      nowMs: Date.parse('2026-07-17T12:00:30.250Z'),
    })).toBe(30)

    expect(calculatePickTimeRemaining({
      turnStartedAt,
      timeLimitSeconds: 60,
      nowMs: Date.parse('2026-07-17T12:01:00.000Z'),
    })).toBe(0)
  })

  it('corrects a client clock that is five minutes fast', () => {
    expect(calculatePickTimeRemaining({
      turnStartedAt,
      timeLimitSeconds: 60,
      nowMs: Date.parse('2026-07-17T12:05:15.000Z'),
      serverClockOffsetMs: -300_000,
    })).toBe(45)
  })

  it('uses the same corrected clock for auction deadlines', () => {
    expect(calculateDeadlineTimeRemaining({
      deadline: '2026-07-17T12:01:00.000Z',
      nowMs: Date.parse('2026-07-17T11:55:40.000Z'),
      serverClockOffsetMs: 300_000,
    })).toBe(20)
  })

  it('estimates server offset from the request midpoint', () => {
    expect(estimateServerClockOffset(10_000, 10_200, 15_100)).toBe(5_000)
  })
})
