'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Trophy, Users, Calendar, Crown, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueService } from '@/lib/league-service'
import { UserSessionService } from '@/lib/user-session'
import type { Match, League, Team, Standing, Pick } from '@/types'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { createLogger } from '@/lib/logger'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'

const log = createLogger('MatchPage')

interface MatchDetails extends Match {
  league: League
  homeTeam: Team & { picks: Pick[] }
  awayTeam: Team & { picks: Pick[] }
}

export default function MatchDetailPage() {
  const params = useParams()
  const router = useRouter()
  const matchId = params.id as string

  const [match, setMatch] = useState<MatchDetails | null>(null)
  const [standings, setStandings] = useState<(Standing & { team: Team })[]>([])
  const [submissionStatus, setSubmissionStatus] = useState<{
    homeSubmitted: boolean; awaySubmitted: boolean
    confirmationStatus: 'none' | 'pending' | 'confirmed' | 'disputed'
  }>({ homeSubmitted: false, awaySubmitted: false, confirmationStatus: 'none' })
  const [isLoading, setIsLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const loadMatchData = async () => {
      try {
        const session = await UserSessionService.getSession()
        setUserId(session?.userId || null)

        // Load match details
        const matchData = await LeagueService.getMatch(matchId)
        if (!matchData) {
          router.push('/dashboard')
          return
        }

        // Load team picks
        const { data: homePicks } = await supabase
          .from('picks')
          .select('*')
          .eq('team_id', matchData.homeTeam.id)
          .order('pick_order', { ascending: true })

        const { data: awayPicks } = await supabase
          .from('picks')
          .select('*')
          .eq('team_id', matchData.awayTeam.id)
          .order('pick_order', { ascending: true })

        const mapPicks = (rows: typeof homePicks): Pick[] =>
          (rows || []).map(p => ({
            id: p.id,
            draftId: p.draft_id,
            teamId: p.team_id,
            pokemonId: p.pokemon_id,
            pokemonName: p.pokemon_name,
            cost: p.cost,
            pickOrder: p.pick_order,
            round: p.round,
            createdAt: p.created_at,
          }))

        setMatch({
          ...matchData,
          homeTeam: { ...matchData.homeTeam, picks: mapPicks(homePicks) },
          awayTeam: { ...matchData.awayTeam, picks: mapPicks(awayPicks) }
        })

        // Load league standings and submission status
        const [standingsData, statusData] = await Promise.all([
          LeagueService.getStandings(matchData.leagueId),
          LeagueService.getMatchSubmissionStatus(matchId),
        ])
        setStandings(standingsData)
        setSubmissionStatus(statusData)
      } catch (error) {
        log.error('Failed to load match data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadMatchData()
  }, [matchId, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading match details...</p>
        </div>
      </div>
    )
  }

  if (!match) {
    return null
  }

  const isUserHomeTeam = match.homeTeam.ownerId === userId
  const isUserAwayTeam = match.awayTeam.ownerId === userId
  const _userTeam = isUserHomeTeam ? match.homeTeam : isUserAwayTeam ? match.awayTeam : null
  const _opponentTeam = isUserHomeTeam ? match.awayTeam : isUserAwayTeam ? match.homeTeam : null

  const homeStanding = standings.find(s => s.teamId === match.homeTeam.id)
  const awayStanding = standings.find(s => s.teamId === match.awayTeam.id)

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 pb-20">
      <div className="max-w-7xl mx-auto pt-8 space-y-6">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        {/* Match Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Trophy className="h-6 w-6 text-yellow-500" />
                <div>
                  <CardTitle className="text-2xl">{match.league.name}</CardTitle>
                  <p className="text-sm text-slate-500">Week {match.weekNumber} • Match #{match.matchNumber}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant={match.status === 'completed' ? 'default' : 'outline'}>
                  {match.status.replace('_', ' ').toUpperCase()}
                </Badge>
                <Badge variant="outline">{match.battleFormat.replace('_', ' ')}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Matchup Display */}
            <div className="grid grid-cols-3 gap-2 sm:gap-8 items-center my-4 sm:my-6">
              {/* Home Team */}
              <div className="text-center">
                <div className={`text-lg sm:text-3xl font-bold mb-2 truncate ${isUserHomeTeam ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                  {match.homeTeam.name}
                </div>
                {isUserHomeTeam && (
                  <Badge className="bg-blue-600 text-white mb-2">Your Team</Badge>
                )}
                {homeStanding && (
                  <p className="text-sm text-slate-500">
                    {homeStanding.wins}W - {homeStanding.losses}L
                    {homeStanding.rank && ` • Rank ${homeStanding.rank}`}
                  </p>
                )}
              </div>

              {/* Score / VS */}
              <div className="text-center">
                {match.status === 'completed' ? (
                  <>
                    <div className="text-2xl sm:text-5xl font-bold text-slate-900 dark:text-white mb-2">
                      {match.homeScore} - {match.awayScore}
                    </div>
                    {match.winnerTeamId && (
                      <Badge className="bg-yellow-500 text-white">
                        <Crown className="h-3 w-3 mr-1" />
                        {match.winnerTeamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name} Wins
                      </Badge>
                    )}
                  </>
                ) : (
                  <div className="text-2xl sm:text-4xl font-semibold text-slate-500">VS</div>
                )}
              </div>

              {/* Away Team */}
              <div className="text-center">
                <div className={`text-lg sm:text-3xl font-bold mb-2 truncate ${isUserAwayTeam ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                  {match.awayTeam.name}
                </div>
                {isUserAwayTeam && (
                  <Badge className="bg-blue-600 text-white mb-2">Your Team</Badge>
                )}
                {awayStanding && (
                  <p className="text-sm text-slate-500">
                    {awayStanding.wins}W - {awayStanding.losses}L
                    {awayStanding.rank && ` • Rank ${awayStanding.rank}`}
                  </p>
                )}
              </div>
            </div>

            {/* Match Date */}
            {match.scheduledDate && (
              <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400 mt-4">
                <Calendar className="h-4 w-4" />
                {format(new Date(match.scheduledDate), 'EEEE, MMMM d, yyyy • h:mm a')}
              </div>
            )}

            {/* Submission Status */}
            {match.status !== 'completed' && submissionStatus.confirmationStatus !== 'none' && (
              <div className="flex items-center justify-center gap-3 mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                {submissionStatus.confirmationStatus === 'pending' && (
                  <>
                    <Clock className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm">
                      Waiting for {!submissionStatus.homeSubmitted ? 'home' : 'away'} team to submit result
                    </span>
                  </>
                )}
                {submissionStatus.confirmationStatus === 'disputed' && (
                  <>
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-600 dark:text-red-400">
                      Results disputed - both teams submitted different scores
                    </span>
                  </>
                )}
              </div>
            )}
            {match.status === 'completed' && submissionStatus.confirmationStatus === 'confirmed' && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-xs text-green-600 dark:text-green-400">Both teams confirmed this result</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs: Teams & Standings */}
        <Tabs defaultValue="teams" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
          </TabsList>

          {/* Teams Tab */}
          <TabsContent value="teams" className="mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Home Team Roster */}
              <TeamRoster
                team={match.homeTeam}
                isUserTeam={isUserHomeTeam}
                title={`${match.homeTeam.name} Roster`}
              />

              {/* Away Team Roster */}
              <TeamRoster
                team={match.awayTeam}
                isUserTeam={isUserAwayTeam}
                title={`${match.awayTeam.name} Roster`}
              />
            </div>
          </TabsContent>

          {/* Standings Tab */}
          <TabsContent value="standings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  League Standings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Rank</th>
                        <th className="text-left py-2 px-3">Team</th>
                        <th className="text-center py-2 px-3">W</th>
                        <th className="text-center py-2 px-3">L</th>
                        <th className="text-center py-2 px-3">D</th>
                        <th className="text-center py-2 px-3">PF</th>
                        <th className="text-center py-2 px-3">PA</th>
                        <th className="text-center py-2 px-3">Diff</th>
                        {standings.some(s => s.currentStreak) && (
                          <th className="text-center py-2 px-3">Streak</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((standing, index) => {
                        const isCurrentTeam = standing.teamId === match.homeTeam.id || standing.teamId === match.awayTeam.id
                        return (
                          <tr
                            key={standing.id}
                            className={`border-b hover:bg-slate-50 dark:hover:bg-slate-800 ${
                              isCurrentTeam ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                            }`}
                          >
                            <td className="py-3 px-3 text-center font-semibold">{standing.rank || index + 1}</td>
                            <td className="py-3 px-3 font-medium">{standing.team.name}</td>
                            <td className="py-3 px-3 text-center">{standing.wins}</td>
                            <td className="py-3 px-3 text-center">{standing.losses}</td>
                            <td className="py-3 px-3 text-center">{standing.draws}</td>
                            <td className="py-3 px-3 text-center">{standing.pointsFor}</td>
                            <td className="py-3 px-3 text-center">{standing.pointsAgainst}</td>
                            <td className={`py-3 px-3 text-center font-semibold ${
                              standing.pointDifferential > 0 ? 'text-green-600' :
                              standing.pointDifferential < 0 ? 'text-red-600' : ''
                            }`}>
                              {standing.pointDifferential > 0 ? '+' : ''}{standing.pointDifferential}
                            </td>
                            {standings.some(s => s.currentStreak) && (
                              <td className="py-3 px-3 text-center">
                                {standing.currentStreak && (
                                  <Badge variant={standing.currentStreak.startsWith('W') ? 'default' : 'destructive'}>
                                    {standing.currentStreak}
                                  </Badge>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function TeamRoster({ team, isUserTeam, title }: { team: Team & { picks: Pick[] }, isUserTeam: boolean, title: string }) {
  return (
    <Card className={isUserTeam ? 'border-blue-500 border-2' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {title}
          {isUserTeam && <Badge className="bg-blue-600 text-white ml-2">Your Team</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {team.picks.length === 0 ? (
          <p className="text-center text-slate-500 py-4">No Pokémon drafted</p>
        ) : (
          <div className="space-y-2">
            {team.picks.map((pick, index) => (
              <div
                key={pick.id}
                className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-500 w-6">#{index + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getPokemonAnimatedUrl(pick.pokemonId, pick.pokemonName)}
                    alt={pick.pokemonName}
                    className="w-10 h-10 pixelated"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      if (!target.dataset.fallback) {
                        target.dataset.fallback = '1'
                        target.src = getPokemonAnimatedBackupUrl(pick.pokemonId)
                      }
                    }}
                  />
                  <span className="font-medium capitalize">{pick.pokemonName}</span>
                </div>
                <Badge variant="outline">{pick.cost} pts</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
