'use client'

import { useState, useMemo } from 'react'
import { Pokemon } from '@/types'
import PokemonCard from './PokemonCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Filter, SortAsc, SortDesc } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PokemonGridSkeleton } from '@/components/ui/loading-states'
import VirtualizedPokemonGrid from './VirtualizedPokemonGrid'

interface PokemonGridProps {
  pokemon: Pokemon[]
  onViewDetails?: (pokemon: Pokemon) => void
  onAddToWishlist?: (pokemon: Pokemon) => void
  onRemoveFromWishlist?: (pokemon: Pokemon) => void
  draftedPokemonIds?: string[]
  wishlistPokemonIds?: string[]
  isLoading?: boolean
  className?: string
  cardSize?: 'sm' | 'md' | 'lg'
  showFilters?: boolean
  showCost?: boolean
  showStats?: boolean
  showWishlistButton?: boolean
}

type SortOption = 'name' | 'cost' | 'total' | 'hp' | 'attack' | 'defense' | 'specialAttack' | 'specialDefense' | 'speed'
type SortDirection = 'asc' | 'desc'

const POKEMON_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'
]

export default function PokemonGrid({
  pokemon,
  onViewDetails,
  onAddToWishlist,
  onRemoveFromWishlist,
  draftedPokemonIds = [],
  wishlistPokemonIds = [],
  isLoading = false,
  className,
  cardSize = 'md',
  showFilters = true,
  showCost = true,
  showStats = true,
  showWishlistButton = true,
}: PokemonGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [costFilter, setCostFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [showFiltersPanel, setShowFiltersPanel] = useState(false)

  // Sorting presets
  const applySortPreset = (sort: SortOption, direction: SortDirection) => {
    setSortBy(sort)
    setSortDirection(direction)
  }

  // Clear all filters and sorting
  const clearAllFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
    setCostFilter('all')
    setSortBy('name')
    setSortDirection('asc')
  }

  // Check if any filters are active
  const hasActiveFilters = searchQuery || (typeFilter !== 'all') || (costFilter !== 'all') || sortBy !== 'name' || sortDirection !== 'asc'

  const filteredAndSortedPokemon = useMemo(() => {
    const filtered = pokemon.filter(p => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!p.name.toLowerCase().includes(query)) {
          return false
        }
      }

      // Type filter
      if (typeFilter && typeFilter !== 'all') {
        if (!p.types.some(t => t.name === typeFilter)) {
          return false
        }
      }

      // Cost filter
      if (costFilter && costFilter !== 'all') {
        const [min, max] = costFilter.split('-').map(Number)
        if (max) {
          if (p.cost < min || p.cost > max) return false
        } else {
          if (p.cost < min) return false
        }
      }

      return true
    })

    // Sort
    filtered.sort((a, b) => {
      let aValue: number | string
      let bValue: number | string

      switch (sortBy) {
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'cost':
          aValue = a.cost
          bValue = b.cost
          break
        case 'total':
          aValue = a.stats.total
          bValue = b.stats.total
          break
        case 'hp':
          aValue = a.stats.hp
          bValue = b.stats.hp
          break
        case 'attack':
          aValue = a.stats.attack
          bValue = b.stats.attack
          break
        case 'defense':
          aValue = a.stats.defense
          bValue = b.stats.defense
          break
        case 'specialAttack':
          aValue = a.stats.specialAttack
          bValue = b.stats.specialAttack
          break
        case 'specialDefense':
          aValue = a.stats.specialDefense
          bValue = b.stats.specialDefense
          break
        case 'speed':
          aValue = a.stats.speed
          bValue = b.stats.speed
          break
        default:
          aValue = a.name
          bValue = b.name
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return sortDirection === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number)
    })

    return filtered
  }, [pokemon, searchQuery, typeFilter, costFilter, sortBy, sortDirection])

  const availablePokemon = filteredAndSortedPokemon.filter(
    p => !draftedPokemonIds.includes(p.id)
  )

  const gridCols = {
    sm: 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9',
    md: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
    lg: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
  }

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Loading filters */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="h-12 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>

        {/* Loading results info */}
        <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse" />
        </div>

        {/* Loading grid */}
        <PokemonGridSkeleton count={12} cardSize={cardSize} />
      </div>
    )
  }

  return (
    <div className={cn('space-y-4 md:space-y-5 lg:space-y-6', className)}>
      {/* Filters */}
      {showFilters && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search Pokémon..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              className="h-12 px-6 text-base whitespace-nowrap"
            >
              <Filter className="h-4 w-4 mr-2" />
              {showFiltersPanel ? 'Hide Filters' : 'Show Filters'}
              {(typeFilter !== 'all' || costFilter !== 'all') && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {[typeFilter !== 'all', costFilter !== 'all'].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </div>

          {/* Sorting Presets */}
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Quick Sort</h3>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Clear All
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={sortBy === 'cost' && sortDirection === 'desc' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applySortPreset('cost', 'desc')}
                className="text-xs h-8 px-3 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
              >
                💰 Most Expensive
              </Button>
              <Button
                variant={sortBy === 'cost' && sortDirection === 'asc' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applySortPreset('cost', 'asc')}
                className="text-xs h-8 px-3 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
              >
                💸 Cheapest
              </Button>
              <Button
                variant={sortBy === 'total' && sortDirection === 'desc' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applySortPreset('total', 'desc')}
                className="text-xs h-8 px-3 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
              >
                ⭐ Highest Stats
              </Button>
              <Button
                variant={sortBy === 'attack' && sortDirection === 'desc' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applySortPreset('attack', 'desc')}
                className="text-xs h-8 px-3 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
              >
                ⚔️ Strongest Attack
              </Button>
              <Button
                variant={sortBy === 'speed' && sortDirection === 'desc' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applySortPreset('speed', 'desc')}
                className="text-xs h-8 px-3 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
              >
                ⚡ Fastest
              </Button>
              <Button
                variant={sortBy === 'name' && sortDirection === 'asc' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applySortPreset('name', 'asc')}
                className="text-xs h-8 px-3 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
              >
                🔤 A-Z
              </Button>
            </div>
          </div>

          {showFiltersPanel && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 sm:p-6 bg-gradient-to-r from-blue-50 via-purple-50 to-cyan-50 rounded-xl border border-gray-200 shadow-sm">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-white border-gray-300 shadow-sm">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {POKEMON_TYPES.map(type => (
                      <SelectItem key={type} value={type} className="capitalize">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: `var(--type-${type})` }}
                          />
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Cost</label>
                <Select value={costFilter} onValueChange={setCostFilter}>
                  <SelectTrigger className="bg-white border-gray-300 shadow-sm">
                    <SelectValue placeholder="All costs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All costs</SelectItem>
                    <SelectItem value="0-5">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-400" />
                        0-5 points
                      </div>
                    </SelectItem>
                    <SelectItem value="6-10">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-400" />
                        6-10 points
                      </div>
                    </SelectItem>
                    <SelectItem value="11-15">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-400" />
                        11-15 points
                      </div>
                    </SelectItem>
                    <SelectItem value="16-20">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-400" />
                        16-20 points
                      </div>
                    </SelectItem>
                    <SelectItem value="21-25">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-orange-400" />
                        21-25 points
                      </div>
                    </SelectItem>
                    <SelectItem value="26">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-400" />
                        26+ points
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Sort by</label>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                  <SelectTrigger className="bg-white border-gray-300 shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="cost">Cost</SelectItem>
                    <SelectItem value="total">Stat Total</SelectItem>
                    <SelectItem value="hp">HP</SelectItem>
                    <SelectItem value="attack">Attack</SelectItem>
                    <SelectItem value="defense">Defense</SelectItem>
                    <SelectItem value="specialAttack">Special Attack</SelectItem>
                    <SelectItem value="specialDefense">Special Defense</SelectItem>
                    <SelectItem value="speed">Speed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Direction</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  className="w-full bg-white border-gray-300 shadow-sm hover:bg-gray-50 transition-colors"
                >
                  {sortDirection === 'asc' ? (
                    <>
                      <SortAsc className="h-4 w-4 mr-2" />
                      Ascending
                    </>
                  ) : (
                    <>
                      <SortDesc className="h-4 w-4 mr-2" />
                      Descending
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results info */}
      <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-sm font-medium text-gray-700">
              Showing <span className="font-bold text-blue-600">{availablePokemon.length}</span> of <span className="font-bold">{pokemon.length}</span> Pokémon
            </div>
          </div>

          {(draftedPokemonIds.length > 0 || typeFilter !== 'all' || costFilter !== 'all') && (
            <div className="flex flex-wrap items-center gap-2">
              {draftedPokemonIds.length > 0 && (
                <Badge variant="outline" className="text-red-600 border-red-300">
                  {draftedPokemonIds.length} drafted
                </Badge>
              )}
              {typeFilter !== 'all' && (
                <Badge variant="outline" className="text-purple-600 border-purple-300 capitalize">
                  Type: {typeFilter}
                </Badge>
              )}
              {costFilter !== 'all' && (
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  Cost: {costFilter}
                </Badge>
              )}
              {(typeFilter !== 'all' || costFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTypeFilter('all')
                    setCostFilter('all')
                  }}
                  className="text-gray-500 hover:text-gray-700 text-xs h-6 px-2"
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pokemon Grid - Virtualized for large lists */}
      {availablePokemon.length > 100 ? (
        <VirtualizedPokemonGrid
          pokemon={availablePokemon}
          onViewDetails={onViewDetails}
          onAddToWishlist={onAddToWishlist}
          onRemoveFromWishlist={onRemoveFromWishlist}
          draftedPokemonIds={draftedPokemonIds}
          wishlistPokemonIds={wishlistPokemonIds}
          cardSize={cardSize}
          showCost={showCost}
          showStats={showStats}
          showWishlistButton={showWishlistButton}
        />
      ) : (
        <div className={cn(
          'grid gap-2 sm:gap-3 md:gap-4 lg:gap-5 xl:gap-6',
          'auto-rows-max',
          gridCols[cardSize]
        )}>
          {availablePokemon.map((p) => (
            <PokemonCard
              key={p.id}
              pokemon={p}
              onViewDetails={onViewDetails}
              onAddToWishlist={onAddToWishlist}
              onRemoveFromWishlist={onRemoveFromWishlist}
              isDrafted={draftedPokemonIds.includes(p.id)}
              isInWishlist={wishlistPokemonIds.includes(p.id)}
              showCost={showCost}
              showStats={showStats}
              showWishlistButton={showWishlistButton}
              size={cardSize}
            />
          ))}
        </div>
      )}

      {availablePokemon.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No Pokémon found matching your filters
        </div>
      )}
    </div>
  )
}