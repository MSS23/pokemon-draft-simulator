import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { handleCorsPreflightIfNeeded } from '@/lib/cors'
import { applyRateLimit } from '@/lib/rate-limit'

// ============================================================================
// CSP NONCE — Per-request nonce for script-src (SEC-02)
// ============================================================================

function generateNonce(): string {
  // Both APIs are available in the Next.js Edge runtime.
  return btoa(crypto.randomUUID())
}

function buildCSP(nonce: string): string {
  // Clerk publishable keys contain a base64-encoded FAPI hostname. Decoding it
  // keeps sign-in working even when a custom-domain env var was omitted.
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  let clerkFapiUrl = 'https://*.clerk.accounts.dev'
  const encodedFapi = clerkPublishableKey.replace(/^pk_(test|live)_/, '')
  if (encodedFapi && encodedFapi !== clerkPublishableKey) {
    try {
      const base64 = encodedFapi
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(encodedFapi.length / 4) * 4, '=')
      const hostname = atob(base64).replace(/\$$/, '')
      if (/^[a-z0-9.-]+$/i.test(hostname)) clerkFapiUrl = `https://${hostname}`
    } catch { /* wildcard fallback remains valid */ }
  }

  // Custom Clerk domain if configured (e.g. clerk.draftpokemon.com)
  const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_CLERK_DOMAIN}`
    : ''

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // Next's hot-reload runtime requires eval locally; production never does.
    process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : '',
    // Clerk requires its own domain for FAPI calls and challenges
    clerkFapiUrl,
    clerkDomain,
    'https://challenges.cloudflare.com',
  ].filter(Boolean).join(' ')

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // style-src keeps unsafe-inline — required by Radix UI + Tailwind (SEC-F02 deferred).
    // Tailwind's runtime + Radix's inline style props make 'nonce-*' impractical for now.
    "style-src 'self' 'unsafe-inline'",
    // img-src is permissive on https: because Pokemon sprites come from many CDNs
    // (Showdown, raw.githubusercontent, official artwork mirrors). Tightening this
    // would require an enumerated allow-list per format.
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      "https://*.supabase.co wss://*.supabase.co",
      "https://pokeapi.co",
      "https://raw.githubusercontent.com",
      "https://*.sentry.io https://*.ingest.sentry.io",
      "https://us.i.posthog.com",
      "https://vercel.live",
      "https://accounts.google.com",
      "https://discord.com",
      clerkFapiUrl,
      clerkDomain,
      "https://clerk.draftpokemon.com https://api.clerk.com",
    ].filter(Boolean).join(' '),
    ["frame-src 'self' https://accounts.google.com https://discord.com https://*.clerk.accounts.dev https://challenges.cloudflare.com", clerkDomain].filter(Boolean).join(' '),
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ]

  return directives.join('; ')
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
  '/lobby(.*)',
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

// API routes that require Clerk authentication (mutating or sensitive)
// These routes MUST have a valid Clerk JWT — middleware is the second layer after route-level auth() calls
const isAuthRequiredApiRoute = createRouteMatcher([
  '/api/ai/(.*)',        // AI analysis — expensive, must be authenticated
  '/api/push/(.*)',      // Push subscriptions — links device to a user
  '/api/formats/sync',  // Admin sync — mutation
  '/api/user/(.*)',      // User data mutations — handled at route level but defend in depth
])

// API routes that are explicitly public (no auth needed)
// All others default to: auth required if matched by isAuthRequiredApiRoute
const isPublicApiRoute = createRouteMatcher([
  '/api/health',        // Health check — monitoring tools
  '/api/feedback',      // Anonymous feedback — no account needed
  '/api/sheets',        // Google Sheets proxy — public data
  '/api/formats',       // Format list reads — public catalog (not /formats/sync)
  '/api/guest/(.*)',    // SEC-06: guest session endpoint — must be public for unauthenticated guests
  '/api/webhooks/(.*)', // Signed by the sender (Svix); verified in the route, never Clerk-session gated
])

// ============================================================================
// MIDDLEWARE
// ============================================================================

function authUnavailable(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'Authentication service unavailable', requestId },
    { status: 503, headers: { 'Retry-After': '30', 'x-request-id': requestId } }
  )
}

export default clerkMiddleware(
  async (auth, request) => {
  // SEC-05: Strip CVE-2025-29927 exploitation vector at edge. Built before the
  // try so the error path still forwards sanitized headers and a request id.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-middleware-subrequest')
  const requestId = requestHeaders.get('x-request-id') || crypto.randomUUID()
  const requiresApiAuth = isAuthRequiredApiRoute(request) && !isPublicApiRoute(request)

  try {
    // SEC-04: Handle CORS preflight at edge — reject disallowed origins early
    if (request.method === 'OPTIONS' && request.nextUrl.pathname.startsWith('/api/')) {
      const preflightResponse = handleCorsPreflightIfNeeded(request)
      if (preflightResponse) return preflightResponse
    }

    // SEC-02: Generate per-request nonce for CSP script-src
    const nonce = generateNonce()
    requestHeaders.set('x-nonce', nonce)

    // Verified Clerk identity keys the rate limit and gates auth-required APIs.
    let userId: string | null = null
    let authFailed = false
    if (request.nextUrl.pathname.startsWith('/api/')) {
      try {
        userId = (await auth()).userId
      } catch (err) {
        authFailed = true
        console.warn('[Middleware] auth() failed; rate-limiting by IP:', err)
      }
    }

    const rateLimitResponse = await applyRateLimit(request, requestId, userId)
    if (rateLimitResponse) return rateLimitResponse

    // SEC-01: Enforce Clerk auth on mutating/sensitive API routes at the edge.
    if (requiresApiAuth) {
      if (authFailed) return authUnavailable(requestId)
      if (!userId) {
        return NextResponse.json(
          { error: 'Authentication required', requestId },
          {
            status: 401,
            headers: { 'x-request-id': requestId },
          }
        )
      }
    }

    // Protect routes that require authentication
    if (isProtectedRoute(request) && !isPublicRoute(request)) {
      try {
        await auth.protect()
      } catch {
        // Clerk will handle redirect to sign-in
        const signInUrl = new URL('/sign-in', request.url)
        signInUrl.searchParams.set('redirect_url', request.url)
        return NextResponse.redirect(signInUrl)
      }
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
  } catch (error) {
    console.error('[Middleware] Unhandled error:', error)
    // Auth-required APIs fail closed; everything else stays up on the
    // next.config baseline CSP rather than turning a Clerk blip into an outage.
    if (requiresApiAuth) return authUnavailable(requestId)
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set('x-request-id', requestId)
    return response
  }
  },
  {
    // SEC-01: Only accept JWTs issued for the production app domain.
    // Localhost is only ever valid in non-production builds; never trust it
    // when NODE_ENV === 'production' even if the env var is missing.
    authorizedParties: process.env.NEXT_PUBLIC_CLERK_AUTHORIZED_PARTIES
      ? process.env.NEXT_PUBLIC_CLERK_AUTHORIZED_PARTIES.split(',')
      : process.env.NODE_ENV === 'production'
        ? ['https://draftpokemon.com']
        : ['https://draftpokemon.com', 'http://localhost:3000'],
  }
)

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
     * - data/ (static format packs) and api/time (clock sync): need neither
     *   auth nor a CSP nonce, so skip the billed middleware invocation
     */
    '/((?!_next/static|_next/image|data/|api/time$|favicon.ico|manifest.json|sw.js|icon-.*\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
