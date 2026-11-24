import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Guest ids come only from a server-issued httpOnly cookie. */

let userId: string | null = null
let existing: string | undefined
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId }) }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (existing ? { name: 'guest-session-id', value: existing } : undefined) }),
}))

import { POST } from '@/app/api/guest/session/route'

const post = () => POST(new Request('http://localhost/api/guest/session', { method: 'POST' }))

beforeEach(() => {
  userId = null
  existing = undefined
})

describe('POST /api/guest/session', () => {
  it('issues an httpOnly SameSite=lax guest cookie', async () => {
    const res = await post()
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/^guest-session-id=guest-/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=lax/i)
    const body = await res.json()
    expect(body.userId).toMatch(/^guest-/)
    expect(body.source).toBe('new-cookie')
  })

  it('returns the Clerk user and sets no cookie when signed in', async () => {
    userId = 'user_1'
    const res = await post()
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await res.json()).toMatchObject({ userId: 'user_1', isAuthenticated: true })
  })

  it('reuses an existing guest cookie', async () => {
    existing = 'guest-abc'
    const res = await post()
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await res.json()).toMatchObject({ userId: 'guest-abc', source: 'existing-cookie' })
  })
})
