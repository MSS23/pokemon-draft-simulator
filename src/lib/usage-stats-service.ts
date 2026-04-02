/**
 * Usage Stats Service
 *
 * Fetches competitive usage data from Smogon/pkmn sources.
 * Uses @pkmn/smogon when available, falls back to direct HTTP fetch
 * from data.pkmn.cc or Smogon stats pages.
 *
 * Caches results in IndexedDB with 24-hour TTL.
 * Returns cached data immediately and refreshes in background.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'
import { createLogger } from '@/lib/logger'

const log = createLogger('UsageStatsService')

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PokemonUsageData {
  name: string
  usagePercent: number
  rank: number
  commonMoves: Array<{ name: string; usage: number }>
  commonItems: Array<{ name: string; usage: number }>
  commonAbilities: Array<{ name: string; usage: number }>
  commonTeammates: Array<{ name: string; usage: number }>
  counters: Array<{ name: string; score: number }>
  spreads: Array<{ nature: string; evs: string; usage: number }>
}

interface UsageStatsDB extends DBSchema {
  usageStats: {
    key: string
    value: {
      format: string
      stats: Record<string, PokemonUsageData>
      cachedAt: number
    }
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'pokemon-draft-usage-stats'
const DB_VERSION = 1
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

const PKMN_DATA_URL = 'https://data.pkmn.cc/stats'

// Format name mapping: our format IDs to Smogon format strings
const FORMAT_MAP: Record<string, string> = {
  'vgc-reg-h': 'gen9vgc2024regh',
  'vgc-reg-g': 'gen9vgc2024regg',
  'vgc-reg-f': 'gen9vgc2024regf',
  'ou': 'gen9ou',
  'uu': 'gen9uu',
  'uber': 'gen9ubers',
  'nu': 'gen9nu',
  'ru': 'gen9ru',
  'doubles-ou': 'gen9doublesou',
}

// ─── Database ─────────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<UsageStatsDB>> | null = null

function getDB(): Promise<IDBPDatabase<UsageStatsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<UsageStatsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('usageStats')) {
          db.createObjectStore('usageStats', { keyPath: 'format' })
        }
      },
    })
  }
  return dbPromise
}

async function getCachedStats(format: string): Promise<Record<string, PokemonUsageData> | null> {
  try {
    const db = await getDB()
    const cached = await db.get('usageStats', format)
    if (!cached) return null
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      return null
    }
    return cached.stats
  } catch (error) {
    log.warn('Failed to read usage stats cache:', error)
    return null
  }
}

async function getCachedStatsEvenStale(format: string): Promise<Record<string, PokemonUsageData> | null> {
  try {
    const db = await getDB()
    const cached = await db.get('usageStats', format)
    if (!cached) return null
    return cached.stats
  } catch {
    return null
  }
}

async function setCachedStats(format: string, stats: Record<string, PokemonUsageData>): Promise<void> {
  try {
    const db = await getDB()
    await db.put('usageStats', {
      format,
      stats,
      cachedAt: Date.now(),
    })
  } catch (error) {
    log.warn('Failed to write usage stats cache:', error)
  }
}

// ─── Parsing Helpers ──────────────────────────────────────────────────────────

function normalizePokemonName(name: string): string {
  return name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-')
}

function parseTopEntries(
  obj: Record<string, number> | undefined,
  limit: number = 10
): Array<{ name: string; usage: number }> {
  if (!obj) return []
  return Object.entries(obj)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, usage]) => ({ name: normalizePokemonName(name), usage }))
}

// ─── Fetch Strategies ─────────────────────────────────────────────────────────

/**
 * Strategy 1: Try @pkmn/smogon for a single Pokemon's stats.
 * Note: @pkmn/smogon.stats() is per-species, not per-format bulk.
 * We use this only as a secondary lookup for individual Pokemon.
 */
async function fetchSingleViaPkmnSmogon(
  pokemonName: string,
  smogonFormat: string
): Promise<PokemonUsageData | null> {
  try {
    const { Smogon } = await import('@pkmn/smogon')
    const { Generations } = await import('@pkmn/data')
    const { Dex } = await import('@pkmn/dex')

    const gens = new Generations(Dex)
    const smogon = new Smogon(fetch)
    const gen = gens.get(9)

    const stats = await smogon.stats(gen, pokemonName, smogonFormat as Parameters<typeof smogon.stats>[2])
    if (!stats) return null

    // stats is DisplayUsageStatistics | LegacyDisplayUsageStatistics
    const usage = 'usage' in stats ? stats.usage : undefined
    const usagePercent = usage && typeof usage === 'object' && 'weighted' in usage
      ? ((usage as { weighted: number }).weighted || 0) * 100
      : 0

    return {
      name: normalizePokemonName(pokemonName),
      usagePercent,
      rank: 0,
      commonMoves: parseTopEntries(stats.moves),
      commonItems: parseTopEntries(stats.items),
      commonAbilities: parseTopEntries(stats.abilities),
      commonTeammates: parseTopEntries(stats.teammates, 6),
      counters: stats.counters
        ? Object.entries(stats.counters)
            .map(([name, val]) => ({
              name: normalizePokemonName(name),
              score: Array.isArray(val) ? val[1] : 0,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
        : [],
      spreads: parseTopEntries(
        'stats' in stats ? stats.stats : ('spreads' in stats ? stats.spreads : undefined),
        5
      ).map(s => {
          const parts = s.name.split(':')
          const nature = parts[0] || 'Unknown'
          const evs = parts.slice(1).join(':') || s.name
          return { nature, evs, usage: s.usage }
        }),
    }
  } catch (error) {
    log.warn(`@pkmn/smogon single fetch failed for ${pokemonName}:`, error)
    return null
  }
}

/**
 * Strategy 2: Direct fetch from data.pkmn.cc
 */
async function fetchViaPkmnData(smogonFormat: string): Promise<Record<string, PokemonUsageData> | null> {
  try {
    const url = `${PKMN_DATA_URL}/${smogonFormat}.json`
    const response = await fetch(url)
    if (!response.ok) {
      log.warn(`data.pkmn.cc returned ${response.status} for ${smogonFormat}`)
      return null
    }

    const data = await response.json()
    if (!data || !data.pokemon) return null

    const result: Record<string, PokemonUsageData> = {}
    let rank = 0

    // data.pkmn.cc returns { pokemon: { [name]: { usage, moves, items, abilities, teammates, spreads } } }
    const pokemonEntries = Object.entries(data.pokemon) as Array<[string, Record<string, unknown>]>

    // Sort by usage descending to assign ranks
    pokemonEntries.sort(([, a], [, b]) => {
      const usageA = (a.usage as number) || 0
      const usageB = (b.usage as number) || 0
      return usageB - usageA
    })

    for (const [name, pokemonData] of pokemonEntries) {
      rank++
      const usage = (pokemonData.usage as number) || 0

      result[normalizePokemonName(name)] = {
        name: normalizePokemonName(name),
        usagePercent: typeof usage === 'number' && usage <= 1 ? usage * 100 : usage,
        rank,
        commonMoves: parseTopEntries(pokemonData.moves as Record<string, number> | undefined),
        commonItems: parseTopEntries(pokemonData.items as Record<string, number> | undefined),
        commonAbilities: parseTopEntries(pokemonData.abilities as Record<string, number> | undefined),
        commonTeammates: parseTopEntries(pokemonData.teammates as Record<string, number> | undefined, 6),
        counters: parseTopEntries(pokemonData.counters as Record<string, number> | undefined, 6)
          .map(c => ({ name: c.name, score: c.usage })),
        spreads: parseTopEntries(pokemonData.spreads as Record<string, number> | undefined, 5)
          .map(s => {
            const parts = s.name.split(':')
            const nature = parts[0] || 'Unknown'
            const evs = parts.slice(1).join(':') || s.name
            return { nature, evs, usage: s.usage }
          }),
      }
    }

    log.info(`Fetched ${Object.keys(result).length} Pokemon via data.pkmn.cc for ${smogonFormat}`)
    return result
  } catch (error) {
    log.warn('data.pkmn.cc fetch failed:', error)
    return null
  }
}

// ─── Public Service ───────────────────────────────────────────────────────────

export class UsageStatsService {
  /**
   * Get usage stats for all Pokemon in a format.
   * Returns cached data first, then refreshes in background.
   */
  static async getUsageStats(format: string): Promise<Map<string, PokemonUsageData>> {
    const smogonFormat = FORMAT_MAP[format] || format

    // Try fresh cache first
    const cached = await getCachedStats(smogonFormat)
    if (cached) {
      log.info(`Returning cached usage stats for ${smogonFormat}`)
      return new Map(Object.entries(cached))
    }

    // Try stale cache while fetching fresh data
    const staleCache = await getCachedStatsEvenStale(smogonFormat)

    // Fetch fresh data
    const freshData = await this.fetchFreshStats(smogonFormat)

    if (freshData) {
      // Cache the fresh data
      await setCachedStats(smogonFormat, Object.fromEntries(freshData))
      return freshData
    }

    // If fetch failed, return stale cache if available
    if (staleCache) {
      log.warn(`Returning stale cache for ${smogonFormat}`)
      return new Map(Object.entries(staleCache))
    }

    // No data available
    log.warn(`No usage stats available for ${smogonFormat}`)
    return new Map()
  }

  /**
   * Get usage data for a specific Pokemon.
   */
  static async getPokemonUsage(
    pokemonName: string,
    format: string
  ): Promise<PokemonUsageData | null> {
    const stats = await this.getUsageStats(format)
    const normalized = normalizePokemonName(pokemonName.toLowerCase())

    // Try exact match first
    if (stats.has(normalized)) {
      return stats.get(normalized)!
    }

    // Try case-insensitive search
    for (const [key, value] of stats) {
      if (key.toLowerCase() === normalized.toLowerCase()) {
        return value
      }
    }

    return null
  }

  /**
   * Get top N Pokemon by usage for a format.
   */
  static async getTopPokemon(
    format: string,
    limit: number = 20
  ): Promise<PokemonUsageData[]> {
    const stats = await this.getUsageStats(format)
    return Array.from(stats.values())
      .sort((a, b) => b.usagePercent - a.usagePercent)
      .slice(0, limit)
  }

  /**
   * Refresh stats in background (fire and forget).
   * Returns immediately, updates cache when done.
   */
  static refreshInBackground(format: string): void {
    const smogonFormat = FORMAT_MAP[format] || format
    this.fetchFreshStats(smogonFormat)
      .then(data => {
        if (data) {
          setCachedStats(smogonFormat, Object.fromEntries(data))
          log.info(`Background refresh complete for ${smogonFormat}`)
        }
      })
      .catch(error => {
        log.warn(`Background refresh failed for ${smogonFormat}:`, error)
      })
  }

  /**
   * Get detailed usage stats for a single Pokemon via @pkmn/smogon.
   * Falls back gracefully if the library is unavailable.
   */
  static async getDetailedPokemonStats(
    pokemonName: string,
    format: string
  ): Promise<PokemonUsageData | null> {
    const smogonFormat = FORMAT_MAP[format] || format
    return fetchSingleViaPkmnSmogon(pokemonName, smogonFormat)
  }

  /**
   * Internal: Try all fetch strategies in order.
   * Uses direct HTTP fetch for bulk data (data.pkmn.cc).
   */
  private static async fetchFreshStats(
    smogonFormat: string
  ): Promise<Map<string, PokemonUsageData> | null> {
    // Primary strategy: data.pkmn.cc direct fetch (works in browser)
    const dataResult = await fetchViaPkmnData(smogonFormat)
    if (dataResult && Object.keys(dataResult).length > 0) {
      return new Map(Object.entries(dataResult))
    }

    return null
  }
}
