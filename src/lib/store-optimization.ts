/**
 * Zustand Store Optimization Utilities
 *
 * Provides optimized patterns for Zustand state management:
 * - Batch updates to reduce re-renders
 * - Memoized selectors with shallow comparison
 * - Subscription helpers for fine-grained reactivity
 */

import { shallow } from 'zustand/shallow'
import type { StoreApi, UseBoundStore } from 'zustand'

/**
 * Create a batched update function
 * Batches multiple state updates into a single render cycle
 */
export function createBatchUpdater<T>(
  setState: (partial: Partial<T>) => void
): (updates: Partial<T>) => void {
  let pendingUpdates: Partial<T> = {}
  let updateTimeout: NodeJS.Timeout | null = null

  return (updates: Partial<T>) => {
    // Merge updates
    pendingUpdates = { ...pendingUpdates, ...updates }

    // Clear existing timeout
    if (updateTimeout) {
      clearTimeout(updateTimeout)
    }

    // Schedule batch update
    updateTimeout = setTimeout(() => {
      setState(pendingUpdates)
      pendingUpdates = {}
      updateTimeout = null
    }, 0)
  }
}

/**
 * Create a memoized selector with shallow comparison
 * Prevents unnecessary re-renders when selected data hasn't changed
 */
export function createShallowSelector<T, R>(
  selector: (state: T) => R
): (state: T) => R {
  let lastResult: R | undefined
  let lastState: T | undefined

  return (state: T) => {
    // Skip if state hasn't changed
    if (lastState === state && lastResult !== undefined) {
      return lastResult
    }

    // Compute new result
    const result = selector(state)

    // Shallow compare
    if (lastResult !== undefined && shallow(lastResult, result)) {
      return lastResult
    }

    // Update cache
    lastState = state
    lastResult = result
    return result
  }
}

/**
 * Create a deep equality selector (use sparingly)
 * Only use for complex nested objects where shallow comparison is insufficient
 */
export function createDeepSelector<T, R>(
  selector: (state: T) => R
): (state: T) => R {
  let lastResult: R | undefined
  let lastState: T | undefined

  return (state: T) => {
    // Skip if state hasn't changed
    if (lastState === state && lastResult !== undefined) {
      return lastResult
    }

    // Compute new result
    const result = selector(state)

    // Deep compare
    if (lastResult !== undefined && JSON.stringify(lastResult) === JSON.stringify(result)) {
      return lastResult
    }

    // Update cache
    lastState = state
    lastResult = result
    return result
  }
}

/**
 * Create a selector that only updates on specific field changes
 */
export function createFieldSelector<T, K extends keyof T>(
  field: K
): (state: T) => T[K] {
  let lastValue: T[K] | undefined

  return (state: T) => {
    const value = state[field]

    if (lastValue === value) {
      return lastValue as T[K]
    }

    lastValue = value
    return value
  }
}

/**
 * Batch multiple store updates together
 * Useful for updating multiple stores in a single render cycle
 */
export function batchStoreUpdates(updates: (() => void)[]): void {
  // Use React's batching (automatic in React 18+)
  // This is primarily for documentation and explicitness
  updates.forEach(update => update())
}

/**
 * Create a derived selector that depends on multiple stores
 */
export function createCombinedSelector<T1, T2, R>(
  store1: UseBoundStore<StoreApi<T1>>,
  selector1: (state: T1) => any,
  store2: UseBoundStore<StoreApi<T2>>,
  selector2: (state: T2) => any,
  combiner: (value1: any, value2: any) => R
): () => R {
  return () => {
    const value1 = store1(selector1)
    const value2 = store2(selector2)
    return combiner(value1, value2)
  }
}

/**
 * Throttle store updates to prevent excessive re-renders
 */
export function createThrottledUpdater<T>(
  setState: (partial: Partial<T>) => void,
  delayMs: number = 100
): (updates: Partial<T>) => void {
  let lastUpdate = 0
  let pendingUpdates: Partial<T> = {}
  let timeout: NodeJS.Timeout | null = null

  return (updates: Partial<T>) => {
    pendingUpdates = { ...pendingUpdates, ...updates }

    const now = Date.now()
    const timeSinceLastUpdate = now - lastUpdate

    if (timeSinceLastUpdate >= delayMs) {
      // Execute immediately
      setState(pendingUpdates)
      pendingUpdates = {}
      lastUpdate = now

      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
    } else {
      // Schedule delayed update
      if (timeout) {
        clearTimeout(timeout)
      }

      timeout = setTimeout(() => {
        setState(pendingUpdates)
        pendingUpdates = {}
        lastUpdate = Date.now()
        timeout = null
      }, delayMs - timeSinceLastUpdate)
    }
  }
}

/**
 * Debounce store updates
 * Useful for high-frequency updates like search input
 */
export function createDebouncedUpdater<T>(
  setState: (partial: Partial<T>) => void,
  delayMs: number = 300
): (updates: Partial<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  let pendingUpdates: Partial<T> = {}

  return (updates: Partial<T>) => {
    pendingUpdates = { ...pendingUpdates, ...updates }

    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      setState(pendingUpdates)
      pendingUpdates = {}
      timeout = null
    }, delayMs)
  }
}

/**
 * Create a selector cache to prevent recalculation
 * Useful for expensive derived state
 */
export class SelectorCache<T extends object, R> {
  private cache = new WeakMap<T, R>()

  constructor(private selector: (state: T) => R) {}

  public get(state: T): R {
    if (this.cache.has(state)) {
      return this.cache.get(state)!
    }

    const result = this.selector(state)
    this.cache.set(state, result)
    return result
  }

  public clear(): void {
    this.cache = new WeakMap()
  }
}

/**
 * Create a memoized array selector
 * Prevents re-renders when array contents haven't changed (by reference)
 */
export function createArraySelector<T, R>(
  selector: (state: T) => R[]
): (state: T) => R[] {
  let lastResult: R[] | undefined
  let lastState: T | undefined

  return (state: T) => {
    if (lastState === state && lastResult !== undefined) {
      return lastResult
    }

    const result = selector(state)

    // Check if arrays are equal by comparing each element
    if (lastResult && result.length === lastResult.length) {
      const allEqual = result.every((item, index) => item === lastResult![index])
      if (allEqual) {
        return lastResult
      }
    }

    lastState = state
    lastResult = result
    return result
  }
}

/**
 * Performance monitoring for store updates
 */
export class StorePerformanceMonitor {
  private updateCount = 0
  private updateTimes: number[] = []
  private startTime = Date.now()

  public recordUpdate(updateDuration: number): void {
    this.updateCount++
    this.updateTimes.push(updateDuration)

    // Keep only last 100 updates
    if (this.updateTimes.length > 100) {
      this.updateTimes.shift()
    }
  }

  public getStats() {
    const totalTime = Date.now() - this.startTime
    const avgUpdateTime = this.updateTimes.length > 0
      ? this.updateTimes.reduce((sum, time) => sum + time, 0) / this.updateTimes.length
      : 0

    return {
      totalUpdates: this.updateCount,
      avgUpdateTime: Math.round(avgUpdateTime * 100) / 100,
      updatesPerSecond: Math.round((this.updateCount / totalTime) * 1000),
      recentUpdates: this.updateTimes.slice(-10),
    }
  }

  public reset(): void {
    this.updateCount = 0
    this.updateTimes = []
    this.startTime = Date.now()
  }
}

/**
 * Create a store update wrapper with performance monitoring
 */
export function createMonitoredUpdater<T>(
  setState: (partial: Partial<T>) => void,
  monitor: StorePerformanceMonitor
): (updates: Partial<T>) => void {
  return (updates: Partial<T>) => {
    const start = performance.now()
    setState(updates)
    const duration = performance.now() - start
    monitor.recordUpdate(duration)
  }
}
