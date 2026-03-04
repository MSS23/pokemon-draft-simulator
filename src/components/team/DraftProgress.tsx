'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Clock, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  // Format timer display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) return `${mins}:${secs.toString().padStart(2, '0')}`
    return `${secs}s`
  }

  const isTimerCritical = timeRemaining > 0 && timeRemaining <= 10
  const isTimerWarning = timeRemaining > 0 && timeRemaining <= 30

  return (
    <div className="w-full space-y-3 bg-card rounded-lg border p-3 sm:p-4 shadow-sm">
      {/* Top bar: stats + timer */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Round */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg">
          <span className="text-xs text-muted-foreground">Round</span>
          <span className="text-sm font-bold">{draftInfo.currentRound}</span>
          {draftInfo.isReverseRound && (
            <RotateCcw className="h-3 w-3 text-muted-foreground" />
          )}
        </div>

        {/* Pick */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg">
          <span className="text-xs text-muted-foreground">Pick</span>
          <span className="text-sm font-bold">{draftInfo.currentPick}</span>
          <span className="text-xs text-muted-foreground">/ {draftInfo.maxPossiblePicks}</span>
        </div>

        {/* Timer - prominent when active */}
        {timeRemaining > 0 && (
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono transition-all',
            isTimerCritical
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse shadow-sm shadow-red-200 dark:shadow-red-900/50'
              : isTimerWarning
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
              : 'bg-primary/10 text-primary'
          )}>
            <Clock className={cn('h-3.5 w-3.5', isTimerCritical && 'animate-bounce')} />
            <span className="text-sm font-bold">{formatTime(timeRemaining)}</span>
          </div>
        )}

        {/* Overall progress bar - grows to fill remaining space */}
        <div className="flex-1 min-w-[120px]">
          <Progress value={draftInfo.overallProgress} className="h-2.5" />
        </div>
      </div>

      {/* Pick order visualization */}
      {draftStatus === 'drafting' && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
          {pickOrder.map((team) => (
            <Badge
              key={team.id}
              variant={team.isCurrentPick ? 'default' : 'outline'}
              className={cn(
                'flex-shrink-0 text-xs px-3 py-1 transition-all',
                team.isCurrentPick
                  ? 'bg-primary text-primary-foreground shadow-md scale-110 font-semibold'
                  : team.hasPickedThisRound
                  ? 'bg-muted text-muted-foreground line-through opacity-50'
                  : 'text-foreground'
              )}
            >
              {team.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
