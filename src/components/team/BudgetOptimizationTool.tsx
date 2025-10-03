'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DollarSign, TrendingUp, Award, AlertCircle } from 'lucide-react'
import { Pokemon } from '@/types'

interface BudgetOptimizationToolProps {
  team: Pokemon[]
  totalBudget: number
  budgetRemaining: number
  className?: string
}

export default function BudgetOptimizationTool({
  team,
  totalBudget,
  budgetRemaining,
  className
}: BudgetOptimizationToolProps) {
  const analysis = useMemo(() => {
    if (!team || team.length === 0) {
      return {
        totalSpent: 0,
        avgCostPerPokemon: 0,
        avgBSTPerCost: 0,
        efficiency: 0,
        recommendations: []
      }
    }

    const totalSpent = team.reduce((sum, p) => sum + (p.cost || 0), 0)
    const avgCostPerPokemon = totalSpent / team.length

    // Calculate average BST (Base Stat Total)
    const totalBST = team.reduce((sum, p) => {
      const bst = Array.isArray(p.stats) ? p.stats.reduce((s: number, stat: any) => s + stat.base_stat, 0) : 0
      return sum + bst
    }, 0)
    const avgBST = totalBST / team.length

    // Calculate BST per cost (efficiency metric)
    const avgBSTPerCost = totalSpent > 0 ? totalBST / totalSpent : 0

    // Efficiency score (0-100)
    // Good efficiency is around 10-15 BST per cost point
    const efficiency = Math.min(100, Math.round((avgBSTPerCost / 12) * 100))

    // Generate recommendations
    const recommendations: string[] = []

    if (budgetRemaining < totalBudget * 0.2 && team.length < 6) {
      recommendations.push('Low budget remaining - focus on cost-effective picks')
    }

    if (avgCostPerPokemon > 15 && budgetRemaining > 30) {
      recommendations.push('Consider budget Pokemon to save points for star picks')
    }

    if (efficiency < 60) {
      recommendations.push('Look for higher BST Pokemon at similar costs to improve efficiency')
    }

    const highCostPokemon = team.filter(p => (p.cost || 0) > 20)
    if (highCostPokemon.length > team.length * 0.5) {
      recommendations.push('Team is top-heavy - consider adding budget support Pokemon')
    }

    return {
      totalSpent,
      avgCostPerPokemon,
      avgBSTPerCost,
      avgBST,
      efficiency,
      recommendations
    }
  }, [team, totalBudget, budgetRemaining])

  const budgetUsedPercentage = ((totalBudget - budgetRemaining) / totalBudget) * 100
  const isOverBudget = budgetRemaining < 0

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Budget Optimization
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Budget Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-600 dark:text-slate-400">Total Budget</p>
            <p className="text-2xl font-bold">{totalBudget}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-600 dark:text-slate-400">Remaining</p>
            <p className={`text-2xl font-bold ${isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {budgetRemaining}
            </p>
          </div>
        </div>

        {/* Budget Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Budget Used</span>
            <span>{budgetUsedPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                budgetUsedPercentage > 90 ? 'bg-red-500' :
                budgetUsedPercentage > 70 ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${Math.min(100, budgetUsedPercentage)}%` }}
            />
          </div>
        </div>

        {team.length > 0 && (
          <>
            {/* Efficiency Metrics */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Avg Cost</div>
                <div className="text-lg font-semibold">{analysis.avgCostPerPokemon.toFixed(1)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Avg BST</div>
                <div className="text-lg font-semibold">{analysis.avgBST?.toFixed(0) || '0'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">BST/Cost</div>
                <div className="text-lg font-semibold">{analysis.avgBSTPerCost?.toFixed(1) || '0'}</div>
              </div>
            </div>

            {/* Efficiency Score */}
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <div>
                  <p className="text-sm font-semibold">Efficiency Score</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Higher is better</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={analysis.efficiency > 75 ? 'default' : analysis.efficiency > 50 ? 'secondary' : 'outline'}
                  className="text-lg px-3 py-1"
                >
                  {analysis.efficiency}%
                </Badge>
                {analysis.efficiency > 75 && <Award className="h-5 w-5 text-yellow-500" />}
              </div>
            </div>

            {/* Recommendations */}
            {analysis.recommendations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  <span>Recommendations</span>
                </div>
                <ul className="space-y-1.5">
                  {analysis.recommendations.map((rec, index) => (
                    <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cost Breakdown */}
            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-sm font-semibold">Cost Breakdown</p>
              <div className="space-y-1">
                {team.map((pokemon, index) => {
                  const costPercentage = ((pokemon.cost || 0) / totalBudget) * 100
                  return (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <span className="w-24 truncate">{pokemon.name}</span>
                      <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${costPercentage}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono">{pokemon.cost || 0}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {team.length === 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400 text-center py-4">
            Draft Pokémon to see budget analysis
          </p>
        )}
      </CardContent>
    </Card>
  )
}
