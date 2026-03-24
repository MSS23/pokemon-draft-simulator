'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Play, Pause, SkipForward, SkipBack, RotateCcw,
  FastForward
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, formatPokemonName } from '@/utils/pokemon'
import { TEAM_COLORS, buildTeamColorMap } from '@/utils/team-colors'

interface ReplayPick {
  id: string
  team_id: string
  team_name: string
  user_name: string
  pokemon_id: string
  pokemon_name: string
  cost: number
  pick_order: number
  round: number
}

interface DraftReplayProps {
  picks: ReplayPick[]
  teams: Array<{ id: string; name: string; userName: string; draftOrder: number }>
  draftName: string
}

export function DraftReplay({ picks, teams, draftName }: DraftReplayProps) {
  const [currentStep, setCurrentStep] = useState(-1) // -1 = not started
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1500) // ms per pick
  const [showReveal, setShowReveal] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sortedPicks = useMemo(
    () => [...picks].sort((a, b) => a.pick_order - b.pick_order),
    [picks]
  )
  const totalPicks = sortedPicks.length

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.draftOrder - b.draftOrder),
    [teams]
  )

  const teamColorMap = useMemo(
    () => buildTeamColorMap(sortedTeams.map(t => t.id)),
    [sortedTeams]
  )

  // Build team rosters up to currentStep
  const teamRosters = useMemo(() => {
    const rosters = new Map<string, ReplayPick[]>()
    for (const team of teams) {
      rosters.set(team.id, [])
    }
    for (let i = 0; i <= currentStep && i < sortedPicks.length; i++) {
      const pick = sortedPicks[i]
      const roster = rosters.get(pick.team_id)
      if (roster) {
        roster.push(pick)
      }
    }
    return rosters
  }, [teams, sortedPicks, currentStep])

  const currentPick = currentStep >= 0 && currentStep < totalPicks
    ? sortedPicks[currentStep]
    : null

  const currentRound = currentPick?.round ?? 0

  // Auto-play logic
  useEffect(() => {
    if (isPlaying && currentStep < totalPicks - 1) {
      timerRef.current = setTimeout(() => {
        setShowReveal(true)
        setTimeout(() => {
          setCurrentStep(prev => prev + 1)
          setShowReveal(false)
        }, 400)
      }, speed)
    } else if (currentStep >= totalPicks - 1) {
      setIsPlaying(false)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isPlaying, currentStep, totalPicks, speed])

  const play = useCallback(() => {
    if (currentStep >= totalPicks - 1) {
      setCurrentStep(-1)
    }
    setIsPlaying(true)
  }, [currentStep, totalPicks])

  const pause = useCallback(() => setIsPlaying(false), [])

  const stepForward = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep(prev => Math.min(prev + 1, totalPicks - 1))
  }, [totalPicks])

  const stepBack = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep(prev => Math.max(prev - 1, -1))
  }, [])

  const reset = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep(-1)
  }, [])

  const jumpToEnd = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep(totalPicks - 1)
  }, [totalPicks])

  const cycleSpeed = useCallback(() => {
    setSpeed(prev => {
      if (prev === 1500) return 800
      if (prev === 800) return 400
      return 1500
    })
  }, [])

  const speedLabel = speed === 1500 ? '1x' : speed === 800 ? '2x' : '3x'

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement
    if (!target.dataset.fallback) {
      target.dataset.fallback = '1'
      const pokemonId = target.dataset.pokemonId
      if (pokemonId) {
        target.src = getPokemonAnimatedBackupUrl(pokemonId)
      }
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {currentStep < 0 ? 'Ready to replay' : `Pick ${currentStep + 1} of ${totalPicks}`}
            {currentRound > 0 && ` \u2014 Round ${currentRound}`}
          </span>
          <span className="font-medium">{draftName}</span>
        </div>
        <div
          className="h-2 bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={currentStep + 1}
          aria-valuemin={0}
          aria-valuemax={totalPicks}
          aria-label={`Draft replay progress: pick ${currentStep + 1} of ${totalPicks}`}
        >
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${totalPicks > 0 ? ((currentStep + 1) / totalPicks) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Current Pick Reveal */}
      {currentPick && (
        <Card className={cn(
          'border-l-4 transition-all duration-300',
          showReveal ? 'scale-[1.02] shadow-lg' : '',
          teamColorMap.get(currentPick.team_id)?.border || 'border-l-primary'
        )}>
          <CardContent className="py-6">
            <div className="flex items-center justify-center gap-4">
              <Badge variant="outline" className="text-lg px-3 py-1">
                #{currentPick.pick_order}
              </Badge>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getPokemonAnimatedUrl(currentPick.pokemon_id, currentPick.pokemon_name)}
                  alt={currentPick.pokemon_name}
                  data-pokemon-id={currentPick.pokemon_id}
                  className={cn(
                    'w-24 h-24 drop-shadow-lg transition-all duration-300',
                    showReveal ? 'scale-110' : ''
                  )}
                  onError={handleImageError}
                />
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">
                  {formatPokemonName(currentPick.pokemon_name)}
                </div>
                <div className={cn(
                  'text-sm font-medium',
                  teamColorMap.get(currentPick.team_id)?.text || 'text-primary'
                )}>
                  {currentPick.team_name}
                </div>
                <div className="text-xs text-muted-foreground">{currentPick.user_name}</div>
                <Badge className="mt-1">{currentPick.cost} pts</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state before playback starts */}
      {currentStep < 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-sm">Press play to start the draft replay</p>
            <p className="text-xs mt-1">{totalPicks} picks across {teams.length} teams</p>
          </CardContent>
        </Card>
      )}

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-2" role="toolbar" aria-label="Replay controls">
        <Button size="sm" variant="outline" onClick={reset} disabled={currentStep < 0} aria-label="Reset to beginning">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={stepBack} disabled={currentStep < 0} aria-label="Previous pick">
          <SkipBack className="h-4 w-4" />
        </Button>
        {isPlaying ? (
          <Button size="sm" onClick={pause} aria-label="Pause replay">
            <Pause className="h-4 w-4 mr-1" />
            Pause
          </Button>
        ) : (
          <Button size="sm" onClick={play} aria-label={currentStep >= totalPicks - 1 ? 'Replay from start' : 'Play replay'}>
            <Play className="h-4 w-4 mr-1" />
            {currentStep >= totalPicks - 1 ? 'Replay' : 'Play'}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={stepForward} disabled={currentStep >= totalPicks - 1} aria-label="Next pick">
          <SkipForward className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={jumpToEnd} disabled={currentStep >= totalPicks - 1} aria-label="Jump to end">
          <FastForward className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={cycleSpeed} aria-label={`Playback speed: ${speedLabel}`}>
          {speedLabel}
        </Button>
      </div>

      {/* Team Rosters Building Up */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {sortedTeams.map((team) => {
          const roster = teamRosters.get(team.id) || []
          const colors = teamColorMap.get(team.id) || TEAM_COLORS[0]

          return (
            <Card key={team.id} className={cn('border-l-4', colors.border)}>
              <CardContent className="p-3">
                <div className="text-xs font-semibold truncate">{team.name}</div>
                <div className="text-[10px] text-muted-foreground mb-2">{team.userName}</div>
                <div className="space-y-1">
                  {roster.map((pick) => (
                    <div key={pick.id} className="flex items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getPokemonAnimatedUrl(pick.pokemon_id, pick.pokemon_name)}
                        alt={pick.pokemon_name}
                        data-pokemon-id={pick.pokemon_id}
                        className="w-6 h-6"
                        loading="lazy"
                        onError={handleImageError}
                      />
                      <span className="text-[10px] truncate flex-1">
                        {formatPokemonName(pick.pokemon_name)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{pick.cost}</span>
                    </div>
                  ))}
                  {roster.length === 0 && (
                    <div className="text-[10px] text-muted-foreground italic">No picks yet</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
