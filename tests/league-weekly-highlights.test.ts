import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { WeeklyHighlightsService } from '@/lib/weekly-highlights-service'
import { supabase } from '@/lib/supabase'

const mockFrom = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from

describe('WeeklyHighlightsService.autoGenerateHighlights eliminations query', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hints the pick_id FK when embedding picks from match_pokemon_kos', async () => {
    const selects: string[] = []
    mockFrom.mockImplementation((table: string) => {
      const b: Record<string, unknown> = {}
      for (const m of ['eq', 'not', 'order', 'limit', 'gte', 'lte', 'in', 'single', 'maybeSingle', 'insert', 'update']) {
        b[m] = () => b
      }
      b.select = (cols: string) => { selects.push(cols); return b }
      // One close completed match so the function reaches the KO queries without creating highlights.
      const data = table === 'matches'
        ? [{ id: 'm1', home_team_id: 'a', away_team_id: 'b', home_score: 1, away_score: 0, winner_team_id: 'a', home_team: { id: 'a', name: 'A' }, away_team: { id: 'b', name: 'B' } }]
        : []
      b.then = (resolve: (r: unknown) => unknown) => resolve({ data, error: null })
      return b
    })

    await WeeklyHighlightsService.autoGenerateHighlights('L1', 1)

    const deathsSelect = selects.find(s => s.includes('pokemon_name') && s.includes('matches!inner'))
    expect(deathsSelect).toBeDefined()
    expect(deathsSelect).toMatch(/picks!pick_id!inner\(/)
  })
})
