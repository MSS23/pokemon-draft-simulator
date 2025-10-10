'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Activity, ArrowRight, Clock, RotateCcw } from 'lucide-react'

interface DraftProgressProps {
  currentTurn: number
  totalTeams: number
  maxRounds: number
  draftStatus: 'waiting' | 'drafting' | 'completed' | 'paused'
  timeRemaining?: number
  teams: Array<{
    id: string
    name: string
    draftOrder: number
    picks: string[]
  }>
}

export default function DraftProgress({
  currentTurn,
  totalTeams,
  maxRounds,
  draftStatus,
  timeRemaining = 0,
  teams
}: DraftProgressProps) {
  const draftInfo = useMemo(() => {
    if (totalTeams === 0) {
      return {
        currentRound: 1,
        currentPick: 1,
        pickInRound: 1,
        isReverseRound: false,
        totalPicks: currentTurn,
        maxPossiblePicks: maxRounds * totalTeams,
        roundProgress: 0,
        overallProgress: 0
      }
    }

    const currentRound = Math.floor((currentTurn - 1) / totalTeams) + 1
    const pickInRound = ((currentTurn - 1) % totalTeams) + 1
    const isReverseRound = currentRound % 2 === 0
    const totalPicks = currentTurn
    const maxPossiblePicks = maxRounds * totalTeams
    const roundProgress = (pickInRound / totalTeams) * 100
    const overallProgress = Math.min((totalPicks / maxPossiblePicks) * 100, 100)

    return {
      currentRound,
      currentPick: currentTurn,
      pickInRound,
      isReverseRound,
      totalPicks,
      maxPossiblePicks,
      roundProgress,
      overallProgress
    }
  }, [currentTurn, totalTeams, maxRounds])

  const getPickOrderVisualization = () => {
    if (totalTeams === 0) return []

    const sortedTeams = [...teams].sort((a, b) => a.draftOrder - b.draftOrder)
    const currentTeamIndex = draftInfo.isReverseRound
      ? totalTeams - draftInfo.pickInRound
      : draftInfo.pickInRound - 1

    return sortedTeams.map((team, index) => {
      const isCurrentPick = index === currentTeamIndex && draftStatus === 'drafting'
      const hasPickedThisRound = draftInfo.isReverseRound
        ? index >= totalTeams - draftInfo.pickInRound
        : index < draftInfo.pickInRound

      return {
        ...team,
        isCurrentPick,
        hasPickedThisRound,
        orderInRound: draftInfo.isReverseRound ? totalTeams - index : index + 1
      }
    })
  }

  const pickOrder = getPickOrderVisualization()

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Draft Progress
          {draftInfo.isReverseRound && (
            <Badge variant="outline" className="text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Snake Round
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Pick Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {draftInfo.currentRound}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400">Round</div>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
              {draftInfo.currentPick}
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400">Overall Pick</div>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
            <div className="text-xl font-bold text-green-600 dark:text-green-400">
              {draftInfo.pickInRound}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400">Pick in Round</div>
          </div>
          <div className={`text-center p-3 rounded-lg transition-all ${
            timeRemaining <= 10 && timeRemaining > 0
              ? 'bg-red-100 dark:bg-red-950 animate-pulse'
              : timeRemaining > 0
              ? 'bg-orange-50 dark:bg-orange-950'
              : 'bg-gray-50 dark:bg-gray-800'
          }`}>
            <div className={`text-xl font-bold font-mono ${
              timeRemaining <= 10 && timeRemaining > 0
                ? 'text-red-600 dark:text-red-400'
                : timeRemaining > 0
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}>
              {timeRemaining > 0 ? `${timeRemaining}s` : '--'}
            </div>
            <div className={`text-xs flex items-center justify-center gap-1 ${
              timeRemaining <= 10 && timeRemaining > 0
                ? 'text-red-600 dark:text-red-400'
                : timeRemaining > 0
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}>
              <Clock className="h-3 w-3" />
              Time Left
            </div>
          </div>
        </div>

        {/* Round Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Round {draftInfo.currentRound} Progress</span>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {draftInfo.pickInRound} / {totalTeams} picks
            </span>
          </div>
          <Progress value={draftInfo.roundProgress} className="h-2" />
        </div>

        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Overall Draft Progress</span>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {draftInfo.totalPicks} / {draftInfo.maxPossiblePicks} picks
            </span>
          </div>
          <Progress value={draftInfo.overallProgress} className="h-2" />
        </div>

        {/* Pick Order Visualization */}
        {draftStatus === 'drafting' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Current Round Pick Order</span>
              {draftInfo.isReverseRound && (
                <ArrowRight className="h-4 w-4 text-gray-400 rotate-180" />
              )}
              {!draftInfo.isReverseRound && (
                <ArrowRight className="h-4 w-4 text-gray-400" />
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-2">
              {pickOrder.map((team) => (
                <div
                  key={team.id}
                  className={`
                    flex-shrink-0 px-2 py-1 rounded text-xs font-medium min-w-0 text-center
                    ${team.isCurrentPick
                      ? 'bg-yellow-500 text-white shadow-lg scale-105'
                      : team.hasPickedThisRound
                      ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }
                  `}
                  style={{ minWidth: '60px' }}
                >
                  <div className="truncate">#{team.draftOrder}</div>
                  <div className="truncate">{team.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Snake Draft Explanation */}
        {draftStatus === 'drafting' && (
          <div className="text-xs text-gray-600 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <strong>Snake Draft:</strong> Pick order reverses each round.
            Round 1: 1→2→3→4, Round 2: 4→3→2→1, Round 3: 1→2→3→4...
          </div>
        )}
      </CardContent>
    </Card>
  )
}