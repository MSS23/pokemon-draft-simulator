'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Pokemon } from '@/types'
import {
  Shield,
  Zap,
  Heart,
  Swords,
  TrendingUp,
  Target,
  Award,
  BarChart3,
  Trophy
} from 'lucide-react'

interface TeamAnalyticsProps {
  pokemon: Pokemon[]
  budget: number
  budgetUsed: number
}

export default function TeamAnalytics({ pokemon, budget, budgetUsed }: TeamAnalyticsProps) {
  const analytics = useMemo(() => {
    if (pokemon.length === 0) {
      return {
        totalStats: 0,
        averageStats: 0,
        typeDistribution: {},
        statAverages: {
          hp: 0,
          attack: 0,
          defense: 0,
          specialAttack: 0,
          specialDefense: 0,
          speed: 0
        },
        costPerStat: 0,
        efficiency: 0
      }
    }

    // Calculate total and average stats
    const totalStats = pokemon.reduce((sum, p) => sum + (p.stats?.total || 0), 0)
    const averageStats = Math.round(totalStats / pokemon.length)

    // Type distribution
    const typeDistribution: Record<string, number> = {}
    pokemon.forEach(p => {
      p.types?.forEach(type => {
        const typeName = (typeof type === 'string' ? type : type.name) as string
        typeDistribution[typeName] = (typeDistribution[typeName] || 0) + 1
      })
    })

    // Stat averages
    const statAverages = {
      hp: Math.round(pokemon.reduce((sum, p) => sum + (p.stats?.hp || 0), 0) / pokemon.length),
      attack: Math.round(pokemon.reduce((sum, p) => sum + (p.stats?.attack || 0), 0) / pokemon.length),
      defense: Math.round(pokemon.reduce((sum, p) => sum + (p.stats?.defense || 0), 0) / pokemon.length),
      specialAttack: Math.round(pokemon.reduce((sum, p) => sum + (p.stats?.specialAttack || 0), 0) / pokemon.length),
      specialDefense: Math.round(pokemon.reduce((sum, p) => sum + (p.stats?.specialDefense || 0), 0) / pokemon.length),
      speed: Math.round(pokemon.reduce((sum, p) => sum + (p.stats?.speed || 0), 0) / pokemon.length)
    }

    // Efficiency metrics
    const costPerStat = budgetUsed > 0 ? (totalStats / budgetUsed).toFixed(2) : '0'
    const efficiency = budgetUsed > 0 ? Math.min(100, Math.round((totalStats / budgetUsed) * 2)) : 0

    return {
      totalStats,
      averageStats,
      typeDistribution,
      statAverages,
      costPerStat: parseFloat(costPerStat),
      efficiency
    }
  }, [pokemon, budgetUsed])

  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      normal: 'bg-gray-400',
      fire: 'bg-orange-500',
      water: 'bg-blue-500',
      electric: 'bg-yellow-400',
      grass: 'bg-green-500',
      ice: 'bg-cyan-300',
      fighting: 'bg-red-600',
      poison: 'bg-purple-500',
      ground: 'bg-yellow-600',
      flying: 'bg-indigo-300',
      psychic: 'bg-pink-500',
      bug: 'bg-lime-500',
      rock: 'bg-yellow-700',
      ghost: 'bg-purple-700',
      dragon: 'bg-indigo-600',
      dark: 'bg-gray-700',
      steel: 'bg-gray-500',
      fairy: 'bg-pink-300'
    }
    return colors[type.toLowerCase()] || 'bg-gray-400'
  }

  const getStatColor = (value: number, max: number = 150): string => {
    const percentage = (value / max) * 100
    if (percentage >= 80) return 'bg-green-500'
    if (percentage >= 60) return 'bg-blue-500'
    if (percentage >= 40) return 'bg-yellow-500'
    return 'bg-orange-500'
  }

  if (pokemon.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Team Analytics
          </CardTitle>
          <CardDescription>Start drafting to see team statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No Pokémon drafted yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Overview Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Team Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Trophy className="w-4 h-4" />
                Total Pokémon
              </div>
              <div className="text-2xl font-bold">{pokemon.length}</div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <TrendingUp className="w-4 h-4" />
                Avg BST
              </div>
              <div className="text-2xl font-bold">{analytics.averageStats}</div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Target className="w-4 h-4" />
                Efficiency
              </div>
              <div className="text-2xl font-bold">{analytics.costPerStat.toFixed(1)}</div>
              <div className="text-xs text-gray-500">BST per point</div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Award className="w-4 h-4" />
                Value Score
              </div>
              <div className="text-2xl font-bold">{analytics.efficiency}%</div>
              <Progress value={analytics.efficiency} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Average Stats</CardTitle>
          <CardDescription>Team-wide stat distribution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                <span>HP</span>
              </div>
              <span className="font-semibold">{analytics.statAverages.hp}</span>
            </div>
            <Progress
              value={(analytics.statAverages.hp / 150) * 100}
              className="h-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Swords className="w-4 h-4 text-orange-500" />
                <span>Attack</span>
              </div>
              <span className="font-semibold">{analytics.statAverages.attack}</span>
            </div>
            <Progress
              value={(analytics.statAverages.attack / 150) * 100}
              className="h-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                <span>Defense</span>
              </div>
              <span className="font-semibold">{analytics.statAverages.defense}</span>
            </div>
            <Progress
              value={(analytics.statAverages.defense / 150) * 100}
              className="h-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-500" />
                <span>Sp. Attack</span>
              </div>
              <span className="font-semibold">{analytics.statAverages.specialAttack}</span>
            </div>
            <Progress
              value={(analytics.statAverages.specialAttack / 150) * 100}
              className="h-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Sp. Defense</span>
              </div>
              <span className="font-semibold">{analytics.statAverages.specialDefense}</span>
            </div>
            <Progress
              value={(analytics.statAverages.specialDefense / 150) * 100}
              className="h-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span>Speed</span>
              </div>
              <span className="font-semibold">{analytics.statAverages.speed}</span>
            </div>
            <Progress
              value={(analytics.statAverages.speed / 150) * 100}
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Type Coverage</CardTitle>
          <CardDescription>Pokémon type distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analytics.typeDistribution)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <Badge
                  key={type}
                  className={`${getTypeColor(type)} text-white border-0 capitalize`}
                >
                  {type} × {count}
                </Badge>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
