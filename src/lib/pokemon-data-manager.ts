/**
 * Pokemon Data Manager
 *
 * Unified interface for Pokemon data fetching, caching, validation, and search.
 * Coordinates IndexedDB cache, search index, format validation, and image preloading.
 *
 * Performance targets:
 * - Initial load: < 2 seconds
 * - Search: < 50ms
 * - Validation: < 1ms (cached)
 * - Format switching: < 500ms
 */

import { PokemonCacheDB, type CachedPokemon } from './pokemon-cache-db'
import { PokemonSearchIndex, type SearchFilters, type SearchResult } from './pokemon-search-index'
import { FormatValidator, type FormatRules, type ValidationResult } from './format-validator'
import { ImagePreloader } from './image-preloader'
import { PokemonPrefetch, type PrefetchProgress } from './pokemon-prefetch'

export interface PokemonDataManagerOptions {
  enableCache?: boolean
  enablePrefetch?: boolean
  enableImagePreload?: boolean
  prefetchOnInit?: boolean
}

export interface LoadFormatOptions {
  formatId: string
  formatRules: FormatRules
  onProgress?: (progress: PrefetchProgress) => void
}

export interface PokemonWithMetadata extends CachedPokemon {
  cost: number
  isLegal: boolean
  validationReason?: string
  bst: number
}

export class PokemonDataManager {
  private static isInitialized = false
  private static currentFormat: FormatRules | null = null
  private static pokemonCache: Map<string, PokemonWithMetadata> = new Map()
  private static allPokemon: CachedPokemon[] = []

  /**
   * Initialize the Pokemon data manager
   */
  static async initialize(options: PokemonDataManagerOptions = {}): Promise<void> {
    if (this.isInitialized) {
      console.log('[PokemonDataManager] Already initialized')
      return
    }

    console.log('[PokemonDataManager] Initializing...')
    const startTime = performance.now()

    try {
      // Initialize IndexedDB cache
      if (options.enableCache !== false) {
        await PokemonCacheDB.initialize()
      }

      // Initialize prefetch system
      if (options.enablePrefetch !== false) {
        await PokemonPrefetch.initialize()
      }

      // Load cached Pokemon
      this.allPokemon = await PokemonCacheDB.getAllPokemon()
      console.log(`[PokemonDataManager] Loaded ${this.allPokemon.length} cached Pokemon`)

      // Build search index if we have Pokemon
      if (this.allPokemon.length > 0) {
        PokemonSearchIndex.buildIndex(this.allPokemon)
      }

      this.isInitialized = true

      const duration = performance.now() - startTime
      console.log(`[PokemonDataManager] Initialized in ${duration.toFixed(2)}ms`)

      // Log cache stats
      const cacheStats = await PokemonCacheDB.getStats()
      console.log('[PokemonDataManager] Cache stats:', cacheStats)
    } catch (error) {
      console.error('[PokemonDataManager] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Load Pokemon for a specific format
   */
  static async loadFormat(options: LoadFormatOptions): Promise<{
    total: number
    legal: number
    illegal: number
    duration: number
  }> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    console.log(`[PokemonDataManager] Loading format ${options.formatId}`)
    const startTime = performance.now()

    try {
      this.currentFormat = options.formatRules

      // Check if format is cached in IndexedDB
      const cachedFormat = await PokemonCacheDB.getFormat(options.formatId)

      let pokemonIds: string[]
      let pokemonCosts: Record<string, number>

      if (cachedFormat) {
        // Use cached format data
        console.log(`[PokemonDataManager] Using cached format ${options.formatId}`)
        pokemonIds = cachedFormat.legalPokemon
        pokemonCosts = cachedFormat.pokemonCosts
      } else {
        // Calculate legal Pokemon from format rules
        const allowedIds = options.formatRules.allowedPokedexNumbers || []
        pokemonIds = allowedIds.map(id => String(id))
        pokemonCosts = {}

        console.log(`[PokemonDataManager] Format ${options.formatId} has ${pokemonIds.length} potential Pokemon`)
      }

      // Prefetch Pokemon data
      await PokemonPrefetch.prefetchFormat(options.formatId, pokemonIds, options.onProgress)

      // Reload Pokemon from cache after prefetch
      this.allPokemon = await PokemonCacheDB.getAllPokemon()

      // Update search index with costs
      PokemonSearchIndex.buildIndex(this.allPokemon, pokemonCosts)

      // Preload validation cache
      FormatValidator.preloadFormat(this.allPokemon, options.formatRules)

      // Build Pokemon with metadata cache
      this.pokemonCache.clear()
      let legalCount = 0
      let illegalCount = 0

      this.allPokemon.forEach(pokemon => {
        const validation = FormatValidator.validatePokemon(pokemon, options.formatRules)
        const bst = pokemon.stats.reduce((sum, s) => sum + s.base_stat, 0)

        const pokemonWithMeta: PokemonWithMetadata = {
          ...pokemon,
          cost: validation.cost || 0,
          isLegal: validation.isLegal,
          validationReason: validation.reason,
          bst,
        }

        this.pokemonCache.set(pokemon.id, pokemonWithMeta)

        if (validation.isLegal) {
          legalCount++
        } else {
          illegalCount++
        }
      })

      // Cache format results for next time
      if (!cachedFormat) {
        const legalPokemon = Array.from(this.pokemonCache.values())
          .filter(p => p.isLegal)
          .map(p => p.id)

        const illegalPokemon = Array.from(this.pokemonCache.values())
          .filter(p => !p.isLegal)
          .map(p => p.id)

        const costs: Record<string, number> = {}
        this.pokemonCache.forEach((pokemon, id) => {
          costs[id] = pokemon.cost
        })

        await PokemonCacheDB.cacheFormat(options.formatId, legalPokemon, illegalPokemon, costs)
      }

      // Preload images for first 50 legal Pokemon
      const legalPokemon = Array.from(this.pokemonCache.values())
        .filter(p => p.isLegal)
        .slice(0, 50)
        .map(p => p.id)

      await ImagePreloader.preloadPokemonImages(legalPokemon, {
        priority: 'high',
        preferArtwork: true,
        fallbackToSprite: true,
      })

      const duration = performance.now() - startTime

      console.log(`[PokemonDataManager] Format ${options.formatId} loaded in ${duration.toFixed(2)}ms`)
      console.log(`[PokemonDataManager] Legal: ${legalCount}, Illegal: ${illegalCount}`)

      return {
        total: this.pokemonCache.size,
        legal: legalCount,
        illegal: illegalCount,
        duration,
      }
    } catch (error) {
      console.error(`[PokemonDataManager] Failed to load format ${options.formatId}:`, error)
      throw error
    }
  }

  /**
   * Get all Pokemon for current format
   */
  static getAllPokemon(legalOnly: boolean = false): PokemonWithMetadata[] {
    const pokemon = Array.from(this.pokemonCache.values())

    if (legalOnly) {
      return pokemon.filter(p => p.isLegal)
    }

    return pokemon
  }

  /**
   * Get Pokemon by ID
   */
  static getPokemon(pokemonId: string): PokemonWithMetadata | null {
    return this.pokemonCache.get(pokemonId) || null
  }

  /**
   * Get Pokemon batch
   */
  static getPokemonBatch(pokemonIds: string[]): PokemonWithMetadata[] {
    return pokemonIds
      .map(id => this.pokemonCache.get(id))
      .filter((p): p is PokemonWithMetadata => p !== undefined)
  }

  /**
   * Search Pokemon
   */
  static search(query: string, filters?: SearchFilters): SearchResult[] {
    const results = PokemonSearchIndex.search(query)

    // Apply additional filters
    if (filters) {
      const filteredPokemon = PokemonSearchIndex.filter(
        results.map(r => r.pokemon),
        filters
      )

      return results.filter(r => filteredPokemon.includes(r.pokemon))
    }

    return results
  }

  /**
   * Filter Pokemon
   */
  static filter(filters: SearchFilters): PokemonWithMetadata[] {
    const allPokemon = this.getAllPokemon(true) // Legal only

    const basePokemon = allPokemon.map(p => p as CachedPokemon)
    const filtered = PokemonSearchIndex.filter(basePokemon, filters)

    return filtered
      .map(p => this.pokemonCache.get(p.id))
      .filter((p): p is PokemonWithMetadata => p !== undefined)
  }

  /**
   * Get Pokemon by type
   */
  static getPokemonByType(type: string): PokemonWithMetadata[] {
    const basePokemon = PokemonSearchIndex.getPokemonByType(type)

    return basePokemon
      .map(p => this.pokemonCache.get(p.id))
      .filter((p): p is PokemonWithMetadata => p !== undefined && p.isLegal)
  }

  /**
   * Get Pokemon by ability
   */
  static getPokemonByAbility(ability: string): PokemonWithMetadata[] {
    const basePokemon = PokemonSearchIndex.getPokemonByAbility(ability)

    return basePokemon
      .map(p => this.pokemonCache.get(p.id))
      .filter((p): p is PokemonWithMetadata => p !== undefined && p.isLegal)
  }

  /**
   * Validate Pokemon for current format
   */
  static validatePokemon(pokemonId: string): ValidationResult {
    if (!this.currentFormat) {
      throw new Error('No format loaded')
    }

    const pokemon = this.pokemonCache.get(pokemonId)
    if (!pokemon) {
      return { isLegal: false, reason: 'Pokemon not found' }
    }

    return FormatValidator.validatePokemon(pokemon, this.currentFormat)
  }

  /**
   * Get Pokemon cost
   */
  static getPokemonCost(pokemonId: string): number {
    const pokemon = this.pokemonCache.get(pokemonId)
    return pokemon?.cost || 0
  }

  /**
   * Preload images for visible Pokemon
   */
  static async preloadVisibleImages(
    pokemonIds: string[],
    startIndex: number,
    endIndex: number
  ): Promise<void> {
    await ImagePreloader.preloadVisiblePokemon(pokemonIds, startIndex, endIndex, {
      preferArtwork: true,
      fallbackToSprite: true,
    })
  }

  /**
   * Get all available types
   */
  static getAllTypes(): string[] {
    return PokemonSearchIndex.getAllTypes()
  }

  /**
   * Get all available abilities
   */
  static getAllAbilities(): string[] {
    return PokemonSearchIndex.getAllAbilities()
  }

  /**
   * Get statistics
   */
  static async getStats() {
    const cacheStats = await PokemonCacheDB.getStats()
    const searchStats = PokemonSearchIndex.getStats()
    const validatorStats = FormatValidator.getCacheStats()
    const imageStats = ImagePreloader.getStats()
    const prefetchStats = PokemonPrefetch.getStats()

    return {
      cache: cacheStats,
      search: searchStats,
      validator: validatorStats,
      images: imageStats,
      prefetch: prefetchStats,
      pokemon: {
        total: this.pokemonCache.size,
        legal: Array.from(this.pokemonCache.values()).filter(p => p.isLegal).length,
        illegal: Array.from(this.pokemonCache.values()).filter(p => !p.isLegal).length,
      },
    }
  }

  /**
   * Clear all caches
   */
  static async clearAllCaches(): Promise<void> {
    await PokemonCacheDB.clearAll()
    PokemonSearchIndex.clear()
    FormatValidator.clearCache()
    ImagePreloader.clearCache()

    this.pokemonCache.clear()
    this.allPokemon = []
    this.currentFormat = null

    console.log('[PokemonDataManager] All caches cleared')
  }

  /**
   * Refresh format (re-validate and reload)
   */
  static async refreshFormat(): Promise<void> {
    if (!this.currentFormat) {
      throw new Error('No format loaded')
    }

    const formatId = this.currentFormat.id

    // Clear format cache
    FormatValidator.clearFormatCache(formatId)

    // Reload format
    await this.loadFormat({
      formatId,
      formatRules: this.currentFormat,
    })
  }

  /**
   * Shutdown manager
   */
  static shutdown(): void {
    PokemonPrefetch.shutdown()
    this.pokemonCache.clear()
    this.allPokemon = []
    this.currentFormat = null
    this.isInitialized = false

    console.log('[PokemonDataManager] Shutdown complete')
  }
}
