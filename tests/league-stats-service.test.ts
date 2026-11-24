import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => { throw new Error('default client must not be used') }) },
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { LeagueStatsService } from '@/lib/league-stats-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

// Chainable, awaitable query builder whose result depends on the table.
function fakeDb(rows: Record<string, unknown>) {
  const from = vi.fn((table: string) => {
    const result = { data: rows[table] ?? null, error: null }
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'or', 'in', 'order', 'limit']) builder[m] = () => builder
    builder.single = () => Promise.resolve(result)
    builder.maybeSingle = () => Promise.resolve(result)
    builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej)
    return builder
  })
  return { db: { from } as unknown as SupabaseClient<Database>, from }
}

describe('LeagueStatsService.getAdvancedTeamStats with an injected client', () => {
  it('reads through the passed client and does not serve it from cache', async () => {
    const { db, from } = fakeDb({
      teams: { id: 't1', name: 'Team One' },
      standings: { wins: 2, losses: 1, draws: 0, points_for: 30, points_against: 10 },
      picks: [{ id: 'p1' }],
      team_pokemon_status: [{ status: 'alive' }],
      match_pokemon_kos: [{ ko_count: 2 }],
    })

    const stats = await LeagueStatsService.getAdvancedTeamStats('t1', db)
    expect(stats?.teamName).toBe('Team One')
    expect(stats?.wins).toBe(2)
    expect(stats?.totalKOsGiven).toBe(2)

    const callsAfterFirst = from.mock.calls.length
    await LeagueStatsService.getAdvancedTeamStats('t1', db)
    expect(from.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })
})
