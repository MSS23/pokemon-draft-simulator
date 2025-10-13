import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ============================================================================
// RATE LIMITING
// ============================================================================

class RateLimiter {
  private requests = new Map<string, number[]>()

  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    const timestamps = this.requests.get(key) || []
    const validTimestamps = timestamps.filter(t => now - t < windowMs)

    if (validTimestamps.length >= limit) {
      return false
    }

    validTimestamps.push(now)
    this.requests.set(key, validTimestamps)
    return true
  }
}

const rateLimiter = new RateLimiter()

const RATE_LIMITS: Record<string, { limit: number; window: number }> = {
  '/api/drafts': { limit: 10, window: 3600000 }, // 10 drafts per hour
  '/api/picks': { limit: 60, window: 60000 },    // 60 picks per minute
  '/api/bids': { limit: 120, window: 60000 },    // 120 bids per minute
  '/api/': { limit: 100, window: 60000 },        // 100 requests per minute (default)
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

    const { limit, window } = rateLimit
    if (!rateLimiter.isAllowed(clientId, limit, window)) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil(window / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(window / 1000)),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  // Check if we're in demo mode or if Supabase is not configured
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If demo mode or missing credentials, skip auth checks
  if (isDemoMode || !supabaseUrl || !supabaseKey || 
      supabaseUrl === 'your-supabase-project-url' || 
      supabaseKey === 'your-supabase-anon-key') {
    console.log('Middleware: Skipping auth checks (demo mode or invalid credentials)')
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
  } catch (error) {
    console.warn('Middleware: Failed to create Supabase client, skipping auth:', error)
    return supabaseResponse
  }

  // Define protected routes that require authentication
  const protectedRoutes = [
    '/leagues',
    '/friends',
    '/achievements',
  ]

  // Define admin routes that require admin access
  const adminRoutes = [
    '/admin',
  ]

  // Check if current path is protected
  const isProtectedRoute = protectedRoutes.some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  const isAdminRoute = adminRoutes.some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  // Redirect unauthenticated users from protected routes
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Check admin access for admin routes
  if (isAdminRoute && user && supabase) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
    } catch (error) {
      console.warn('Middleware: Failed to check admin access, allowing through:', error)
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