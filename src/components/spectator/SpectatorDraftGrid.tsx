'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import PokemonCard from '@/components/pokemon/PokemonCard'
import PokemonDetailsModal from '@/components/pokemon/PokemonDetailsModal'
import { Search, Filter, Eye, Users } from 'lucide-react'
import { Pokemon } from '@/types'
import { usePokemonList } from '@/hooks/usePokemon'
import { getFormatById } from '@/lib/formats'
import { FormatRulesEngine } from '@/domain/rules/format-rules-engine'

interface SpectatorDraftGridProps {
  draftData: {
    id: string
    format: string
    settings: any
    picks: any[]
    teams: any[]
  }
  onPokemonView?: (pokemon: Pokemon) => void
}

export default function SpectatorDraftGrid({ draftData, onPokemonView }: SpectatorDraftGridProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState<string>('')
  const [showAvailableOnly, setShowAvailableOnly] = useState(true)
  const [detailsPokemon, setDetailsPokemon] = useState<Pokemon | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  const { data: allPokemon, isLoading } = usePokemonList()

  // Get format rules for filtering
  const [format, setFormat] = useState(() => getFormatById(draftData.settings?.formatId || 'vgc-reg-h'))
  const [rulesEngine, setRulesEngine] = useState<FormatRulesEngine | null>(() =>
    format ? new FormatRulesEngine(draftData.settings?.formatId || 'vgc-reg-h') : null
  )
  const [filteredPokemon, setFilteredPokemon] = useState<any[]>([])

  // Update format and rules engine when draftData changes
  useEffect(() => {
    const formatId = draftData.settings?.formatId || 'vgc-reg-h'
    const newFormat = getFormatById(formatId)
    setFormat(newFormat)
    setRulesEngine(newFormat ? new FormatRulesEngine(formatId) : null)
  }, [draftData.settings?.formatId])

  // Filter Pokemon based on format legality and draft picks (synchronous)
  useEffect(() => {
    if (!allPokemon || !rulesEngine) {
      setFilteredPokemon([])
      return
    }

    // Initialize the rules engine (synchronous no-op)
    rulesEngine.initialize()

    const draftedPokemonIds = new Set(draftData.picks?.map(pick => pick.pokemon_id) || [])

    // Process all Pokemon synchronously
    const validatedPokemon = allPokemon.map(pokemon => {
      const legalityResult = rulesEngine.validatePokemon(pokemon)
      return {
        ...pokemon,
        isLegal: legalityResult.isLegal,
        cost: legalityResult.cost,
        isDrafted: draftedPokemonIds.has(pokemon.id)
      }
    })

    const filtered = validatedPokemon
      .filter(pokemon => {
        // Filter by format legality
        if (!pokemon.isLegal) return false

        // Filter by availability if enabled
        if (showAvailableOnly && pokemon.isDrafted) return false

        // Filter by search term
        if (searchTerm && !pokemon.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          return false
        }

        // Filter by type
        if (selectedType && !pokemon.types.some(type => type.name === selectedType)) {
          return false
        }

        return true
      })
      .sort((a, b) => {
        // Sort by drafted status, then by cost, then by name
        if (a.isDrafted !== b.isDrafted) {
          return a.isDrafted ? 1 : -1
        }
        if (a.cost !== b.cost) {
          return b.cost - a.cost
        }
        return a.name.localeCompare(b.name)
      })

    setFilteredPokemon(filtered)
  }, [allPokemon, rulesEngine, draftData.picks, showAvailableOnly, searchTerm, selectedType])

  const pokemonTypes = [
    'normal', 'fire', 'water', 'electric', 'grass', 'ice',
    'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
    'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'
  ]

  const handleViewDetails = (pokemon: Pokemon) => {
    setDetailsPokemon(pokemon)
    setIsDetailsOpen(true)
    onPokemonView?.(pokemon)
  }

  const totalPokemon = filteredPokemon.length
  const availablePokemon = filteredPokemon.filter(p => !p.isDrafted).length
  const draftedPokemon = filteredPokemon.filter(p => p.isDrafted).length

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pokemon Pool</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading Pokémon...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Pokemon Pool
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span>{availablePokemon} available</span>
              <span>•</span>
              <span>{draftedPokemon} drafted</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search Pokémon..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={showAvailableOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowAvailableOnly(!showAvailableOnly)}
              >
                <Filter className="h-4 w-4 mr-1" />
                {showAvailableOnly ? 'Available Only' : 'Show All'}
              </Button>

              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-3 py-1 text-sm border rounded-md bg-background"
              >
                <option value="">All Types</option>
                {pokemonTypes.map(type => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{totalPokemon}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{availablePokemon}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Available</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">{draftedPokemon}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Drafted</div>
            </div>
          </div>

          {/* Pokemon Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-96 overflow-y-auto">
            {filteredPokemon.map((pokemon) => (
              <div key={pokemon.id} className="relative">
                <PokemonCard
                  pokemon={pokemon}
                  onViewDetails={handleViewDetails}
                  isDrafted={pokemon.isDrafted}
                  isDisabled={pokemon.isDrafted}
                  showCost={true}
                  showStats={false}
                  showWishlistButton={false}
                  size="sm"
                  className={pokemon.isDrafted ? 'opacity-60' : ''}
                />
                {pokemon.isDrafted && (
                  <div className="absolute top-1 right-1">
                    <Badge variant="secondary" className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      Drafted
                    </Badge>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredPokemon.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No Pokémon Found
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Try adjusting your search or filter criteria.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pokemon Details Modal (Read-Only) */}
      <PokemonDetailsModal
        pokemon={detailsPokemon}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        onSelect={() => {}} // No selection in spectator mode
        isDrafted={false}
      />
    </>
  )
}
