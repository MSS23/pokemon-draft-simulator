'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { TrendingUp, Award, BarChart3, Target } from 'lucide-react'
import { useDraftStats } from '@/hooks/useDraftStats'
import { Pokemon } from '@/types'
import { cn } from '@/lib/utils'

interface DraftStatisticsProps {
  pokemon: Pokemon[]
  className?: string
}

/**
 * DraftStatistics - Comprehensive statistics dashboard for active drafts
 *
 * Features:
 * - Team comparison (BST, avg cost, budget)
 * - Type distribution chart
 * - Most picked Pokemon
 * - Draft progress indicators
 */
export default function DraftStatistics({ pokemon, className }: DraftStatisticsProps) {
  const stats = useDraftStats(pokemon)

  // Get type color mapping
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

  // Find max BST for relative comparison
  const maxBST = useMemo(() => {
    return Math.max(...stats.teams.map(t => t.totalBST), 1)
  }, [stats.teams])

  if (stats.totalPicks === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center h-64 text-center">
          <BarChart3 className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            No picks yet
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-600 mt-1">
            Statistics will appear as teams make picks
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.totalPicks}
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Total Picks
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.currentRound}
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Current Round
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.averageCost}
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Avg Cost
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.teams.length}
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Teams
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Team Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {stats.teams
                .sort((a, b) => b.totalBST - a.totalBST)
                .map((team, index) => (
                  <div key={team.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={index === 0 ? 'default' : 'outline'}>
                          #{index + 1}
                        </Badge>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {team.name}
                        </span>
                      </div>
                      <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-400">
                        <span>{team.pickCount} picks</span>
                        <span>BST: {team.totalBST}</span>
                      </div>
                    </div>

                    <Progress
                      value={(team.totalBST / maxBST) * 100}
                      className="h-2"
                    />

                    <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <div>
                        Avg BST: <span className="font-medium">{team.avgBST}</span>
                      </div>
                      <div>
                        Avg Cost: <span className="font-medium">{team.avgCost}</span>
                      </div>
                      <div>
                        Budget: <span className="font-medium">{team.budgetRemaining}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {stats.typeDistribution.map(({ type, count }) => (
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
                      <span className="text-slate-600 dark:text-slate-400">
                        {count}
                      </span>
                    </div>
                    <Progress
                      value={(count / stats.totalPicks) * 100}
                      className="h-1.5"
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Most Picked */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Most Picked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {stats.mostPicked.length === 0 ? (
                  <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                    No picks yet
                  </div>
                ) : (
                  stats.mostPicked.map((p, index) => {
                    const pokemonData = pokemon.find(pk => pk.id === p.id)
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <Badge variant={index < 3 ? 'default' : 'outline'}>
                          #{index + 1}
                        </Badge>

                        {pokemonData && (
                          <img
                            src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonData.id}.png`}
                            alt={p.name}
                            className="w-10 h-10 pixelated"
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {p.name}
                          </div>
                          {pokemonData && pokemonData.types && (
                            <div className="flex gap-1 mt-1">
                              {pokemonData.types.slice(0, 2).map(type => (
                                <Badge
                                  key={type.name}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {type.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="text-sm text-slate-600 dark:text-slate-400">
                          {p.pickCount === 1 ? '1 pick' : `${p.pickCount} picks`}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
