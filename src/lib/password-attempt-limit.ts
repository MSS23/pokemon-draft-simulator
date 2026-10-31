import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

/**
 * Failed draft-password attempts: 5 per minute per caller, the same budget
 * /api/draft/verify-password gets in middleware. Only failures are counted, so
 * a correct password always gets through once the caller is under the limit.
 */
export const PASSWORD_FAILURE_LIMIT = 5
export const PASSWORD_FAILURE_WINDOW_MS = 60_000

const redisUrl = process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
const upstash = redisUrl && redisToken
  ? new Ratelimit({
      redis: new Redis({ url: redisUrl, token: redisToken }),
      limiter: Ratelimit.slidingWindow(PASSWORD_FAILURE_LIMIT, '1 m'),
      prefix: 'rl:pw-join',
    })
  : null

// shortcut: per-instance memory when Upstash is not configured, so serverless
// instances each keep their own count; configure Upstash for a global limit.
const failures = new Map<string, number[]>()

function recentFailures(key: string): number[] {
  const now = Date.now()
  const recent = (failures.get(key) ?? []).filter((t) => now - t < PASSWORD_FAILURE_WINDOW_MS)
  if (recent.length) failures.set(key, recent)
  else failures.delete(key)
  return recent
}

export async function isPasswordAttemptBlocked(key: string): Promise<boolean> {
  if (upstash) {
    try {
      const { remaining } = await upstash.getRemaining(key)
      return remaining <= 0
    } catch {
      // Redis outage: fall through to the in-memory count.
    }
  }
  return recentFailures(key).length >= PASSWORD_FAILURE_LIMIT
}

export async function recordPasswordFailure(key: string): Promise<void> {
  if (upstash) {
    try {
      await upstash.limit(key)
      return
    } catch {
      // Redis outage: fall through to the in-memory count.
    }
  }
  failures.set(key, [...recentFailures(key), Date.now()])
}
