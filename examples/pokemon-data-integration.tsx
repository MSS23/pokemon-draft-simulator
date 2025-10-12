/**
 * Integration Example: Pokemon Data Manager
 *
 * Complete example showing how to integrate the optimized Pokemon data system
 * into a React component for the draft interface.
 */

'use client'

import { useEffect, useState, useMemo } from 'react'
import { usePokemonDataManager, usePokemonSearch, useVisiblePokemonPreload } from '@/hooks/usePokemonDataManager'
import type { FormatRules } from '@/lib/format-validator'
import type { SearchFilters } from '@/lib/pokemon-search-index'

// Example: VGC 2024 Regulation H Format
const VGC_REG_H_FORMAT: FormatRules = {
  id: 'vgc-reg-h',
  name: 'VGC 2024 Regulation H',
  generation: 9,
  gameType: 'doubles',
  allowedPokedexNumbers: Array.from({ length: 400 }, (_, i) => i + 1),
  bannedCategories: ['legendary', 'mythical', 'paradox'],
  explicitBans: [1001, 1002, 1003, 1004, 1014, 1015, 1016, 1017, 1018, 1019, 1020],
  costConfig: {
    type: 'bst',
    minCost: 1,
    maxCost: 20,
  },
}

export function PokemonDraftInterface() {
  // Initialize Pokemon data manager
  const {
    pokemon,
    legalPokemon,
    isLoading,
    progress,
    search,
    filter,
    getPokemon,
    getPokemonCost,
    validatePokemon,
    loadFormat,
    types,
    abilities,
    stats,
  } = usePokemonDataManager()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({})

  // Virtualized list state
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 })

  // Load format on mount
  useEffect(() => {
    loadFormat({
      formatId: 'vgc-reg-h',
      formatRules: VGC_REG_H_FORMAT,
    })
  }, [loadFormat])

  // Debounced search
  const { results: searchResults, isSearching } = usePokemonSearch(
    searchQuery,
    searchFilters,
    300
  )

  // Filtered Pokemon
  const filteredPokemon = useMemo(() => {
    if (searchQuery && searchResults.length > 0) {
      return searchResults.map(r => r.pokemon)
    }

    if (Object.keys(searchFilters).length > 0) {
      return filter(searchFilters)
    }

    return legalPokemon
  }, [searchQuery, searchResults, searchFilters, legalPokemon, filter])

  // Preload visible images
  const pokemonIds = filteredPokemon.map(p => p.id)
  useVisiblePokemonPreload(pokemonIds, visibleRange.start, visibleRange.end)

  // Handle Pokemon selection
  const handleSelectPokemon = (pokemonId: string) => {
    const pokemon = getPokemon(pokemonId)
    if (!pokemon) return

    // Validate
    const validation = validatePokemon(pokemonId)
    if (!validation.isLegal) {
      alert(`Cannot select ${pokemon.name}: ${validation.reason}`)
      return
    }

    // Get cost
    const cost = getPokemonCost(pokemonId)
    console.log(`Selected ${pokemon.name} (Cost: ${cost})`)

    // Add to team...
  }

  // Handle filter change
  const handleFilterChange = (newFilters: Partial<SearchFilters>) => {
    setSearchFilters(prev => ({
      ...prev,
      ...newFilters,
    }))
  }

  // Handle scroll (for virtualized list)
  const handleScroll = (startIndex: number, endIndex: number) => {
    setVisibleRange({ start: startIndex, end: endIndex })
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header with loading progress */}
      <div className="p-4 border-b">
        <h1 className="text-2xl font-bold">Pokemon Draft - {VGC_REG_H_FORMAT.name}</h1>

        {isLoading && progress && (
          <div className="mt-2">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Loading Pokemon...</span>
              <span>{progress.percentage.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>
                {progress.completed} / {progress.total} completed
              </span>
              {progress.failed > 0 && (
                <span className="text-red-500">{progress.failed} failed</span>
              )}
            </div>
          </div>
        )}

        {stats && (
          <div className="mt-2 text-sm text-gray-600">
            <span>{stats.pokemon.legal} legal Pokemon</span>
            {stats.cache && (
              <span className="ml-4">
                Cache: {stats.cache.pokemonCount} Pokemon (
                {(stats.cache.totalSize / 1024 / 1024).toFixed(2)}MB)
              </span>
            )}
            {stats.images && (
              <span className="ml-4">
                Images: {stats.images.cacheSize} ({stats.images.cacheHitRate.toFixed(0)}% hit rate)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Search and filters */}
      <div className="p-4 border-b space-y-4">
        {/* Search input */}
        <div>
          <input
            type="text"
            placeholder="Search Pokemon by name, type, ability..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          />
          {isSearching && (
            <p className="text-sm text-gray-500 mt-1">Searching...</p>
          )}
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-2">
          {types.slice(0, 18).map(type => (
            <button
              key={type}
              onClick={() =>
                handleFilterChange({
                  types: searchFilters.types?.includes(type)
                    ? searchFilters.types.filter(t => t !== type)
                    : [...(searchFilters.types || []), type],
                })
              }
              className={`px-3 py-1 rounded-full text-sm capitalize ${
                searchFilters.types?.includes(type)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* BST range filter */}
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Min BST</label>
            <input
              type="number"
              value={searchFilters.minBST || ''}
              onChange={(e) =>
                handleFilterChange({ minBST: parseInt(e.target.value) || undefined })
              }
              placeholder="0"
              className="w-24 px-2 py-1 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max BST</label>
            <input
              type="number"
              value={searchFilters.maxBST || ''}
              onChange={(e) =>
                handleFilterChange({ maxBST: parseInt(e.target.value) || undefined })
              }
              placeholder="800"
              className="w-24 px-2 py-1 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Min Cost</label>
            <input
              type="number"
              value={searchFilters.minCost || ''}
              onChange={(e) =>
                handleFilterChange({ minCost: parseInt(e.target.value) || undefined })
              }
              placeholder="1"
              className="w-24 px-2 py-1 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Cost</label>
            <input
              type="number"
              value={searchFilters.maxCost || ''}
              onChange={(e) =>
                handleFilterChange({ maxCost: parseInt(e.target.value) || undefined })
              }
              placeholder="20"
              className="w-24 px-2 py-1 border rounded"
            />
          </div>
        </div>

        {/* Clear filters */}
        {(searchQuery || Object.keys(searchFilters).length > 0) && (
          <button
            onClick={() => {
              setSearchQuery('')
              setSearchFilters({})
            }}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Pokemon grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filteredPokemon.map((pokemon) => (
            <div
              key={pokemon.id}
              onClick={() => handleSelectPokemon(pokemon.id)}
              className="border rounded-lg p-3 hover:shadow-lg cursor-pointer transition-shadow"
            >
              {/* Pokemon image */}
              <img
                src={
                  pokemon.sprites.other?.['official-artwork']?.front_default ||
                  pokemon.sprites.front_default
                }
                alt={pokemon.name}
                className="w-full h-32 object-contain"
                loading="lazy"
              />

              {/* Pokemon info */}
              <div className="mt-2">
                <h3 className="font-semibold capitalize">{pokemon.name}</h3>

                {/* Types */}
                <div className="flex gap-1 mt-1">
                  {pokemon.types.map((t) => (
                    <span
                      key={t.type.name}
                      className="px-2 py-0.5 bg-gray-200 text-xs rounded capitalize"
                    >
                      {t.type.name}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="mt-2 text-sm text-gray-600">
                  <div>BST: {pokemon.bst}</div>
                  <div className="font-bold text-blue-600">Cost: {pokemon.cost}</div>
                </div>

                {/* Legality indicator */}
                {!pokemon.isLegal && (
                  <div className="mt-2 text-xs text-red-500">
                    Banned: {pokemon.validationReason}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredPokemon.length === 0 && !isLoading && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No Pokemon found</p>
            <p className="text-sm mt-2">Try adjusting your filters</p>
          </div>
        )}
      </div>

      {/* Footer with count */}
      <div className="p-4 border-t text-sm text-gray-600">
        Showing {filteredPokemon.length} of {legalPokemon.length} legal Pokemon
      </div>
    </div>
  )
}

/**
 * Example: Simple Pokemon Picker Component
 */
export function SimplePokemonPicker() {
  const { legalPokemon, isLoading, loadFormat } = usePokemonDataManager()
  const [selectedPokemon, setSelectedPokemon] = useState<string[]>([])

  useEffect(() => {
    loadFormat({
      formatId: 'vgc-reg-h',
      formatRules: VGC_REG_H_FORMAT,
    })
  }, [loadFormat])

  if (isLoading) {
    return <div>Loading Pokemon...</div>
  }

  return (
    <div>
      <h2>Pick 6 Pokemon</h2>
      <div className="grid grid-cols-6 gap-4">
        {legalPokemon.slice(0, 50).map((pokemon) => (
          <button
            key={pokemon.id}
            onClick={() => setSelectedPokemon(prev => [...prev, pokemon.id])}
            disabled={selectedPokemon.length >= 6}
            className="p-2 border rounded hover:bg-gray-100"
          >
            <img
              src={pokemon.sprites.front_default}
              alt={pokemon.name}
              className="w-full"
            />
            <div className="text-sm capitalize">{pokemon.name}</div>
            <div className="text-xs text-gray-600">Cost: {pokemon.cost}</div>
          </button>
        ))}
      </div>
      <div className="mt-4">
        Selected: {selectedPokemon.length} / 6
      </div>
    </div>
  )
}

/**
 * Example: Pokemon Type Analysis
 */
export function PokemonTypeAnalysis() {
  const { legalPokemon, types, getPokemonByType } = usePokemonDataManager()

  const typeDistribution = useMemo(() => {
    return types.map(type => ({
      type,
      count: getPokemonByType(type).length,
      avgCost:
        getPokemonByType(type).reduce((sum, p) => sum + p.cost, 0) /
        getPokemonByType(type).length,
    }))
      .sort((a, b) => b.count - a.count)
  }, [types, getPokemonByType])

  return (
    <div>
      <h2>Type Distribution</h2>
      <table className="w-full">
        <thead>
          <tr>
            <th>Type</th>
            <th>Count</th>
            <th>Avg Cost</th>
            <th>% of Total</th>
          </tr>
        </thead>
        <tbody>
          {typeDistribution.map(({ type, count, avgCost }) => (
            <tr key={type}>
              <td className="capitalize">{type}</td>
              <td>{count}</td>
              <td>{avgCost.toFixed(1)}</td>
              <td>{((count / legalPokemon.length) * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
