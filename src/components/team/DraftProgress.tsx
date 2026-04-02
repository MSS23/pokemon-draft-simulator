'use client'

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Clock, RotateCcw, Swords, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  onTheClockVariants,
  getTimerColor,
  useReducedMotion,
  REDUCED_MOTION_VARIANTS,
} from '@/lib/draft-animations'
import SoundToggle from '@/components/draft/SoundToggle'

interface DraftProgressProps {
  currentTurn: number
  totalTeams: number
  maxRounds: number
  draftStatus: 'waiting' | 'drafting' | 'completed' | 'paused'
  timeRemaining?: number
  userTeamId?: string
  isUserTurn?: boolean
  teams: Array<{
    id: string
    name: string
    draftOrder: number
    picks: string[]
  }>
  /** When true, renders a single-row compact banner for mobile */
  compact?: boolean
}

export default function DraftProgress({
  currentTurn,
  totalTeams,
  maxRounds,
  draftStatus,
  timeRemaining = 0,
  userTeamId,
  isUserTurn = false,
  teams,
  compact = false,
}: DraftProgressProps) {
  const reducedMotion = useReducedMotion()

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
      const isUserTeam = team.id === userTeamId

      return {
        ...team,
        isCurrentPick,
        hasPickedThisRound,
        isUserTeam,
        orderInRound: draftInfo.isReverseRound ? totalTeams - index : index + 1
      }
    })
  }

  const pickOrder = getPickOrderVisualization()
  const currentPickingTeam = pickOrder.find(t => t.isCurrentPick)

  // Format timer display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) return `${mins}:${secs.toString().padStart(2, '0')}`
    return `${secs}s`
  }

  const timeLimit = draftInfo.maxPossiblePicks > 0 ? timeRemaining : 0
  const timerColor = getTimerColor(timeRemaining, timeLimit > 0 ? timeLimit : 90)
  const isTimerCritical = timeRemaining > 0 && timeRemaining <= 10
  const isTimerWarning = timeRemaining > 0 && timeRemaining <= 30

  const clockVariants = reducedMotion ? REDUCED_MOTION_VARIANTS : onTheClockVariants

  // Compact mode for mobile — single row with team name + timer
  if (compact && draftStatus === 'drafting') {
    return (
      <div className="w-full">
        {/* Compact banner — visible only on mobile, full banner on md+ */}
        <div className="md:hidden">
          <div className={cn(
            'flex items-center justify-between gap-2 rounded-lg border px-3 py-2',
            isUserTurn
              ? 'bg-green-500/10 border-green-400 dark:border-green-500'
              : 'bg-blue-500/10 border-blue-400 dark:border-blue-500'
          )}>
            <div className="flex items-center gap-2 min-w-0">
              <div className={cn(
                'flex items-center justify-center rounded-md p-1.5',
                isUserTurn ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
              )}>
                {isUserTurn ? <Swords className="h-4 w-4" /> : <Timer className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                {isUserTurn ? (
                  <span className="text-sm font-extrabold text-green-600 dark:text-green-400">YOUR PICK!</span>
                ) : (
                  <span className="text-sm font-bold truncate block">{currentPickingTeam?.name ?? '...'}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {timeRemaining > 0 && (
                <span className={cn(
                  'font-mono text-sm font-bold px-2 py-1 rounded-md',
                  isTimerCritical
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                    : isTimerWarning
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                    : 'bg-background/80 text-foreground'
                )} style={{ color: timerColor }}>
                  <Clock className="h-3 w-3 inline mr-1" />
                  {formatTime(timeRemaining)}
                </span>
              )}
              <Badge variant="secondary" className="text-[10px] font-mono">
                R{draftInfo.currentRound} P{draftInfo.pickInRound}
              </Badge>
            </div>
          </div>
        </div>

        {/* Full banner — hidden on mobile, visible on md+ */}
        <div className="hidden md:block">
          <FullDraftBanner
            draftStatus={draftStatus}
            isUserTurn={isUserTurn}
            reducedMotion={reducedMotion}
            clockVariants={clockVariants}
            currentPickingTeam={currentPickingTeam}
            timeRemaining={timeRemaining}
            timerColor={timerColor}
            isTimerCritical={isTimerCritical}
            isTimerWarning={isTimerWarning}
            formatTime={formatTime}
            draftInfo={draftInfo}
            pickOrder={pickOrder}
            userTeamId={userTeamId}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-3">
      {/* On the Clock Banner */}
      {draftStatus === 'drafting' && (
        <motion.div
          variants={clockVariants}
          initial="initial"
          animate="animate"
          className={cn(
            'relative w-full rounded-xl border-2 p-4 sm:p-5 transition-colors overflow-hidden',
            isUserTurn
              ? 'bg-gradient-to-r from-green-500/10 via-green-400/5 to-green-500/10 border-green-400 dark:border-green-500'
              : 'bg-gradient-to-r from-blue-500/10 via-blue-400/5 to-blue-500/10 border-blue-400 dark:border-blue-500'
          )}
        >
          {/* Background pulse effect for user turn */}
          {isUserTurn && !reducedMotion && (
            <motion.div
              className="absolute inset-0 bg-green-400/10 dark:bg-green-400/5"
              animate={{
                opacity: [0, 0.5, 0],
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          <div className="relative z-10 flex items-center justify-between gap-3">
            {/* Left: Team name + status */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={cn(
                'flex items-center justify-center rounded-lg p-2',
                isUserTurn
                  ? 'bg-green-500 text-white'
                  : 'bg-blue-500 text-white'
              )}>
                {isUserTurn ? (
                  <Swords className="h-5 w-5" />
                ) : (
                  <Timer className="h-5 w-5" />
                )}
              </div>

              <div className="min-w-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isUserTurn ? 'your-pick' : currentPickingTeam?.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {isUserTurn ? (
                      <div>
                        <span className="text-lg sm:text-xl font-extrabold text-green-600 dark:text-green-400 tracking-tight">
                          YOUR PICK!
                        </span>
                        <p className="text-xs text-green-600/70 dark:text-green-400/70 font-medium">
                          Select a Pokemon from the grid below
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-lg sm:text-xl font-bold text-foreground truncate block">
                          {currentPickingTeam?.name ?? '...'}
                        </span>
                        <p className="text-xs text-muted-foreground font-medium">
                          is on the clock
                        </p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Center: Timer */}
            {timeRemaining > 0 && (
              <motion.div
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg sm:text-2xl font-bold transition-colors',
                  isTimerCritical
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                    : isTimerWarning
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                    : 'bg-background/80 text-foreground'
                )}
                style={{ color: timerColor }}
                animate={isTimerCritical && !reducedMotion ? {
                  scale: [1, 1.05, 1],
                } : {}}
                transition={isTimerCritical ? {
                  duration: 0.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                } : {}}
              >
                <Clock className={cn('h-4 w-4 sm:h-5 sm:w-5', isTimerCritical && !reducedMotion && 'animate-bounce')} />
                {formatTime(timeRemaining)}
              </motion.div>
            )}

            {/* Right: Sound toggle */}
            <SoundToggle className="flex-shrink-0" />
          </div>

          {/* Stats bar */}
          <div className="relative z-10 flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background/60 rounded-lg text-xs">
              <span className="text-muted-foreground">Round</span>
              <span className="font-bold">{draftInfo.currentRound}</span>
              {draftInfo.isReverseRound && (
                <RotateCcw className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background/60 rounded-lg text-xs">
              <span className="text-muted-foreground">Pick</span>
              <span className="font-bold">{draftInfo.currentPick}</span>
              <span className="text-muted-foreground">/ {draftInfo.maxPossiblePicks}</span>
            </div>
            <div className="flex-1 min-w-[80px]">
              <Progress value={draftInfo.overallProgress} className="h-2" />
            </div>
          </div>
        </motion.div>
      )}

      {/* Pick order visualization */}
      {draftStatus === 'drafting' && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
          {pickOrder.map((team) => (
            <Badge
              key={team.id}
              variant={team.isCurrentPick ? 'default' : 'outline'}
              className={cn(
                'flex-shrink-0 text-xs px-3 py-1 transition-all',
                team.isCurrentPick && team.isUserTeam
                  ? 'bg-green-500 dark:bg-green-600 text-white border-green-500 shadow-md scale-110 font-semibold'
                  : team.isCurrentPick
                  ? 'bg-primary text-primary-foreground shadow-md scale-110 font-semibold'
                  : team.hasPickedThisRound
                  ? 'bg-muted text-muted-foreground line-through opacity-50'
                  : team.isUserTeam
                  ? 'border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 font-medium'
                  : 'text-foreground'
              )}
            >
              {team.name}{team.isUserTeam ? ' (You)' : ''}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

/** Extracted full-size banner for desktop (used by compact mode's md+ view) */
function FullDraftBanner({
  draftStatus,
  isUserTurn,
  reducedMotion,
  clockVariants,
  currentPickingTeam,
  timeRemaining,
  timerColor,
  isTimerCritical,
  isTimerWarning,
  formatTime,
  draftInfo,
  pickOrder,
  userTeamId: _userTeamId,
}: {
  draftStatus: string
  isUserTurn: boolean
  reducedMotion: boolean
  clockVariants: typeof onTheClockVariants | typeof REDUCED_MOTION_VARIANTS
  currentPickingTeam: { name: string } | undefined
  timeRemaining: number
  timerColor: string
  isTimerCritical: boolean
  isTimerWarning: boolean
  formatTime: (s: number) => string
  draftInfo: {
    currentRound: number
    currentPick: number
    pickInRound: number
    isReverseRound: boolean
    overallProgress: number
    maxPossiblePicks: number
  }
  pickOrder: Array<{
    id: string
    name: string
    isCurrentPick: boolean
    hasPickedThisRound: boolean
    isUserTeam: boolean
  }>
  userTeamId?: string
}) {
  return (
    <div className="w-full space-y-3">
      {draftStatus === 'drafting' && (
        <motion.div
          variants={clockVariants}
          initial="initial"
          animate="animate"
          className={cn(
            'relative w-full rounded-xl border-2 p-4 sm:p-5 transition-colors overflow-hidden',
            isUserTurn
              ? 'bg-gradient-to-r from-green-500/10 via-green-400/5 to-green-500/10 border-green-400 dark:border-green-500'
              : 'bg-gradient-to-r from-blue-500/10 via-blue-400/5 to-blue-500/10 border-blue-400 dark:border-blue-500'
          )}
        >
          {isUserTurn && !reducedMotion && (
            <motion.div
              className="absolute inset-0 bg-green-400/10 dark:bg-green-400/5"
              animate={{ opacity: [0, 0.5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={cn(
                'flex items-center justify-center rounded-lg p-2',
                isUserTurn ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
              )}>
                {isUserTurn ? <Swords className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isUserTurn ? 'your-pick' : currentPickingTeam?.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {isUserTurn ? (
                      <div>
                        <span className="text-lg sm:text-xl font-extrabold text-green-600 dark:text-green-400 tracking-tight">YOUR PICK!</span>
                        <p className="text-xs text-green-600/70 dark:text-green-400/70 font-medium">Select a Pokemon from the grid below</p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-lg sm:text-xl font-bold text-foreground truncate block">{currentPickingTeam?.name ?? '...'}</span>
                        <p className="text-xs text-muted-foreground font-medium">is on the clock</p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {timeRemaining > 0 && (
              <motion.div
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg sm:text-2xl font-bold transition-colors',
                  isTimerCritical ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                    : isTimerWarning ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                    : 'bg-background/80 text-foreground'
                )}
                style={{ color: timerColor }}
                animate={isTimerCritical && !reducedMotion ? { scale: [1, 1.05, 1] } : {}}
                transition={isTimerCritical ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' } : {}}
              >
                <Clock className={cn('h-4 w-4 sm:h-5 sm:w-5', isTimerCritical && !reducedMotion && 'animate-bounce')} />
                {formatTime(timeRemaining)}
              </motion.div>
            )}

            <SoundToggle className="flex-shrink-0" />
          </div>

          <div className="relative z-10 flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background/60 rounded-lg text-xs">
              <span className="text-muted-foreground">Round</span>
              <span className="font-bold">{draftInfo.currentRound}</span>
              {draftInfo.isReverseRound && <RotateCcw className="h-3 w-3 text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background/60 rounded-lg text-xs">
              <span className="text-muted-foreground">Pick</span>
              <span className="font-bold">{draftInfo.currentPick}</span>
              <span className="text-muted-foreground">/ {draftInfo.maxPossiblePicks}</span>
            </div>
            <div className="flex-1 min-w-[80px]">
              <Progress value={draftInfo.overallProgress} className="h-2" />
            </div>
          </div>
        </motion.div>
      )}

      {draftStatus === 'drafting' && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
          {pickOrder.map((team) => (
            <Badge
              key={team.id}
              variant={team.isCurrentPick ? 'default' : 'outline'}
              className={cn(
                'flex-shrink-0 text-xs px-3 py-1 transition-all',
                team.isCurrentPick && team.isUserTeam
                  ? 'bg-green-500 dark:bg-green-600 text-white border-green-500 shadow-md scale-110 font-semibold'
                  : team.isCurrentPick
                  ? 'bg-primary text-primary-foreground shadow-md scale-110 font-semibold'
                  : team.hasPickedThisRound
                  ? 'bg-muted text-muted-foreground line-through opacity-50'
                  : team.isUserTeam
                  ? 'border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 font-medium'
                  : 'text-foreground'
              )}
            >
              {team.name}{team.isUserTeam ? ' (You)' : ''}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
