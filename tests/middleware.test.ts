import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'

/**
 * Exercises the real src/middleware.ts with clerkMiddleware reduced to a
 * pass-through that hands the handler a controllable auth().
 */

let authImpl: () => Promise<{ userId: string | null }> = async () => ({ userId: null })
let protectImpl: () => Promise<void> = async () => {}

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (handler: (auth: unknown, req: NextRequest) => unknown) =>
    (req: NextRequest) => {
      const auth = Object.assign(() => authImpl(), { protect: () => protectImpl() })
      return handler(auth, req)
    },
  createRouteMatcher: (patterns: string[]) => {
    const regexes = patterns.map(p => new RegExp(`^${p}$`))
    return (req: NextRequest) => regexes.some(r => r.test(req.nextUrl.pathname))
  },
}))

import middleware, { config } from '@/middleware'

type Handler = (req: NextRequest, ev?: NextFetchEvent) => Promise<Response>
const run = middleware as unknown as Handler

function req(path: string, method = 'POST', headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { method, headers })
}

describe('middleware matcher', () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`)

  it('skips static data packs and the clock endpoint', () => {
    expect(matcher.test('/data/format-manifest.json')).toBe(false)
    expect(matcher.test('/api/time')).toBe(false)
  })

  it('still runs on API routes and pages', () => {
    expect(matcher.test('/api/draft/create')).toBe(true)
    expect(matcher.test('/api/pokemon/25')).toBe(true)
    expect(matcher.test('/draft/abc')).toBe(true)
    expect(matcher.test('/')).toBe(true)
  })
})

describe('middleware rate-limit key', () => {
  beforeEach(() => {
    authImpl = async () => ({ userId: null })
  })

  it('cannot be bypassed with a random x-clerk-user-id per request', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 16; i += 1) {
      const res = await run(req('/api/user/delete', 'POST', {
        'x-clerk-user-id': `spoof-${i}`,
        'x-forwarded-for': '198.51.100.9',
      }))
      statuses.push(res.status)
    }
    expect(statuses[15]).toBe(429)
  })

  it('gives each signed-in user their own bucket', async () => {
    for (let i = 0; i < 15; i += 1) {
      authImpl = async () => ({ userId: 'user_a' })
      await run(req('/api/user/delete', 'POST', { 'x-forwarded-for': '198.51.100.10' }))
    }
    authImpl = async () => ({ userId: 'user_b' })
    const res = await run(req('/api/user/delete', 'POST', { 'x-forwarded-for': '198.51.100.10' }))
    expect(res.status).not.toBe(429)
  })
})

describe('middleware auth failures', () => {
  beforeEach(() => {
    authImpl = async () => { throw new Error('JWKS unreachable') }
  })

  it('returns 503 for auth-required APIs when auth() throws', async () => {
    const res = await run(req('/api/user/delete', 'POST', { 'x-forwarded-for': '198.51.100.20' }))
    expect(res.status).toBe(503)
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })

  it('still serves public API routes when auth() throws', async () => {
    const res = await run(req('/api/draft/create', 'POST', { 'x-forwarded-for': '198.51.100.21' }))
    expect(res.status).toBe(200)
  })

  it('returns 401 for auth-required APIs without a session', async () => {
    authImpl = async () => ({ userId: null })
    const res = await run(req('/api/ai/analyze-team', 'POST', { 'x-forwarded-for': '198.51.100.22' }))
    expect(res.status).toBe(401)
  })
})

describe('middleware route limits', () => {
  beforeEach(() => {
    authImpl = async () => ({ userId: null })
  })

  // In-memory budget is 3x the rule: 10/hr drafts -> 30 pass, the 31st is 429.
  it('429s /api/draft/create on request 31 from one IP', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 31; i += 1) {
      const res = await run(req('/api/draft/create', 'POST', { 'x-forwarded-for': '198.51.100.30' }))
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 30).every(s => s === 200)).toBe(true)
    expect(statuses[30]).toBe(429)
  })

  it('never rate-limits or auth-gates /api/webhooks/*', async () => {
    let last = 0
    for (let i = 0; i < 400; i += 1) {
      last = (await run(req('/api/webhooks/clerk', 'POST', { 'x-forwarded-for': '198.51.100.31' }))).status
    }
    expect(last).toBe(200)
  })
})

describe('middleware protected pages', () => {
  it('redirects unauthenticated /dashboard to sign-in', async () => {
    protectImpl = async () => { throw new Error('unauthenticated') }
    try {
      const res = await run(req('/dashboard', 'GET'))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe('/sign-in')
      expect(location.searchParams.get('redirect_url')).toBe('http://localhost/dashboard')
    } finally {
      protectImpl = async () => {}
    }
  })
})
