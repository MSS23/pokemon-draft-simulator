'use client'

/**
 * Match Recorder Modal Component
 *
 * Records match results with Pokemon-level tracking:
 * - Game-by-game score entry (best of 1/3/5)
 * - Per-game Pokemon KO tracking
 * - KO counter per Pokemon per game
 * - Dual-confirmation: both teams submit independently
 */

import { useState, useEffect, useMemo, memo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LeagueService } from '@/lib/league-service'
import { MatchKOService } from '@/lib/match-ko-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('MatchRecorderModal')
import { Loader2, Trophy, AlertTriangle, Plus, Minus, Clock, CheckCircle2, XCircle } from 'lucide-react'
import type { Match, Team, Pick } from '@/types'

interface MatchRecorderModalProps {
  isOpen: boolean
  onClose: () => void
  match: Match & { homeTeam: Team; awayTeam: Team }
  homeTeamPicks: Pick[]
  awayTeamPicks: Pick[]
  onSuccess: () => void
  currentUserTeamId?: string | null
}

interface GameResult {
  gameNumber: number
  homeScore: number
  awayScore: number
  winnerTeamId: string | null
  isDnf?: boolean
}

interface PokemonKO {
  pickId: string
  pokemonId: string
  pokemonName: string
  koCount: number
  isDeath: boolean
}

/** Per-game KO data for both teams */
interface GameKOData {
  home: PokemonKO[]
  away: PokemonKO[]
}

export const MatchRecorderModal = memo(function MatchRecorderModal({
  isOpen,
  onClose,
  match,
  homeTeamPicks,
  awayTeamPicks,
  onSuccess,
  currentUserTeamId,
}: MatchRecorderModalProps) {
  const [currentStep, setCurrentStep] = useState<'games' | 'kos' | 'confirm'>('games')
  const [games, setGames] = useState<GameResult[]>([])
  // Per-game KO tracking: gameNumber -> { home: KO[], away: KO[] }
  const [gameKOs, setGameKOs] = useState<Record<number, GameKOData>>({})
  const [activeGame, setActiveGame] = useState<number>(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submissionResult, setSubmissionResult] = useState<'pending' | 'confirmed' | 'disputed' | null>(null)

  const totalGames = match.battleFormat === 'best_of_1' ? 1 : match.battleFormat === 'best_of_3' ? 3 : 5
  const winsNeeded = match.battleFormat === 'best_of_1' ? 1 : match.battleFormat === 'best_of_3' ? 2 : 3

  const isUserInMatch = currentUserTeamId === match.homeTeamId || currentUserTeamId === match.awayTeamId
  const userSide = currentUserTeamId === match.homeTeamId ? 'home' : currentUserTeamId === match.awayTeamId ? 'away' : null

  // Games that were actually played (not DNF)
  const playedGames = useMemo(() => games.filter(g => !g.isDnf && g.winnerTeamId !== null), [games])

  useEffect(() => {
    if (games.length === 0) {
      const initialGames: GameResult[] = []
      for (let i = 0; i < totalGames; i++) {
        initialGames.push({
          gameNumber: i + 1,
          homeScore: 0,
          awayScore: 0,
          winnerTeamId: null,
        })
      }
      setGames(initialGames)
    }
  }, [totalGames, games.length])

  // Initialize gameKOs when entering KO step
  useEffect(() => {
    if (currentStep === 'kos' && playedGames.length > 0) {
      setGameKOs(prev => {
        const updated = { ...prev }
        for (const game of playedGames) {
          if (!updated[game.gameNumber]) {
            updated[game.gameNumber] = { home: [], away: [] }
          }
        }
        // Set active game to first played game
        setActiveGame(playedGames[0].gameNumber)
        return updated
      })
    }
  }, [currentStep, playedGames])

  const updateGameWinner = (gameIndex: number, winnerId: string | null) => {
    const updated = [...games]
    updated[gameIndex].winnerTeamId = winnerId
    updated[gameIndex].isDnf = false

    // Count wins up through this game
    const homeWins = updated.slice(0, gameIndex + 1).filter(g => g.winnerTeamId === match.homeTeamId && !g.isDnf).length
    const awayWins = updated.slice(0, gameIndex + 1).filter(g => g.winnerTeamId === match.awayTeamId && !g.isDnf).length
    const seriesClinched = homeWins >= winsNeeded || awayWins >= winsNeeded

    // Auto-DNF remaining games if series is clinched, clear DNF if not
    for (let i = gameIndex + 1; i < updated.length; i++) {
      if (seriesClinched) {
        updated[i].winnerTeamId = null
        updated[i].isDnf = true
      } else {
        updated[i].isDnf = false
      }
    }

    setGames(updated)
  }

  const calculateMatchWinner = (): string | null => {
    const homeWins = games.filter(g => g.winnerTeamId === match.homeTeamId && !g.isDnf).length
    const awayWins = games.filter(g => g.winnerTeamId === match.awayTeamId && !g.isDnf).length

    if (homeWins >= winsNeeded) return match.homeTeamId
    if (awayWins >= winsNeeded) return match.awayTeamId
    if (homeWins > awayWins) return match.homeTeamId
    if (awayWins > homeWins) return match.awayTeamId
    return null
  }

  const addPokemonKO = (gameNumber: number, teamType: 'home' | 'away', pick: Pick) => {
    setGameKOs(prev => {
      const gameData = prev[gameNumber] || { home: [], away: [] }
      const kos = gameData[teamType]

      const existing = kos.find(ko => ko.pickId === pick.id)
      const updatedKOs = existing
        ? kos.map(ko => ko.pickId === pick.id ? { ...ko, koCount: ko.koCount + 1 } : ko)
        : [...kos, {
            pickId: pick.id,
            pokemonId: pick.pokemonId,
            pokemonName: pick.pokemonName,
            koCount: 1,
            isDeath: false,
          }]

      return {
        ...prev,
        [gameNumber]: { ...gameData, [teamType]: updatedKOs },
      }
    })
  }

  const removePokemonKO = (gameNumber: number, teamType: 'home' | 'away', pickId: string) => {
    setGameKOs(prev => {
      const gameData = prev[gameNumber] || { home: [], away: [] }
      const kos = gameData[teamType]

      const existing = kos.find(ko => ko.pickId === pickId)
      const updatedKOs = existing && existing.koCount > 1
        ? kos.map(ko => ko.pickId === pickId ? { ...ko, koCount: ko.koCount - 1 } : ko)
        : kos.filter(ko => ko.pickId !== pickId)

      return {
        ...prev,
        [gameNumber]: { ...gameData, [teamType]: updatedKOs },
      }
    })
  }

  /** Count total KOs across all games for a team */
  const getTotalKOCount = (teamType: 'home' | 'away'): number => {
    let total = 0
    for (const gn of Object.keys(gameKOs)) {
      const data = gameKOs[Number(gn)]
      if (data) {
        total += data[teamType].reduce((sum, ko) => sum + ko.koCount, 0)
      }
    }
    return total
  }

  const handleSubmit = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      const matchWinner = calculateMatchWinner()
      const homeScore = games.filter(g => g.winnerTeamId === match.homeTeamId && !g.isDnf).length
      const awayScore = games.filter(g => g.winnerTeamId === match.awayTeamId && !g.isDnf).length

      if (isUserInMatch && currentUserTeamId) {
        // Dual-confirmation: submit from this team's perspective
        const result = await LeagueService.submitMatchResult(match.id, currentUserTeamId, {
          homeScore,
          awayScore,
          winnerTeamId: matchWinner,
        })

        setSubmissionResult(result.status)

        // If confirmed (both teams agreed), also record KOs
        if (result.status === 'confirmed') {
          await recordKOs(matchWinner)
          onSuccess()
        }

        // If pending, just close - they'll see the status on the fixture
        if (result.status === 'pending') {
          return
        }

        if (result.status === 'disputed') {
          return
        }
      } else {
        // No user team context (admin/spectator) - direct update
        const homeScore = games.filter(g => g.winnerTeamId === match.homeTeamId && !g.isDnf).length
        const awayScore = games.filter(g => g.winnerTeamId === match.awayTeamId && !g.isDnf).length
        await LeagueService.updateMatchResult(match.id, {
          homeScore,
          awayScore,
          winnerTeamId: matchWinner,
          status: 'completed',
        })
        await recordKOs(matchWinner)
        onSuccess()
        onClose()
      }
    } catch (err) {
      log.error('Failed to record match:', err)
      setError(err instanceof Error ? err.message : 'Failed to record match')
    } finally {
      setIsSubmitting(false)
    }
  }

  const recordKOs = async (matchWinner: string | null) => {
    // Record KOs per game with correct game_number
    for (const game of playedGames) {
      const data = gameKOs[game.gameNumber]
      if (!data) continue

      for (const ko of data.home) {
        await MatchKOService.recordPokemonKO(
          match.id,
          game.gameNumber,
          ko.pickId,
          ko.koCount,
          ko.isDeath
        )
      }

      for (const ko of data.away) {
        await MatchKOService.recordPokemonKO(
          match.id,
          game.gameNumber,
          ko.pickId,
          ko.koCount,
          ko.isDeath
        )
      }
    }

    // Update match stats for all picks
    const allPicks = [...homeTeamPicks, ...awayTeamPicks]
    for (const pick of allPicks) {
      const wasOnWinningTeam = pick.teamId === matchWinner
      await MatchKOService.updatePokemonMatchStats(pick.id, wasOnWinningTeam)
    }
  }

  const canProceedToKOs = games.every(g => g.winnerTeamId !== null || g.isDnf)
  const matchWinner = calculateMatchWinner()

  /** Render KO section for a single game */
  const renderGameKOSection = (gameNumber: number) => {
    const data = gameKOs[gameNumber] || { home: [], away: [] }
    const gameResult = games.find(g => g.gameNumber === gameNumber)
    const gameWinner = gameResult?.winnerTeamId === match.homeTeamId
      ? match.homeTeam.name
      : match.awayTeam.name

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Winner: {gameWinner}
          </Badge>
        </div>

        {/* Home Team KOs */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">{match.homeTeam.name}</CardTitle>
            <CardDescription className="text-xs">Pokemon that fainted in Game {gameNumber}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              {homeTeamPicks.map(pick => (
                <Button
                  key={pick.id}
                  variant="outline"
                  size="sm"
                  onClick={() => addPokemonKO(gameNumber, 'home', pick)}
                  className="justify-start text-xs h-8"
                >
                  <Plus className="h-3 w-3 mr-1 shrink-0" />
                  <span className="truncate">{pick.pokemonName}</span>
                </Button>
              ))}
            </div>

            {data.home.length > 0 && (
              <div className="space-y-1 pt-2 border-t">
                {data.home.map(ko => (
                  <div key={ko.pickId} className="flex items-center justify-between p-1.5 bg-muted rounded-md">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{ko.pokemonName}</span>
                      <Badge variant="secondary" className="text-xs">x{ko.koCount}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removePokemonKO(gameNumber, 'home', ko.pickId)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Away Team KOs */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">{match.awayTeam.name}</CardTitle>
            <CardDescription className="text-xs">Pokemon that fainted in Game {gameNumber}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              {awayTeamPicks.map(pick => (
                <Button
                  key={pick.id}
                  variant="outline"
                  size="sm"
                  onClick={() => addPokemonKO(gameNumber, 'away', pick)}
                  className="justify-start text-xs h-8"
                >
                  <Plus className="h-3 w-3 mr-1 shrink-0" />
                  <span className="truncate">{pick.pokemonName}</span>
                </Button>
              ))}
            </div>

            {data.away.length > 0 && (
              <div className="space-y-1 pt-2 border-t">
                {data.away.map(ko => (
                  <div key={ko.pickId} className="flex items-center justify-between p-1.5 bg-muted rounded-md">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{ko.pokemonName}</span>
                      <Badge variant="secondary" className="text-xs">x{ko.koCount}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removePokemonKO(gameNumber, 'away', ko.pickId)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Record Match Result
          </DialogTitle>
          <DialogDescription>
            {match.homeTeam.name} vs {match.awayTeam.name} - Week {match.weekNumber}
            {userSide && (
              <Badge variant="secondary" className="ml-2">
                You are {userSide === 'home' ? match.homeTeam.name : match.awayTeam.name}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {/* Submission Result State */}
          {submissionResult && (
            <div className="py-4 space-y-4">
              {submissionResult === 'pending' && (
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Result submitted!</strong> Waiting for your opponent to submit their result.
                    Once both teams submit matching results, the match will be automatically confirmed.
                  </AlertDescription>
                </Alert>
              )}
              {submissionResult === 'confirmed' && (
                <Alert className="border-green-500 dark:border-green-700 bg-green-50 dark:bg-green-950/20">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription>
                    <strong>Match confirmed!</strong> Both teams submitted matching results.
                    The match has been recorded.
                  </AlertDescription>
                </Alert>
              )}
              {submissionResult === 'disputed' && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Results disputed!</strong> Your submission doesn&apos;t match your opponent&apos;s.
                    Please coordinate with your opponent to resolve the discrepancy.
                  </AlertDescription>
                </Alert>
              )}
              <Button onClick={onClose} className="w-full">
                {submissionResult === 'confirmed' ? 'Done' : 'Close'}
              </Button>
            </div>
          )}

          {/* Step 1: Game Results */}
          {!submissionResult && currentStep === 'games' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Game Results</h3>
                <Badge>{match.battleFormat.replace('_', ' ')}</Badge>
              </div>

              {games.map((game, index) => (
                <Card key={game.gameNumber} className={game.isDnf ? 'opacity-50' : ''}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      Game {game.gameNumber}
                      {game.isDnf && (
                        <Badge variant="secondary" className="text-xs">DNF - Series decided</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  {!game.isDnf && (
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
                  )}
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

          {/* Step 2: Per-Game Pokemon KOs */}
          {!submissionResult && currentStep === 'kos' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Pokemon Knockouts</h3>
                <Badge variant="outline">
                  {getTotalKOCount('home') + getTotalKOCount('away')} total KOs
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                Record which Pokemon were KO&apos;d in each game.
              </p>

              {/* Game tabs */}
              {playedGames.length > 1 && (
                <div className="flex gap-1.5">
                  {playedGames.map(game => {
                    const data = gameKOs[game.gameNumber]
                    const gameKOCount = data
                      ? data.home.reduce((s, k) => s + k.koCount, 0) + data.away.reduce((s, k) => s + k.koCount, 0)
                      : 0
                    return (
                      <Button
                        key={game.gameNumber}
                        variant={activeGame === game.gameNumber ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setActiveGame(game.gameNumber)}
                        className="flex-1"
                      >
                        Game {game.gameNumber}
                        {gameKOCount > 0 && (
                          <Badge
                            variant={activeGame === game.gameNumber ? 'secondary' : 'default'}
                            className="ml-1.5 h-5 min-w-5 px-1 text-xs"
                          >
                            {gameKOCount}
                          </Badge>
                        )}
                      </Button>
                    )
                  })}
                </div>
              )}

              {/* Active game KO section */}
              {renderGameKOSection(playedGames.length === 1 ? playedGames[0].gameNumber : activeGame)}
            </div>
          )}

          {/* Step 3: Confirmation */}
          {!submissionResult && currentStep === 'confirm' && (
            <div className="space-y-4 py-4">
              <h3 className="text-lg font-semibold">Confirm Match Result</h3>

              {isUserInMatch && (
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    Your opponent will also need to submit their result. If both results match,
                    the match will be automatically confirmed.
                  </AlertDescription>
                </Alert>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Match Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{match.homeTeam.name}</div>
                      <div className="text-4xl font-bold my-2">
                        {games.filter(g => g.winnerTeamId === match.homeTeamId && !g.isDnf).length}
                      </div>
                      {matchWinner === match.homeTeamId && (
                        <Badge className="mt-2">Winner</Badge>
                      )}
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{match.awayTeam.name}</div>
                      <div className="text-4xl font-bold my-2">
                        {games.filter(g => g.winnerTeamId === match.awayTeamId && !g.isDnf).length}
                      </div>
                      {matchWinner === match.awayTeamId && (
                        <Badge className="mt-2">Winner</Badge>
                      )}
                    </div>
                  </div>
                  {games.some(g => g.isDnf) && (
                    <p className="text-sm text-muted-foreground text-center">
                      Game{games.filter(g => g.isDnf).length > 1 ? 's' : ''}{' '}
                      {games.filter(g => g.isDnf).map(g => g.gameNumber).join(', ')}{' '}
                      not played (series decided)
                    </p>
                  )}

                  {/* Per-game KO summary */}
                  {playedGames.some(g => {
                    const d = gameKOs[g.gameNumber]
                    return d && (d.home.length > 0 || d.away.length > 0)
                  }) && (
                    <div className="border-t pt-4 mt-4 space-y-3">
                      <Label className="text-sm font-semibold block">Pokemon Knockouts:</Label>
                      {playedGames.map(game => {
                        const data = gameKOs[game.gameNumber]
                        if (!data || (data.home.length === 0 && data.away.length === 0)) return null
                        return (
                          <div key={game.gameNumber} className="space-y-1">
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Game {game.gameNumber}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                {data.home.length > 0 ? data.home.map(ko => (
                                  <div key={ko.pickId} className="text-sm py-0.5">
                                    {ko.pokemonName} <span className="text-muted-foreground">x{ko.koCount}</span>
                                  </div>
                                )) : (
                                  <div className="text-sm text-muted-foreground">No KOs</div>
                                )}
                              </div>
                              <div>
                                {data.away.length > 0 ? data.away.map(ko => (
                                  <div key={ko.pickId} className="text-sm py-0.5">
                                    {ko.pokemonName} <span className="text-muted-foreground">x{ko.koCount}</span>
                                  </div>
                                )) : (
                                  <div className="text-sm text-muted-foreground">No KOs</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
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

        {!submissionResult && (
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
                    ) : isUserInMatch ? (
                      'Submit My Result'
                    ) : (
                      'Submit Result'
                    )}
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
})
