import { Ratelimit } from '@upstash/ratelimit'
// The fetch-only entry: the default (nodejs) entry reads process.version, which
// the Edge bundler flags as an unsupported Node.js API in middleware.
import { Redis } from '@upstash/redis/cloudflare'
import { NextResponse, type NextRequest } from 'next/server'

// ============================================================================
// RATE LIMITING — Upstash Redis (with in-memory fallback)
// ============================================================================

export class InMemoryRateLimiter {
  private requests = new Map<string, number[]>()

  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    const timestamps = this.requests.get(key) || []
    const validTimestamps = timestamps.filter(t => now - t < windowMs)

    if (validTimestamps.length >= limit) return false

    validTimestamps.push(now)
    this.requests.set(key, validTimestamps)

    if (this.requests.size > 10000) {
      for (const [entryKey, entryTimestamps] of this.requests) {
        const valid = entryTimestamps.filter(t => now - t < windowMs)
        if (valid.length === 0) this.requests.delete(entryKey)
        else this.requests.set(entryKey, valid)
      }
    }
    return true
  }

  get size(): number {
    return this.requests.size
  }
}

interface RateLimitRule {
  limit: number
  window: number
  /** Upstash key prefix. Rules without one are in-memory only. */
  prefix?: string
}

// SEC-AUDIT (vibe-security): Map matches REAL routes under src/app/api/**.
// First matching prefix wins, so put narrower paths above broader ones.
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  '/api/draft/create': { limit: 10, window: 3600000, prefix: 'rl:drafts' },
  '/api/draft/join': { limit: 30, window: 60000, prefix: 'rl:joins' },
  '/api/tournament/create': { limit: 10, window: 3600000, prefix: 'rl:tournaments' },
  '/api/user/export': { limit: 5, window: 3600000, prefix: 'rl:export' },
  '/api/user': { limit: 5, window: 60000, prefix: 'rl:user' },   // 5/min — tight: delete is destructive
  '/api/ai': { limit: 10, window: 3600000, prefix: 'rl:ai' },    // 10/hr — AI analysis is expensive
  '/api/sheets': { limit: 10, window: 60000, prefix: 'rl:sheets' }, // public proxy — prevent free use as a CSV fetcher
  '/api/feedback': { limit: 3, window: 3600000, prefix: 'rl:feedback' }, // Discord webhook spam guard
  // CDN-cached roster fan-out: high ceiling so bursts never 429, still caps
  // random-id misses that fetch PokeAPI upstream; in-memory to avoid a Redis
  // round-trip per sprite.
  '/api/pokemon': { limit: 200, window: 60000 },
  '/api/': { limit: 100, window: 60000, prefix: 'rl:api' },
}

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

let upstashLimiters: Record<string, Ratelimit> | null = null

try {
  if (hasRedis) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    upstashLimiters = {}
    for (const rule of Object.values(RATE_LIMITS)) {
      if (!rule.prefix) continue
      upstashLimiters[rule.prefix] = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(rule.limit, `${rule.window} ms`),
        prefix: rule.prefix,
      })
    }
  } else if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    // Per-isolate memory resets on recycle and is not shared across regions,
    // so brute-force/spam limits do not hold at scale without Redis.
    console.error('[RateLimit] UPSTASH_REDIS_REST_URL/TOKEN unset in production; using per-instance in-memory limits')
  }
} catch (err) {
  console.error('[RateLimit] Failed to initialize Upstash Redis:', err)
  upstashLimiters = null
}

const inMemoryLimiter = new InMemoryRateLimiter()

/**
 * Bucket key. Only the verified Clerk userId (from auth()) or the
 * platform-set forwarding headers are trusted; never a client-chosen header.
 */
export function getClientId(request: NextRequest, userId?: string | null): string {
  if (userId) return `user:${userId}`
  // Vercel overwrites x-forwarded-for; the first entry is the client IP.
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ||
             request.headers.get('x-real-ip') ||
             'unknown'
  return `ip:${ip}`
}

export function findRateLimitRule(pathname: string): [path: string, rule: RateLimitRule] {
  for (const [path, rule] of Object.entries(RATE_LIMITS)) {
    if (path !== '/api/' && pathname.startsWith(path)) return [path, rule]
  }
  return ['/api/', RATE_LIMITS['/api/']]
}

export async function applyRateLimit(
  request: NextRequest,
  requestId: string,
  userId?: string | null,
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/api/')) return null
  // Signed webhooks (Clerk/Svix) retry in bursts from shared IPs; the signature check is their gate.
  if (pathname.startsWith('/api/webhooks/')) return null

  const clientId = getClientId(request, userId)
  const [rulePath, rule] = findRateLimitRule(pathname)
  const { limit, window: windowMs } = rule
  // Per-rule bucket so a busy default route cannot exhaust a tight one (and vice versa).
  const memoryKey = `${clientId}|${rulePath}`
  const isRead = request.method === 'GET' || request.method === 'HEAD'
  const limiter = rule.prefix ? upstashLimiters?.[rule.prefix] : undefined

  let isAllowed: boolean
  if (limiter) {
    try {
      isAllowed = (await limiter.limit(clientId)).success
    } catch (err) {
      if (!isRead) {
        // Fail closed: a Redis outage must not reopen brute-force/spam routes.
        console.error('[RateLimit] Redis call failed; rejecting non-GET request:', err)
        return NextResponse.json(
          { error: 'Service temporarily unavailable', requestId },
          { status: 503, headers: { 'Retry-After': '30', 'X-Request-Id': requestId } },
        )
      }
      console.warn('[RateLimit] Redis call failed; falling back to in-memory for GET:', err)
      isAllowed = inMemoryLimiter.isAllowed(memoryKey, limit * 3, windowMs)
    }
  } else {
    // 3x the limit since in-memory state resets between serverless invocations
    isAllowed = inMemoryLimiter.isAllowed(memoryKey, limit * 3, windowMs)
  }

  if (isAllowed) return null

  return NextResponse.json(
    {
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(windowMs / 1000),
      requestId,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil(windowMs / 1000)),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-Request-Id': requestId,
      },
    },
  )
}
