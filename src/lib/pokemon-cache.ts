'use client'

import { Pokemon } from '@/types'

export interface CacheEntry<T> {
  data: T
  timestamp: number
  version: string
  etag?: string
  lastAccessed: number
  hitCount: number
  size: number
}

export interface CacheConfig {
  maxSize: number // Maximum cache size in bytes
  maxAge: number // Maximum age in milliseconds
  staleTime: number // Time after which data is considered stale
  gcInterval: number // Garbage collection interval
  compressionThreshold: number // Size threshold for compression
  persistToStorage: boolean // Whether to persist cache to localStorage
  backgroundRefresh: boolean // Whether to refresh stale data in background
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
  entries: number
  hitRate: number
  memoryUsage: number
}

class PokemonCache {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private config: CacheConfig
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    entries: 0,
    hitRate: 0,
    memoryUsage: 0
  }
  private gcTimer: NodeJS.Timeout | null = null
  private refreshQueue: Set<string> = new Set()
  private refreshing: Map<string, Promise<any>> = new Map()

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 50 * 1024 * 1024, // 50MB
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcInterval: 5 * 60 * 1000, // 5 minutes
      compressionThreshold: 1024, // 1KB
      persistToStorage: true,
      backgroundRefresh: true,
      ...config
    }

    this.startGarbageCollection()
    this.loadFromStorage()
  }

  // Get data from cache
  async get<T>(key: string, fetchFn?: () => Promise<T>): Promise<T | null> {
    const entry = this.cache.get(key)
    const now = Date.now()

    if (entry) {
      entry.lastAccessed = now
      entry.hitCount++
      this.stats.hits++

      // Check if data is still valid
      if (now - entry.timestamp < this.config.maxAge) {
        // Data is valid, but check if it's stale
        if (now - entry.timestamp > this.config.staleTime) {
          // Data is stale, trigger background refresh if enabled
          if (this.config.backgroundRefresh && fetchFn) {
            this.backgroundRefresh(key, fetchFn)
          }
        }

        this.updateStats()
        return entry.data as T
      }
    }

    this.stats.misses++

    // Data not in cache or expired, fetch fresh data
    if (fetchFn) {
      try {
        const data = await this.fetchWithDeduplication(key, fetchFn)
        this.set(key, data)
        this.updateStats()
        return data
      } catch (error) {
        console.error(`Failed to fetch data for key ${key}:`, error)

        // Return stale data if available as fallback
        if (entry) {
          console.warn(`Returning stale data for key ${key}`)
          return entry.data as T
        }
      }
    }

    this.updateStats()
    return null
  }

  // Set data in cache
  set<T>(key: string, data: T, options: { etag?: string; version?: string } = {}): void {
    const serialized = JSON.stringify(data)
    const size = new Blob([serialized]).size

    // Check cache size limits
    if (this.stats.size + size > this.config.maxSize) {
      this.evictLRU(size)
    }

    const now = Date.now()
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      version: options.version || '1.0',
      etag: options.etag,
      lastAccessed: now,
      hitCount: 0,
      size
    }

    // Remove old entry if exists
    const oldEntry = this.cache.get(key)
    if (oldEntry) {
      this.stats.size -= oldEntry.size
    }

    this.cache.set(key, entry)
    this.stats.size += size
    this.stats.entries = this.cache.size

    // Persist to storage if enabled
    if (this.config.persistToStorage) {
      this.persistToStorage()
    }
  }

  // Check if key exists in cache
  has(key: string): boolean {
    return this.cache.has(key)
  }

  // Remove entry from cache
  delete(key: string): boolean {
    const entry = this.cache.get(key)
    if (entry) {
      this.stats.size -= entry.size
      this.stats.entries = this.cache.size - 1
    }

    const deleted = this.cache.delete(key)

    if (this.config.persistToStorage) {
      this.persistToStorage()
    }

    return deleted
  }

  // Clear entire cache
  clear(): void {
    this.cache.clear()
    this.stats.size = 0
    this.stats.entries = 0
    this.stats.hits = 0
    this.stats.misses = 0
    this.stats.hitRate = 0

    if (this.config.persistToStorage) {
      this.clearStorage()
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    return { ...this.stats }
  }

  // Preload data into cache
  async preload<T>(key: string, fetchFn: () => Promise<T>): Promise<void> {
    if (!this.has(key)) {
      try {
        const data = await fetchFn()
        this.set(key, data)
      } catch (error) {
        console.error(`Failed to preload data for key ${key}:`, error)
      }
    }
  }

  // Batch preload multiple keys
  async preloadBatch<T>(
    items: Array<{ key: string; fetchFn: () => Promise<T> }>
  ): Promise<void> {
    const promises = items
      .filter(item => !this.has(item.key))
      .map(item => this.preload(item.key, item.fetchFn))

    await Promise.allSettled(promises)
  }

  // Background refresh for stale data
  private async backgroundRefresh<T>(key: string, fetchFn: () => Promise<T>): Promise<void> {
    if (this.refreshQueue.has(key) || this.refreshing.has(key)) {
      return // Already refreshing
    }

    this.refreshQueue.add(key)

    // Debounce refresh requests
    setTimeout(async () => {
      if (!this.refreshQueue.has(key)) return

      this.refreshQueue.delete(key)

      try {
        const refreshPromise = fetchFn()
        this.refreshing.set(key, refreshPromise)

        const data = await refreshPromise
        this.set(key, data)

        console.debug(`Background refresh completed for key ${key}`)
      } catch (error) {
        console.warn(`Background refresh failed for key ${key}:`, error)
      } finally {
        this.refreshing.delete(key)
      }
    }, 100)
  }

  // Deduplication for concurrent requests
  private async fetchWithDeduplication<T>(
    key: string,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    // Check if already fetching
    const existingPromise = this.refreshing.get(key)
    if (existingPromise) {
      return existingPromise
    }

    // Start new fetch
    const promise = fetchFn()
    this.refreshing.set(key, promise)

    try {
      const result = await promise
      return result
    } finally {
      this.refreshing.delete(key)
    }
  }

  // LRU eviction
  private evictLRU(neededSpace: number): void {
    const entries = Array.from(this.cache.entries())
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)

    let freedSpace = 0
    let evictedCount = 0

    for (const [key, entry] of entries) {
      if (freedSpace >= neededSpace) break

      this.cache.delete(key)
      freedSpace += entry.size
      evictedCount++
    }

    this.stats.size -= freedSpace
    this.stats.entries = this.cache.size

    console.debug(`Evicted ${evictedCount} entries, freed ${freedSpace} bytes`)
  }

  // Garbage collection
  private startGarbageCollection(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer)
    }

    this.gcTimer = setInterval(() => {
      this.runGarbageCollection()
    }, this.config.gcInterval)
  }

  private runGarbageCollection(): void {
    const now = Date.now()
    let removedCount = 0
    let freedSpace = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.maxAge) {
        freedSpace += entry.size
        this.cache.delete(key)
        removedCount++
      }
    }

    if (removedCount > 0) {
      this.stats.size -= freedSpace
      this.stats.entries = this.cache.size
      console.debug(`GC: Removed ${removedCount} expired entries, freed ${freedSpace} bytes`)
    }
  }

  // Update statistics
  private updateStats(): void {
    this.stats.hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0
    this.stats.memoryUsage = this.stats.size
  }

  // Storage persistence
  private persistToStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const cacheData = {
        entries: Array.from(this.cache.entries()),
        timestamp: Date.now()
      }

      localStorage.setItem('pokemon-cache', JSON.stringify(cacheData))
    } catch (error) {
      console.warn('Failed to persist cache to storage:', error)
    }
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem('pokemon-cache')
      if (!stored) return

      const cacheData = JSON.parse(stored)
      const now = Date.now()

      // Only load if not too old
      if (now - cacheData.timestamp < this.config.maxAge) {
        for (const [key, entry] of cacheData.entries) {
          if (now - entry.timestamp < this.config.maxAge) {
            this.cache.set(key, entry)
            this.stats.size += entry.size
          }
        }

        this.stats.entries = this.cache.size
        console.debug(`Loaded ${this.cache.size} entries from storage`)
      }
    } catch (error) {
      console.warn('Failed to load cache from storage:', error)
      this.clearStorage()
    }
  }

  private clearStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      localStorage.removeItem('pokemon-cache')
    } catch (error) {
      console.warn('Failed to clear storage:', error)
    }
  }

  // Cleanup
  destroy(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }

    this.clear()
  }
}

// Pokemon-specific cache instance
export const pokemonCache = new PokemonCache({
  maxSize: 100 * 1024 * 1024, // 100MB for Pokemon data
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  staleTime: 10 * 60 * 1000, // 10 minutes
  persistToStorage: true,
  backgroundRefresh: true
})

// Pokemon-specific cache utilities
export class PokemonCacheManager {
  private static instance: PokemonCacheManager

  static getInstance(): PokemonCacheManager {
    if (!PokemonCacheManager.instance) {
      PokemonCacheManager.instance = new PokemonCacheManager()
    }
    return PokemonCacheManager.instance
  }

  // Cache Pokemon by ID
  async cachePokemon(pokemon: Pokemon): Promise<void> {
    pokemonCache.set(`pokemon:${pokemon.id}`, pokemon)
  }

  // Cache Pokemon list
  async cachePokemonList(pokemon: Pokemon[], listKey: string = 'default'): Promise<void> {
    pokemonCache.set(`pokemon-list:${listKey}`, pokemon)

    // Also cache individual Pokemon
    for (const p of pokemon) {
      await this.cachePokemon(p)
    }
  }

  // Get cached Pokemon by ID
  async getCachedPokemon(id: string): Promise<Pokemon | null> {
    return pokemonCache.get(`pokemon:${id}`)
  }

  // Get cached Pokemon list
  async getCachedPokemonList(listKey: string = 'default'): Promise<Pokemon[] | null> {
    return pokemonCache.get(`pokemon-list:${listKey}`)
  }

  // Preload commonly used Pokemon
  async preloadCommonPokemon(pokemonIds: string[]): Promise<void> {
    const items = pokemonIds.map(id => ({
      key: `pokemon:${id}`,
      fetchFn: () => this.fetchPokemonFromAPI(id)
    }))

    await pokemonCache.preloadBatch(items)
  }

  // Get cache statistics
  getCacheStats(): CacheStats {
    return pokemonCache.getStats()
  }

  // Clear Pokemon cache
  clearCache(): void {
    pokemonCache.clear()
  }

  // Mock API fetch (replace with actual API calls)
  private async fetchPokemonFromAPI(id: string): Promise<Pokemon> {
    // This would be replaced with actual PokéAPI calls
    throw new Error(`Pokemon ${id} not found in cache and API fetch not implemented`)
  }
}

// Export singleton
export const pokemonCacheManager = PokemonCacheManager.getInstance()

// React hook for Pokemon caching
export function usePokemonCache() {
  const manager = pokemonCacheManager

  const cachePokemon = async (pokemon: Pokemon) => {
    await manager.cachePokemon(pokemon)
  }

  const cachePokemonList = async (pokemon: Pokemon[], listKey: string = 'default') => {
    await manager.cachePokemonList(pokemon, listKey)
  }

  const getCachedPokemon = async (id: string) => {
    return manager.getCachedPokemon(id)
  }

  const getCachedPokemonList = async (listKey: string = 'default') => {
    return manager.getCachedPokemonList(listKey)
  }

  const preloadCommonPokemon = async (pokemonIds: string[]) => {
    await manager.preloadCommonPokemon(pokemonIds)
  }

  const getCacheStats = () => {
    return manager.getCacheStats()
  }

  const clearCache = () => {
    manager.clearCache()
  }

  return {
    cachePokemon,
    cachePokemonList,
    getCachedPokemon,
    getCachedPokemonList,
    preloadCommonPokemon,
    getCacheStats,
    clearCache
  }
}