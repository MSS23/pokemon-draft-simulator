import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

let userId: string | null = 'user_1'
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ emailAddresses: [{ emailAddress: 'a@b.c' }] }) },
  }),
}))

interface Call { table: string; ops: Array<[string, ...unknown[]]> }
type Res = { data?: unknown; error?: { message: string } | null }

let resolveFn: (c: Call) => Res
let calls: Call[] = []

/** Chainable Supabase stub that records each call chain and resolves via resolveFn. */
const db = {
  from: (table: string) => {
    const call: Call = { table, ops: [] }
    calls.push(call)
    const builder: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'in', 'or']) {
      builder[op] = (...args: unknown[]) => { call.ops.push([op, ...args]); return builder }
    }
    builder.then = (ok: (r: Res) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, ...resolveFn(call) }).then(ok, bad)
    return builder
  },
}
vi.mock('@/lib/supabase-server', () => ({ createServiceRoleClient: () => db }))

import { GET } from '@/app/api/user/export/route'

function base(c: Call): Res {
  const eq = c.ops.find(o => o[0] === 'eq')
  if (c.table === 'participants') return { data: [{ id: 'p1', team_id: 't1', user_id: 'user_1' }] }
  if (c.table === 'teams' && eq?.[1] === 'owner_id') return { data: [{ id: 't2' }] }
  return { data: [{ table: c.table }] }
}

beforeEach(() => {
  userId = 'user_1'
  calls = []
  resolveFn = base
})

const find = (table: string, pred: (c: Call) => boolean = () => true) =>
  calls.find(c => c.table === table && pred(c))

describe('GET /api/user/export', () => {
  it('401 when signed out', async () => {
    userId = null
    expect((await GET()).status).toBe(401)
  })

  it('filters bids by team ids and wishlist by participant ids; covers every linked table', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(find('bid_history')?.ops).toContainEqual(['in', 'team_id', ['t1', 't2']])
    expect(find('wishlist_items')?.ops).toContainEqual(['in', 'participant_id', ['p1']])
    expect(find('teams', c => c.ops.some(o => o[0] === 'in'))?.ops).toContainEqual(['in', 'id', ['t1', 't2']])
    expect(find('drafts')?.ops).toContainEqual(['eq', 'host_id', 'user_1'])
    expect(find('custom_formats')?.ops).toContainEqual(['eq', 'created_by_user_id', 'user_1'])
    expect(find('push_subscriptions')?.ops[0][1]).not.toMatch(/p256dh|auth/)
    expect(find('trades')?.ops).toContainEqual(['or', 'team_a_id.in.(t1,t2),team_b_id.in.(t1,t2)'])
    expect(find('matches')?.ops).toContainEqual(['or', 'home_team_id.in.(t1,t2),away_team_id.in.(t1,t2)'])

    for (const key of ['profile', 'participants', 'teams', 'picks', 'bidHistory', 'wishlistItems',
      'hostedDrafts', 'customFormats', 'pushSubscriptions', 'leagueTeams', 'matches', 'trades']) {
      expect(body).toHaveProperty(key)
    }
    expect(body.bidHistory).toEqual([{ table: 'bid_history' }])
    expect(body.email).toBe('a@b.c')
  })

  it('500 instead of a silent partial export when any query errors', async () => {
    resolveFn = c => (c.table === 'bid_history' ? { error: { message: 'column does not exist' } } : base(c))
    const res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to export data' })
  })

  it('skips IN queries when the user has no teams or participants', async () => {
    resolveFn = c => (c.table === 'participants' || c.table === 'teams' ? { data: [] } : base(c))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(find('bid_history')).toBeUndefined()
    expect(find('wishlist_items')).toBeUndefined()
  })
})
