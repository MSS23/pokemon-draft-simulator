'use client'

import { useState, useMemo, useDeferredValue } from 'react'
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
import { Slider } from '@/components/ui/slider'
import { Search, SearchX, Filter, SortAsc, SortDesc, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PokemonGridSkeleton } from '@/components/ui/loading-states'
import VirtualizedPokemonGrid from './VirtualizedPokemonGrid'
import { TierDefinition } from '@/types'
import { getPokemonTier } from '@/lib/tier-utils'

interface PokemonGridProps {
  pokemon: Pokemon[]
  onViewDetails?: (pokemon: Pokemon) => void
  onQuickDraft?: (pokemon: Pokemon) => void
  onAddToWishlist?: (pokemon: Pokemon) => void
  onRemoveFromWishlist?: (pokemon: Pokemon) => void
  onPreDraft?: (pokemon: Pokemon) => void
  onClearPreDraft?: (pokemon: Pokemon) => void
  preDraftPokemonId?: string | null
  draftedPokemonIds?: string[]
  wishlistPokemonIds?: string[]
  isLoading?: boolean
  className?: string
  cardSize?: 'sm' | 'md' | 'lg'
  showFilters?: boolean
  showCost?: boolean
  showStats?: boolean
  showWishlistButton?: boolean
  showQuickDraft?: boolean
  budgetRemaining?: number
  maxAffordableCost?: number
  remainingSlots?: number
  // Tiered draft props
  scoringSystem?: 'budget' | 'tiered'
  tierConfig?: { tiers: TierDefinition[] }
  tierUsage?: Record<string, number>
  draftedByTeamMap?: Record<string, string>
}

type SortOption = 'dex' | 'name' | 'cost' | 'total' | 'hp' | 'attack' | 'defense' | 'specialAttack' | 'specialDefense' | 'speed'
type SortDirection = 'asc' | 'desc'

const POKEMON_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'
]

const SORT_OPTIONS: { value: string; label: string; sort: SortOption; direction: SortDirection }[] = [
  { value: 'dex-asc', label: 'Dex Order', sort: 'dex', direction: 'asc' },
  { value: 'name-asc', label: 'Name (A-Z)', sort: 'name', direction: 'asc' },
  { value: 'name-desc', label: 'Name (Z-A)', sort: 'name', direction: 'desc' },
  { value: 'cost-desc', label: 'Cost (High-Low)', sort: 'cost', direction: 'desc' },
  { value: 'cost-asc', label: 'Cost (Low-High)', sort: 'cost', direction: 'asc' },
  { value: 'total-desc', label: 'BST (High-Low)', sort: 'total', direction: 'desc' },
  { value: 'total-asc', label: 'BST (Low-High)', sort: 'total', direction: 'asc' },
  { value: 'hp-desc', label: 'HP (High-Low)', sort: 'hp', direction: 'desc' },
  { value: 'attack-desc', label: 'Attack (High-Low)', sort: 'attack', direction: 'desc' },
  { value: 'defense-desc', label: 'Defense (High-Low)', sort: 'defense', direction: 'desc' },
  { value: 'specialAttack-desc', label: 'Sp. Atk (High-Low)', sort: 'specialAttack', direction: 'desc' },
  { value: 'specialDefense-desc', label: 'Sp. Def (High-Low)', sort: 'specialDefense', direction: 'desc' },
  { value: 'speed-desc', label: 'Speed (Fast-Slow)', sort: 'speed', direction: 'desc' },
  { value: 'speed-asc', label: 'Speed (Slow-Fast)', sort: 'speed', direction: 'asc' },
]

export default function PokemonGrid({
  pokemon,
  onViewDetails,
  onQuickDraft,
  onAddToWishlist,
  onRemoveFromWishlist,
  onPreDraft,
  onClearPreDraft,
  preDraftPokemonId,
  draftedPokemonIds = [],
  wishlistPokemonIds = [],
  isLoading = false,
  className,
  cardSize = 'md',
  showFilters = true,
  showCost = true,
  showStats = true,
  showWishlistButton = true,
  showQuickDraft = false,
  budgetRemaining,
  maxAffordableCost,
  remainingSlots,
  scoringSystem,
  tierConfig,
  tierUsage = {},
  draftedByTeamMap = {},
}: PokemonGridProps) {
  const isTiered = scoringSystem === 'tiered' && tierConfig?.tiers?.length
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [generationFilter, setGenerationFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [costFilter, setCostFilter] = useState<string>('all')
  const [_tierFilter, _setTierFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortOption>('dex')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [showFiltersPanel, setShowFiltersPanel] = useState(false)

  // Stat range filters
  const [hpRange, setHpRange] = useState<[number, number]>([0, 255])
  const [attackRange, setAttackRange] = useState<[number, number]>([0, 255])
  const [defenseRange, setDefenseRange] = useState<[number, number]>([0, 255])
  const [speedRange, setSpeedRange] = useState<[number, number]>([0, 255])
  const [bstRange, setBstRange] = useState<[number, number]>([0, 800])

  const sortValue = `${sortBy}-${sortDirection}`

  const handleSortChange = (value: string) => {
    const option = SORT_OPTIONS.find(o => o.value === value)
    if (option) {
      setSortBy(option.sort)
      setSortDirection(option.direction)
    }
  }

  // Clear all filters and sorting
  const clearAllFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
    setGenerationFilter('all')
    setCategoryFilter('all')
    setCostFilter('all')
    setSortBy('dex')
    setSortDirection('asc')
    setHpRange([0, 255])
    setAttackRange([0, 255])
    setDefenseRange([0, 255])
    setSpeedRange([0, 255])
    setBstRange([0, 800])
  }

  // Check if any filters are active
  const hasActiveFilters = searchQuery ||
    (typeFilter !== 'all') ||
    (generationFilter !== 'all') ||
    (categoryFilter !== 'all') ||
    (costFilter !== 'all') ||
    sortBy !== 'dex' ||
    sortDirection !== 'asc' ||
    hpRange[0] > 0 || hpRange[1] < 255 ||
    attackRange[0] > 0 || attackRange[1] < 255 ||
    defenseRange[0] > 0 || defenseRange[1] < 255 ||
    speedRange[0] > 0 || speedRange[1] < 255 ||
    bstRange[0] > 0 || bstRange[1] < 800

  const activeFilterCount = [
    typeFilter !== 'all',
    generationFilter !== 'all',
    categoryFilter !== 'all',
    costFilter !== 'all',
    hpRange[0] > 0 || hpRange[1] < 255,
    attackRange[0] > 0 || attackRange[1] < 255,
    defenseRange[0] > 0 || defenseRange[1] < 255,
    speedRange[0] > 0 || speedRange[1] < 255,
    bstRange[0] > 0 || bstRange[1] < 800,
  ].filter(Boolean).length

  const availableGenerations = useMemo(() =>
    Array.from(new Set(pokemon.map((entry) => entry.generation).filter((generation): generation is number => !!generation)))
      .sort((a, b) => a - b),
  [pokemon])

  // Pre-normalize search query (runs once per query change)
  const normalizedSearchQuery = useMemo(() => {
    if (!deferredSearchQuery) return null
    const query = deferredSearchQuery.toLowerCase().trim()
    return {
      original: query,
      normalized: query.replace(/[^a-z0-9]/g, ''),
      noSpaces: query.replace(/\s+/g, '')
    }
  }, [deferredSearchQuery])

  // Extract sort comparator (prevents recreation on every filter)
  const sortComparator = useMemo(() => {
    return (a: Pokemon, b: Pokemon): number => {
      let aValue: number | string
      let bValue: number | string

      switch (sortBy) {
        case 'dex':
          aValue = parseInt(a.id) || 0
          bValue = parseInt(b.id) || 0
          break
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
          aValue = parseInt(a.id) || 0
          bValue = parseInt(b.id) || 0
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return sortDirection === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number)
    }
  }, [sortBy, sortDirection])

  const filteredAndSortedPokemon = useMemo(() => {
    const hasFilters = normalizedSearchQuery ||
      typeFilter !== 'all' ||
      generationFilter !== 'all' ||
      categoryFilter !== 'all' ||
      costFilter !== 'all' ||
      hpRange[0] > 0 || hpRange[1] < 255 ||
      attackRange[0] > 0 || attackRange[1] < 255 ||
      defenseRange[0] > 0 || defenseRange[1] < 255 ||
      speedRange[0] > 0 || speedRange[1] < 255 ||
      bstRange[0] > 0 || bstRange[1] < 800

    let result = pokemon

    if (hasFilters) {
      result = pokemon.filter(p => {
        // Search filter (most selective - check first)
        if (normalizedSearchQuery) {
          const nameMatch = p.name.toLowerCase().includes(normalizedSearchQuery.original)
          const typeMatch = p.types.some(t => t.name.toLowerCase().includes(normalizedSearchQuery.original))
          const abilityMatch = p.abilities?.some(a => {
            const lowerAbility = a.toLowerCase()
            return lowerAbility.includes(normalizedSearchQuery.original) ||
              lowerAbility.replace(/[^a-z0-9]/g, '').includes(normalizedSearchQuery.normalized)
          }) || false
          const moveMatch = p.moves?.some(m => {
            const moveName = m.name.toLowerCase()
            return moveName.includes(normalizedSearchQuery.original) ||
              moveName.replace(/[^a-z0-9]/g, '').includes(normalizedSearchQuery.normalized) ||
              moveName.replace(/\s+/g, '').includes(normalizedSearchQuery.noSpaces)
          }) || false
          const dexMatch = p.id === normalizedSearchQuery.original.replace(/^#/, '')

          if (!nameMatch && !typeMatch && !abilityMatch && !moveMatch && !dexMatch) return false
        }

        // Type filter
        if (typeFilter !== 'all') {
          if (!p.types.some(t => t.name === typeFilter)) return false
        }

        if (generationFilter !== 'all' && p.generation !== Number(generationFilter)) return false

        if (categoryFilter === 'legendary' && !p.isLegendary) return false
        if (categoryFilter === 'mythical' && !p.isMythical) return false
        if (categoryFilter === 'paradox' && !p.isParadox) return false
        if (categoryFilter === 'standard' && (p.isLegendary || p.isMythical || p.isParadox)) return false

        // Cost filter
        if (costFilter !== 'all') {
          const [min, max] = costFilter.split('-').map(Number)
          if (max) {
            if (p.cost < min || p.cost > max) return false
          } else {
            if (p.cost < min) return false
          }
        }

        // Stat range filters
        if (p.stats.hp < hpRange[0] || p.stats.hp > hpRange[1]) return false
        if (p.stats.attack < attackRange[0] || p.stats.attack > attackRange[1]) return false
        if (p.stats.defense < defenseRange[0] || p.stats.defense > defenseRange[1]) return false
        if (p.stats.speed < speedRange[0] || p.stats.speed > speedRange[1]) return false
        if (p.stats.total < bstRange[0] || p.stats.total > bstRange[1]) return false

        return true
      })
    }

    return result.slice().sort(sortComparator)
  }, [pokemon, normalizedSearchQuery, typeFilter, generationFilter, categoryFilter, costFilter, sortComparator, hpRange, attackRange, defenseRange, speedRange, bstRange])

  // Show ALL pokemon (including drafted), wishlisted pinned to top
  const displayPokemon = useMemo(() => {
    if (wishlistPokemonIds.length === 0) return filteredAndSortedPokemon
    const wishlistSet = new Set(wishlistPokemonIds)
    const wishlisted = filteredAndSortedPokemon.filter(p => wishlistSet.has(p.id))
    const rest = filteredAndSortedPokemon.filter(p => !wishlistSet.has(p.id))
    return [...wishlisted, ...rest]
  }, [filteredAndSortedPokemon, wishlistPokemonIds])

  const availableCount = useMemo(() =>
    displayPokemon.filter(p => !draftedPokemonIds.includes(p.id)).length,
    [displayPokemon, draftedPokemonIds]
  )

  const gridCols = {
    sm: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8',
    md: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
    lg: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
  }

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <div className="h-12 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-12 w-32 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="p-4 bg-card rounded-lg border">
          <div className="h-4 bg-muted rounded w-48 animate-pulse" />
        </div>
        <PokemonGridSkeleton count={12} cardSize={cardSize} />
      </div>
    )
  }

  return (
    <div className={cn('space-y-4 md:space-y-5 lg:space-y-6', className)}>
      {/* Filters */}
      {showFilters && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by name, type, ability, or move..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto sm:overflow-visible flex-nowrap sm:flex-nowrap">
              <Select value={sortValue} onValueChange={handleSortChange}>
                <SelectTrigger className="h-12 w-full sm:w-[180px]">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowFiltersPanel(!showFiltersPanel)}
                  className="h-12 px-3 sm:px-4"
                >
                  <Filter className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 sm:ml-2 text-xs">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={clearAllFilters}
                    className="h-12 px-3 text-muted-foreground"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          {showFiltersPanel && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 p-4 sm:p-6 bg-card rounded-xl border shadow-sm">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {POKEMON_TYPES.map(type => (
                      <SelectItem key={type} value={type} className="capitalize">
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Generation</label>
                <Select value={generationFilter} onValueChange={setGenerationFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All generations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All generations</SelectItem>
                    {availableGenerations.map((generation) => (
                      <SelectItem key={generation} value={String(generation)}>Generation {generation}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Category</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    <SelectItem value="standard">Standard Pokemon</SelectItem>
                    <SelectItem value="legendary">Legendary</SelectItem>
                    <SelectItem value="mythical">Mythical</SelectItem>
                    <SelectItem value="paradox">Paradox</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Cost</label>
                <Select value={costFilter} onValueChange={setCostFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All costs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All costs</SelectItem>
                    <SelectItem value="0-5">0-5 pts</SelectItem>
                    <SelectItem value="6-10">6-10 pts</SelectItem>
                    <SelectItem value="11-15">11-15 pts</SelectItem>
                    <SelectItem value="16-20">16-20 pts</SelectItem>
                    <SelectItem value="21-25">21-25 pts</SelectItem>
                    <SelectItem value="26">26+ pts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Direction</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  className="w-full"
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

              {/* Stat Range Filters */}
              <div className="sm:col-span-2 xl:col-span-5 space-y-4 border-t pt-4">
                <h4 className="font-medium text-sm text-foreground">Filter by Stats</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      HP: {hpRange[0]} - {hpRange[1]}
                    </label>
                    <Slider
                      min={0}
                      max={255}
                      step={5}
                      value={hpRange}
                      onValueChange={(value) => setHpRange(value as [number, number])}
                      className="cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      Attack: {attackRange[0]} - {attackRange[1]}
                    </label>
                    <Slider
                      min={0}
                      max={255}
                      step={5}
                      value={attackRange}
                      onValueChange={(value) => setAttackRange(value as [number, number])}
                      className="cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      Defense: {defenseRange[0]} - {defenseRange[1]}
                    </label>
                    <Slider
                      min={0}
                      max={255}
                      step={5}
                      value={defenseRange}
                      onValueChange={(value) => setDefenseRange(value as [number, number])}
                      className="cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      Speed: {speedRange[0]} - {speedRange[1]}
                    </label>
                    <Slider
                      min={0}
                      max={255}
                      step={5}
                      value={speedRange}
                      onValueChange={(value) => setSpeedRange(value as [number, number])}
                      className="cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      Base Stat Total: {bstRange[0]} - {bstRange[1]}
                    </label>
                    <Slider
                      min={0}
                      max={800}
                      step={10}
                      value={bstRange}
                      onValueChange={(value) => setBstRange(value as [number, number])}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results info */}
      <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{availableCount}</span> available
          <span className="ml-1.5 text-xs">from {pokemon.length} in this format</span>
          {draftedPokemonIds.length > 0 && (
            <span className="ml-1.5 text-xs">({draftedPokemonIds.length} drafted)</span>
          )}
        </span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-xs h-6 px-2"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Budget Feasibility Warning */}
      {maxAffordableCost !== undefined && remainingSlots !== undefined && remainingSlots > 0 && budgetRemaining !== undefined && maxAffordableCost < budgetRemaining && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border",
          maxAffordableCost <= 0
            ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300"
            : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300"
        )}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            {maxAffordableCost <= 0
              ? `Budget locked — you can't afford to fill your remaining ${remainingSlots} slots`
              : `Budget tight — pick Pokemon costing ${maxAffordableCost} or less to fill your remaining ${remainingSlots} slots`
            }
          </span>
        </div>
      )}

      {/* Pokemon Grid - Virtualized for large lists */}
      {displayPokemon.length > 100 ? (
        <VirtualizedPokemonGrid
          pokemon={displayPokemon}
          onViewDetails={onViewDetails}
          onQuickDraft={onQuickDraft}
          onAddToWishlist={onAddToWishlist}
          onRemoveFromWishlist={onRemoveFromWishlist}
          onPreDraft={onPreDraft}
          onClearPreDraft={onClearPreDraft}
          preDraftPokemonId={preDraftPokemonId}
          draftedPokemonIds={draftedPokemonIds}
          wishlistPokemonIds={wishlistPokemonIds}
          cardSize={cardSize}
          showCost={showCost}
          showStats={showStats}
          showWishlistButton={showWishlistButton}
          showQuickDraft={showQuickDraft}
          budgetRemaining={budgetRemaining}
          maxAffordableCost={maxAffordableCost}
          draftedByTeamMap={draftedByTeamMap}
          isTiered={!!isTiered}
          tierConfig={tierConfig}
          tierUsage={tierUsage}
        />
      ) : (
        <div className={cn(
          'grid gap-2 sm:gap-3 md:gap-4 lg:gap-5 xl:gap-6',
          'auto-rows-max',
          gridCols[cardSize]
        )}>
          {displayPokemon.map((p) => (
            <PokemonCard
              key={p.id}
              pokemon={p}
              onViewDetails={onViewDetails}
              onQuickDraft={onQuickDraft}
              onAddToWishlist={onAddToWishlist}
              onRemoveFromWishlist={onRemoveFromWishlist}
              onPreDraft={onPreDraft}
              onClearPreDraft={onClearPreDraft}
              isDrafted={draftedPokemonIds.includes(p.id)}
              isInWishlist={wishlistPokemonIds.includes(p.id)}
              isPreDrafted={preDraftPokemonId === p.id}
              isUnaffordable={
                isTiered && tierConfig
                  ? (() => {
                      const tier = getPokemonTier(p.cost, tierConfig.tiers)
                      if (!tier) return true
                      return (tierUsage[tier.name.toUpperCase()] || 0) >= tier.slotsPerTeam
                    })()
                  : budgetRemaining !== undefined && p.cost > budgetRemaining
              }
              isUnsafe={
                !isTiered &&
                maxAffordableCost !== undefined &&
                p.cost > maxAffordableCost &&
                (budgetRemaining === undefined || p.cost <= budgetRemaining)
              }
              showCost={showCost}
              showStats={showStats}
              showWishlistButton={showWishlistButton}
              showQuickDraft={showQuickDraft}
              size={cardSize}
              draftedByTeamName={draftedByTeamMap[p.id]}
            />
          ))}
        </div>
      )}

      {displayPokemon.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
          <SearchX className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-semibold text-foreground">No Pokemon match these filters</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Try another generation or category, or clear the filters to return to the full format pool.
          </p>
          <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-4">
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}
