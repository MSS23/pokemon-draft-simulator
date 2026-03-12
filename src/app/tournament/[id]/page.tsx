'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KnockoutService } from '@/lib/knockout-service'
import { getFormatById } from '@/lib/formats'
import { MatchRecorderModal } from '@/components/league/MatchRecorderModal'
import { PlayoffBracket } from '@/components/league/PlayoffBracket'
import { PokemonSprite } from '@/components/ui/pokemon-sprite'
import { LoadingScreen } from '@/components/ui/loading-states'
import { buildTeamColorMap } from '@/utils/team-colors'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'
import {
  ArrowLeft, Trophy, Swords, Copy, Check, Crown,
} from 'lucide-react'
import type { League, Match, Team, Pick } from '@/types'
import type { Tournament } from '@/lib/tournament-service'

const log = createLogger('TournamentPage')

export default function TournamentPage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.id as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches] = useState<(Match & { homeTeam: Team; awayTeam: Team })[]>([])
  const [teamPicks, setTeamPicks] = useState<Record<string, Pick[]>>({})
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  // Match recorder
  const [selectedMatch, setSelectedMatch] = useState<(Match & { homeTeam: Team; awayTeam: Team }) | null>(null)
  const [homeTeamPicks, setHomeTeamPicks] = useState<Pick[]>([])
  const [awayTeamPicks, setAwayTeamPicks] = useState<Pick[]>([])

  const { user } = useAuth()

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const data = await KnockoutService.getFullTournament(tournamentId)
      if (!data) { setError('Tournament not found'); return }

      setLeague(data.league)
      setTournament(data.tournament)
      setMatches(data.matches)

      // Load team rosters
      const teamIds = data.league.teams.map(t => t.id)
      const picks = await KnockoutService.getTeamPicks(teamIds)
      setTeamPicks(picks)

      // Check commissioner
      let userId = user?.id
      if (!userId) {
        try {
          const session = await UserSessionService.getOrCreateSession()
          userId = session.userId
        } catch { /* ignore */ }
      }
      if (userId) {
        const result = await KnockoutService.isCommissioner(tournamentId, userId)
        setIsCommissioner(result)
      }
    } catch (err) {
      log.error('Error loading tournament:', err)
      setError(err instanceof Error ? err.message : 'Failed to load tournament')
    } finally {
      setIsLoading(false)
    }
  }, [tournamentId, user?.id])

  useEffect(() => { loadData() }, [loadData])

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/tournament/${tournamentId}`)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleRecordMatch = useCallback((match: Match & { homeTeam: Team; awayTeam: Team }) => {
    setHomeTeamPicks(teamPicks[match.homeTeamId] || [])
    setAwayTeamPicks(teamPicks[match.awayTeamId] || [])
    setSelectedMatch(match)
  }, [teamPicks])

  const handleMatchRecorded = useCallback(async () => {
    if (!selectedMatch) return
    setSelectedMatch(null)

    // After recording via MatchRecorderModal, also update the bracket
    try {
      // Find winner from the match (modal already updated the DB match)
      // Reload everything to get fresh state
      await loadData()
      notify.success('Match Recorded', 'Bracket updated')
    } catch (err) {
      log.error('Error updating bracket:', err)
    }
  }, [selectedMatch, loadData])

  // Derive active (pending) matches from the bracket
  const activeMatches = useMemo(() => {
    if (!tournament) return []
    return matches.filter(m => m.status === 'scheduled' || m.status === 'in_progress')
  }, [tournament, matches])

  const completedMatches = useMemo(() => {
    return matches.filter(m => m.status === 'completed')
  }, [matches])

  const teamColorMap = useMemo(() => {
    if (!league) return new Map()
    return buildTeamColorMap(league.teams.map(t => t.id))
  }, [league])

  if (isLoading) {
    return <LoadingScreen title="Loading Tournament..." description="Fetching bracket and match data." />
  }

  if (error || !league || !tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Error</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error || 'Tournament not found'}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currentRoundName = tournament.rounds.find(r =>
    r.matches.some(m => m.status === 'pending' || m.status === 'in-progress')
  )?.name || (tournament.status === 'completed' ? 'Complete' : 'Round 1')

  const formatId = (league.settings as Record<string, unknown>)?.formatId as string | undefined
  const tournamentFormat = formatId ? getFormatById(formatId) : null

  return (
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6 max-w-6xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{league.name}</h1>
              {tournamentFormat && (
                <Badge variant="outline">{tournamentFormat.shortName}</Badge>
              )}
              {tournament.status === 'completed' && (
                <Badge variant="default" className="bg-yellow-500 text-yellow-950">Complete</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Knockout Tournament &middot; {league.teams.length} players &middot; {currentRoundName}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyLink}>
            {copiedLink ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {/* Champion Banner */}
        {tournament.winner && (
          <Card className="mb-6 border-2 border-yellow-500/50 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20">
            <CardContent className="py-4 flex items-center justify-center gap-3">
              <Crown className="h-6 w-6 text-yellow-500" />
              <span className="text-lg font-bold">{tournament.winner.name}</span>
              <span className="text-muted-foreground">wins the tournament!</span>
              <Trophy className="h-6 w-6 text-yellow-500" />
            </CardContent>
          </Card>
        )}

        {/* Bracket */}
        <PlayoffBracket tournament={tournament} className="mb-6" />

        {/* Active Matches */}
        {activeMatches.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Swords className="h-4 w-4 text-red-500" />
                Upcoming Matches
                <Badge variant="outline" className="ml-auto">{activeMatches.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeMatches.map(match => {
                const homeColors = teamColorMap.get(match.homeTeamId)
                const awayColors = teamColorMap.get(match.awayTeamId)
                const homePicks = teamPicks[match.homeTeamId] || []
                const awayPicks = teamPicks[match.awayTeamId] || []

                return (
                  <div key={match.id} className="border rounded-lg overflow-hidden">
                    {/* Teams + Score bar */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`w-1.5 h-6 rounded-full shrink-0 ${homeColors?.bg || 'bg-muted'}`} />
                        <span className="font-semibold text-sm truncate">{match.homeTeam.name}</span>
                      </div>
                      <div className="px-3 shrink-0">
                        <Badge variant="outline" size="sm">vs</Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        <span className="font-semibold text-sm truncate">{match.awayTeam.name}</span>
                        <div className={`w-1.5 h-6 rounded-full shrink-0 ${awayColors?.bg || 'bg-muted'}`} />
                      </div>
                    </div>

                    {/* Rosters */}
                    <div className="grid grid-cols-2 gap-0 divide-x">
                      <div className="px-2.5 py-2 space-y-0.5">
                        {homePicks.slice(0, 6).map(pick => (
                          <div key={pick.id} className="flex items-center gap-1.5">
                            <PokemonSprite pokemonId={pick.pokemonId} pokemonName={pick.pokemonName} className="w-6 h-6 object-contain" lazy />
                            <span className="text-xs capitalize truncate">{pick.pokemonName}</span>
                          </div>
                        ))}
                        {homePicks.length === 0 && <p className="text-xs text-muted-foreground py-1">No Pokemon</p>}
                      </div>
                      <div className="px-2.5 py-2 space-y-0.5">
                        {awayPicks.slice(0, 6).map(pick => (
                          <div key={pick.id} className="flex items-center gap-1.5 justify-end">
                            <span className="text-xs capitalize truncate">{pick.pokemonName}</span>
                            <PokemonSprite pokemonId={pick.pokemonId} pokemonName={pick.pokemonName} className="w-6 h-6 object-contain" lazy />
                          </div>
                        ))}
                        {awayPicks.length === 0 && <p className="text-xs text-muted-foreground py-1 text-right">No Pokemon</p>}
                      </div>
                    </div>

                    {/* Record button */}
                    {isCommissioner && (
                      <div className="border-t px-3 py-1.5 bg-muted/10">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs w-full h-7"
                          onClick={() => handleRecordMatch(match)}
                        >
                          Record Result
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Completed Matches */}
        {completedMatches.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-green-500" />
                Completed Matches
                <Badge variant="secondary" className="ml-auto">{completedMatches.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {completedMatches.map(match => {
                const homeColors = teamColorMap.get(match.homeTeamId)
                const awayColors = teamColorMap.get(match.awayTeamId)
                const roundInfo = tournament.rounds.find(r =>
                  r.matches.some(m =>
                    (m.participant1?.teamId === match.homeTeamId && m.participant2?.teamId === match.awayTeamId) ||
                    (m.participant1?.teamId === match.awayTeamId && m.participant2?.teamId === match.homeTeamId)
                  )
                )

                return (
                  <div key={match.id} className="flex items-center justify-between p-2.5 border rounded-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`w-1.5 h-5 rounded-full shrink-0 ${homeColors?.bg || 'bg-muted'}`} />
                      <span className={`text-sm truncate ${match.winnerTeamId === match.homeTeamId ? 'font-bold' : 'text-muted-foreground'}`}>
                        {match.homeTeam.name}
                      </span>
                    </div>
                    <div className="px-3 text-center shrink-0 flex items-center gap-2">
                      <span className={`text-sm font-bold tabular-nums ${match.winnerTeamId === match.homeTeamId ? 'text-green-500' : ''}`}>
                        {match.homeScore}
                      </span>
                      <span className="text-xs text-muted-foreground">-</span>
                      <span className={`text-sm font-bold tabular-nums ${match.winnerTeamId === match.awayTeamId ? 'text-green-500' : ''}`}>
                        {match.awayScore}
                      </span>
                      {roundInfo && (
                        <Badge variant="outline" size="sm" className="text-[10px] ml-1">
                          {roundInfo.name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                      <span className={`text-sm truncate ${match.winnerTeamId === match.awayTeamId ? 'font-bold' : 'text-muted-foreground'}`}>
                        {match.awayTeam.name}
                      </span>
                      <div className={`w-1.5 h-5 rounded-full shrink-0 ${awayColors?.bg || 'bg-muted'}`} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Match Recorder Modal */}
        {selectedMatch && (
          <MatchRecorderModal
            isOpen={!!selectedMatch}
            onClose={() => setSelectedMatch(null)}
            match={selectedMatch}
            homeTeamPicks={homeTeamPicks}
            awayTeamPicks={awayTeamPicks}
            onSuccess={handleMatchRecorded}
          />
        )}
      </div>
    </div>
  )
}
