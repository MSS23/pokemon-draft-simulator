'use client'

import { useState } from 'react'
import { Pokemon } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { X, Plus, ArrowUpDown, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { usePokemonImage } from '@/hooks/usePokemonImage'

interface PokemonComparisonProps {
  availablePokemon: Pokemon[]
  preselectedPokemon?: Pokemon[]
  maxCompare?: number
}

interface StatComparison {
  stat: string
  label: string
  values: number[]
  best: number
  worst: number
}

export default function PokemonComparison({
  availablePokemon,
  preselectedPokemon = [],
  maxCompare = 4
}: PokemonComparisonProps) {
  const [selectedPokemon, setSelectedPokemon] = useState<Pokemon[]>(preselectedPokemon.slice(0, maxCompare))
  const [isOpen, setIsOpen] = useState(false)

  const addPokemon = (pokemon: Pokemon) => {
    if (selectedPokemon.length < maxCompare && !selectedPokemon.find(p => p.id === pokemon.id)) {
      setSelectedPokemon([...selectedPokemon, pokemon])
    }
  }

  const removePokemon = (pokemonId: string) => {
    setSelectedPokemon(selectedPokemon.filter(p => p.id !== pokemonId))
  }

  const clearAll = () => {
    setSelectedPokemon([])
  }

  // Calculate stat comparisons
  const getStatComparisons = (): StatComparison[] => {
    if (selectedPokemon.length === 0) return []

    const stats: StatComparison[] = [
      { stat: 'hp', label: 'HP', values: [], best: 0, worst: Infinity },
      { stat: 'attack', label: 'Attack', values: [], best: 0, worst: Infinity },
      { stat: 'defense', label: 'Defense', values: [], best: 0, worst: Infinity },
      { stat: 'specialAttack', label: 'Sp. Atk', values: [], best: 0, worst: Infinity },
      { stat: 'specialDefense', label: 'Sp. Def', values: [], best: 0, worst: Infinity },
      { stat: 'speed', label: 'Speed', values: [], best: 0, worst: Infinity },
      { stat: 'total', label: 'BST', values: [], best: 0, worst: Infinity },
    ]

    selectedPokemon.forEach(pokemon => {
      stats.forEach(stat => {
        const value = pokemon.stats[stat.stat as keyof typeof pokemon.stats]
        stat.values.push(value)
        stat.best = Math.max(stat.best, value)
        stat.worst = Math.min(stat.worst, value)
      })
    })

    return stats
  }

  const statComparisons = getStatComparisons()

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2 h-12 px-6 text-base whitespace-nowrap">
          <ArrowUpDown className="h-4 w-4" />
          <span className="hidden sm:inline">Compare</span>
          {selectedPokemon.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {selectedPokemon.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Pokémon Comparison Tool</span>
            {selectedPokemon.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear All
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Pokemon Selection */}
          {selectedPokemon.length < maxCompare && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Add Pokémon to Compare ({selectedPokemon.length}/{maxCompare})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-64 overflow-y-auto">
                  {availablePokemon
                    .filter(p => !selectedPokemon.find(sp => sp.id === p.id))
                    .slice(0, 50)
                    .map(pokemon => (
                      <Button
                        key={pokemon.id}
                        variant="outline"
                        size="sm"
                        onClick={() => addPokemon(pokemon)}
                        className="h-auto p-2 flex flex-col gap-1"
                      >
                        <div className="text-xs font-semibold truncate w-full">
                          {pokemon.name}
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {pokemon.cost}
                        </Badge>
                      </Button>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comparison View */}
          {selectedPokemon.length > 0 ? (
            <>
              {/* Pokemon Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {selectedPokemon.map(pokemon => (
                  <PokemonComparisonCard
                    key={pokemon.id}
                    pokemon={pokemon}
                    onRemove={() => removePokemon(pokemon.id)}
                  />
                ))}
              </div>

              {/* Stat Comparison Table */}
              {selectedPokemon.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Stat Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {statComparisons.map(stat => (
                        <div key={stat.stat} className="space-y-1">
                          <div className="flex items-center justify-between text-sm font-semibold">
                            <span>{stat.label}</span>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs">
                                Δ {stat.best - stat.worst}
                              </Badge>
                            </div>
                          </div>
                          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${selectedPokemon.length}, 1fr)` }}>
                            {stat.values.map((value, idx) => (
                              <div
                                key={idx}
                                className={cn(
                                  "text-center py-2 px-3 rounded-lg font-bold transition-all",
                                  value === stat.best && selectedPokemon.length > 1
                                    ? "bg-green-100 text-green-800 ring-2 ring-green-500"
                                    : value === stat.worst && selectedPokemon.length > 1
                                    ? "bg-red-100 text-red-800"
                                    : "bg-gray-100 text-gray-700"
                                )}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  {value === stat.best && selectedPokemon.length > 1 && (
                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                  )}
                                  {value === stat.worst && selectedPokemon.length > 1 && (
                                    <TrendingDown className="h-3 w-3 text-red-600" />
                                  )}
                                  <span>{value}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Cost Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cost Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${selectedPokemon.length}, 1fr)` }}>
                    {selectedPokemon.map(pokemon => {
                      const valueRating = pokemon.stats.total / pokemon.cost
                      const bestValue = Math.max(
                        ...selectedPokemon.map(p => p.stats.total / p.cost)
                      )
                      const isBestValue = valueRating === bestValue

                      return (
                        <div
                          key={pokemon.id}
                          className={cn(
                            "p-3 rounded-lg border-2",
                            isBestValue
                              ? "bg-yellow-50 border-yellow-400"
                              : "bg-white border-gray-200"
                          )}
                        >
                          <div className="text-xs text-gray-600 mb-1">Cost</div>
                          <div className="text-2xl font-bold text-gray-900">{pokemon.cost}</div>
                          <div className="text-xs text-gray-500 mt-2">
                            {valueRating.toFixed(1)} pts/cost
                          </div>
                          {isBestValue && (
                            <Badge className="mt-2 bg-yellow-500">Best Value</Badge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Type Coverage */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Type Coverage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${selectedPokemon.length}, 1fr)` }}>
                    {selectedPokemon.map(pokemon => (
                      <div key={pokemon.id} className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {pokemon.types.map(type => (
                            <Badge
                              key={type.name}
                              className="text-xs"
                              style={{
                                backgroundColor: type.color,
                                color: 'white'
                              }}
                            >
                              {type.name}
                            </Badge>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500">
                          {pokemon.abilities.slice(0, 2).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Plus className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Select Pokémon above to start comparing</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PokemonComparisonCard({
  pokemon,
  onRemove
}: {
  pokemon: Pokemon
  onRemove: () => void
}) {
  const { imageUrl, isLoading, hasError } = usePokemonImage({
    pokemonId: pokemon.id,
    pokemonName: pokemon.name,
    preferOfficialArt: true
  })

  return (
    <Card className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="absolute top-2 right-2 h-6 w-6 p-0 rounded-full bg-red-100 hover:bg-red-200 z-10"
      >
        <X className="h-3 w-3 text-red-600" />
      </Button>
      <CardContent className="p-4">
        <div className="text-center space-y-3">
          <div className="flex flex-col items-center">
            <h3 className="font-bold text-lg">{pokemon.name}</h3>
            <div className="text-xs text-gray-500">#{pokemon.id.padStart(3, '0')}</div>
          </div>

          <div className="relative w-24 h-24 mx-auto">
            {!hasError && !isLoading && (
              <Image
                src={imageUrl}
                alt={pokemon.name}
                width={96}
                height={96}
                className="object-contain"
                unoptimized
              />
            )}
            {isLoading && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500/30 border-t-blue-500"></div>
              </div>
            )}
            {hasError && (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded">
                <span className="text-xs text-gray-400">No image</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1 justify-center">
            {pokemon.types.map(type => (
              <Badge
                key={type.name}
                className="text-xs"
                style={{
                  backgroundColor: type.color,
                  color: 'white'
                }}
              >
                {type.name}
              </Badge>
            ))}
          </div>

          <Badge variant="secondary" className="font-bold">
            {pokemon.cost} pts
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
