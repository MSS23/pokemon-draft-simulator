import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

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
  console.warn('[RateLimit] Upstash Redis not configured — rate limiting is degraded. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production.')
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
      default: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '1 m'), prefix: 'rl:api' }),
    }
  : null

const RATE_LIMITS: Record<string, { limit: number; window: number; key?: keyof NonNullable<typeof upstashLimiters> }> = {
  '/api/drafts': { limit: 10, window: 3600000, key: 'drafts' },
  '/api/picks': { limit: 60, window: 60000, key: 'picks' },
  '/api/bids': { limit: 120, window: 60000, key: 'bids' },
  '/api/user/export': { limit: 5, window: 3600000, key: 'export' },
  '/api/': { limit: 100, window: 60000, key: 'default' },
}

function getClientId(request: NextRequest): string {
  const userId = request.cookies.get('user_id')?.value
  if (userId) return `user:${userId}`

  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown'
  return `ip:${ip}`
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Generate request ID for tracing
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()

  // Apply rate limiting to API routes
  if (pathname.startsWith('/api/')) {
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
      } catch {
        // Redis unavailable — fall back to in-memory
        // Use 3x the limit since in-memory state resets between serverless invocations
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
  }

  // Inject request ID header for downstream use
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // Propagate request ID to response
  supabaseResponse.headers.set('x-request-id', requestId)

  // Check if we're in demo mode or if Supabase is not configured
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If demo mode or missing credentials, skip auth checks
  if (isDemoMode || !supabaseUrl || !supabaseKey || 
      supabaseUrl === 'your-supabase-project-url' || 
      supabaseKey === 'your-supabase-anon-key') {
    return supabaseResponse
  }

  let supabase
  let user = null

  try {
    supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            supabaseResponse = NextResponse.next({
              request,
            })
            supabaseResponse.headers.set('x-request-id', requestId)
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Refreshing the auth token if expired
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    user = authUser
  } catch {
    // Auth service unavailable - allow pages through since they handle auth client-side.
    // Only block admin routes.
    const adminPaths = ['/admin']
    const needsAdmin = adminPaths.some(r => pathname.startsWith(r))

    if (needsAdmin) {
      return NextResponse.json(
        { error: 'Authentication service unavailable' },
        { status: 500 }
      )
    }
    return supabaseResponse
  }

  // Admin routes require admin access
  const adminRoutes = ['/admin']

  const isAdminRoute = adminRoutes.some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  // Check admin access for admin routes — verify is_admin flag, not just profile existence
  if (isAdminRoute && user && supabase) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, is_admin')
        .eq('user_id', user.id)
        .single()

      if (!profile || !profile.is_admin) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
    } catch {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
  }

  return supabaseResponse
}

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