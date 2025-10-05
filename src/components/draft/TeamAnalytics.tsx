'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { TrendingUp, TrendingDown, Shield, Zap, Heart, Award, Target } from 'lucide-react'
import { calculateTeamStats, rateTeam, type TeamStats } from '@/lib/team-analytics'
import type { Team, Pick, Pokemon } from '@/types'

interface TeamAnalyticsProps {
  team: Team
  picks: Pick[]
  allPokemon: Pokemon[]
  className?: string
}

export default function TeamAnalytics({
  team,
  picks,
  allPokemon,
  className
}: TeamAnalyticsProps) {
  const stats = useMemo(
    () => calculateTeamStats(team, picks, allPokemon),
    [team, picks, allPokemon]
  )

  const rating = useMemo(() => rateTeam(stats), [stats])

  const getRatingColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400'
    if (score >= 60) return 'text-blue-600 dark:text-blue-400'
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getRatingBg = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30'
    if (score >= 60) return 'bg-blue-100 dark:bg-blue-900/30'
    if (score >= 40) return 'bg-yellow-100 dark:bg-yellow-900/30'
    return 'bg-red-100 dark:bg-red-900/30'
  }

  if (stats.totalPokemon === 0) {
    return (
      <Card className={`p-6 bg-white dark:bg-slate-800 ${className}`}>
        <div className="text-center text-slate-500 dark:text-slate-400">
          <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No Pokémon Drafted Yet</p>
          <p className="text-sm mt-1">Analytics will appear once you start drafting</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className={`p-6 bg-white dark:bg-slate-800 ${className}`}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">
            {team.name} Analytics
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {stats.totalPokemon} Pokémon • {stats.budgetUsed}/{stats.budgetUsed + stats.budgetRemaining} Budget
          </p>
        </div>

        {/* Overall Rating */}
        <div className={`p-4 rounded-lg ${getRatingBg(rating.overall)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Overall Rating
            </span>
            <div className="flex items-center gap-2">
              <Award className={`h-5 w-5 ${getRatingColor(rating.overall)}`} />
              <span className={`text-2xl font-bold ${getRatingColor(rating.overall)}`}>
                {rating.overall}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">/100</span>
            </div>
          </div>
          <Progress value={rating.overall} className="h-2" />
        </div>

        {/* Rating Breakdown */}
        <div className="grid grid-cols-2 gap-3">
          {/* Offense */}
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Offense
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-red-600 dark:text-red-400">
                {rating.breakdown.offense}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400">/100</span>
            </div>
          </div>

          {/* Defense */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Defense
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {rating.breakdown.defense}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400">/100</span>
            </div>
          </div>

          {/* Speed */}
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Speed
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                {rating.breakdown.speed}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400">/100</span>
            </div>
          </div>

          {/* Diversity */}
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Diversity
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-purple-600 dark:text-purple-400">
                {rating.breakdown.diversity}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400">/100</span>
            </div>
          </div>
        </div>

        {/* Stat Averages */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Average Stats
          </h4>
          <div className="space-y-2">
            <StatBar label="HP" value={stats.avgHP} max={255} color="green" />
            <StatBar label="Attack" value={stats.avgAttack} max={255} color="red" />
            <StatBar label="Defense" value={stats.avgDefense} max={255} color="blue" />
            <StatBar label="Sp. Atk" value={stats.avgSpecialAttack} max={255} color="purple" />
            <StatBar label="Sp. Def" value={stats.avgSpecialDefense} max={255} color="cyan" />
            <StatBar label="Speed" value={stats.avgSpeed} max={255} color="yellow" />
          </div>
        </div>

        {/* Type Coverage */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Type Coverage ({stats.uniqueTypes.length} types)
          </h4>
          <div className="flex flex-wrap gap-1">
            {stats.uniqueTypes.map(type => (
              <Badge
                key={type}
                variant="outline"
                className="capitalize text-xs"
                style={{
                  backgroundColor: `var(--type-${type}, #gray)`,
                  color: 'white',
                  borderColor: 'transparent'
                }}
              >
                {type}
              </Badge>
            ))}
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Total BST</div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {stats.totalBST}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Avg BST</div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {stats.avgBST}
            </div>
          </div>
          {stats.mostExpensivePick && (
            <div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Most Expensive</div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {stats.mostExpensivePick.pokemon} ({stats.mostExpensivePick.cost})
              </div>
            </div>
          )}
          {stats.cheapestPick && (
            <div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Best Value</div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {stats.cheapestPick.pokemon} ({stats.cheapestPick.cost})
              </div>
            </div>
          )}
        </div>

        {/* Special Pokemon */}
        {(stats.legendaryCount > 0 || stats.mythicalCount > 0) && (
          <div className="flex gap-2">
            {stats.legendaryCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                ⭐ {stats.legendaryCount} Legendary
              </Badge>
            )}
            {stats.mythicalCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                ✨ {stats.mythicalCount} Mythical
              </Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

// Helper component for stat bars
function StatBar({
  label,
  value,
  max,
  color
}: {
  label: string
  value: number
  max: number
  color: string
}) {
  const percentage = (value / max) * 100

  const colorClasses: Record<string, string> = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    cyan: 'bg-cyan-500',
    yellow: 'bg-yellow-500'
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-600 dark:text-slate-400 w-16">
        {label}
      </span>
      <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${colorClasses[color] || 'bg-slate-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 w-8 text-right">
        {value}
      </span>
    </div>
  )
}
