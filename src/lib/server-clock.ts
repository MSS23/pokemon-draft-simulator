/**
 * Shared, page-wide estimate of (server time - device time).
 *
 * COST: several timer hooks/components need the same offset. Before this
 * module each of them called /api/time independently, and the auction hooks
 * re-synced on EVERY auction change — so each bid that extended an auction
 * made every connected client hit the function twice. During a busy auction
 * draft that was thousands of Vercel function invocations per hour.
 *
 * Now the offset is fetched at most once per `maxAgeMs` (default 5 minutes)
 * across all callers, concurrent callers share one in-flight request, and a
 * failed sync keeps the previous estimate (the database enforces expiry; the
 * offset only drives the visible countdown).
 */
import { estimateServerClockOffset } from '@/lib/draft-timer'
import { createLogger } from '@/lib/logger'

const log = createLogger('ServerClock')

export const SERVER_CLOCK_MAX_AGE_MS = 5 * 60 * 1000

let cachedOffsetMs = 0
let cachedAtMs = 0
let inFlight: Promise<number> | null = null

export interface SyncServerClockOptions {
  /** Reuse a cached offset younger than this. Defaults to 5 minutes. */
  maxAgeMs?: number
  /** Ignore the cache and fetch now (still shares any in-flight request). */
  force?: boolean
}

/** Last known offset in ms (0 until the first successful sync). */
export function getServerClockOffsetMs(): number {
  return cachedOffsetMs
}

/** Best estimate of the current server time in ms. */
export function estimateServerNowMs(): number {
  return Date.now() + cachedOffsetMs
}

/**
 * Resolve the server clock offset, hitting /api/time only when the cached
 * value is older than `maxAgeMs`. Safe to call from many hooks at once.
 */
export async function syncServerClockOffset(options: SyncServerClockOptions = {}): Promise<number> {
  const maxAgeMs = options.maxAgeMs ?? SERVER_CLOCK_MAX_AGE_MS
  const now = Date.now()

  if (!options.force && cachedAtMs > 0 && now - cachedAtMs < maxAgeMs) {
    return cachedOffsetMs
  }
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const requestStartedAt = Date.now()
      const response = await fetch('/api/time', { cache: 'no-store' })
      if (!response.ok) throw new Error(`Clock sync failed (${response.status})`)
      const payload = await response.json() as { serverTime?: number }
      if (!Number.isFinite(payload.serverTime)) throw new Error('Clock sync returned invalid time')
      const responseReceivedAt = Date.now()
      cachedOffsetMs = estimateServerClockOffset(requestStartedAt, responseReceivedAt, payload.serverTime as number)
      cachedAtMs = responseReceivedAt
    } catch (error) {
      log.warn('Clock sync failed; keeping previous offset', error)
    } finally {
      inFlight = null
    }
    return cachedOffsetMs
  })()

  return inFlight
}

/** Test helper: forget the cached offset and any in-flight request. */
export function resetServerClockForTests(): void {
  cachedOffsetMs = 0
  cachedAtMs = 0
  inFlight = null
}
