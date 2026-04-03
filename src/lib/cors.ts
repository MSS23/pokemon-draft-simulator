/**
 * CORS helper — SEC-04
 * Restricts cross-origin access to production domain(s) only.
 * Never sets Access-Control-Allow-Origin: * on API routes.
 */

export const ALLOWED_ORIGINS = [
  'https://draftpokemon.com',
  'https://www.draftpokemon.com',
  // Local development — only included when not in production
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000'] : []),
  // Allow additional origins from env var (for staging, preview deploys)
  ...(process.env.NEXT_PUBLIC_ALLOWED_ORIGINS
    ? process.env.NEXT_PUBLIC_ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : []),
]

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id',
  'Access-Control-Max-Age': '86400',
}

/**
 * Returns the origin from the request if it is in ALLOWED_ORIGINS, else null.
 */
export function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin')
  if (!origin) return null
  return ALLOWED_ORIGINS.includes(origin) ? origin : null
}

/**
 * Apply CORS headers to an existing Response.
 * Only sets Access-Control-Allow-Origin if origin is in allowlist.
 * Safe to call on all API responses — no-op for non-CORS requests.
 */
export function applyCors(response: Response, request: Request): Response {
  const allowedOrigin = getAllowedOrigin(request)
  if (!allowedOrigin) return response

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', allowedOrigin)
  headers.set('Vary', 'Origin')
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Handle OPTIONS preflight requests.
 * Returns a 204 response for allowed origins, 403 for disallowed, null for non-OPTIONS.
 */
export function handleCorsPreflightIfNeeded(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null

  const allowedOrigin = getAllowedOrigin(request)
  if (!allowedOrigin) {
    return new Response(null, { status: 403 })
  }

  const headers = new Headers({
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
    ...CORS_HEADERS,
  })

  return new Response(null, { status: 204, headers })
}
