'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react'
import { Pokemon, Pick } from '@/types'
import { cn } from '@/lib/utils'

interface DraftReplayProps {
  picks: Pick[]
  pokemon: Pokemon[]
  teams: Array<{ id: string; name: string }>
  className?: string
}

interface ReplayPick extends Pick {
  teamName: string
  roundNumber: number
  pickInRound: number
}

/**
 * DraftReplay - Interactive replay of draft with timeline controls
 *
 * Features:
 * - Play/Pause animation
 * - Skip forward/backward
 * - Scrub through timeline
 * - Speed control
 * - Round-by-round breakdown
 */
export default function DraftReplay({
  picks,
  pokemon,
  teams,
  className
}: DraftReplayProps) {
  const [currentTurn, setCurrentTurn] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1000) // ms per pick

  // Enrich picks with team names and round info
  const enrichedPicks = useMemo<ReplayPick[]>(() => {
    return picks
      .sort((a, b) => a.pickOrder - b.pickOrder)
      .map((pick, index) => {
        const team = teams.find(t => t.id === pick.teamId)
        const roundNumber = pick.round
        const pickInRound = (index % teams.length) + 1

        return {
          ...pick,
          teamName: team?.name || 'Unknown Team',
          roundNumber,
          pickInRound
        }
      })
  }, [picks, teams])

  // Playback logic
  useEffect(() => {
    if (!isPlaying) return
    if (currentTurn >= enrichedPicks.length - 1) {
      setIsPlaying(false)
      return
    }

    const interval = setInterval(() => {
      setCurrentTurn(turn => {
        if (turn >= enrichedPicks.length - 1) {
          setIsPlaying(false)
          return turn
        }
        return turn + 1
      })
    }, playbackSpeed)

    return () => clearInterval(interval)
  }, [isPlaying, currentTurn, enrichedPicks.length, playbackSpeed])

  const currentPick = enrichedPicks[currentTurn]
  const currentPokemon = useMemo(
    () => pokemon.find(p => p.id === currentPick?.pokemonId),
    [pokemon, currentPick]
  )

  const visiblePicks = enrichedPicks.slice(0, currentTurn + 1)

  // Group picks by round
  const picksByRound = useMemo(() => {
    const rounds: Record<number, ReplayPick[]> = {}
    visiblePicks.forEach(pick => {
      if (!rounds[pick.roundNumber]) {
        rounds[pick.roundNumber] = []
      }
      rounds[pick.roundNumber].push(pick)
    })
    return rounds
  }, [visiblePicks])

  const handlePlayPause = () => {
    if (currentTurn >= enrichedPicks.length - 1) {
      setCurrentTurn(0)
      setIsPlaying(true)
    } else {
      setIsPlaying(!isPlaying)
    }
  }

  const handleSkipBack = () => {
    setCurrentTurn(Math.max(0, currentTurn - 1))
    setIsPlaying(false)
  }

  const handleSkipForward = () => {
    setCurrentTurn(Math.min(enrichedPicks.length - 1, currentTurn + 1))
    setIsPlaying(false)
  }

  const handleReset = () => {
    setCurrentTurn(0)
    setIsPlaying(false)
  }

  const handleSliderChange = (values: number[]) => {
    setCurrentTurn(values[0])
    setIsPlaying(false)
  }

  if (enrichedPicks.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center h-64 text-center">
          <Play className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            No picks to replay
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-600 mt-1">
            Draft replay will be available after picks are made
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Current Pick Highlight */}
      {currentPick && currentPokemon && (
        <Card className="border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-900/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-6">
              <img
                src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${currentPokemon.id}.png`}
                alt={currentPokemon.name}
                className="w-24 h-24 pixelated"
              />

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">
                    Pick #{currentPick.pickOrder}
                  </Badge>
                  <Badge variant="outline">
                    Round {currentPick.roundNumber}
                  </Badge>
                  <Badge variant="outline">
                    Pick {currentPick.pickInRound}/{teams.length}
                  </Badge>
                </div>

                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {currentPokemon.name}
                </h3>

                <p className="text-slate-600 dark:text-slate-400 mb-2">
                  Picked by <span className="font-medium">{currentPick.teamName}</span>
                </p>

                <div className="flex gap-2">
                  {currentPokemon.types.map(type => (
                    <Badge key={type.name} variant="secondary">
                      {type.name}
                    </Badge>
                  ))}
                </div>

                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Cost: {currentPick.cost} • BST: {currentPokemon.stats.total}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Timeline Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>Turn {currentTurn + 1} / {enrichedPicks.length}</span>
                <span>Round {currentPick?.roundNumber || 1}</span>
              </div>

              <Slider
                value={[currentTurn]}
                onValueChange={handleSliderChange}
                max={enrichedPicks.length - 1}
                step={1}
                className="cursor-pointer"
              />
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleReset}
                disabled={currentTurn === 0}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleSkipBack}
                disabled={currentTurn === 0}
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                variant="default"
                size="icon"
                onClick={handlePlayPause}
                className="h-10 w-10"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleSkipForward}
                disabled={currentTurn >= enrichedPicks.length - 1}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            {/* Speed Control */}
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Speed:</span>
              {[0.5, 1, 2].map(speed => (
                <Button
                  key={speed}
                  variant={playbackSpeed === 1000 / speed ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlaybackSpeed(1000 / speed)}
                >
                  {speed}x
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Round-by-Round Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Draft Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(picksByRound)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([round, roundPicks]) => (
                <div key={round}>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
                    Round {round}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {roundPicks.map(pick => {
                      const pickPokemon = pokemon.find(p => p.id === pick.pokemonId)
                      const isCurrent = pick.pickOrder === currentPick?.pickOrder

                      return (
                        <button
                          key={pick.id}
                          onClick={() => {
                            setCurrentTurn(pick.pickOrder - 1)
                            setIsPlaying(false)
                          }}
                          className={cn(
                            'p-2 rounded-lg border-2 transition-all hover:shadow-md',
                            isCurrent
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                          )}
                        >
                          {pickPokemon && (
                            <>
                              <img
                                src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pickPokemon.id}.png`}
                                alt={pickPokemon.name}
                                className="w-12 h-12 mx-auto pixelated"
                              />
                              <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate mt-1">
                                {pickPokemon.name}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {pick.teamName}
                              </div>
                            </>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
