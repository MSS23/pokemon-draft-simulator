import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let missing: string[] = []
vi.mock('@/lib/env', () => ({ reportMissingServerEnv: () => missing }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }) },
}))

import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  beforeEach(() => {
    missing = []
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('healthy and cacheable when config is complete', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('healthy')
    expect(body.config).toBeUndefined()
    expect(res.headers.get('Cache-Control')).toContain('s-maxage')
  })

  it('degraded without naming the variables when a server secret is missing', async () => {
    missing = ['CRON_SECRET']
    const res = await GET()
    const text = await res.text()
    const body = JSON.parse(text)
    expect(res.status).toBe(200)
    expect(body.status).toBe('degraded')
    expect(body.config).toBe('missing')
    expect(text).not.toContain('CRON_SECRET')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
