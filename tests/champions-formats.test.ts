import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHAMPIONS_MA_DEX_IDS,
  CHAMPIONS_MB_ADDED_DEX_NUMBERS,
  CHAMPIONS_MB_DEX_IDS,
} from '@/data/champions-regulations'
import { createFormatRulesEngine } from '@/domain/rules'
import { fetchPokemonForFormat } from '@/lib/pokemon-api'
import { getServerFormatPoolIds } from '@/lib/server-format-pool'
import type { Pokemon } from '@/types'

function pokemon(id: number): Pokemon {
  return {
    id: String(id),
    name: `Pokemon ${id}`,
    types: [],
    abilities: [],
    stats: {
      hp: 50,
      attack: 50,
      defense: 50,
      specialAttack: 50,
      specialDefense: 50,
      speed: 50,
      total: 300,
    },
    sprite: '',
    cost: 1,
    isLegal: true,
  }
}

describe('Pokemon Champions regulation pools', () => {
  it('matches the official species counts and M-B delta', () => {
    expect(new Set(CHAMPIONS_MA_DEX_IDS).size).toBe(186)
    expect(new Set(CHAMPIONS_MB_DEX_IDS).size).toBe(208)
    expect(CHAMPIONS_MB_ADDED_DEX_NUMBERS).toHaveLength(22)
  })

  it('keeps the M-A and M-B allowlists distinct', () => {
    const ma = createFormatRulesEngine('vgc-reg-ma')
    const mb = createFormatRulesEngine('vgc-reg-mb')

    expect(ma.isLegal(pokemon(25))).toBe(true) // Pikachu: both pools
    expect(mb.isLegal(pokemon(25))).toBe(true)
    expect(ma.isLegal(pokemon(45))).toBe(false) // Vileplume: introduced in M-B
    expect(mb.isLegal(pokemon(45))).toBe(true)
    expect(mb.isLegal(pokemon(1000))).toBe(true) // Gholdengo: introduced in M-B
    expect(mb.isLegal(pokemon(1))).toBe(false) // Bulbasaur is not listed
  })
})

describe('checked-in National Dex catalogue', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('contains every National Dex species from 1 through 1025', () => {
    const dataDir = join(process.cwd(), 'public', 'data')
    const manifest = JSON.parse(readFileSync(join(dataDir, 'format-manifest.json'), 'utf8')) as {
      pokemonIndexHash: string
    }
    const index = JSON.parse(readFileSync(
      join(dataDir, `pokemon_index_${manifest.pokemonIndexHash}.json`),
      'utf8',
    )) as Record<string, { nationalDex: number }>
    const dexNumbers = new Set(Object.values(index).map((entry) => entry.nationalDex))

    expect(dexNumbers.size).toBe(1025)
    for (let id = 1; id <= 1025; id += 1) {
      expect(dexNumbers.has(id), `missing National Dex #${id}`).toBe(true)
    }
  })

  it('returns the full catalogue and complete Champions pool without an API cap', async () => {
    const dataDir = join(process.cwd(), 'public', 'data')
    const manifest = JSON.parse(readFileSync(join(dataDir, 'format-manifest.json'), 'utf8')) as {
      pokemonIndexHash: string
      formats: Array<{ id: string; hash: string }>
    }
    const index = JSON.parse(readFileSync(
      join(dataDir, `pokemon_index_${manifest.pokemonIndexHash}.json`),
      'utf8',
    ))

    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('format-manifest') ? manifest : index,
    })))

    await expect(fetchPokemonForFormat('unrestricted')).resolves.toHaveLength(1025)
    await expect(fetchPokemonForFormat('vgc-reg-mb')).resolves.toHaveLength(208)
  })

  it('builds the same authoritative pools for database enforcement', async () => {
    await expect(getServerFormatPoolIds('unrestricted')).resolves.toHaveLength(1025)
    await expect(getServerFormatPoolIds('vgc-reg-ma')).resolves.toHaveLength(186)
    await expect(getServerFormatPoolIds('vgc-reg-mb')).resolves.toHaveLength(208)
  })
})
