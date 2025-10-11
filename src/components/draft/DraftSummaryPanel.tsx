'use client'

import React from 'react'
import { Pokemon } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Trophy,
  Coins,
  Users,
  Target,
  RotateCcw,
  Crown,
  Zap
} from 'lucide-react'

interface DraftSummaryPanelProps {
  draftedPokemon: Pokemon[]
  totalBudget?: number
  maxTeamSize?: number
  onUndoLast?: () => void
  onResetDraft?: () => void
  className?: string
}

export default function DraftSummaryPanel({
  draftedPokemon,
  totalBudget = 100,
  maxTeamSize = 6,
  onUndoLast,
  onResetDraft,
  className
}: DraftSummaryPanelProps) {
  const usedBudget = draftedPokemon.reduce((sum, p) => sum + p.cost, 0)
  const remainingBudget = totalBudget - usedBudget
  const draftedCount = draftedPokemon.length
  const remainingSlots = maxTeamSize - draftedCount
  const averageCost = draftedCount > 0 ? Math.round(usedBudget / draftedCount) : 0

  // Calculate progress
  const slotsUsedPercent = (draftedCount / maxTeamSize) * 100

  if (draftedCount === 0) {
    return (
      <Card className={cn(
        "fixed bottom-6 right-6 w-80 z-50 border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-xl",
        className
      )}>
        <CardContent className="p-4 text-center">
          <div className="text-slate-400 dark:text-slate-500 mb-2">
            <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No Pokémon drafted yet</p>
            <p className="text-xs">Click on any Pokémon to start drafting</p>
          </div>
          <div className="flex justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1">
              <Coins className="h-3 w-3" />
              <span>{totalBudget} pts budget</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>{maxTeamSize} slots</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      "fixed bottom-6 right-6 w-80 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-2xl border-2",
      draftedCount >= maxTeamSize
        ? "border-green-400 dark:border-green-500"
        : "border-blue-400 dark:border-blue-500",
      className
    )}>
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-2 rounded-full",
              draftedCount >= maxTeamSize
                ? "bg-green-100 dark:bg-green-900/30"
                : "bg-blue-100 dark:bg-blue-900/30"
            )}>
              <Trophy className={cn(
                "h-4 w-4",
                draftedCount >= maxTeamSize
                  ? "text-green-600 dark:text-green-400"
                  : "text-blue-600 dark:text-blue-400"
              )} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200">
                Draft Team
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {draftedCount >= maxTeamSize ? 'Team Complete!' : 'Building team...'}
              </p>
            </div>
          </div>
          {draftedCount >= maxTeamSize && (
            <Crown className="h-5 w-5 text-yellow-500 animate-pulse" />
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Team</span>
            </div>
            <div className="text-lg font-bold text-blue-800 dark:text-blue-200">
              {draftedCount}/{maxTeamSize}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400">
              {remainingSlots} slots left
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-700 dark:text-green-300">Budget</span>
            </div>
            <div className="text-lg font-bold text-green-800 dark:text-green-200">
              {remainingBudget}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400">
              {usedBudget}/{totalBudget} used
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Avg Cost</span>
            </div>
            <div className="text-lg font-bold text-purple-800 dark:text-purple-200">
              {averageCost}
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400">
              points per pick
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Team Progress</span>
            <span>{Math.round(slotsUsedPercent)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                draftedCount >= maxTeamSize
                  ? "bg-gradient-to-r from-green-500 to-emerald-600"
                  : "bg-gradient-to-r from-blue-500 to-cyan-600"
              )}
              style={{ width: `${Math.min(slotsUsedPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Recently Drafted */}
        {draftedPokemon.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Recent Picks
            </h4>
            <div className="space-y-1 max-h-20 overflow-y-auto">
              {draftedPokemon.slice(-3).reverse().map((pokemon, index) => (
                <div
                  key={`${pokemon.id}-${index}`}
                  className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: pokemon.types[0]?.color }}
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {pokemon.name}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs px-1">
                    {pokemon.cost}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {onUndoLast && draftedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUndoLast}
              className="flex-1 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Undo
            </Button>
          )}
          {onResetDraft && draftedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResetDraft}
              className="flex-1 text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Reset
            </Button>
          )}
        </div>

        {/* Completion Message */}
        {draftedCount >= maxTeamSize && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border border-green-200 dark:border-green-700 rounded-lg p-3 text-center">
            <div className="text-green-700 dark:text-green-300 font-semibold text-sm mb-1">
              🎉 Team Complete!
            </div>
            <p className="text-xs text-green-600 dark:text-green-400">
              Your draft team is ready for battle
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}