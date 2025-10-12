'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Shield, Zap, Target, TrendingUp } from 'lucide-react'
import { Pokemon } from '@/types'
import { cn } from '@/lib/utils'
import {
  getWeaknesses,
  getResistances,
  getImmunities,
  analyzeTeamTypeCoverage,
  PokemonTypeName,
  TypeCoverage
} from '@/utils/type-effectiveness'

interface TeamBuilderViewProps {
  teamPokemon: Pokemon[]
  teamName: string
  className?: string
}

/**
 * TeamBuilderView - Advanced team analysis and type coverage
 *
 * Features:
 * - Team composition grid
 * - Type coverage matrix
 * - Common weaknesses analysis
 * - Resistance coverage
 * - Speed tier distribution
 * - Stat totals
 */
export default function TeamBuilderView({
  teamPokemon,
  teamName,
  className
}: TeamBuilderViewProps) {
  const [selectedPokemon, setSelectedPokemon] = useState<Set<string>>(new Set())

  const toggleSelection = (pokemonId: string) => {
    setSelectedPokemon(prev => {
      const next = new Set(prev)
      if (next.has(pokemonId)) {
        next.delete(pokemonId)
      } else {
        next.add(pokemonId)
      }
      return next
    })
  }

  // Analyze team weaknesses (types that hit 2+ team members)
  const teamWeaknesses = useMemo(() => {
    const weaknessCount: Record<string, number> = {}

    teamPokemon.forEach(pokemon => {
      const types = pokemon.types.map(t => t.name.toLowerCase() as PokemonTypeName)
      const weaknesses = getWeaknesses(types)

      weaknesses.forEach(type => {
        weaknessCount[type] = (weaknessCount[type] || 0) + 1
      })
    })

    return Object.entries(weaknessCount)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }))
  }, [teamPokemon])

  // Analyze team resistances (types resisted by 2+ team members)
  const teamResistances = useMemo(() => {
    const resistanceCount: Record<string, number> = {}

    teamPokemon.forEach(pokemon => {
      const types = pokemon.types.map(t => t.name.toLowerCase() as PokemonTypeName)
      const resistances = [...getResistances(types), ...getImmunities(types)]

      resistances.forEach(type => {
        resistanceCount[type] = (resistanceCount[type] || 0) + 1
      })
    })

    return Object.entries(resistanceCount)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }))
  }, [teamPokemon])

  // Analyze offensive type coverage
  const typeCoverage = useMemo(() => {
    return analyzeTeamTypeCoverage(teamPokemon)
  }, [teamPokemon])

  // Speed tiers
  const speedTiers = useMemo(() => {
    return teamPokemon
      .map(p => ({ id: p.id, name: p.name, speed: p.stats.speed }))
      .sort((a, b) => b.speed - a.speed)
  }, [teamPokemon])

  // Team totals
  const teamTotals = useMemo(() => {
    const totalBST = teamPokemon.reduce((sum, p) => sum + p.stats.total, 0)
    const avgBST = teamPokemon.length > 0 ? Math.round(totalBST / teamPokemon.length) : 0
    const avgSpeed = teamPokemon.length > 0
      ? Math.round(teamPokemon.reduce((sum, p) => sum + p.stats.speed, 0) / teamPokemon.length)
      : 0
    const totalCost = teamPokemon.reduce((sum, p) => sum + p.cost, 0)

    return { totalBST, avgBST, avgSpeed, totalCost }
  }, [teamPokemon])

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      normal: 'bg-gray-400',
      fire: 'bg-red-500',
      water: 'bg-blue-500',
      electric: 'bg-yellow-400',
      grass: 'bg-green-500',
      ice: 'bg-cyan-400',
      fighting: 'bg-orange-700',
      poison: 'bg-purple-500',
      ground: 'bg-yellow-600',
      flying: 'bg-indigo-400',
      psychic: 'bg-pink-500',
      bug: 'bg-lime-500',
      rock: 'bg-yellow-700',
      ghost: 'bg-purple-700',
      dragon: 'bg-indigo-600',
      dark: 'bg-gray-700',
      steel: 'bg-gray-500',
      fairy: 'bg-pink-400'
    }
    return colors[type.toLowerCase()] || 'bg-gray-400'
  }

  const getCoverageColor = (quality: TypeCoverage['quality']) => {
    switch (quality) {
      case 'excellent': return 'bg-green-500'
      case 'good': return 'bg-blue-500'
      case 'poor': return 'bg-yellow-500'
      case 'none': return 'bg-red-500'
    }
  }

  if (teamPokemon.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center h-64 text-center">
          <Target className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            No Pokemon on team yet
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-600 mt-1">
            Team analysis will appear here
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Team Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {teamPokemon.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Pokemon
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {teamTotals.avgBST}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Avg BST
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {teamTotals.avgSpeed}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Avg Speed
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {teamTotals.totalCost}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Total Cost
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Team Composition */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {teamName} Roster
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-2 gap-2">
                {teamPokemon.map(pokemon => (
                  <button
                    key={pokemon.id}
                    onClick={() => toggleSelection(pokemon.id)}
                    className={cn(
                      'p-3 rounded-lg border-2 transition-all hover:shadow-md',
                      selectedPokemon.has(pokemon.id)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    )}
                  >
                    <img
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`}
                      alt={pokemon.name}
                      className="w-16 h-16 mx-auto pixelated"
                    />
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate mt-1">
                      {pokemon.name}
                    </div>
                    <div className="flex gap-1 mt-1 justify-center flex-wrap">
                      {pokemon.types.map(type => (
                        <div
                          key={type.name}
                          className={cn(
                            'w-4 h-4 rounded-full',
                            getTypeColor(type.name)
                          )}
                          title={type.name}
                        />
                      ))}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      BST: {pokemon.stats.total}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Type Coverage Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Offensive Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {typeCoverage.map(({ type, count, quality }) => (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-3 h-3 rounded-full',
                          getTypeColor(type)
                        )} />
                        <span className="font-medium capitalize text-slate-900 dark:text-slate-100">
                          {type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 dark:text-slate-400">
                          {count}x
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-white border-0',
                            getCoverageColor(quality)
                          )}
                        >
                          {quality}
                        </Badge>
                      </div>
                    </div>
                    <Progress
                      value={Math.min((count / teamPokemon.length) * 100, 100)}
                      className="h-1"
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Common Weaknesses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-red-500" />
              Common Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {teamWeaknesses.length === 0 ? (
              <div className="text-center text-slate-500 dark:text-slate-400 py-4">
                No shared weaknesses
              </div>
            ) : (
              <div className="space-y-2">
                {teamWeaknesses.map(({ type, count }) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-3 h-3 rounded-full',
                        getTypeColor(type)
                      )} />
                      <span className="text-sm capitalize text-slate-900 dark:text-slate-100">
                        {type}
                      </span>
                    </div>
                    <Badge variant="destructive">
                      {count}/{teamPokemon.length}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resistances */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-green-500" />
              Resistances
            </CardTitle>
          </CardHeader>
          <CardContent>
            {teamResistances.length === 0 ? (
              <div className="text-center text-slate-500 dark:text-slate-400 py-4">
                No shared resistances
              </div>
            ) : (
              <div className="space-y-2">
                {teamResistances.map(({ type, count }) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-3 h-3 rounded-full',
                        getTypeColor(type)
                      )} />
                      <span className="text-sm capitalize text-slate-900 dark:text-slate-100">
                        {type}
                      </span>
                    </div>
                    <Badge variant="default" className="bg-green-600">
                      {count}/{teamPokemon.length}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Speed Tiers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Speed Tiers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {speedTiers.map((pokemon, index) => (
                  <div
                    key={pokemon.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        #{index + 1}
                      </Badge>
                      <span className="text-slate-900 dark:text-slate-100 truncate max-w-[120px]">
                        {pokemon.name}
                      </span>
                    </div>
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {pokemon.speed}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
