'use client'

import React from 'react'
import { WishlistItem } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  Clock,
  Zap,
  X,
  Play,
  RotateCcw,
  Crown,
  AlertTriangle
} from 'lucide-react'

interface AutoPickIndicatorProps {
  isCountingDown: boolean
  timeRemaining: number
  nextPokemon: WishlistItem | null
  canAutoPick: boolean
  countdownDuration?: number
  onCancel: () => void
  onManualPick: () => void
  onRestart: () => void
  className?: string
}

export default function AutoPickIndicator({
  isCountingDown,
  timeRemaining,
  nextPokemon,
  canAutoPick,
  countdownDuration = 10,
  onCancel,
  onManualPick,
  onRestart,
  className
}: AutoPickIndicatorProps) {
  if (!canAutoPick && !isCountingDown) {
    return null
  }

  const progress = countdownDuration > 0 ? ((countdownDuration - timeRemaining) / countdownDuration) * 100 : 0
  const isUrgent = timeRemaining <= 3

  const formatTime = (seconds: number) => {
    return seconds.toString()
  }

  return (
    <Card className={cn(
      "fixed top-4 left-1/2 transform -translate-x-1/2 z-50",
      "bg-gradient-to-r from-purple-600 to-blue-600 text-white",
      "border-2 border-white/20 shadow-2xl backdrop-blur-sm",
      "min-w-80 max-w-md",
      isUrgent && "animate-pulse",
      className
    )}>
      <CardContent className="p-4">
        {isCountingDown ? (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "p-2 rounded-full",
                  isUrgent ? "bg-red-500" : "bg-yellow-500"
                )}>
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Auto-Pick Active</h3>
                  <p className="text-white/80 text-sm">Your turn • Picking from wishlist</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
                title="Cancel auto-pick"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Pokemon Preview */}
            {nextPokemon && (
              <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                      <Crown className="h-6 w-6 text-yellow-300" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white truncate">
                        {nextPokemon.pokemonName}
                      </span>
                      <Badge className="bg-white/20 text-white text-xs">
                        #{nextPokemon.priority}
                      </Badge>
                    </div>
                    <div className="text-white/70 text-sm">
                      {nextPokemon.cost} points • Top choice
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Countdown */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">Auto-picking in:</span>
                </div>
                <div className={cn(
                  "text-2xl font-bold tabular-nums",
                  isUrgent ? "text-red-300" : "text-white"
                )}>
                  {formatTime(timeRemaining)}s
                </div>
              </div>

              <Progress
                value={progress}
                className={cn(
                  "h-2 bg-white/20",
                  isUrgent && "bg-red-500/20"
                )}
              />

              {isUrgent && (
                <div className="flex items-center gap-2 text-red-300 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Auto-pick imminent!</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={onManualPick}
                className="flex-1 bg-white text-purple-600 hover:bg-gray-100 font-semibold"
              >
                <Play className="h-4 w-4 mr-2" />
                Pick Now
              </Button>
              <Button
                variant="outline"
                onClick={onCancel}
                className="px-4 text-white border-white/30 hover:bg-white/10"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : canAutoPick ? (
          <div className="space-y-4">
            {/* Standby Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-full bg-green-500">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Auto-Pick Ready</h3>
                  <p className="text-white/80 text-sm">Your turn • Wishlist available</p>
                </div>
              </div>
            </div>

            {/* Next Pokemon Preview */}
            {nextPokemon && (
              <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                      <Crown className="h-6 w-6 text-yellow-300" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white truncate">
                        {nextPokemon.pokemonName}
                      </span>
                      <Badge className="bg-white/20 text-white text-xs">
                        #{nextPokemon.priority}
                      </Badge>
                    </div>
                    <div className="text-white/70 text-sm">
                      {nextPokemon.cost} points • Ready to auto-pick
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={onRestart}
                className="flex-1 bg-white text-purple-600 hover:bg-gray-100 font-semibold"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Start Auto-Pick
              </Button>
              <Button
                onClick={onManualPick}
                variant="outline"
                className="px-4 text-white border-white/30 hover:bg-white/10"
              >
                <Play className="h-4 w-4 mr-2" />
                Pick Now
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}