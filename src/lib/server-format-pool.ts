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

export interface ServerFormatPool {
  /** Legal species ids (national dex numbers as strings). */
  ids: string[]
  /** Authoritative cost per id, computed exactly like the client pool loader
   *  (src/lib/pokemon-api.ts): compiled pack cost, else rules-engine cost. */
  entries: Array<{ id: string; name: string; cost: number }>
}

const poolCache = new Map<string, ServerFormatPool>()

function toPokemon(entry: IndexEntry): Pokemon {
  return {
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
  }
}

/**
 * Resolve the exact server-enforced species pool (and per-species cost) for a
 * built-in format. The pool is stored on the draft (settings.allowedPokemonIds)
 * and the costs are written to pokemon_tiers so make_draft_pick /
 * system_make_pick charge the authoritative cost instead of the client's.
 */
export async function getServerFormatPool(formatId: string): Promise<ServerFormatPool> {
  const cached = poolCache.get(formatId)
  if (cached) return cached

  const format = getFormatById(formatId)
  if (!format) throw new Error(`Unknown Pokemon format: ${formatId}`)

  const dataDir = join(process.cwd(), 'public', 'data')
  const manifest = JSON.parse(await readFile(join(dataDir, 'format-manifest.json'), 'utf8')) as FormatManifest
  const index = JSON.parse(await readFile(
    join(dataDir, `pokemon_index_${manifest.pokemonIndexHash}.json`),
    'utf8',
  )) as Record<string, IndexEntry>
  const engine = createFormatRulesEngine(formatId)

  let pool: ServerFormatPool
  const compiled = manifest.formats.find((entry) => entry.id === formatId)
  if (compiled) {
    const pack = JSON.parse(await readFile(
      join(dataDir, `format_${formatId}_${compiled.hash}.json`),
      'utf8',
    )) as { legalPokemon: string[]; costs?: Record<string, number> }
    const entries = pack.legalPokemon
      .filter((name) => Number.isInteger(index[name]?.nationalDex))
      .map((name) => ({ id: String(index[name].nationalDex), name, cost: pack.costs?.[name] ?? 10 }))
    pool = { ids: entries.map((e) => e.id), entries }
  } else {
    const entries = Object.values(index)
      .map(toPokemon)
      .filter((pokemon) => engine.isLegal(pokemon))
      .map((pokemon) => ({ id: pokemon.id, name: pokemon.name, cost: engine.getCost(pokemon) }))
    // An official allowlist is authoritative for the id set even if a listed
    // species is missing from the local index (it then has no cost row and
    // the RPC falls back to the submitted cost, as before).
    const ids = format.ruleset.allowedPokemon?.length
      ? [...format.ruleset.allowedPokemon]
      : entries.map((e) => e.id)
    pool = { ids, entries }
  }

  poolCache.set(formatId, pool)
  return pool
}
