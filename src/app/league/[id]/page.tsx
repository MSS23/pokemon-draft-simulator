'use client'

/**
 * League Hub Page
 *
 * Main dashboard for a league showing:
 * - Current standings
 * - This week's fixtures
 * - Recent results
 * - Quick stats
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueService } from '@/lib/league-service'
import { MatchKOService } from '@/lib/match-ko-service'
import { MatchRecorderModal } from '@/components/league/MatchRecorderModal'
import { PokemonStatusBadge } from '@/components/league/PokemonStatusBadge'
import { LoadingScreen } from '@/components/ui/loading-states'
import { ArrowLeft, Trophy, Calendar, TrendingUp, Skull, Swords, Users, Repeat, Loader2 } from 'lucide-react'
import type { League, Match, Standing, Team, Pick, TeamWithPokemonStatus, ExtendedLeagueSettings } from '@/types'

export default function LeaguePage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [standings, setStandings] = useState<(Standing & { team: Team })[]>([])
  const [weekFixtures, setWeekFixtures] = useState<(Match & { homeTeam: Team; awayTeam: Team })[]>([])
  const [leagueSettings, setLeagueSettings] = useState<ExtendedLeagueSettings | null>(null)
  const [teamsWithStatus, setTeamsWithStatus] = useState<TeamWithPokemonStatus[]>([])
  const [selectedMatch, setSelectedMatch] = useState<(Match & { homeTeam: Team; awayTeam: Team }) | null>(null)
  const [homeTeamPicks, setHomeTeamPicks] = useState<Pick[]>([])
  const [awayTeamPicks, setAwayTeamPicks] = useState<Pick[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canAdvance, setCanAdvance] = useState(false)
  const [isAdvancing, setIsAdvancing] = useState(false)

  useEffect(() => {
    loadLeagueData()
  }, [leagueId])

  const loadLeagueData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Load league with basic info
      const leagueData = await LeagueService.getLeague(leagueId)
      if (!leagueData) {
        setError('League not found')
        return
      }
      setLeague(leagueData)

      // Load standings
      const standingsData = await LeagueService.getStandings(leagueId)
      setStandings(standingsData)

      // Load week fixtures
      const currentWeek = leagueData.currentWeek || 1
      const fixtures = await LeagueService.getWeekFixtures(leagueId, currentWeek)
      setWeekFixtures(fixtures)

      // Load league settings
      const settings = await LeagueService.getLeagueSettings(leagueId)
      setLeagueSettings(settings)

      // Load teams with Pokemon status
      const leagueWithStatus = await LeagueService.getLeagueWithPokemonStatus(leagueId)
      if (leagueWithStatus) {
        setTeamsWithStatus(leagueWithStatus.teams)
      }

      // Check if we can advance to next week
      const canAdvanceWeek = await LeagueService.canAdvanceWeek(leagueId, leagueData.currentWeek || 1)
      setCanAdvance(canAdvanceWeek)
    } catch (err) {
      console.error('Error loading league data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load league')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdvanceWeek = async () => {
    try {
      setIsAdvancing(true)
      await LeagueService.advanceToNextWeek(leagueId)
      await loadLeagueData()
    } catch (err) {
      console.error('Error advancing week:', err)
      alert(err instanceof Error ? err.message : 'Failed to advance to next week')
    } finally {
      setIsAdvancing(false)
    }
  }

  const handleRecordMatch = async (match: Match & { homeTeam: Team; awayTeam: Team }) => {
    // Load picks for both teams
    const { data: homePicks } = await (await import('@/lib/supabase')).supabase!
      .from('picks')
      .select('*')
      .eq('team_id', match.homeTeamId)

    const { data: awayPicks } = await (await import('@/lib/supabase')).supabase!
      .from('picks')
      .select('*')
      .eq('team_id', match.awayTeamId)

    if (homePicks && awayPicks) {
      setHomeTeamPicks(homePicks.map((p: any) => ({
        id: p.id,
        draftId: p.draft_id,
        teamId: p.team_id,
        pokemonId: p.pokemon_id,
        pokemonName: p.pokemon_name,
        cost: p.cost,
        pickOrder: p.pick_order,
        round: p.round,
        createdAt: p.created_at,
      })))
      setAwayTeamPicks(awayPicks.map((p: any) => ({
        id: p.id,
        draftId: p.draft_id,
        teamId: p.team_id,
        pokemonId: p.pokemon_id,
        pokemonName: p.pokemon_name,
        cost: p.cost,
        pickOrder: p.pick_order,
        round: p.round,
        createdAt: p.created_at,
      })))
      setSelectedMatch(match)
    }
  }

  if (isLoading) {
    return (
      <LoadingScreen
        title="Loading League..."
        description="Fetching standings, fixtures, and team data."
      />
    )
  }

  if (error || !league || !leagueSettings) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error || 'League not found'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalDeadPokemon = teamsWithStatus.reduce((sum, team) => sum + team.deadPokemon, 0)

  return (
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent">
                {league.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">Week {league.currentWeek} of {league.totalWeeks}</Badge>
                <Badge variant="outline">{league.leagueType.replace('_', ' ')}</Badge>
                {leagueSettings.enableNuzlocke && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <Skull className="h-3 w-3" />
                    Nuzlocke
                  </Badge>
                )}
                {leagueSettings.enableTrades && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Repeat className="h-3 w-3" />
                    Trading
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/league/${leagueId}/rankings`)}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Power Rankings
          </Button>
          {leagueSettings.enableTrades && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/league/${leagueId}/trades`)}
            >
              <Repeat className="h-4 w-4 mr-2" />
              Trade Center
            </Button>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Teams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{league.teams.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Swords className="h-4 w-4" />
                Matches Played
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {weekFixtures.filter(m => m.status === 'completed').length} / {weekFixtures.length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                Leader
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold truncate">
                {standings[0]?.team.name || 'TBD'}
              </div>
              <div className="text-xs text-muted-foreground">
                {standings[0] ? `${standings[0].wins}W-${standings[0].losses}L` : ''}
              </div>
            </CardContent>
          </Card>

          {leagueSettings.enableNuzlocke && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Skull className="h-4 w-4 text-red-500" />
                  Deaths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {totalDeadPokemon}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Tabs defaultValue="fixtures" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="fixtures">This Week's Fixtures</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
            <TabsTrigger value="teams">Teams & Pokemon</TabsTrigger>
          </TabsList>

          {/* Fixtures Tab */}
          <TabsContent value="fixtures" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Week {league.currentWeek} Fixtures
                    </CardTitle>
                    <CardDescription>
                      {leagueSettings.matchFormat.replace('_', ' ')} format
                      {weekFixtures.length > 0 && weekFixtures[0].scheduledDate && (
                        <span className="ml-2">
                          • {new Date(weekFixtures[0].scheduledDate).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  {canAdvance && league.currentWeek < league.totalWeeks && (
                    <Button
                      onClick={handleAdvanceWeek}
                      disabled={isAdvancing}
                      size="sm"
                      className="ml-4"
                    >
                      {isAdvancing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Advancing...
                        </>
                      ) : (
                        `Advance to Week ${league.currentWeek + 1}`
                      )}
                    </Button>
                  )}
                  {league.currentWeek === league.totalWeeks && canAdvance && (
                    <Button
                      onClick={handleAdvanceWeek}
                      disabled={isAdvancing}
                      size="sm"
                      className="ml-4"
                      variant="default"
                    >
                      {isAdvancing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Completing...
                        </>
                      ) : (
                        <>
                          <Trophy className="mr-2 h-4 w-4" />
                          Complete Season
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {weekFixtures.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No fixtures scheduled for this week
                  </p>
                ) : (
                  weekFixtures.map(match => (
                    <Card key={match.id} className="border-2">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-lg font-semibold">{match.homeTeam.name}</div>
                            <div className="text-sm text-muted-foreground">Home</div>
                          </div>

                          <div className="text-center px-4">
                            {match.status === 'completed' ? (
                              <div className="text-2xl font-bold">
                                {match.homeScore} - {match.awayScore}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">vs</div>
                            )}
                          </div>

                          <div className="flex-1 text-right">
                            <div className="text-lg font-semibold">{match.awayTeam.name}</div>
                            <div className="text-sm text-muted-foreground">Away</div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                match.status === 'completed'
                                  ? 'default'
                                  : match.status === 'in_progress'
                                  ? 'secondary'
                                  : 'outline'
                              }
                            >
                              {match.status.replace('_', ' ')}
                            </Badge>
                            {match.scheduledDate && match.status !== 'completed' && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(match.scheduledDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                            )}
                          </div>

                          {match.status === 'scheduled' && (
                            <Button size="sm" onClick={() => handleRecordMatch(match)}>
                              Record Result
                            </Button>
                          )}

                          {match.status === 'completed' && match.winnerTeamId && (
                            <Badge variant="default" className="flex items-center gap-1">
                              <Trophy className="h-3 w-3" />
                              {match.winnerTeamId === match.homeTeamId
                                ? match.homeTeam.name
                                : match.awayTeam.name}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Standings Tab */}
          <TabsContent value="standings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  League Standings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {standings.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      No standings data yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {standings.map((standing, index) => (
                        <div
                          key={standing.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/league/${leagueId}/team/${standing.teamId}`)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`text-2xl font-bold w-8 text-center ${
                              index === 0 ? 'text-yellow-500' :
                              index === 1 ? 'text-gray-400' :
                              index === 2 ? 'text-orange-600' :
                              'text-muted-foreground'
                            }`}>
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-semibold">{standing.team.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {standing.wins}W-{standing.losses}L-{standing.draws}D
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{standing.pointsFor} pts</div>
                            <div className="text-sm text-muted-foreground">
                              {standing.pointDifferential > 0 ? '+' : ''}
                              {standing.pointDifferential} diff
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Teams & Pokemon Tab */}
          <TabsContent value="teams" className="space-y-4">
            {teamsWithStatus.map(team => (
              <Card key={team.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{team.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{team.pokemonStatuses.length} Pokemon</Badge>
                      {leagueSettings.enableNuzlocke && team.deadPokemon > 0 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <Skull className="h-3 w-3" />
                          {team.deadPokemon} Dead
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/league/${leagueId}/team/${team.id}`)}
                      >
                        View Details
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {team.pokemonStatuses.map(status => (
                      <div
                        key={status.id}
                        className="flex items-center justify-between p-2 border rounded-md"
                      >
                        <div>
                          <div className="font-medium text-sm">Pokemon #{status.pickId.slice(0, 8)}</div>
                          <div className="text-xs text-muted-foreground">
                            {status.totalKos} KOs • {status.matchesPlayed} matches
                          </div>
                        </div>
                        <PokemonStatusBadge status={status.status} size="sm" showText={false} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        {/* Match Recorder Modal */}
        {selectedMatch && leagueSettings && (
          <MatchRecorderModal
            isOpen={!!selectedMatch}
            onClose={() => setSelectedMatch(null)}
            match={selectedMatch}
            homeTeamPicks={homeTeamPicks}
            awayTeamPicks={awayTeamPicks}
            leagueSettings={leagueSettings}
            onSuccess={() => {
              setSelectedMatch(null)
              loadLeagueData()
            }}
          />
        )}
      </div>
    </div>
  )
}
