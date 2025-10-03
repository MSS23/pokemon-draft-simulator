'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useEffect, useState, useRef, useCallback } from 'react'
import { pokemonCache, pokemonCacheManager, type CacheStats } from '@/lib/pokemon-cache'
import { fetchPokemon, fetchPokemonList, pokemonQueries } from '@/lib/pokemon-api'
import { getDemoPokemon } from '@/lib/demo-data'
import { Pokemon } from '@/types'

interface CacheHealthMetrics {
  hitRate: number
  stalenessRate: number
  memoryUsage: number
  backgroundRefreshes: number
  errors: number
}

interface PredictiveLoadingConfig {
  enabled: boolean
  lookAheadCount: number
  loadOnHover: boolean
  loadOnScroll: boolean
  priorityTypes: string[]
}

export function useEnhancedPokemonCache() {
  const queryClient = useQueryClient()
  const [cacheStats, setCacheStats] = useState<CacheStats>(pokemonCacheManager.getCacheStats())
  const [healthMetrics, setHealthMetrics] = useState<CacheHealthMetrics>({
    hitRate: 0,
    stalenessRate: 0,
    memoryUsage: 0,
    backgroundRefreshes: 0,
    errors: 0
  })
  
  const metricsRef = useRef<CacheHealthMetrics>(healthMetrics)
  const statsUpdateInterval = useRef<NodeJS.Timeout>()

  // Update cache stats periodically
  useEffect(() => {
    const updateStats = () => {
      const stats = pokemonCacheManager.getCacheStats()
      setCacheStats(stats)
      
      // Calculate health metrics
      const stalenessRate = 0 // Would need to track stale data
      const memoryUsage = stats.memoryUsage / (100 * 1024 * 1024) // as percentage of 100MB limit
      
      setHealthMetrics(prev => ({
        ...prev,
        hitRate: stats.hitRate,
        stalenessRate,
        memoryUsage
      }))
    }

    updateStats()
    statsUpdateInterval.current = setInterval(updateStats, 30000) // Update every 30s

    return () => {
      if (statsUpdateInterval.current) {
        clearInterval(statsUpdateInterval.current)
      }
    }
  }, [])

  // Enhanced Pokemon fetching with multilayer caching
  const fetchWithCache = useCallback(async (id: string): Promise<Pokemon> => {
    // Try enhanced cache first
    const cached = await pokemonCacheManager.getCachedPokemon(id)
    if (cached) {
      metricsRef.current.backgroundRefreshes++
      return cached
    }

    // Try React Query cache
    const queryData = queryClient.getQueryData<Pokemon>(pokemonQueries.detail(id))
    if (queryData) {
      // Cache in enhanced cache for next time
      await pokemonCacheManager.cachePokemon(queryData)
      return queryData
    }

    // Fetch from API
    try {
      const pokemon = await fetchPokemon(id)
      
      // Cache in both systems
      await pokemonCacheManager.cachePokemon(pokemon)
      queryClient.setQueryData(pokemonQueries.detail(id), pokemon)
      
      return pokemon
    } catch (error) {
      metricsRef.current.errors++
      throw error
    }
  }, [queryClient])

  // Enhanced Pokemon list fetching
  const fetchListWithCache = useCallback(async (listKey: string = 'default'): Promise<Pokemon[]> => {
    // Try enhanced cache first
    const cached = await pokemonCacheManager.getCachedPokemonList(listKey)
    if (cached) {
      return cached
    }

    // Try React Query cache
    const queryData = queryClient.getQueryData<Pokemon[]>(pokemonQueries.list({}))
    if (queryData) {
      await pokemonCacheManager.cachePokemonList(queryData, listKey)
      return queryData
    }

    // Fetch from API with fallback
    try {
      const pokemon = await fetchPokemonList()
      if (pokemon.length > 0) {
        await pokemonCacheManager.cachePokemonList(pokemon, listKey)
        queryClient.setQueryData(pokemonQueries.list({}), pokemon)
        return pokemon
      }
      
      // Fallback to demo data
      const demoPokemon = getDemoPokemon()
      await pokemonCacheManager.cachePokemonList(demoPokemon, listKey)
      return demoPokemon
    } catch (error) {
      metricsRef.current.errors++
      console.warn('Failed to fetch Pokemon list, using demo data:', error)
      const demoPokemon = getDemoPokemon()
      await pokemonCacheManager.cachePokemonList(demoPokemon, listKey)
      return demoPokemon
    }
  }, [queryClient])

  // Predictive loading for commonly accessed Pokemon
  const predictiveLoad = useCallback(async (config: PredictiveLoadingConfig) => {
    if (!config.enabled) return

    try {
      // Get current Pokemon list to determine popular Pokemon
      const pokemonList = await fetchListWithCache()
      
      // Prioritize by type and cost
      const priorityPokemon = pokemonList
        .filter(p => 
          config.priorityTypes.length === 0 || 
          p.types.some(t => config.priorityTypes.includes(t.name))
        )
        .sort((a, b) => b.cost - a.cost) // Higher cost = more popular
        .slice(0, config.lookAheadCount)

      // Preload these Pokemon
      const preloadPromises = priorityPokemon.map(p => 
        pokemonCacheManager.cachePokemon(p)
      )

      await Promise.allSettled(preloadPromises)
      console.debug(`Predictively loaded ${priorityPokemon.length} Pokemon`)
    } catch (error) {
      console.warn('Predictive loading failed:', error)
    }
  }, [fetchListWithCache])

  // Background refresh strategy
  const backgroundRefresh = useCallback(async () => {
    try {
      // Refresh the main Pokemon list in background
      const freshList = await fetchPokemonList()
      if (freshList.length > 0) {
        await pokemonCacheManager.cachePokemonList(freshList, 'background-refresh')
        queryClient.setQueryData(pokemonQueries.list({}), freshList)
        metricsRef.current.backgroundRefreshes++
      }
    } catch (error) {
      console.warn('Background refresh failed:', error)
      metricsRef.current.errors++
    }
  }, [queryClient])

  // Cache warming for draft-related Pokemon
  const warmCacheForDraft = useCallback(async (draftedPokemonIds: string[]) => {
    if (draftedPokemonIds.length === 0) return

    try {
      // Load all drafted Pokemon and their related Pokemon
      const loadPromises = draftedPokemonIds.map(id => fetchWithCache(id))
      await Promise.allSettled(loadPromises)

      // Also load Pokemon of similar types/tiers
      const pokemonList = await fetchListWithCache()
      const draftedPokemon = pokemonList.filter(p => draftedPokemonIds.includes(p.id))
      
      const relatedTypes = [...new Set(draftedPokemon.flatMap(p => p.types.map(t => t.name)))]
      const avgCost = draftedPokemon.reduce((sum, p) => sum + p.cost, 0) / draftedPokemon.length
      
      const relatedPokemon = pokemonList
        .filter(p => 
          !draftedPokemonIds.includes(p.id) &&
          (p.types.some(t => relatedTypes.includes(t.name)) || 
           Math.abs(p.cost - avgCost) <= 5)
        )
        .slice(0, 20) // Limit to prevent overwhelming
      
      const relatedPromises = relatedPokemon.map(p => pokemonCacheManager.cachePokemon(p))
      await Promise.allSettled(relatedPromises)
      
      console.debug(`Warmed cache with ${relatedPokemon.length} related Pokemon`)
    } catch (error) {
      console.warn('Cache warming failed:', error)
    }
  }, [fetchWithCache, fetchListWithCache])

  // Cache optimization - clean up old or rarely used entries
  const optimizeCache = useCallback(() => {
    try {
      const stats = pokemonCacheManager.getCacheStats()
      
      // If cache is getting full, trigger cleanup
      if (stats.memoryUsage > 80 * 1024 * 1024) { // 80MB threshold
        console.debug('Cache optimization triggered - high memory usage')
        // The cache's built-in LRU and GC will handle cleanup
      }
      
      return {
        performed: true,
        memoryBefore: stats.memoryUsage,
        entriesBefore: stats.entries
      }
    } catch (error) {
      console.warn('Cache optimization failed:', error)
      return { performed: false }
    }
  }, [])

  // Cache health monitoring
  const getCacheHealth = useCallback((): 'healthy' | 'degraded' | 'critical' => {
    const { hitRate, memoryUsage, errors } = healthMetrics
    
    if (errors > 10 || memoryUsage > 0.9) return 'critical'
    if (hitRate < 0.6 || memoryUsage > 0.8) return 'degraded'
    return 'healthy'
  }, [healthMetrics])

  return {
    // Core caching functions
    fetchWithCache,
    fetchListWithCache,
    
    // Advanced features
    predictiveLoad,
    backgroundRefresh,
    warmCacheForDraft,
    optimizeCache,
    
    // Monitoring
    cacheStats,
    healthMetrics,
    getCacheHealth,
    
    // Utilities
    clearCache: () => pokemonCacheManager.clearCache(),
    getCachedPokemon: (id: string) => pokemonCacheManager.getCachedPokemon(id),
    getCachedPokemonList: (listKey?: string) => pokemonCacheManager.getCachedPokemonList(listKey)
  }
}

// Hook for automated cache management
export function useAutomaticCacheManagement(config: {
  enablePredictiveLoading: boolean
  enableBackgroundRefresh: boolean
  enableCacheWarming: boolean
  draftedPokemonIds?: string[]
  priorityTypes?: string[]
}) {
  const cache = useEnhancedPokemonCache()
  const [isActive, setIsActive] = useState(true)
  
  // Background refresh
  useEffect(() => {
    if (!config.enableBackgroundRefresh || !isActive) return
    
    const interval = setInterval(() => {
      cache.backgroundRefresh()
    }, 10 * 60 * 1000) // Every 10 minutes
    
    return () => clearInterval(interval)
  }, [cache, config.enableBackgroundRefresh, isActive])
  
  // Predictive loading
  useEffect(() => {
    if (!config.enablePredictiveLoading || !isActive) return
    
    cache.predictiveLoad({
      enabled: true,
      lookAheadCount: 20,
      loadOnHover: true,
      loadOnScroll: true,
      priorityTypes: config.priorityTypes || ['fire', 'water', 'grass', 'electric', 'psychic']
    })
  }, [cache, config.enablePredictiveLoading, config.priorityTypes, isActive])
  
  // Cache warming for draft
  useEffect(() => {
    if (!config.enableCacheWarming || !config.draftedPokemonIds || !isActive) return
    
    cache.warmCacheForDraft(config.draftedPokemonIds)
  }, [cache, config.enableCacheWarming, config.draftedPokemonIds, isActive])
  
  // Cache optimization
  useEffect(() => {
    if (!isActive) return
    
    const interval = setInterval(() => {
      cache.optimizeCache()
    }, 5 * 60 * 1000) // Every 5 minutes
    
    return () => clearInterval(interval)
  }, [cache, isActive])
  
  // Pause/resume cache management
  const pauseManagement = () => setIsActive(false)
  const resumeManagement = () => setIsActive(true)
  
  return {
    ...cache,
    isActive,
    pauseManagement,
    resumeManagement
  }
}

// Hook for cache performance monitoring
export function useCachePerformanceMonitor() {
  const cache = useEnhancedPokemonCache()
  const [performanceLog, setPerformanceLog] = useState<Array<{
    timestamp: string
    action: string
    duration: number
    success: boolean
  }>>([])
  
  const logPerformance = useCallback((action: string, duration: number, success: boolean) => {
    setPerformanceLog(prev => [
      ...prev.slice(-99), // Keep last 100 entries
      {
        timestamp: new Date().toISOString(),
        action,
        duration,
        success
      }
    ])
  }, [])
  
  const measureCacheOperation = useCallback(async <T>(
    operation: () => Promise<T>,
    actionName: string
  ): Promise<T> => {
    const start = performance.now()
    try {
      const result = await operation()
      const duration = performance.now() - start
      logPerformance(actionName, duration, true)
      return result
    } catch (error) {
      const duration = performance.now() - start
      logPerformance(actionName, duration, false)
      throw error
    }
  }, [logPerformance])
  
  const getAverageResponseTime = useCallback((action?: string) => {
    const relevantLogs = action 
      ? performanceLog.filter(log => log.action === action)
      : performanceLog
    
    if (relevantLogs.length === 0) return 0
    
    const totalDuration = relevantLogs.reduce((sum, log) => sum + log.duration, 0)
    return totalDuration / relevantLogs.length
  }, [performanceLog])
  
  const getSuccessRate = useCallback((action?: string) => {
    const relevantLogs = action 
      ? performanceLog.filter(log => log.action === action)
      : performanceLog
    
    if (relevantLogs.length === 0) return 1
    
    const successCount = relevantLogs.filter(log => log.success).length
    return successCount / relevantLogs.length
  }, [performanceLog])
  
  return {
    ...cache,
    performanceLog,
    measureCacheOperation,
    getAverageResponseTime,
    getSuccessRate,
    clearPerformanceLog: () => setPerformanceLog([])
  }
}
