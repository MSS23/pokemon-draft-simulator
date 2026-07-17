import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFormatRulesEngine } from '@/domain/rules'
import { getFormatById } from '@/lib/formats'
import type { Pokemon } from '@/types'

interface IndexEntry {
  name: string
  nationalDex: number
  types: string[]
  stats: Pokemon['stats']
  abilities: string[]
  flags: {
    isLegendary: boolean
    isMythical: boolean
    isParadox: boolean
  }
}

interface FormatManifest {
  pokemonIndexHash: string
  formats: Array<{ id: string; hash: string }>
}

const poolCache = new Map<string, string[]>()

/** Resolve the exact server-enforced species pool stored with a new draft. */
export async function getServerFormatPoolIds(formatId: string): Promise<string[]> {
  const cached = poolCache.get(formatId)
  if (cached) return cached

  const format = getFormatById(formatId)
  if (!format) throw new Error(`Unknown Pokemon format: ${formatId}`)
  if (format.ruleset.allowedPokemon?.length) {
    const ids = [...format.ruleset.allowedPokemon]
    poolCache.set(formatId, ids)
    return ids
  }

  const dataDir = join(process.cwd(), 'public', 'data')
  const manifest = JSON.parse(await readFile(join(dataDir, 'format-manifest.json'), 'utf8')) as FormatManifest
  const index = JSON.parse(await readFile(
    join(dataDir, `pokemon_index_${manifest.pokemonIndexHash}.json`),
    'utf8',
  )) as Record<string, IndexEntry>

  const compiled = manifest.formats.find((entry) => entry.id === formatId)
  if (compiled) {
    const pack = JSON.parse(await readFile(
      join(dataDir, `format_${formatId}_${compiled.hash}.json`),
      'utf8',
    )) as { legalPokemon: string[] }
    const ids = pack.legalPokemon
      .map((name) => index[name]?.nationalDex)
      .filter((id): id is number => Number.isInteger(id))
      .map(String)
    poolCache.set(formatId, ids)
    return ids
  }

  const engine = createFormatRulesEngine(formatId)
  const ids = Object.values(index)
    .map((entry): Pokemon => ({
      id: String(entry.nationalDex),
      name: entry.name,
      types: entry.types.map((name) => ({ name, color: '' })),
      stats: entry.stats,
      abilities: entry.abilities,
      sprite: '',
      cost: 0,
      isLegal: true,
      isLegendary: entry.flags.isLegendary,
      isMythical: entry.flags.isMythical,
      isParadox: entry.flags.isParadox,
      generation: entry.nationalDex <= 151 ? 1
        : entry.nationalDex <= 251 ? 2
        : entry.nationalDex <= 386 ? 3
        : entry.nationalDex <= 493 ? 4
        : entry.nationalDex <= 649 ? 5
        : entry.nationalDex <= 721 ? 6
        : entry.nationalDex <= 809 ? 7
        : entry.nationalDex <= 905 ? 8 : 9,
    }))
    .filter((pokemon) => engine.isLegal(pokemon))
    .map((pokemon) => pokemon.id)

  poolCache.set(formatId, ids)
  return ids
}

