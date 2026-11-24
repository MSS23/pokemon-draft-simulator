import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/** Cron sweep auth (CRON_SECRET) and soft-deleted draft filtering. */

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
const processDraftTick = vi.fn(async (id: string) => ({ draftId: id, action: 'none' }))
vi.mock('@/lib/draft-tick', () => ({ processDraftTick: (id: string) => processDraftTick(id) }))

const queries: string[][] = []
vi.mock('@/lib/supabase-server', () => ({
  createServiceRoleClient: () => ({
    from() {
      const q: string[] = []
      queries.push(q)
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'order', 'range']) {
        builder[m] = (...args: unknown[]) => {
          q.push(`${m}(${args.filter((a) => a === null || typeof a !== 'object').join(',')})`)
          return builder
        }
      }
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: [{ id: 'd1' }], count: 1, error: null })
      return builder
    },
  }),
}))

import { GET } from '@/app/api/cron/draft-tick/route'

const call = (authorization?: string) => GET(new NextRequest('http://localhost/api/cron/draft-tick', {
  headers: authorization ? { authorization } : {},
}))

beforeEach(() => {
  queries.length = 0
  processDraftTick.mockClear()
})
afterEach(() => { vi.unstubAllEnvs() })

describe('/api/cron/draft-tick', () => {
  it('returns 503 when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await call('Bearer anything')).status).toBe(503)
    expect(processDraftTick).not.toHaveBeenCalled()
  })

  it('returns 401 for a missing or wrong bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 's')
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    expect(processDraftTick).not.toHaveBeenCalled()
  })

  it('sweeps with the correct bearer and filters deleted drafts out of both queries', async () => {
    vi.stubEnv('CRON_SECRET', 's')
    const res = await call('Bearer s')
    expect(res.status).toBe(200)
    expect(processDraftTick).toHaveBeenCalledWith('d1')
    expect(queries).toHaveLength(2)
    for (const q of queries) expect(q).toContain('is(deleted_at,)')
  })
})
