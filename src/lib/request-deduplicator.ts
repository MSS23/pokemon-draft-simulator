'use client'

/**
 * Request Deduplicator
 *
 * Prevents race conditions by:
 * - Deduplicating identical concurrent requests
 * - Caching recent request results
 * - Preventing duplicate subscriptions
 */

export interface DeduplicatorOptions {
  cacheTime?: number // How long to cache results (ms)
  enabled?: boolean // Enable/disable deduplication
}

export class RequestDeduplicator {
  private static instance: RequestDeduplicator
  private pendingRequests = new Map<string, Promise<any>>()
  private cache = new Map<string, { data: any; timestamp: number }>()
  private defaultCacheTime = 5000 // 5 seconds

  static getInstance(): RequestDeduplicator {
    if (!RequestDeduplicator.instance) {
      RequestDeduplicator.instance = new RequestDeduplicator()
    }
    return RequestDeduplicator.instance
  }

  /**
   * Deduplicate a request by key
   *
   * If a request with the same key is already in progress, return that promise.
   * If a cached result exists and is still fresh, return it.
   * Otherwise, execute the request and cache the result.
   */
  async dedupe<T>(
    key: string,
    fn: () => Promise<T>,
    options: DeduplicatorOptions = {}
  ): Promise<T> {
    const { cacheTime = this.defaultCacheTime, enabled = true } = options

    // If deduplication is disabled, execute directly
    if (!enabled) {
      return fn()
    }

    // Check cache first
    const cached = this.cache.get(key)
    if (cached) {
      const age = Date.now() - cached.timestamp
      if (age < cacheTime) {
        console.log(`[Deduplicator] Cache hit for ${key} (age: ${age}ms)`)
        return cached.data
      } else {
        // Cache expired, remove it
        this.cache.delete(key)
      }
    }

    // Check if request is already in progress
    const pending = this.pendingRequests.get(key)
    if (pending) {
      console.log(`[Deduplicator] Request already in progress for ${key}, reusing promise`)
      return pending
    }

    // Execute new request
    console.log(`[Deduplicator] Executing new request for ${key}`)

    const promise = fn()
      .then(result => {
        // Cache successful result
        this.cache.set(key, {
          data: result,
          timestamp: Date.now()
        })

        // Clean up old cache entries
        this.cleanCache()

        return result
      })
      .finally(() => {
        // Remove from pending requests
        this.pendingRequests.delete(key)
      })

    // Store as pending
    this.pendingRequests.set(key, promise)

    return promise
  }

  /**
   * Invalidate cache for a specific key or all keys matching a pattern
   */
  invalidate(keyOrPattern: string | RegExp): void {
    if (typeof keyOrPattern === 'string') {
      this.cache.delete(keyOrPattern)
      this.pendingRequests.delete(keyOrPattern)
      console.log(`[Deduplicator] Invalidated cache for ${keyOrPattern}`)
    } else {
      // Pattern invalidation
      const pattern = keyOrPattern
      let count = 0

      for (const key of this.cache.keys()) {
        if (pattern.test(key)) {
          this.cache.delete(key)
          this.pendingRequests.delete(key)
          count++
        }
      }

      console.log(`[Deduplicator] Invalidated ${count} cache entries matching pattern ${pattern}`)
    }
  }

  /**
   * Clear all cached data and pending requests
   */
  clear(): void {
    console.log(`[Deduplicator] Clearing ${this.cache.size} cached entries and ${this.pendingRequests.size} pending requests`)
    this.cache.clear()
    this.pendingRequests.clear()
  }

  /**
   * Clean up expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, value] of this.cache.entries()) {
      const age = now - value.timestamp
      if (age > this.defaultCacheTime * 2) { // Keep for 2x cache time before cleanup
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[Deduplicator] Cleaned ${cleaned} expired cache entries`)
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size
    }
  }
}

// Export singleton instance
export const requestDeduplicator = RequestDeduplicator.getInstance()

/**
 * Helper function to wrap a request with deduplication
 */
export async function dedupeRequest<T>(
  key: string,
  fn: () => Promise<T>,
  options?: DeduplicatorOptions
): Promise<T> {
  return requestDeduplicator.dedupe(key, fn, options)
}
