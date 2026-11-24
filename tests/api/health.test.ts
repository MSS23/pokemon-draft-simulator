import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

let token: string | null
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: 'user_1', getToken: async () => token }),
}))

let whoami: { data: unknown; error: { message: string } | null }
vi.mock('@/lib/supabase-server', () => ({
  createClerkSupabaseClientServer: async () => ({ rpc: async () => whoami }),
}))

const dbProbe = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { getChannels: () => [], from: () => ({ select: () => ({ limit: dbProbe }) }) },
}))

import { GET as bridge } from '@/app/api/health/bridge/route'
import { GET as monitoring } from '@/app/api/monitoring/route'

const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`

describe('GET /api/health/bridge', () => {
  beforeEach(() => {
    token = jwt({ role: 'authenticated' })
    whoami = { data: 'user_1', error: null }
  })

  it('200 when whoami matches', async () => {
    expect((await bridge()).status).toBe(200)
  })

  it('503 when the token lacks role=authenticated', async () => {
    token = jwt({ role: 'anon' })
    const res = await bridge()
    expect(res.status).toBe(503)
    expect((await res.json()).bridge).toBe('down')
  })

  it('503 on whoami mismatch', async () => {
    whoami = { data: 'someone_else', error: null }
    expect((await bridge()).status).toBe(503)
  })

  it('503 on whoami RPC error', async () => {
    whoami = { data: null, error: { message: 'x' } }
    expect((await bridge()).status).toBe(503)
  })
})

describe('GET /api/monitoring', () => {
  const req = (authorization?: string) =>
    new NextRequest('http://localhost/api/monitoring', authorization ? { headers: { authorization } } : undefined)

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    dbProbe.mockResolvedValue({ data: [], error: null })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('401 without the bearer secret, and never touches the DB', async () => {
    expect((await monitoring(req())).status).toBe(401)
    expect((await monitoring(req('Bearer wrong'))).status).toBe(401)
    expect(dbProbe).not.toHaveBeenCalled()
  })

  it('503 when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await monitoring(req('Bearer '))).status).toBe(503)
  })

  it('reports db down when the probe resolves {error}', async () => {
    dbProbe.mockResolvedValue({ data: null, error: { message: 'down' } })
    const res = await monitoring(req('Bearer s3cret'))
    expect(res.status).toBe(200)
    expect((await res.json()).dbStatus).toBe('down')
  })

  it('ok with the right secret', async () => {
    const res = await monitoring(req('Bearer s3cret'))
    expect((await res.json()).status).toBe('ok')
  })
})
