/**
 * Background Pokemon Prefetching with Web Workers
 *
 * Efficiently prefetches Pokemon data in background without blocking UI.
 * Coordinates with cache and handles rate limiting.
 */

import { PokemonCacheDB, type CachedPokemon } from './pokemon-cache-db'
import { ImagePreloader } from './image-preloader'

export interface PrefetchProgress {
  total: number
  completed: number
  failed: number
  percentage: number
}

export type PrefetchProgressCallback = (progress: PrefetchProgress) => void

export class PokemonPrefetch {
  private static worker: Worker | null = null
  private static isInitialized = false
  private static prefetchQueue = new Set<string>()
  private static progressCallbacks = new Set<PrefetchProgressCallback>()

  /**
   * Initialize prefetch system with web worker
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Note: Web Workers require proper webpack/next.js configuration
      // For now, we'll use a simpler approach without workers
      this.isInitialized = true
      console.log('[PokemonPrefetch] Initialized (non-worker mode)')
    } catch (error) {
      console.error('[PokemonPrefetch] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Prefetch Pokemon data for a format
   */
  static async prefetchFormat(
    formatId: string,
    pokemonIds: string[],
    onProgress?: PrefetchProgressCallback
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    console.log(`[PokemonPrefetch] Starting prefetch for format ${formatId} (${pokemonIds.length} Pokemon)`)

    const startTime = performance.now()
    const progress: PrefetchProgress = {
      total: pokemonIds.length,
      completed: 0,
      failed: 0,
      percentage: 0,
    }

    if (onProgress) {
      this.progressCallbacks.add(onProgress)
    }

    try {
      // Check which Pokemon are already cached
      const cachedMap = await PokemonCacheDB.getPokemonBatch(pokemonIds)
      const uncachedIds = pokemonIds.filter(id => !cachedMap.has(id))

      console.log(`[PokemonPrefetch] ${cachedMap.size} cached, ${uncachedIds.length} need fetching`)

      // Update progress for cached Pokemon
      progress.completed = cachedMap.size
      progress.percentage = (progress.completed / progress.total) * 100
      this.notifyProgress(progress)

      // Fetch uncached Pokemon in batches
      const batchSize = 50
      const batches: string[][] = []

      for (let i = 0; i < uncachedIds.length; i += batchSize) {
        batches.push(uncachedIds.slice(i, i + batchSize))
      }

      // Process batches sequentially to avoid rate limiting
      for (const batch of batches) {
        await this.fetchBatch(batch, progress, onProgress)

        // Rate limit between batches (100ms)
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const duration = performance.now() - startTime
      console.log(`[PokemonPrefetch] Completed prefetch for ${formatId} in ${duration.toFixed(2)}ms`)
      console.log(`[PokemonPrefetch] Success: ${progress.completed}, Failed: ${progress.failed}`)

      // Prefetch images for cached Pokemon
      await this.prefetchImages(pokemonIds)
    } finally {
      if (onProgress) {
        this.progressCallbacks.delete(onProgress)
      }
    }
  }

  /**
   * Fetch a batch of Pokemon
   */
  private static async fetchBatch(
    pokemonIds: string[],
    progress: PrefetchProgress,
    onProgress?: PrefetchProgressCallback
  ): Promise<void> {
    const promises = pokemonIds.map(id => this.fetchPokemon(id))
    const results = await Promise.allSettled(promises)

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        progress.completed++
      } else {
        progress.failed++
        console.error(`[PokemonPrefetch] Failed to fetch ${pokemonIds[index]}:`, result.reason)
      }

      progress.percentage = (progress.completed / progress.total) * 100
      this.notifyProgress(progress)
    })
  }

  /**
   * Fetch a single Pokemon from API
   */
  private static async fetchPokemon(pokemonId: string): Promise<void> {
    try {
      // Fetch Pokemon data
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      // Fetch species data for legendary/mythical flags
      const speciesResponse = await fetch(data.species.url)
      const speciesData = speciesResponse.ok ? await speciesResponse.json() : null

      // Transform to cached format
      const pokemon: Omit<CachedPokemon, 'cachedAt'> = {
        id: String(data.id),
        name: data.name,
        types: data.types,
        stats: data.stats,
        abilities: data.abilities,
        sprites: data.sprites,
        species: data.species,
        height: data.height,
        weight: data.weight,
        moves: data.moves,
        is_legendary: speciesData?.is_legendary || false,
        is_mythical: speciesData?.is_mythical || false,
      }

      // Cache the Pokemon
      await PokemonCacheDB.cachePokemon(pokemon)
    } catch (error) {
      console.error(`[PokemonPrefetch] Error fetching Pokemon ${pokemonId}:`, error)
      throw error
    }
  }

  /**
   * Prefetch images for Pokemon
   */
  private static async prefetchImages(pokemonIds: string[]): Promise<void> {
    console.log(`[PokemonPrefetch] Prefetching images for ${pokemonIds.length} Pokemon`)

    try {
      await ImagePreloader.preloadPokemonImages(pokemonIds, {
        priority: 'low',
        preferArtwork: true,
        fallbackToSprite: true,
      })
    } catch (error) {
      console.error('[PokemonPrefetch] Image prefetch failed:', error)
    }
  }

  /**
   * Notify progress callbacks
   */
  private static notifyProgress(progress: PrefetchProgress): void {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress)
      } catch (error) {
        console.error('[PokemonPrefetch] Progress callback error:', error)
      }
    })
  }

  /**
   * Prefetch a single Pokemon (for on-demand loading)
   */
  static async prefetchPokemon(pokemonId: string): Promise<void> {
    if (this.prefetchQueue.has(pokemonId)) {
      return // Already queued
    }

    this.prefetchQueue.add(pokemonId)

    try {
      // Check if already cached
      const cached = await PokemonCacheDB.getPokemon(pokemonId)
      if (cached) {
        return
      }

      // Fetch and cache
      await this.fetchPokemon(pokemonId)

      // Prefetch images
      await ImagePreloader.preloadPokemonImages([pokemonId], {
        priority: 'medium',
        preferArtwork: true,
        fallbackToSprite: true,
      })
    } finally {
      this.prefetchQueue.delete(pokemonId)
    }
  }

  /**
   * Prefetch Pokemon batch (for scrolling/pagination)
   */
  static async prefetchPokemonBatch(pokemonIds: string[]): Promise<void> {
    const uncachedIds = pokemonIds.filter(id => !this.prefetchQueue.has(id))

    if (uncachedIds.length === 0) return

    uncachedIds.forEach(id => this.prefetchQueue.add(id))

    try {
      // Check which are already cached
      const cachedMap = await PokemonCacheDB.getPokemonBatch(uncachedIds)
      const toFetch = uncachedIds.filter(id => !cachedMap.has(id))

      if (toFetch.length === 0) return

      // Fetch in parallel (limited batch)
      const batchSize = 10
      for (let i = 0; i < toFetch.length; i += batchSize) {
        const batch = toFetch.slice(i, i + batchSize)
        await Promise.all(batch.map(id => this.fetchPokemon(id)))

        // Rate limit
        if (i + batchSize < toFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      // Prefetch images
      await ImagePreloader.preloadPokemonImages(toFetch, {
        priority: 'low',
        preferArtwork: true,
        fallbackToSprite: true,
      })
    } finally {
      uncachedIds.forEach(id => this.prefetchQueue.delete(id))
    }
  }

  /**
   * Cancel all pending prefetch operations
   */
  static cancelAll(): void {
    this.prefetchQueue.clear()
    this.progressCallbacks.clear()
    console.log('[PokemonPrefetch] Cancelled all operations')
  }

  /**
   * Get prefetch statistics
   */
  static getStats(): {
    isInitialized: boolean
    queueSize: number
    callbackCount: number
  } {
    return {
      isInitialized: this.isInitialized,
      queueSize: this.prefetchQueue.size,
      callbackCount: this.progressCallbacks.size,
    }
  }

  /**
   * Shutdown prefetch system
   */
  static shutdown(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }

    this.prefetchQueue.clear()
    this.progressCallbacks.clear()
    this.isInitialized = false

    console.log('[PokemonPrefetch] Shutdown complete')
  }
}
