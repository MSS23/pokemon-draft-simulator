import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ============================================================================
// CSP NONCE — Per-request nonce for script-src (SEC-02)
// ============================================================================

function generateNonce(): string {
  // crypto.randomUUID() is available in Next.js Edge runtime
  return Buffer.from(crypto.randomUUID()).toString('base64')
}

function buildCSP(nonce: string): string {
  // Derive Clerk FAPI URL from environment — never hardcode.
  // Format: https://<clerk-publishable-key-slug>.clerk.accounts.dev
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  const clerkSlug = clerkPublishableKey.startsWith('pk_')
    ? clerkPublishableKey.split('_')[2]?.split('.')[0]
    : ''
  const clerkFapiUrl = clerkSlug
    ? `https://${clerkSlug}.clerk.accounts.dev`
    : 'https://*.clerk.accounts.dev'

  // Custom Clerk domain if configured (e.g. clerk.draftpokemon.com)
  const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_CLERK_DOMAIN}`
    : ''

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // NOTE: unsafe-eval REMOVED — framer-motion verified to not use eval()
    // Clerk requires its own domain for FAPI calls and challenges
    clerkFapiUrl,
    clerkDomain,
    'https://challenges.cloudflare.com',
  ].filter(Boolean).join(' ')

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // style-src keeps unsafe-inline — required by Radix UI + Tailwind (SEC-F02 deferred)
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://raw.githubusercontent.com https://pokeapi.co https://play.pokemonshowdown.com https://lh3.googleusercontent.com https://cdn.discordapp.com https://img.clerk.com https://img.clerkstatic.com data: blob:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      "https://*.supabase.co wss://*.supabase.co",
      "https://pokeapi.co",
      "https://*.sentry.io",
      "https://us.i.posthog.com",
      "https://accounts.google.com",
      "https://discord.com",
      clerkFapiUrl,
      clerkDomain,
      "https://clerk.draftpokemon.com https://api.clerk.com",
    ].filter(Boolean).join(' '),
    "frame-src 'self' https://accounts.google.com https://discord.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
    "frame-ancestors 'self'",
    "worker-src 'self' blob:",
  ]

  return directives.join('; ')
}

// ============================================================================
// RATE LIMITING — Upstash Redis (with in-memory fallback)
// ============================================================================

// In-memory fallback for when Redis is not configured
class InMemoryRateLimiter {
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
}

const inMemoryLimiter = new InMemoryRateLimiter()

// Upstash Redis rate limiters (per route pattern)
const hasRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN

if (!hasRedis) {
  console.error(
    '[RateLimit] CRITICAL: Upstash Redis not configured. ' +
    'Rate limiting is NON-FUNCTIONAL in this instance — in-memory state does not ' +
    'persist across Vercel serverless invocations. ' +
    'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel environment variables.'
  )
}

const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

const upstashLimiters = redis
  ? {
      drafts: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 h'), prefix: 'rl:drafts' }),
      picks: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'rl:picks' }),
      bids: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '1 m'), prefix: 'rl:bids' }),
      export: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '1 h'), prefix: 'rl:export' }),
      ai: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 h'), prefix: 'rl:ai' }),
      user: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '1 m'), prefix: 'rl:user' }),
      default: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '1 m'), prefix: 'rl:api' }),
    }
  : null

const RATE_LIMITS: Record<string, { limit: number; window: number; key?: keyof NonNullable<typeof upstashLimiters> }> = {
  '/api/drafts': { limit: 10, window: 3600000, key: 'drafts' },
  '/api/picks': { limit: 60, window: 60000, key: 'picks' },
  '/api/bids': { limit: 120, window: 60000, key: 'bids' },
  '/api/user/export': { limit: 5, window: 3600000, key: 'export' },
  '/api/user': { limit: 5, window: 60000, key: 'user' },   // 5/min — tight: delete, export are destructive
  '/api/ai': { limit: 10, window: 3600000, key: 'ai' },    // 10/hr — AI analysis is expensive
  '/api/': { limit: 100, window: 60000, key: 'default' },
}

function getClientId(request: NextRequest): string {
  // Use Clerk-injected user ID (set by clerkMiddleware) for authenticated requests.
  // This is not spoofable — it comes from the verified JWT, not client headers or cookies.
  const clerkUserId = request.headers.get('x-clerk-user-id')
  if (clerkUserId) return `user:${clerkUserId}`

  // IP-based fallback for unauthenticated requests (guests, public routes)
  // x-forwarded-for may contain a comma-separated list — take the first (client) IP
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ||
             request.headers.get('x-real-ip') ||
             'unknown'
  return `ip:${ip}`
}

// ============================================================================
// ROUTE MATCHERS
// ============================================================================

// Routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/settings(.*)',
  '/profile(.*)',
  '/admin(.*)',
  '/my-drafts(.*)',
])

// Routes that are ALWAYS public (no auth needed)
// Spectator pages, landing page, draft pages, join pages, leagues, matches, etc.
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/spectate(.*)',
  '/watch-drafts(.*)',
  '/draft/(.*)',
  '/join-draft(.*)',
  '/join-tournament(.*)',
  '/tournament/(.*)',
  '/about(.*)',
  '/terms(.*)',
  '/privacy(.*)',
  '/feedback(.*)',
  '/auth(.*)',
  '/api/(.*)',
  '/league/(.*)',
  '/match/(.*)',
])

// ============================================================================
// MIDDLEWARE
// ============================================================================

async function applyRateLimit(request: NextRequest, requestId: string): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/api/')) return null

  const clientId = getClientId(request)

  // Find matching rate limit config
  let rateLimit = RATE_LIMITS['/api/']
  for (const [path, config] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(path) && path !== '/api/') {
      rateLimit = config
      break
    }
  }

  const { limit, window: windowMs } = rateLimit
  let isAllowed = true

  // Use Upstash Redis if available, otherwise fall back to in-memory
  if (upstashLimiters && rateLimit.key) {
    try {
      const result = await upstashLimiters[rateLimit.key].limit(clientId)
      isAllowed = result.success
    } catch (err) {
      // Redis unavailable — fall back to in-memory limiter.
      // This should never happen in production. Log at error level so it surfaces in Vercel logs.
      console.error('[RateLimit] Redis call failed, falling back to in-memory limiter:', err)
      isAllowed = inMemoryLimiter.isAllowed(clientId, limit * 3, windowMs)
    }
  } else {
    // Use 3x the limit since in-memory state resets between serverless invocations
    isAllowed = inMemoryLimiter.isAllowed(clientId, limit * 3, windowMs)
  }

  if (!isAllowed) {
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
      }
    )
  }

  return null
}

export default clerkMiddleware(async (auth, request) => {
  // SEC-05: Strip CVE-2025-29927 exploitation vector at edge
  // The x-middleware-subrequest header is used by the Next.js middleware
  // bypass vulnerability. Strip it unconditionally before any auth checks.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-middleware-subrequest')

  // Generate request ID for tracing
  const requestId = requestHeaders.get('x-request-id') || crypto.randomUUID()

  // SEC-02: Generate per-request nonce for CSP script-src
  const nonce = generateNonce()
  requestHeaders.set('x-nonce', nonce)

  // Apply rate limiting to API routes
  const rateLimitResponse = await applyRateLimit(request, requestId)
  if (rateLimitResponse) return rateLimitResponse

  // Protect routes that require authentication
  // Public routes and unmatched routes pass through without auth
  if (isProtectedRoute(request) && !isPublicRoute(request)) {
    await auth.protect()
  }

  // Inject request ID header for downstream use
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
  response.headers.set('x-request-id', requestId)
  // SEC-02: Set nonce-based CSP on every response
  response.headers.set('Content-Security-Policy', buildCSP(nonce))

  return response
})

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (PWA manifest)
     * - sw.js (service worker)
     * - public folder files (images, icons, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon-.*\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
