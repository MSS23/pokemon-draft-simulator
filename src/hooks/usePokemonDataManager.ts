/**
 * React Hook for Pokemon Data Manager
 *
 * Provides easy access to optimized Pokemon data fetching, caching, and search.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  PokemonDataManager,
  type PokemonWithMetadata,
  type LoadFormatOptions,
  type PokemonDataManagerOptions,
} from '@/lib/pokemon-data-manager'
import type { SearchFilters, SearchResult } from '@/lib/pokemon-search-index'
import type { PrefetchProgress } from '@/lib/pokemon-prefetch'

export interface UsePokemonDataManagerResult {
  // Data
  pokemon: PokemonWithMetadata[]
  allPokemon: PokemonWithMetadata[]
  legalPokemon: PokemonWithMetadata[]

  // Loading states
  isLoading: boolean
  isInitialized: boolean
  progress: PrefetchProgress | null

  // Search & filter
  search: (query: string, filters?: SearchFilters) => SearchResult[]
  filter: (filters: SearchFilters) => PokemonWithMetadata[]

  // Lookups
  getPokemon: (id: string) => PokemonWithMetadata | null
  getPokemonByType: (type: string) => PokemonWithMetadata[]
  getPokemonByAbility: (ability: string) => PokemonWithMetadata[]

  // Validation
  validatePokemon: (id: string) => { isLegal: boolean; reason?: string; cost?: number }
  getPokemonCost: (id: string) => number

  // Actions
  loadFormat: (options: LoadFormatOptions) => Promise<void>
  refreshFormat: () => Promise<void>
  clearCaches: () => Promise<void>

  // Metadata
  types: string[]
  abilities: string[]
  stats: any
}

export function usePokemonDataManager(
  options: PokemonDataManagerOptions = {}
): UsePokemonDataManagerResult {
  const [isLoading, setIsLoading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [progress, setProgress] = useState<PrefetchProgress | null>(null)
  const [pokemon, setPokemon] = useState<PokemonWithMetadata[]>([])
  const [updateCounter, setUpdateCounter] = useState(0)

  // Initialize on mount
  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        await PokemonDataManager.initialize(options)
        if (mounted) {
          setIsInitialized(true)
          setPokemon(PokemonDataManager.getAllPokemon(true))
        }
      } catch (error) {
        console.error('[usePokemonDataManager] Initialization failed:', error)
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [options])

  // Load format
  const loadFormat = useCallback(async (formatOptions: LoadFormatOptions) => {
    setIsLoading(true)
    setProgress(null)

    try {
      await PokemonDataManager.loadFormat({
        ...formatOptions,
        onProgress: (p) => {
          setProgress(p)
          if (formatOptions.onProgress) {
            formatOptions.onProgress(p)
          }
        },
      })

      setPokemon(PokemonDataManager.getAllPokemon(true))
      setUpdateCounter(c => c + 1)
    } catch (error) {
      console.error('[usePokemonDataManager] Load format failed:', error)
      throw error
    } finally {
      setIsLoading(false)
      setProgress(null)
    }
  }, [])

  // Refresh current format
  const refreshFormat = useCallback(async () => {
    setIsLoading(true)

    try {
      await PokemonDataManager.refreshFormat()
      setPokemon(PokemonDataManager.getAllPokemon(true))
      setUpdateCounter(c => c + 1)
    } catch (error) {
      console.error('[usePokemonDataManager] Refresh format failed:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Clear caches
  const clearCaches = useCallback(async () => {
    setIsLoading(true)

    try {
      await PokemonDataManager.clearAllCaches()
      setPokemon([])
      setUpdateCounter(c => c + 1)
    } catch (error) {
      console.error('[usePokemonDataManager] Clear caches failed:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Search
  const search = useCallback((query: string, filters?: SearchFilters): SearchResult[] => {
    return PokemonDataManager.search(query, filters)
  }, [])

  // Filter
  const filter = useCallback((filters: SearchFilters): PokemonWithMetadata[] => {
    return PokemonDataManager.filter(filters)
  }, [])

  // Get Pokemon by ID
  const getPokemon = useCallback((id: string): PokemonWithMetadata | null => {
    return PokemonDataManager.getPokemon(id)
  }, [])

  // Get Pokemon by type
  const getPokemonByType = useCallback((type: string): PokemonWithMetadata[] => {
    return PokemonDataManager.getPokemonByType(type)
  }, [])

  // Get Pokemon by ability
  const getPokemonByAbility = useCallback((ability: string): PokemonWithMetadata[] => {
    return PokemonDataManager.getPokemonByAbility(ability)
  }, [])

  // Validate Pokemon
  const validatePokemon = useCallback((id: string) => {
    return PokemonDataManager.validatePokemon(id)
  }, [])

  // Get Pokemon cost
  const getPokemonCost = useCallback((id: string): number => {
    return PokemonDataManager.getPokemonCost(id)
  }, [])

  // Computed values
  const allPokemon = useMemo(() => PokemonDataManager.getAllPokemon(false), [])
  const legalPokemon = useMemo(() => PokemonDataManager.getAllPokemon(true), [])
  const types = useMemo(() => PokemonDataManager.getAllTypes(), [])
  const abilities = useMemo(() => PokemonDataManager.getAllAbilities(), [])

  // Get stats
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    if (isInitialized) {
      PokemonDataManager.getStats().then(setStats)
    }
  }, [isInitialized, updateCounter])

  return {
    // Data
    pokemon,
    allPokemon,
    legalPokemon,

    // Loading states
    isLoading,
    isInitialized,
    progress,

    // Search & filter
    search,
    filter,

    // Lookups
    getPokemon,
    getPokemonByType,
    getPokemonByAbility,

    // Validation
    validatePokemon,
    getPokemonCost,

    // Actions
    loadFormat,
    refreshFormat,
    clearCaches,

    // Metadata
    types,
    abilities,
    stats,
  }
}

/**
 * Hook for preloading visible Pokemon images (for virtualized lists)
 */
export function useVisiblePokemonPreload(
  pokemonIds: string[],
  startIndex: number,
  endIndex: number,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled || pokemonIds.length === 0) return

    PokemonDataManager.preloadVisibleImages(pokemonIds, startIndex, endIndex)
  }, [pokemonIds, startIndex, endIndex, enabled])
}

/**
 * Hook for Pokemon search with debounce
 */
export function usePokemonSearch(
  query: string,
  filters?: SearchFilters,
  debounceMs: number = 300
): {
  results: SearchResult[]
  isSearching: boolean
} {
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    const timeoutId = setTimeout(() => {
      const searchResults = PokemonDataManager.search(query, filters)
      setResults(searchResults)
      setIsSearching(false)
    }, debounceMs)

    return () => clearTimeout(timeoutId)
  }, [query, filters, debounceMs])

  return {
    results,
    isSearching,
  }
}

/**
 * Hook for Pokemon filtering
 */
export function usePokemonFilter(filters: SearchFilters): PokemonWithMetadata[] {
  return useMemo(() => {
    return PokemonDataManager.filter(filters)
  }, [filters])
}
