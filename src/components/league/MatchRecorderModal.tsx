'use client'

/**
 * Match Recorder Modal Component
 *
 * Records match results with Pokemon-level tracking:
 * - Game-by-game score entry (best of 1/3/5)
 * - Pokemon selector (which Pokemon were used)
 * - KO counter per Pokemon
 * - Death confirmation for Nuzlocke mode
 */

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LeagueService } from '@/lib/league-service'
import { MatchKOService } from '@/lib/match-ko-service'
import { PokemonStatusBadge } from './PokemonStatusBadge'
import { Loader2, Trophy, Skull, AlertTriangle, Plus, Minus } from 'lucide-react'
import type { Match, Team, Pick, ExtendedLeagueSettings } from '@/types'

interface MatchRecorderModalProps {
  isOpen: boolean
  onClose: () => void
  match: Match & { homeTeam: Team; awayTeam: Team }
  homeTeamPicks: Pick[]
  awayTeamPicks: Pick[]
  leagueSettings: ExtendedLeagueSettings
  onSuccess: () => void
}

interface GameResult {
  gameNumber: number
  homeScore: number
  awayScore: number
  winnerTeamId: string | null
}

interface PokemonKO {
  pickId: string
  pokemonId: string
  pokemonName: string
  koCount: number
  isDeath: boolean
}

export function MatchRecorderModal({
  isOpen,
  onClose,
  match,
  homeTeamPicks,
  awayTeamPicks,
  leagueSettings,
  onSuccess,
}: MatchRecorderModalProps) {
  const [currentStep, setCurrentStep] = useState<'games' | 'kos' | 'confirm'>('games')
  const [games, setGames] = useState<GameResult[]>([])
  const [homeKOs, setHomeKOs] = useState<PokemonKO[]>([])
  const [awayKOs, setAwayKOs] = useState<PokemonKO[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gamesRequired = match.battleFormat === 'best_of_1' ? 1 : match.battleFormat === 'best_of_3' ? 2 : 3

  useEffect(() => {
    // Initialize games array
    if (games.length === 0) {
      const initialGames: GameResult[] = []
      for (let i = 0; i < gamesRequired; i++) {
        initialGames.push({
          gameNumber: i + 1,
          homeScore: 0,
          awayScore: 0,
          winnerTeamId: null,
        })
      }
      setGames(initialGames)
    }
  }, [gamesRequired, games.length])

  const updateGameWinner = (gameIndex: number, winnerId: string | null) => {
    const updated = [...games]
    updated[gameIndex].winnerTeamId = winnerId
    setGames(updated)
  }

  const calculateMatchWinner = (): string | null => {
    const homeWins = games.filter(g => g.winnerTeamId === match.homeTeamId).length
    const awayWins = games.filter(g => g.winnerTeamId === match.awayTeamId).length

    if (homeWins > awayWins) return match.homeTeamId
    if (awayWins > homeWins) return match.awayTeamId
    return null
  }

  const addPokemonKO = (teamType: 'home' | 'away', pick: Pick) => {
    const setKOs = teamType === 'home' ? setHomeKOs : setAwayKOs
    const kos = teamType === 'home' ? homeKOs : awayKOs

    const existing = kos.find(ko => ko.pickId === pick.id)
    if (existing) {
      setKOs(kos.map(ko =>
        ko.pickId === pick.id
          ? { ...ko, koCount: ko.koCount + 1 }
          : ko
      ))
    } else {
      setKOs([...kos, {
        pickId: pick.id,
        pokemonId: pick.pokemonId,
        pokemonName: pick.pokemonName,
        koCount: 1,
        isDeath: false,
      }])
    }
  }

  const removePokemonKO = (teamType: 'home' | 'away', pickId: string) => {
    const setKOs = teamType === 'home' ? setHomeKOs : setAwayKOs
    const kos = teamType === 'home' ? homeKOs : awayKOs

    const existing = kos.find(ko => ko.pickId === pickId)
    if (existing && existing.koCount > 1) {
      setKOs(kos.map(ko =>
        ko.pickId === pickId
          ? { ...ko, koCount: ko.koCount - 1 }
          : ko
      ))
    } else {
      setKOs(kos.filter(ko => ko.pickId !== pickId))
    }
  }

  const toggleDeath = (teamType: 'home' | 'away', pickId: string) => {
    const setKOs = teamType === 'home' ? setHomeKOs : setAwayKOs
    const kos = teamType === 'home' ? homeKOs : awayKOs

    setKOs(kos.map(ko =>
      ko.pickId === pickId
        ? { ...ko, isDeath: !ko.isDeath }
        : ko
    ))
  }

  const handleSubmit = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      const matchWinner = calculateMatchWinner()
      const homeScore = games.filter(g => g.winnerTeamId === match.homeTeamId).length
      const awayScore = games.filter(g => g.winnerTeamId === match.awayTeamId).length

      // Update match result
      await LeagueService.updateMatchResult(match.id, {
        homeScore,
        awayScore,
        winnerTeamId: matchWinner,
        status: 'completed',
      })

      // Record all KOs for home team
      for (const ko of homeKOs) {
        for (const game of games) {
          await MatchKOService.recordPokemonKO(
            match.id,
            game.gameNumber,
            ko.pickId,
            ko.koCount,
            ko.isDeath
          )
        }
      }

      // Record all KOs for away team
      for (const ko of awayKOs) {
        for (const game of games) {
          await MatchKOService.recordPokemonKO(
            match.id,
            game.gameNumber,
            ko.pickId,
            ko.koCount,
            ko.isDeath
          )
        }
      }

      // Update Pokemon match stats
      const allPicks = [...homeTeamPicks, ...awayTeamPicks]
      for (const pick of allPicks) {
        const wasOnWinningTeam = pick.teamId === matchWinner
        await MatchKOService.updatePokemonMatchStats(pick.id, wasOnWinningTeam)
      }

      onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to record match:', err)
      setError(err instanceof Error ? err.message : 'Failed to record match')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canProceedToKOs = games.every(g => g.winnerTeamId !== null)
  const matchWinner = calculateMatchWinner()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Record Match Result
          </DialogTitle>
          <DialogDescription>
            {match.homeTeam.name} vs {match.awayTeam.name} - Week {match.weekNumber}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {/* Step 1: Game Results */}
          {currentStep === 'games' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Game Results</h3>
                <Badge>{match.battleFormat.replace('_', ' ')}</Badge>
              </div>

              {games.map((game, index) => (
                <Card key={game.gameNumber}>
                  <CardHeader>
                    <CardTitle className="text-base">Game {game.gameNumber}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <Button
                        variant={game.winnerTeamId === match.homeTeamId ? 'default' : 'outline'}
                        onClick={() => updateGameWinner(index, match.homeTeamId)}
                        className="w-full"
                      >
                        {match.homeTeam.name}
                        {game.winnerTeamId === match.homeTeamId && (
                          <Trophy className="ml-2 h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant={game.winnerTeamId === match.awayTeamId ? 'default' : 'outline'}
                        onClick={() => updateGameWinner(index, match.awayTeamId)}
                        className="w-full"
                      >
                        {match.awayTeam.name}
                        {game.winnerTeamId === match.awayTeamId && (
                          <Trophy className="ml-2 h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {matchWinner && (
                <Alert>
                  <Trophy className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Match Winner:</strong>{' '}
                    {matchWinner === match.homeTeamId ? match.homeTeam.name : match.awayTeam.name}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 2: Pokemon KOs */}
          {currentStep === 'kos' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Pokemon Knockouts</h3>
                {leagueSettings.enableNuzlocke && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <Skull className="h-3 w-3" />
                    Nuzlocke Mode
                  </Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                Track which Pokemon fainted during the match. In Nuzlocke mode, mark deaths as permanent.
              </p>

              {/* Home Team KOs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{match.homeTeam.name}</CardTitle>
                  <CardDescription>Add Pokemon that fainted</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {homeTeamPicks.map(pick => (
                      <Button
                        key={pick.id}
                        variant="outline"
                        size="sm"
                        onClick={() => addPokemonKO('home', pick)}
                        className="justify-start"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {pick.pokemonName}
                      </Button>
                    ))}
                  </div>

                  {homeKOs.length > 0 && (
                    <div className="space-y-2 mt-4 pt-4 border-t">
                      <Label className="text-sm font-semibold">Recorded KOs:</Label>
                      {homeKOs.map(ko => (
                        <div key={ko.pickId} className="flex items-center justify-between p-2 bg-muted rounded-md">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{ko.pokemonName}</span>
                            <Badge variant="secondary">x{ko.koCount}</Badge>
                            {ko.isDeath && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <Skull className="h-3 w-3" />
                                Death
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {leagueSettings.enableNuzlocke && (
                              <Button
                                variant={ko.isDeath ? 'destructive' : 'ghost'}
                                size="sm"
                                onClick={() => toggleDeath('home', ko.pickId)}
                              >
                                <Skull className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removePokemonKO('home', ko.pickId)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Away Team KOs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{match.awayTeam.name}</CardTitle>
                  <CardDescription>Add Pokemon that fainted</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {awayTeamPicks.map(pick => (
                      <Button
                        key={pick.id}
                        variant="outline"
                        size="sm"
                        onClick={() => addPokemonKO('away', pick)}
                        className="justify-start"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {pick.pokemonName}
                      </Button>
                    ))}
                  </div>

                  {awayKOs.length > 0 && (
                    <div className="space-y-2 mt-4 pt-4 border-t">
                      <Label className="text-sm font-semibold">Recorded KOs:</Label>
                      {awayKOs.map(ko => (
                        <div key={ko.pickId} className="flex items-center justify-between p-2 bg-muted rounded-md">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{ko.pokemonName}</span>
                            <Badge variant="secondary">x{ko.koCount}</Badge>
                            {ko.isDeath && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <Skull className="h-3 w-3" />
                                Death
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {leagueSettings.enableNuzlocke && (
                              <Button
                                variant={ko.isDeath ? 'destructive' : 'ghost'}
                                size="sm"
                                onClick={() => toggleDeath('away', ko.pickId)}
                              >
                                <Skull className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removePokemonKO('away', ko.pickId)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {currentStep === 'confirm' && (
            <div className="space-y-4 py-4">
              <h3 className="text-lg font-semibold">Confirm Match Result</h3>

              <Card>
                <CardHeader>
                  <CardTitle>Match Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{match.homeTeam.name}</div>
                      <div className="text-4xl font-bold my-2">
                        {games.filter(g => g.winnerTeamId === match.homeTeamId).length}
                      </div>
                      {matchWinner === match.homeTeamId && (
                        <Badge className="mt-2">Winner</Badge>
                      )}
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{match.awayTeam.name}</div>
                      <div className="text-4xl font-bold my-2">
                        {games.filter(g => g.winnerTeamId === match.awayTeamId).length}
                      </div>
                      {matchWinner === match.awayTeamId && (
                        <Badge className="mt-2">Winner</Badge>
                      )}
                    </div>
                  </div>

                  {(homeKOs.length > 0 || awayKOs.length > 0) && (
                    <div className="border-t pt-4 mt-4">
                      <Label className="text-sm font-semibold mb-2 block">Pokemon Knockouts:</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          {homeKOs.map(ko => (
                            <div key={ko.pickId} className="text-sm py-1">
                              {ko.pokemonName} (x{ko.koCount})
                              {ko.isDeath && <Skull className="inline h-3 w-3 ml-1 text-red-500" />}
                            </div>
                          ))}
                        </div>
                        <div>
                          {awayKOs.map(ko => (
                            <div key={ko.pickId} className="text-sm py-1">
                              {ko.pokemonName} (x{ko.koCount})
                              {ko.isDeath && <Skull className="inline h-3 w-3 ml-1 text-red-500" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {leagueSettings.enableNuzlocke && (homeKOs.some(ko => ko.isDeath) || awayKOs.some(ko => ko.isDeath)) && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Warning:</strong> This match includes permanent Pokemon deaths (Nuzlocke mode).
                        These Pokemon will be permanently removed from their teams.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <div>
              {currentStep !== 'games' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (currentStep === 'kos') setCurrentStep('games')
                    if (currentStep === 'confirm') setCurrentStep('kos')
                  }}
                  disabled={isSubmitting}
                >
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              {currentStep === 'games' && (
                <Button onClick={() => setCurrentStep('kos')} disabled={!canProceedToKOs}>
                  Next: Pokemon KOs
                </Button>
              )}
              {currentStep === 'kos' && (
                <Button onClick={() => setCurrentStep('confirm')}>
                  Next: Confirm
                </Button>
              )}
              {currentStep === 'confirm' && (
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Result'
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
