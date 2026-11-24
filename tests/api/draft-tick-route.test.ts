import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** POST /api/draft/[id]/tick: CRON_SECRET or a participant session only. */

let currentUser: string | null = null
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: currentUser }),
}))
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const tick = vi.fn()
vi.mock('@/lib/draft-tick', () => ({ processDraftTick: (id: string) => tick(id) }))

let participants: string[] = []
vi.mock('@/lib/supabase-server', () => ({
  createServiceRoleClient: () => ({
    from() {
      let userId = ''
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.limit = () => builder
      builder.eq = (col: string, val: string) => { if (col === 'user_id') userId = val; return builder }
      builder.maybeSingle = async () => ({ data: participants.includes(userId) ? { id: 'p1' } : null, error: null })
      return builder
    },
  }),
}))

import { POST } from '@/app/api/draft/[id]/tick/route'

const DRAFT = '11111111-1111-1111-1111-111111111111'
function callTick(headers: Record<string, string> = {}, guestCookie?: string) {
  const req = new NextRequest(`http://localhost/api/draft/${DRAFT}/tick`, { method: 'POST', headers })
  // happy-dom strips a literal Cookie header, so set it through the cookie API.
  if (guestCookie) req.cookies.set('guest-session-id', guestCookie)
  return POST(req, { params: Promise.resolve({ id: DRAFT }) })
}

describe('/api/draft/[id]/tick auth', () => {
  beforeEach(() => {
    currentUser = null
    participants = ['user_host', 'guest-abc']
    process.env.CRON_SECRET = 'cron-secret'
    tick.mockResolvedValue({ draftId: DRAFT, action: 'none', detail: 'raw rpc error text' })
  })

  it('rejects callers with no session', async () => {
    expect((await callTick()).status).toBe(401)
    expect(tick).not.toHaveBeenCalled()
  })

  it('rejects signed-in non-participants', async () => {
    currentUser = 'user_stranger'
    expect((await callTick()).status).toBe(403)
    expect(tick).not.toHaveBeenCalled()
  })

  it('ticks for a participant and hides raw detail', async () => {
    currentUser = 'user_host'
    const res = await callTick()
    expect(res.status).toBe(200)
    expect(tick).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ draftId: DRAFT, action: 'none' })
  })

  it('keeps the auto-picked species name for the client toast', async () => {
    currentUser = 'user_host'
    tick.mockResolvedValue({ draftId: DRAFT, action: 'auto_picked', detail: 'Pikachu' })
    expect((await (await callTick()).json()).detail).toBe('Pikachu')
  })

  it('accepts a guest cookie participant (spectators included)', async () => {
    expect((await callTick({}, 'guest-abc')).status).toBe(200)
  })

  it('accepts the cron secret without a session', async () => {
    expect((await callTick({ authorization: 'Bearer cron-secret' })).status).toBe(200)
    expect((await callTick({ authorization: 'Bearer wrong' })).status).toBe(401)
  })
})
