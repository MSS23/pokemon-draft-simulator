import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The RateLimiter class is not exported from middleware.ts, so we
 * re-implement a standalone copy for unit testing. This mirrors the
 * exact logic in src/middleware.ts (lines 8-37).
 */
class RateLimiter {
  private requests = new Map<string, number[]>()

  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    const timestamps = this.requests.get(key) || []
    const validTimestamps = timestamps.filter(t => now - t < windowMs)

    if (validTimestamps.length >= limit) {
      return false
    }

    validTimestamps.push(now)
    this.requests.set(key, validTimestamps)

    // Prevent memory leak: purge stale entries when the map grows too large
    if (this.requests.size > 10000) {
      for (const [entryKey, entryTimestamps] of this.requests) {
        const valid = entryTimestamps.filter(t => now - t < windowMs)
        if (valid.length === 0) {
          this.requests.delete(entryKey)
        } else {
          this.requests.set(entryKey, valid)
        }
      }
    }

    return true
  }

  /** Expose internal map size for testing */
  get size(): number {
    return this.requests.size
  }
}

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter()
    vi.useRealTimers()
  })

  // =========================================================================
  // Basic allow/block behavior
  // =========================================================================
  describe('basic rate limiting', () => {
    it('should allow requests under the limit', () => {
      const limit = 5
      const windowMs = 60000

      for (let i = 0; i < limit; i++) {
        expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)
      }
    })

    it('should block requests that exceed the limit', () => {
      const limit = 3
      const windowMs = 60000

      // Use up the limit
      for (let i = 0; i < limit; i++) {
        expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)
      }

      // This should be blocked
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(false)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(false)
    })

    it('should track different keys independently', () => {
      const limit = 2
      const windowMs = 60000

      // User 1 uses all their requests
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(false)

      // User 2 should still be allowed
      expect(limiter.isAllowed('user-2', limit, windowMs)).toBe(true)
      expect(limiter.isAllowed('user-2', limit, windowMs)).toBe(true)
      expect(limiter.isAllowed('user-2', limit, windowMs)).toBe(false)
    })

    it('should allow exactly the limit number of requests', () => {
      const limit = 10
      const windowMs = 60000

      let allowedCount = 0
      for (let i = 0; i < limit + 5; i++) {
        if (limiter.isAllowed('user-1', limit, windowMs)) {
          allowedCount++
        }
      }

      expect(allowedCount).toBe(limit)
    })
  })

  // =========================================================================
  // Window expiry
  // =========================================================================
  describe('window expiry', () => {
    it('should reset after the time window expires', () => {
      vi.useFakeTimers()

      const limit = 2
      const windowMs = 1000

      // Use up the limit
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(false)

      // Advance past the window
      vi.advanceTimersByTime(windowMs + 1)

      // Should be allowed again
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(false)

      vi.useRealTimers()
    })

    it('should only expire old timestamps, not recent ones', () => {
      vi.useFakeTimers()

      const limit = 3
      const windowMs = 1000

      // First request at t=0
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)

      // Second request at t=400
      vi.advanceTimersByTime(400)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)

      // Third request at t=800
      vi.advanceTimersByTime(400)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)

      // Blocked at t=800
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(false)

      // At t=1001, the first request (t=0) should have expired
      vi.advanceTimersByTime(201)

      // Should allow one more (2 still valid from t=400 and t=800)
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)

      // But no more
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(false)

      vi.useRealTimers()
    })
  })

  // =========================================================================
  // Memory management (stale entry purging)
  // =========================================================================
  describe('stale entry purging', () => {
    it('should purge stale entries when map exceeds 10000 keys', () => {
      vi.useFakeTimers()

      const limit = 1
      const windowMs = 1000

      // Fill up with 10001 keys
      for (let i = 0; i <= 10000; i++) {
        limiter.isAllowed(`user-${i}`, limit, windowMs)
      }

      expect(limiter.size).toBe(10001)

      // Advance past the window so all entries are stale
      vi.advanceTimersByTime(windowMs + 1)

      // Next isAllowed call with a new key triggers purge (map > 10000)
      // But actually, after time advance, the map still has 10001 entries.
      // We need one more call to trigger the purge logic.
      // Add another key to make it > 10000 (it already is)
      limiter.isAllowed('new-user', limit, windowMs)

      // After purge, stale entries should be removed.
      // Only 'new-user' should remain (with a valid timestamp).
      expect(limiter.size).toBe(1)

      vi.useRealTimers()
    })

    it('should keep entries with valid timestamps during purge', () => {
      vi.useFakeTimers()

      const limit = 2
      const windowMs = 5000

      // Create 10001 entries: first 10000 will be stale, last one will be recent
      for (let i = 0; i < 10000; i++) {
        limiter.isAllowed(`old-user-${i}`, limit, windowMs)
      }

      // Advance past window for the old entries
      vi.advanceTimersByTime(windowMs + 1)

      // Add a fresh entry to push size over 10000 and have a valid entry
      limiter.isAllowed('fresh-user', limit, windowMs)

      expect(limiter.size).toBeGreaterThanOrEqual(1)

      // Add one more to trigger purge (size is now 10001)
      limiter.isAllowed('another-fresh', limit, windowMs)

      // After purge: only entries with valid timestamps survive
      // 'fresh-user' and 'another-fresh' should remain
      expect(limiter.size).toBeLessThanOrEqual(2)

      vi.useRealTimers()
    })

    it('should not purge when map is under 10000 entries', () => {
      const limit = 1
      const windowMs = 1000

      // Add 100 entries (well under 10000)
      for (let i = 0; i < 100; i++) {
        limiter.isAllowed(`user-${i}`, limit, windowMs)
      }

      expect(limiter.size).toBe(100)

      // Add one more -- should NOT trigger purge
      limiter.isAllowed('user-extra', limit, windowMs)

      // All entries still present (no purge occurred)
      expect(limiter.size).toBe(101)
    })
  })

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('should handle limit of 0', () => {
      // With limit 0, no requests should be allowed
      expect(limiter.isAllowed('user-1', 0, 60000)).toBe(false)
    })

    it('should handle limit of 1', () => {
      expect(limiter.isAllowed('user-1', 1, 60000)).toBe(true)
      expect(limiter.isAllowed('user-1', 1, 60000)).toBe(false)
    })

    it('should handle very short window', () => {
      vi.useFakeTimers()

      const limit = 5
      const windowMs = 1 // 1ms window

      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)

      // Advance past the 1ms window
      vi.advanceTimersByTime(2)

      // Previous request expired, should allow again
      expect(limiter.isAllowed('user-1', limit, windowMs)).toBe(true)

      vi.useRealTimers()
    })

    it('should handle empty key string', () => {
      expect(limiter.isAllowed('', 2, 60000)).toBe(true)
      expect(limiter.isAllowed('', 2, 60000)).toBe(true)
      expect(limiter.isAllowed('', 2, 60000)).toBe(false)
    })

    it('should handle concurrent keys with different limits', () => {
      // Simulate different rate limits for different endpoints
      expect(limiter.isAllowed('api-drafts', 2, 60000)).toBe(true)
      expect(limiter.isAllowed('api-drafts', 2, 60000)).toBe(true)
      expect(limiter.isAllowed('api-drafts', 2, 60000)).toBe(false)

      // Same key but higher limit in a different call should still track accumulated timestamps
      // (limit is passed per-call, but timestamps are shared per key)
      expect(limiter.isAllowed('api-drafts', 5, 60000)).toBe(true)
    })
  })
})
