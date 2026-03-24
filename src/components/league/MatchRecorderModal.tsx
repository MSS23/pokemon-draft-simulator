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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LeagueService } from '@/lib/league-service'
import { MatchKOService } from '@/lib/match-ko-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('MatchRecorderModal')
import { Loader2, Trophy, AlertTriangle, Clock, CheckCircle2, XCircle, Plus, Minus, Swords, Skull } from 'lucide-react'
import { PokemonSprite } from '@/components/ui/pokemon-sprite'
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
  faintedCount: number
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

  const totalGames = match.battleFormat === 'best_of_1' ? 1 : 3
  const winsNeeded = match.battleFormat === 'best_of_1' ? 1 : 2

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

  // 4v4 VGC: each side brings 4 Pokemon
  const TEAM_SIZE = 4

  /** Update a stat (koCount or faintedCount) for a Pokemon in a specific game */
  const updatePokemonStat = (
    gameNumber: number,
    teamType: 'home' | 'away',
    pick: Pick,
    field: 'koCount' | 'faintedCount',
    value: number
  ) => {
    // Per-Pokemon caps: max 4 KOs (opponent has 4 mons), max 1 death (binary)
    const maxValue = field === 'faintedCount' ? 1 : TEAM_SIZE
    const clamped = Math.max(0, Math.min(value, maxValue))

    setGameKOs(prev => {
      const gameData = prev[gameNumber] || { home: [], away: [] }
      const kos = gameData[teamType]

      // Check team total cap before allowing increase
      if (clamped > 0) {
        const currentTotal = kos
          .filter(ko => ko.pickId !== pick.id)
          .reduce((sum, ko) => sum + ko[field], 0)
        if (currentTotal + clamped > TEAM_SIZE) {
          // Would exceed team cap of 4 — clamp to remaining room
          const remaining = Math.max(0, TEAM_SIZE - currentTotal)
          if (remaining === 0) return prev
          return applyStatUpdate(prev, gameNumber, gameData, teamType, kos, pick, field, remaining)
        }
      }

      return applyStatUpdate(prev, gameNumber, gameData, teamType, kos, pick, field, clamped)
    })
  }

  /** Inner helper to apply the stat update (avoids duplication) */
  const applyStatUpdate = (
    prev: Record<number, GameKOData>,
    gameNumber: number,
    gameData: GameKOData,
    teamType: 'home' | 'away',
    kos: PokemonKO[],
    pick: Pick,
    field: 'koCount' | 'faintedCount',
    clamped: number
  ) => {
    const existing = kos.find(ko => ko.pickId === pick.id)
    if (existing) {
      const updated = kos.map(ko =>
        ko.pickId === pick.id ? { ...ko, [field]: clamped } : ko
      )
      const cleaned = updated.filter(ko => ko.koCount > 0 || ko.faintedCount > 0)
      return { ...prev, [gameNumber]: { ...gameData, [teamType]: cleaned } }
    } else if (clamped > 0) {
      return {
        ...prev,
        [gameNumber]: {
          ...gameData,
          [teamType]: [...kos, {
            pickId: pick.id,
            pokemonId: pick.pokemonId,
            pokemonName: pick.pokemonName,
            koCount: field === 'koCount' ? clamped : 0,
            faintedCount: field === 'faintedCount' ? clamped : 0,
            isDeath: false,
          }],
        },
      }
    }
    return prev
  }

  /** Get a Pokemon's current stat value for a game */
  const getStatValue = (gameNumber: number, teamType: 'home' | 'away', pickId: string, field: 'koCount' | 'faintedCount'): number => {
    const data = gameKOs[gameNumber]
    if (!data) return 0
    const ko = data[teamType].find(k => k.pickId === pickId)
    return ko ? ko[field] : 0
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

  /** Count total faints across all games for a team */
  const getTotalFaintedCount = (teamType: 'home' | 'away'): number => {
    let total = 0
    for (const gn of Object.keys(gameKOs)) {
      const data = gameKOs[Number(gn)]
      if (data) {
        total += data[teamType].reduce((sum, ko) => sum + ko.faintedCount, 0)
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

  /** Validate KO data for all played games. Returns array of error strings. */
  const validateKOs = (): string[] => {
    const errors: string[] = []

    for (const game of playedGames) {
      const data = gameKOs[game.gameNumber]
      const gn = game.gameNumber
      const homeKills = data ? data.home.reduce((s, k) => s + k.koCount, 0) : 0
      const homeDeaths = data ? data.home.reduce((s, k) => s + k.faintedCount, 0) : 0
      const awayKills = data ? data.away.reduce((s, k) => s + k.koCount, 0) : 0
      const awayDeaths = data ? data.away.reduce((s, k) => s + k.faintedCount, 0) : 0

      // Must have some KO data entered
      if (homeKills === 0 && awayKills === 0 && homeDeaths === 0 && awayDeaths === 0) {
        errors.push(`Game ${gn}: No kills or deaths recorded`)
        continue
      }

      // Cross-validate: home team kills = away team deaths (and vice versa)
      if (homeKills !== awayDeaths) {
        errors.push(`Game ${gn}: ${match.homeTeam.name} kills (${homeKills}) must equal ${match.awayTeam.name} deaths (${awayDeaths})`)
      }
      if (awayKills !== homeDeaths) {
        errors.push(`Game ${gn}: ${match.awayTeam.name} kills (${awayKills}) must equal ${match.homeTeam.name} deaths (${homeDeaths})`)
      }

      // Losing team must have all 4 Pokemon fainted
      const loserIsHome = game.winnerTeamId === match.awayTeamId
      const loserDeaths = loserIsHome ? homeDeaths : awayDeaths
      const loserName = loserIsHome ? match.homeTeam.name : match.awayTeam.name
      if (loserDeaths !== TEAM_SIZE) {
        errors.push(`Game ${gn}: Losing team (${loserName}) must have exactly ${TEAM_SIZE} deaths`)
      }

      // Winner can't have all 4 fainted (they won)
      const winnerDeaths = loserIsHome ? awayDeaths : homeDeaths
      if (winnerDeaths >= TEAM_SIZE) {
        errors.push(`Game ${gn}: Winning team can't have all ${TEAM_SIZE} Pokemon fainted`)
      }
    }

    return errors
  }

  const koErrors = currentStep === 'kos' ? validateKOs() : []
  const canProceedToConfirm = koErrors.length === 0

  /** Render a single Pokemon row with Kills and Deaths toggle counters */
  const renderPokemonRow = (pick: Pick, gameNumber: number, teamType: 'home' | 'away') => {
    const kills = getStatValue(gameNumber, teamType, pick.id, 'koCount')
    const deaths = getStatValue(gameNumber, teamType, pick.id, 'faintedCount')

    // Calculate team totals to know if we're at the cap
    const data = gameKOs[gameNumber]
    const teamKillsTotal = data ? data[teamType].reduce((s, k) => s + k.koCount, 0) : 0
    const teamDeathsTotal = data ? data[teamType].reduce((s, k) => s + k.faintedCount, 0) : 0
    const killsAtCap = kills >= TEAM_SIZE || teamKillsTotal >= TEAM_SIZE
    const deathsAtCap = deaths >= 1 || teamDeathsTotal >= TEAM_SIZE

    return (
      <div key={pick.id} className="flex items-center gap-2 sm:gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
        <PokemonSprite
          pokemonId={pick.pokemonId}
          pokemonName={pick.pokemonName}
          className="w-9 h-9 object-contain shrink-0"
          lazy={false}
        />
        <span className="text-sm font-medium capitalize min-w-0 truncate flex-1">{pick.pokemonName}</span>

        {/* Kills Counter */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-green-300 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950 disabled:opacity-30"
            onClick={() => updatePokemonStat(gameNumber, teamType, pick, 'koCount', kills - 1)}
            disabled={kills === 0}
          >
            <Minus className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          </Button>
          <div className="w-9 h-8 flex items-center justify-center rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800">
            <span className={`text-sm font-bold ${kills > 0 ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'}`}>
              {kills}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-green-300 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900 disabled:opacity-30"
            onClick={() => updatePokemonStat(gameNumber, teamType, pick, 'koCount', kills + 1)}
            disabled={killsAtCap}
          >
            <Plus className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          </Button>
        </div>

        {/* Deaths Counter */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-30"
            onClick={() => updatePokemonStat(gameNumber, teamType, pick, 'faintedCount', deaths - 1)}
            disabled={deaths === 0}
          >
            <Minus className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
          </Button>
          <div className="w-9 h-8 flex items-center justify-center rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
            <span className={`text-sm font-bold ${deaths > 0 ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
              {deaths}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900 disabled:opacity-30"
            onClick={() => updatePokemonStat(gameNumber, teamType, pick, 'faintedCount', deaths + 1)}
            disabled={deathsAtCap}
          >
            <Plus className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
          </Button>
        </div>
      </div>
    )
  }

  /** Get kills/deaths totals for a team in a specific game */
  const getGameTeamTotals = (gameNumber: number, teamType: 'home' | 'away') => {
    const data = gameKOs[gameNumber]
    if (!data) return { kills: 0, deaths: 0 }
    const side = data[teamType]
    return {
      kills: side.reduce((sum, ko) => sum + ko.koCount, 0),
      deaths: side.reduce((sum, ko) => sum + ko.faintedCount, 0),
    }
  }

  /** Render KO section for a single game */
  const renderGameKOSection = (gameNumber: number) => {
    const gameResult = games.find(g => g.gameNumber === gameNumber)
    const gameWinner = gameResult?.winnerTeamId === match.homeTeamId
      ? match.homeTeam.name
      : match.awayTeam.name
    const homeTotals = getGameTeamTotals(gameNumber, 'home')
    const awayTotals = getGameTeamTotals(gameNumber, 'away')

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Winner: {gameWinner}
          </Badge>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-2 sm:gap-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="w-9 shrink-0" />
          <div className="flex-1">Pokemon</div>
          <div className="w-[104px] text-center flex items-center justify-center gap-1">
            <Swords className="h-3 w-3" /> Kills
          </div>
          <div className="w-[104px] text-center flex items-center justify-center gap-1">
            <Skull className="h-3 w-3" /> Deaths
          </div>
        </div>

        {/* Home Team */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold">{match.homeTeam.name}</h4>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-600 dark:text-green-400 font-medium">{homeTotals.kills} kills</span>
              <span className="text-red-600 dark:text-red-400 font-medium">{homeTotals.deaths} deaths</span>
            </div>
          </div>
          <div className="space-y-0.5 border rounded-lg p-1">
            {homeTeamPicks.map(pick => renderPokemonRow(pick, gameNumber, 'home'))}
          </div>
        </div>

        {/* Away Team */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold">{match.awayTeam.name}</h4>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-600 dark:text-green-400 font-medium">{awayTotals.kills} kills</span>
              <span className="text-red-600 dark:text-red-400 font-medium">{awayTotals.deaths} deaths</span>
            </div>
          </div>
          <div className="space-y-0.5 border rounded-lg p-1">
            {awayTeamPicks.map(pick => renderPokemonRow(pick, gameNumber, 'away'))}
          </div>
        </div>
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
                <h3 className="text-lg font-semibold">Pokemon Stats</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-green-300 dark:border-green-800 text-green-700 dark:text-green-300">
                    <Swords className="h-3 w-3 mr-1" />
                    {getTotalKOCount('home') + getTotalKOCount('away')} Kills
                  </Badge>
                  <Badge variant="outline" className="border-red-300 dark:border-red-800 text-red-700 dark:text-red-300">
                    <Skull className="h-3 w-3 mr-1" />
                    {getTotalFaintedCount('home') + getTotalFaintedCount('away')} Deaths
                  </Badge>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Track kills and deaths for each Pokemon. Use the <span className="text-green-600 dark:text-green-400 font-medium">+/-</span> buttons to adjust.
              </p>

              <p className="text-sm text-muted-foreground mb-2">
                Best of {totalGames} — Game {activeGame} of {totalGames}
              </p>

              <details className="text-xs text-muted-foreground mb-3 border rounded-lg p-2">
                <summary className="cursor-pointer font-medium">How KO tracking works</summary>
                <p className="mt-1.5 leading-relaxed">
                  Each team brings their drafted Pokemon to battle. Record which Pokemon were knocked out (KO&apos;d) in each game.
                  A Pokemon marked as KO&apos;d in all games they participated in is considered &ldquo;fainted&rdquo; for the season.
                </p>
              </details>

              {/* Game tabs */}
              {playedGames.length > 1 && (
                <div className="flex gap-1.5">
                  {playedGames.map(game => {
                    const data = gameKOs[game.gameNumber]
                    const gameKOCount = data
                      ? data.home.reduce((s, k) => s + k.koCount + k.faintedCount, 0) + data.away.reduce((s, k) => s + k.koCount + k.faintedCount, 0)
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

              {/* Validation errors */}
              {koErrors.length > 0 && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-0.5 text-sm">
                      {koErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
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
                      <Label className="text-sm font-semibold block">Pokemon Stats:</Label>
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
                                  <div key={ko.pickId} className="text-sm py-0.5 flex items-center gap-1.5">
                                    <span className="capitalize">{ko.pokemonName}</span>
                                    {ko.koCount > 0 && <Badge size="sm" variant="default" className="bg-green-600">{ko.koCount} kill{ko.koCount !== 1 ? 's' : ''}</Badge>}
                                    {ko.faintedCount > 0 && <Badge size="sm" variant="destructive">{ko.faintedCount} death{ko.faintedCount !== 1 ? 's' : ''}</Badge>}
                                  </div>
                                )) : (
                                  <div className="text-sm text-muted-foreground">No activity</div>
                                )}
                              </div>
                              <div>
                                {data.away.length > 0 ? data.away.map(ko => (
                                  <div key={ko.pickId} className="text-sm py-0.5 flex items-center gap-1.5">
                                    <span className="capitalize">{ko.pokemonName}</span>
                                    {ko.koCount > 0 && <Badge size="sm" variant="default" className="bg-green-600">{ko.koCount} kill{ko.koCount !== 1 ? 's' : ''}</Badge>}
                                    {ko.faintedCount > 0 && <Badge size="sm" variant="destructive">{ko.faintedCount} death{ko.faintedCount !== 1 ? 's' : ''}</Badge>}
                                  </div>
                                )) : (
                                  <div className="text-sm text-muted-foreground">No activity</div>
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
                  <Button onClick={() => setCurrentStep('confirm')} disabled={!canProceedToConfirm}>
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
