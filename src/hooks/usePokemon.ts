import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPokemon,
  fetchPokemonList,
  searchPokemon,
  fetchPokemonByType,
  fetchPokemonForFormat,
  fetchPokemonForCustomFormat,
  pokemonQueries
} from '@/lib/pokemon-api'
import { Pokemon } from '@/types'

export const usePokemon = (id: string) => {
  return useQuery({
    queryKey: pokemonQueries.detail(id),
    queryFn: () => fetchPokemon(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

export const usePokemonList = (enabled: boolean = true) => {
  return useQuery({
    queryKey: pokemonQueries.list({}),
    queryFn: () => fetchPokemonList(),
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
    retryDelay: 2000, // 2 second delay before retry
  })
}

export const usePokemonListByFormat = (formatId?: string, customFormatId?: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: customFormatId
      ? ['pokemon', 'custom-format', customFormatId]
      : formatId
      ? pokemonQueries.listByFormat(formatId)
      : pokemonQueries.list({}),
    queryFn: () => {
      // If custom format ID is provided, fetch from database
      if (customFormatId) {
        return fetchPokemonForCustomFormat(customFormatId)
      }
      // Otherwise use regular format-based fetching
      if (formatId) {
        return fetchPokemonForFormat(formatId, 400)
      }
      return fetchPokemonList(400)
    },
    enabled: enabled && (!!formatId || !!customFormatId),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
    retryDelay: 2000, // 2 second delay before retry
  })
}

export const usePokemonByType = (typeName: string) => {
  return useQuery({
    queryKey: pokemonQueries.list({ type: typeName }),
    queryFn: () => fetchPokemonByType(typeName),
    enabled: !!typeName,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export const usePokemonSearch = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (query: string) => searchPokemon(query),
    onSuccess: (data, query) => {
      // Cache individual Pokemon
      data.forEach(pokemon => {
        queryClient.setQueryData(
          pokemonQueries.detail(pokemon.id),
          pokemon
        )
      })
    },
  })
}

// Custom hook for filtered Pokemon lists
export const useFilteredPokemon = (filters: {
  type?: string
  minStatTotal?: number
  maxCost?: number
  searchQuery?: string
}) => {
  const { data: allPokemon, isLoading, error } = usePokemonList()

  const filteredPokemon = allPokemon?.filter(pokemon => {
    if (filters.type && !pokemon.types.some(t => t.name === filters.type)) {
      return false
    }

    if (filters.minStatTotal && pokemon.stats.total < filters.minStatTotal) {
      return false
    }

    if (filters.maxCost && pokemon.cost > filters.maxCost) {
      return false
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      if (!pokemon.name.toLowerCase().includes(query)) {
        return false
      }
    }

    return true
  })

  return {
    data: filteredPokemon || [],
    isLoading,
    error,
  }
}

// Hook for getting Pokemon by IDs (useful for draft picks)
export const usePokemonByIds = (ids: string[]) => {
  return useQuery({
    queryKey: pokemonQueries.list({ ids }),
    queryFn: async () => {
      try {
        const promises = ids.map(id => fetchPokemon(id).catch(() => null))
        const results = await Promise.all(promises)
        return results.filter(pokemon => pokemon !== null)
      } catch (error) {
        console.warn('Error fetching Pokemon by IDs:', error)
        return []
      }
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

// Hook for caching Pokemon data in local storage for offline use
export const usePokemonCache = () => {
  const queryClient = useQueryClient()

  const cachePokemonList = (pokemon: Pokemon[]) => {
    pokemon.forEach(p => {
      queryClient.setQueryData(pokemonQueries.detail(p.id), p)
    })

    // Cache the full list
    queryClient.setQueryData(pokemonQueries.list({}), pokemon)
  }

  const getCachedPokemon = (id: string): Pokemon | undefined => {
    return queryClient.getQueryData(pokemonQueries.detail(id))
  }

  const getCachedPokemonList = (): Pokemon[] | undefined => {
    return queryClient.getQueryData(pokemonQueries.list({}))
  }

  return {
    cachePokemonList,
    getCachedPokemon,
    getCachedPokemonList,
  }
}