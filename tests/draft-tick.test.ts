import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the server-authoritative draft tick orchestration
 * (src/lib/draft-tick.ts). These cover the TypeScript decision logic — which
 * RPC gets called, and how its result maps to a TickResult — using a mocked
 * service-role Supabase client.
 *
 * The atomicity / concurrency guarantees themselves live in Postgres
 * (resolve_auction, system_make_pick, system_advance_turn) and are exercised by
 * the DB integration tests documented in tests/db/README.md — they need a real
 * database and are out of scope for this unit suite.
 */

const mockLog = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  createLogger: () => mockLog,
}))

// The mock service-role client is configured per-test via `dbConfig`.
let dbConfig: MockDbConfig
vi.mock('@/lib/supabase-server', () => ({
  createServiceRoleClient: () => makeMockDb(dbConfig),
}))

import { processDraftTick, logTickError } from '@/lib/draft-tick'

interface MockResult { data?: unknown; count?: number; error?: { message: string } | null }
interface MockDbConfig {
  tables: Record<string, MockResult[]>
  rpc: Record<string, MockResult>
  rpcCalls?: string[]
}

/**
 * Minimal chainable Supabase stub. `from(table)` shifts the next queued result
 * for that table; the returned builder resolves that result from single(),
 * maybeSingle(), order(), or when awaited directly (thenable). `rpc(name)`
 * returns the configured result for that function.
 */
function makeMockDb(config: MockDbConfig) {
  const queues: Record<string, MockResult[]> = {}
  for (const [t, rs] of Object.entries(config.tables)) queues[t] = [...rs]

  return {
    from(table: string) {
      const result = queues[table]?.shift() ?? { data: null }
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      builder.select = chain
      builder.eq = chain
      builder.in = chain
      builder.order = () => Promise.resolve(result)
      builder.single = () => Promise.resolve(result)
      builder.maybeSingle = () => Promise.resolve(result)
      builder.limit = chain
      // Thenable so `await db.from(t).select().eq()` resolves to `result`.
      builder.then = (onF: (v: MockResult) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onF, onR)
      return builder
    },
    rpc(name: string) {
      config.rpcCalls?.push(name)
      const r = config.rpc[name] ?? { data: null }
      return Promise.resolve(r)
    },
  }
}

const activeSnake = (overrides: Record<string, unknown> = {}) => ({
  id: 'draft-1',
  status: 'active',
  format: 'snake',
  current_turn: 3,
  current_round: 1,
  turn_started_at: new Date(Date.now() - 100_000).toISOString(), // ~100s ago
  settings: { timeLimit: 60, maxPokemonPerTeam: 6 },
  ...overrides,
})

describe('processDraftTick', () => {
  beforeEach(() => {
    dbConfig = { tables: {}, rpc: {}, rpcCalls: [] }
  })

  it('does nothing when the draft is not active', async () => {
    dbConfig.tables.drafts = [{ data: { ...activeSnake(), status: 'completed' } }]
    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('not_active')
  })

  it('resolves an expired auction (auction format)', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake({ format: 'auction' }) }]
    dbConfig.tables.auctions = [{ data: { id: 'auc-1', status: 'active', auction_end: new Date(Date.now() - 5000).toISOString() } }]
    dbConfig.rpc.resolve_auction = { data: { resolved: true, winner: 'team-1' } }

    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('auction_resolved')
  })

  it('reports not_expired when the auction has not yet ended', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake({ format: 'auction' }) }]
    dbConfig.tables.auctions = [{ data: { id: 'auc-1', status: 'active', auction_end: new Date(Date.now() + 30_000).toISOString() } }]
    dbConfig.rpc.resolve_auction = { data: { resolved: false, reason: 'Auction not yet expired' } }

    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('not_expired')
  })

  it('skips an expired nomination turn when no auction is active', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake({ format: 'auction' }) }]
    dbConfig.tables.auctions = [{ data: null }]
    dbConfig.rpc.system_skip_nomination = { data: { skipped: true, newTurn: 4 } }

    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('nomination_skipped')
  })

  it('waits out a nomination window that has not expired', async () => {
    dbConfig.tables.drafts = [
      { data: activeSnake({ format: 'auction', turn_started_at: new Date().toISOString() }) },
    ]
    dbConfig.tables.auctions = [{ data: null }]

    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('not_expired')
  })

  it('does not skip a nomination when the draft has no time limit', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake({ format: 'auction', settings: {} }) }]
    dbConfig.tables.auctions = [{ data: null }]

    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('none')
  })

  it('does not act on a snake turn whose timer has not expired', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake({ turn_started_at: new Date().toISOString() }) }]
    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('not_expired')
  })

  it('auto-picks the top affordable wishlist mon on snake timeout', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake() }]
    dbConfig.tables.teams = [
      { count: 4 },                       // team count
      { data: { budget_remaining: 100 } }, // budget lookup
    ]
    dbConfig.tables.participants = [{ data: [{ id: 'part-1' }] }]
    dbConfig.tables.wishlist_items = [{ data: [
      { pokemon_id: '25', pokemon_name: 'Pikachu', cost: 10, priority: 1 },
    ] }]
    dbConfig.tables.picks = [{ data: [] }] // nothing drafted yet
    dbConfig.rpc.get_current_team_id = { data: 'team-1' }
    dbConfig.rpc.system_make_pick = { data: { success: true, pickId: 'pick-1' } }

    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('auto_picked')
    expect(res.detail).toBe('Pikachu')
  })

  it('auto-picks for a team with two participants (co-owners)', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake() }]
    dbConfig.tables.teams = [{ count: 4 }, { data: { budget_remaining: 100 } }]
    dbConfig.tables.participants = [{ data: [{ id: 'part-1' }, { id: 'part-2' }] }]
    dbConfig.tables.wishlist_items = [{ data: [
      { pokemon_id: '25', pokemon_name: 'Pikachu', cost: 10, priority: 1 },
    ] }]
    dbConfig.tables.picks = [{ data: [] }]
    dbConfig.rpc.get_current_team_id = { data: 'team-1' }
    dbConfig.rpc.system_make_pick = { data: { success: true, pickId: 'pick-1' } }

    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('auto_picked')
    expect(res.detail).toBe('Pikachu')
  })

  it('skips the turn when there is no affordable/undrafted wishlist mon', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake() }]
    dbConfig.tables.teams = [
      { count: 4 },
      { data: { budget_remaining: 5 } }, // can't afford the 10-cost wishlist mon
    ]
    dbConfig.tables.participants = [{ data: [{ id: 'part-1' }] }]
    dbConfig.tables.wishlist_items = [{ data: [
      { pokemon_id: '25', pokemon_name: 'Pikachu', cost: 10, priority: 1 },
    ] }]
    dbConfig.tables.picks = [{ data: [] }]
    dbConfig.rpc.get_current_team_id = { data: 'team-1' }
    dbConfig.rpc.system_advance_turn = { data: { success: true, skipped: true, newTurn: 4 } }

    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('skipped')
  })

  it('skips (not auto-picks) when the only wishlist mon is already drafted', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake() }]
    dbConfig.tables.teams = [{ count: 4 }, { data: { budget_remaining: 100 } }]
    dbConfig.tables.participants = [{ data: [{ id: 'part-1' }] }]
    dbConfig.tables.wishlist_items = [{ data: [
      { pokemon_id: '25', pokemon_name: 'Pikachu', cost: 10, priority: 1 },
    ] }]
    dbConfig.tables.picks = [{ data: [{ pokemon_id: '25' }] }] // already taken
    dbConfig.rpc.get_current_team_id = { data: 'team-1' }
    dbConfig.rpc.system_advance_turn = { data: { success: true, skipped: true, newTurn: 4 } }

    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('skipped')
  })

  it('does nothing for a soft-deleted draft that still has status active', async () => {
    dbConfig.tables.drafts = [{ data: activeSnake({ deleted_at: new Date().toISOString() }) }]
    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('not_active')
    expect(dbConfig.rpcCalls).toEqual([])
  })

  const expiredWithWishlist = () => {
    dbConfig.tables.drafts = [{ data: activeSnake() }] // 100s elapsed, 60s limit: inside grace
    dbConfig.tables.teams = [{ count: 4 }, { data: { budget_remaining: 100 } }]
    dbConfig.tables.participants = [{ data: [{ id: 'part-1' }] }]
    dbConfig.tables.wishlist_items = [{ data: [
      { pokemon_id: '25', pokemon_name: 'Pikachu', cost: 10, priority: 1 },
    ] }]
    dbConfig.tables.picks = [{ data: [] }]
    dbConfig.rpc.get_current_team_id = { data: 'team-1' }
    dbConfig.rpc.system_advance_turn = { data: { success: true, skipped: true, newTurn: 4 } }
  }

  it('does not skip the turn when system_make_pick errors transiently', async () => {
    expiredWithWishlist()
    dbConfig.rpc.system_make_pick = { error: { message: 'timeout' } }
    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('none')
    expect(dbConfig.rpcCalls).not.toContain('system_advance_turn')
  })

  it('does not skip the turn when the wishlist query errors', async () => {
    expiredWithWishlist()
    dbConfig.tables.wishlist_items = [{ data: null, error: { message: 'pool exhausted' } }]
    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('none')
    expect(dbConfig.rpcCalls).not.toContain('system_advance_turn')
  })

  it('does not skip the turn when the budget lookup errors', async () => {
    expiredWithWishlist()
    dbConfig.tables.teams = [{ count: 4 }, { data: null, error: { message: '503' } }]
    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('none')
    expect(dbConfig.rpcCalls).not.toContain('system_advance_turn')
  })

  it('skips anyway once an auto-pick error persists past the grace window', async () => {
    expiredWithWishlist()
    dbConfig.tables.drafts = [{ data: activeSnake({ turn_started_at: new Date(Date.now() - 200_000).toISOString() }) }]
    dbConfig.rpc.system_make_pick = { error: { message: 'function does not exist' } }
    const res = await processDraftTick('draft-1')
    expect(res.action).toBe('skipped')
  })

  it('logs a repeated identical tick error at warn, a new one at error', () => {
    mockLog.error.mockClear()
    mockLog.warn.mockClear()
    logTickError('system_advance_turn', 'draft-log', 'boom')
    logTickError('system_advance_turn', 'draft-log', 'boom')
    logTickError('system_advance_turn', 'draft-log', 'other')
    expect(mockLog.error).toHaveBeenCalledTimes(2)
    expect(mockLog.warn).toHaveBeenCalledTimes(1)
  })
})
