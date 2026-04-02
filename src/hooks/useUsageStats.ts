/**
 * React hook for competitive usage stats.
 *
 * Wraps UsageStatsService with TanStack Query for caching,
 * deduplication, and background refresh.
 *
 * Graceful fallback: if stats are unavailable, components
 * receive an empty map and can display "N/A" accordingly.
 */

import { useQuery } from '@tanstack/react-query'
import { UsageStatsService, type PokemonUsageData } from '@/lib/usage-stats-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('useUsageStats')

const STALE_TIME = 24 * 60 * 60 * 1000 // 24 hours
const GC_TIME = 48 * 60 * 60 * 1000    // 48 hours

/**
 * Fetch all usage stats for a format.
 *
 * @param format - Format ID (e.g. 'vgc-reg-h', 'ou')
 * @returns { stats, isLoading, error }
 */
export function useUsageStats(format: string) {
  const query = useQuery<Map<string, PokemonUsageData>>({
    queryKey: ['usageStats', format],
    queryFn: async () => {
      log.info(`Fetching usage stats for ${format}`)
      return UsageStatsService.getUsageStats(format)
    },
    enabled: !!format,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 1,
    retryDelay: 3000,
    // Return empty map on error so components don't break
    placeholderData: () => new Map<string, PokemonUsageData>(),
  })

  return {
    stats: query.data ?? new Map<string, PokemonUsageData>(),
    isLoading: query.isLoading,
    error: query.error,
  }
}

/**
 * Fetch usage data for a single Pokemon in a format.
 *
 * @param pokemonName - Pokemon name (e.g. 'Garchomp')
 * @param format - Format ID
 */
export function usePokemonUsage(pokemonName: string, format: string) {
  const query = useQuery<PokemonUsageData | null>({
    queryKey: ['usageStats', format, 'pokemon', pokemonName],
    queryFn: () => UsageStatsService.getPokemonUsage(pokemonName, format),
    enabled: !!pokemonName && !!format,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 1,
  })

  return {
    usage: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/**
 * Fetch top N Pokemon by usage for a format.
 *
 * @param format - Format ID
 * @param limit - Number of top Pokemon to return (default 20)
 */
export function useTopPokemon(format: string, limit: number = 20) {
  const query = useQuery<PokemonUsageData[]>({
    queryKey: ['usageStats', format, 'top', limit],
    queryFn: () => UsageStatsService.getTopPokemon(format, limit),
    enabled: !!format,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 1,
    placeholderData: () => [],
  })

  return {
    topPokemon: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  }
}
