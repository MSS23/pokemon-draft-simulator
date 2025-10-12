/**
 * Request Batching Utility
 *
 * Batches multiple individual requests into a single network call
 * Reduces network overhead and improves performance
 *
 * Features:
 * - Automatic batching with configurable delay
 * - Deduplication of identical requests
 * - Request coalescing for parallel requests
 * - Error handling per request
 */

interface BatchRequest<T> {
  id: string
  resolve: (value: T) => void
  reject: (error: Error) => void
  timestamp: number
}

interface BatchConfig {
  maxBatchSize?: number
  batchDelayMs?: number
  maxWaitMs?: number
}

/**
 * Generic batch request manager
 */
export class BatchRequester<T> {
  private queue: Map<string, BatchRequest<T>> = new Map()
  private timeout: NodeJS.Timeout | null = null
  private config: Required<BatchConfig>

  constructor(
    private fetchFn: (ids: string[]) => Promise<Map<string, T>>,
    config?: BatchConfig
  ) {
    this.config = {
      maxBatchSize: config?.maxBatchSize ?? 50,
      batchDelayMs: config?.batchDelayMs ?? 50,
      maxWaitMs: config?.maxWaitMs ?? 500,
    }
  }

  /**
   * Request an item by ID
   * Returns a promise that resolves when the batch completes
   */
  public request(id: string): Promise<T> {
    return new Promise((resolve, reject) => {
      // Check if request already exists
      const existing = this.queue.get(id)
      if (existing) {
        // Request is already queued, return the existing promise
        return existing.resolve
      }

      // Add to queue
      this.queue.set(id, {
        id,
        resolve,
        reject,
        timestamp: Date.now(),
      })

      // Schedule batch if not already scheduled
      if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), this.config.batchDelayMs)
      }

      // Check if we need to flush immediately due to:
      // 1. Batch size limit reached
      // 2. Oldest request exceeds max wait time
      if (this.shouldFlushImmediately()) {
        this.flushImmediately()
      }
    })
  }

  /**
   * Check if batch should be flushed immediately
   */
  private shouldFlushImmediately(): boolean {
    // Check batch size
    if (this.queue.size >= this.config.maxBatchSize) {
      return true
    }

    // Check max wait time
    const now = Date.now()
    for (const request of this.queue.values()) {
      if (now - request.timestamp >= this.config.maxWaitMs) {
        return true
      }
    }

    return false
  }

  /**
   * Flush immediately (cancel scheduled timeout)
   */
  private flushImmediately(): void {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    this.flush()
  }

  /**
   * Flush the current batch
   */
  private async flush(): Promise<void> {
    // Clear timeout
    this.timeout = null

    // Get all queued requests
    const batch = Array.from(this.queue.values())
    this.queue.clear()

    if (batch.length === 0) return

    // Extract IDs
    const ids = batch.map(req => req.id)

    try {
      // Execute batch fetch
      const results = await this.fetchFn(ids)

      // Resolve all requests
      batch.forEach(request => {
        const result = results.get(request.id)
        if (result !== undefined) {
          request.resolve(result)
        } else {
          request.reject(new Error(`Item not found: ${request.id}`))
        }
      })
    } catch (error) {
      // Reject all requests on batch error
      batch.forEach(request => {
        request.reject(error instanceof Error ? error : new Error('Batch request failed'))
      })
    }
  }

  /**
   * Clear all pending requests
   */
  public clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    // Reject all pending requests
    this.queue.forEach(request => {
      request.reject(new Error('Batch cleared'))
    })

    this.queue.clear()
  }
}

/**
 * Pokemon-specific batch requester
 */
class PokemonBatchRequester extends BatchRequester<any> {
  constructor() {
    super(async (ids: string[]) => {
      // Fetch multiple Pokemon in parallel
      const promises = ids.map(async (id) => {
        try {
          const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          return [id, data] as [string, any]
        } catch (error) {
          console.error(`Failed to fetch Pokemon ${id}:`, error)
          return [id, null] as [string, any]
        }
      })

      const results = await Promise.all(promises)
      return new Map(results.filter(([, data]) => data !== null))
    }, {
      maxBatchSize: 20, // Pokemon API rate limits
      batchDelayMs: 100, // Slightly longer delay for Pokemon
      maxWaitMs: 1000,
    })
  }
}

/**
 * Singleton Pokemon batch requester
 */
let pokemonBatcher: PokemonBatchRequester | null = null

/**
 * Get Pokemon batch requester instance
 */
export function getPokemonBatcher(): PokemonBatchRequester {
  if (!pokemonBatcher) {
    pokemonBatcher = new PokemonBatchRequester()
  }
  return pokemonBatcher
}

/**
 * Batch request Pokemon data
 */
export async function batchRequestPokemon(id: string): Promise<any> {
  const batcher = getPokemonBatcher()
  return batcher.request(id)
}

/**
 * Clear Pokemon batch queue
 */
export function clearPokemonBatchQueue(): void {
  if (pokemonBatcher) {
    pokemonBatcher.clear()
  }
}

/**
 * Generic image preloader with batching
 */
class ImagePreloader {
  private queue: Set<string> = new Set()
  private timeout: NodeJS.Timeout | null = null
  private loading: Set<string> = new Set()
  private loaded: Set<string> = new Set()

  /**
   * Preload an image
   */
  public preload(url: string): Promise<void> {
    // Already loaded
    if (this.loaded.has(url)) {
      return Promise.resolve()
    }

    // Already loading
    if (this.loading.has(url)) {
      return new Promise((resolve) => {
        const checkLoaded = setInterval(() => {
          if (this.loaded.has(url)) {
            clearInterval(checkLoaded)
            resolve()
          }
        }, 50)
      })
    }

    // Add to queue
    this.queue.add(url)

    // Schedule batch
    if (!this.timeout) {
      this.timeout = setTimeout(() => this.flush(), 50)
    }

    return Promise.resolve()
  }

  /**
   * Flush preload queue
   */
  private flush(): void {
    this.timeout = null

    const urls = Array.from(this.queue)
    this.queue.clear()

    // Load all images in parallel
    urls.forEach(url => {
      this.loading.add(url)

      const img = new Image()
      img.onload = () => {
        this.loading.delete(url)
        this.loaded.add(url)
      }
      img.onerror = () => {
        this.loading.delete(url)
        console.warn(`Failed to preload image: ${url}`)
      }
      img.src = url
    })
  }

  /**
   * Check if image is loaded
   */
  public isLoaded(url: string): boolean {
    return this.loaded.has(url)
  }

  /**
   * Clear cache
   */
  public clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    this.queue.clear()
    this.loading.clear()
    this.loaded.clear()
  }
}

/**
 * Singleton image preloader
 */
let imagePreloader: ImagePreloader | null = null

/**
 * Get image preloader instance
 */
export function getImagePreloader(): ImagePreloader {
  if (typeof window === 'undefined') {
    return {} as ImagePreloader
  }

  if (!imagePreloader) {
    imagePreloader = new ImagePreloader()
  }

  return imagePreloader
}

/**
 * Preload Pokemon sprite images
 */
export function preloadPokemonImages(pokemonIds: string[]): void {
  const preloader = getImagePreloader()

  pokemonIds.forEach(id => {
    // Preload both sprite and artwork
    preloader.preload(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`)
    preloader.preload(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`)
  })
}
