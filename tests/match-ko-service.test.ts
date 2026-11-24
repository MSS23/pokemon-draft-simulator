import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const inserted: Array<Record<string, unknown>> = []
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.insert = (row: Record<string, unknown>) => { inserted.push(row); return b }
      b.single = async () =>
        table === 'picks'
          ? { data: { pokemon_id: '25', pokemon_name: 'pikachu' }, error: null }
          : { data: { id: 'ko-1' }, error: null }
      return b
    },
  },
}))

import { MatchKOService } from '@/lib/match-ko-service'

const base = {
  matchId: 'm1', scorerPickId: 's1', scorerTeamId: 'tA', victimPickId: 'v1', victimTeamId: 'tB',
}

beforeEach(() => { inserted.length = 0 })

describe('MatchKOService.recordScoredKO is_death (G-03)', () => {
  it('defaults is_death to false and does not mark the victim dead', async () => {
    const dead = vi.spyOn(MatchKOService, 'markPokemonDead').mockResolvedValue(undefined as never)
    await MatchKOService.recordScoredKO(base)
    expect(inserted[0]).toMatchObject({ pick_id: 'v1', is_death: false })
    expect(dead).not.toHaveBeenCalled()
  })

  it('stores is_death from the caller so the Fallen Warrior highlight can find it', async () => {
    const dead = vi.spyOn(MatchKOService, 'markPokemonDead').mockResolvedValue(undefined as never)
    await expect(MatchKOService.recordScoredKO({ ...base, isDeath: true })).resolves.toEqual({ id: 'ko-1' })
    expect(inserted[0]).toMatchObject({ is_death: true })
    expect(dead).toHaveBeenCalledWith('v1', 'm1')
  })
})
