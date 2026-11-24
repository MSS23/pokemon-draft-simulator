import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** F-05: a tournament lobby closing mid-join must not silently seat the player as a spectator. */

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1' }) }))
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

let leagueStatuses: string[] = []
let rpcSpectator = false
vi.mock('@/lib/supabase-server', () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'ilike', 'is']) builder[m] = () => builder
      builder.maybeSingle = async () => {
        if (table === 'drafts') return { data: { id: 'draft-1', has_password: false, settings: { tournamentOnly: true } }, error: null }
        if (table === 'leagues') return { data: { id: 'league-1', status: leagueStatuses.shift() }, error: null }
        return { data: null, error: null }
      }
      return builder
    },
    rpc: async () => ({ data: { success: true, teamId: rpcSpectator ? null : 'team-1', asSpectator: rpcSpectator }, error: null }),
  }),
}))

import { POST } from '@/app/api/draft/join/route'

const join = () => POST(new NextRequest('http://localhost/api/draft/join', {
  method: 'POST',
  body: JSON.stringify({ roomCode: 'abc123', teamName: 'Team Rocket' }),
}))

describe('/api/draft/join tournament lobby race', () => {
  beforeEach(() => { rpcSpectator = false })

  it('joins normally while the lobby is open', async () => {
    leagueStatuses = ['scheduled']
    const res = await join()
    expect(res.status).toBe(200)
    expect((await res.json()).teamId).toBe('team-1')
  })

  it('returns 409 when the lobby closed before the RPC seated the player', async () => {
    leagueStatuses = ['scheduled', 'active']
    rpcSpectator = true
    const res = await join()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already started/)
  })
})
