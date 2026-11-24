import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getServerClockOffsetMs,
  resetServerClockForTests,
  syncServerClockOffset,
} from '@/lib/server-clock'

function timeResponse(serverTime: number, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ serverTime }),
  } as unknown as Response
}

describe('server clock cache', () => {
  beforeEach(() => {
    resetServerClockForTests()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-15T15:15:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fetches /api/time once and shares the result with concurrent callers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(timeResponse(Date.now() + 30_000))
    vi.stubGlobal('fetch', fetchMock)

    const [a, b, c] = await Promise.all([
      syncServerClockOffset(),
      syncServerClockOffset(),
      syncServerClockOffset(),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/time', { cache: 'no-store' })
    expect(a).toBe(30_000)
    expect(b).toBe(30_000)
    expect(c).toBe(30_000)
    expect(getServerClockOffsetMs()).toBe(30_000)
  })

  it('reuses the cached offset until it is older than maxAgeMs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(timeResponse(Date.now() + 1_000))
    vi.stubGlobal('fetch', fetchMock)

    await syncServerClockOffset()
    // Simulate what the auction hooks do: re-sync on every bid.
    for (let i = 0; i < 50; i++) {
      await syncServerClockOffset()
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await syncServerClockOffset()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('honours force and a custom maxAgeMs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(timeResponse(Date.now()))
    vi.stubGlobal('fetch', fetchMock)

    await syncServerClockOffset()
    await syncServerClockOffset({ force: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(2_000)
    await syncServerClockOffset({ maxAgeMs: 1_000 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keeps the previous offset when the sync fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(timeResponse(Date.now() - 5_000))
      .mockResolvedValueOnce(timeResponse(0, false))
      .mockRejectedValueOnce(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    expect(await syncServerClockOffset()).toBe(-5_000)
    expect(await syncServerClockOffset({ force: true })).toBe(-5_000)
    expect(await syncServerClockOffset({ force: true })).toBe(-5_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
