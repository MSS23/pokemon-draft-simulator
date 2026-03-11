'use client'

/**
 * Team Detail Page with AI Analysis
 *
 * Comprehensive team view with:
 * - Roster with Pokemon stats
 * - Advanced team statistics
 * - AI-powered analysis
 * - Matchup predictions
 * - Form indicators
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueStatsService } from '@/lib/league-stats-service'
import { MatchKOService } from '@/lib/match-ko-service'
import { AIAccessControl } from '@/lib/ai-access-control'
import { LoadingScreen } from '@/components/ui/loading-states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/contexts/AuthContext'
// UserSessionService used for guest ID fallback
import { RosterCard } from '@/components/pokemon/RosterCard'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Shield,
  Swords,
  Zap,
  Target,
  Activity,
  Brain,
  Lock,
  Eye
} from 'lucide-react'
import type {
  AdvancedTeamStats,
  TeamFormIndicator
} from '@/lib/league-stats-service'
import type { Pick, Team } from '@/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('LeagueTeamPage')

type ViewerRole = 'owner' | 'opponent' | 'spectator'

export default function TeamDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string
  const teamId = params.teamId as string
  const { user: authUser } = useAuth()

  const [team, setTeam] = useState<Team | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [stats, setStats] = useState<AdvancedTeamStats | null>(null)
  const [form, setForm] = useState<TeamFormIndicator | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [analysis, setAnalysis] = useState<any>(null)
  const [pokemonKOStats, setPokemonKOStats] = useState<Map<string, { kills: number; deaths: number; matchesPlayed: number }>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [canAnalyzeTeams, setCanAnalyzeTeams] = useState(false)
  const [accessChecked, setAccessChecked] = useState(false)
  const [viewerRole, setViewerRole] = useState<ViewerRole>('spectator')
  const [matchHistory, setMatchHistory] = useState<Array<{
    matchId: string
    weekNumber: number
    opponentId: string
    opponentName: string
    myScore: number
    theirScore: number
    result: 'W' | 'L' | 'D'
  }>>([])

  const loadTeamData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { supabase } = await import('@/lib/supabase')
      if (!supabase) throw new Error('Supabase not available')

      // Determine viewer identity
      const userId = authUser?.id || localStorage.getItem('guestUserId')

      // Load team
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single()

      if (teamError) throw teamError
      setTeam(teamData as unknown as Team)

      // Determine viewer role
      if (userId && (teamData as unknown as Team).ownerId === userId) {
        setViewerRole('owner')
      } else if (userId) {
        // Check if user owns another team in this league
        const { data: leagueTeams } = await supabase
          .from('league_teams')
          .select('team_id')
          .eq('league_id', leagueId)

        if (leagueTeams) {
          const leagueTeamIds = leagueTeams.map(lt => lt.team_id)
          const { data: userTeams } = await supabase
            .from('teams')
            .select('id')
            .eq('owner_id', userId)
            .in('id', leagueTeamIds)

          if (userTeams && userTeams.length > 0) {
            setViewerRole('opponent')
          } else {
            setViewerRole('spectator')
          }
        }
      }

      // Load picks
      const { data: picksData } = await supabase
        .from('picks')
        .select('*')
        .eq('team_id', teamId)
        .order('pick_order', { ascending: true })

      setPicks((picksData || []).map(p => ({
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

      // Load advanced stats
      const statsData = await LeagueStatsService.getAdvancedTeamStats(teamId)
      setStats(statsData)

      // Load form
      const formData = await LeagueStatsService.getTeamForm(teamId)
      setForm(formData)

      // Load KO/death stats per Pokemon
      try {
        const [teamStatuses, deathCounts] = await Promise.all([
          MatchKOService.getTeamPokemonStatuses(teamId, leagueId),
          MatchKOService.getDeathCounts(leagueId),
        ])

        const koStatsMap = new Map<string, { kills: number; deaths: number; matchesPlayed: number }>()
        for (const status of teamStatuses) {
          koStatsMap.set(status.pickId, {
            kills: status.totalKos,
            deaths: deathCounts.get(status.pickId) || 0,
            matchesPlayed: status.matchesPlayed,
          })
        }
        setPokemonKOStats(koStatsMap)
      } catch (err) {
        log.warn('Failed to load KO stats:', err)
      }

      // Load match history
      try {
        const { data: matchRows } = await supabase
          .from('matches')
          .select('*')
          .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
          .eq('status', 'completed')
          .order('week_number', { ascending: false })

        if (matchRows && matchRows.length > 0) {
          const opponentIds = matchRows.map(m =>
            m.home_team_id === teamId ? m.away_team_id : m.home_team_id
          )
          const { data: oppTeams } = await supabase
            .from('teams')
            .select('id, name')
            .in('id', [...new Set(opponentIds)])

          const teamNameMap = new Map((oppTeams || []).map(t => [t.id, t.name]))
          setMatchHistory(matchRows.map(m => {
            const isHome = m.home_team_id === teamId
            const opponentId = isHome ? m.away_team_id : m.home_team_id
            const myScore = (isHome ? m.home_score : m.away_score) ?? 0
            const theirScore = (isHome ? m.away_score : m.home_score) ?? 0
            const result = m.winner_team_id === null ? 'D' : m.winner_team_id === teamId ? 'W' : 'L'
            return { matchId: m.id, weekNumber: m.week_number, opponentId, opponentName: teamNameMap.get(opponentId) || 'Unknown', myScore, theirScore, result }
          }))
        }
      } catch (err) {
        log.warn('Failed to load match history:', err)
      }

      // Check AI analysis access
      const accessInfo = await AIAccessControl.getLeagueAccessInfo(leagueId)
      setCanAnalyzeTeams(accessInfo.canAnalyzeTeams)
      setAccessChecked(true)
    } catch (err) {
      log.error('Error loading team data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load team')
    } finally {
      setIsLoading(false)
    }
  }, [teamId, leagueId, authUser?.id])

  useEffect(() => {
    loadTeamData()
  }, [loadTeamData])

  const handleAnalyzeTeam = async () => {
    if (!stats) return

    // Double-check access before making API call
    if (!canAnalyzeTeams) {
      toast.error('AI analysis is only available to league participants')
      return
    }

    try {
      setIsAnalyzing(true)

      // Call API route with auth check
      const response = await fetch('/api/ai/analyze-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, leagueId })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to analyze team')
      }

      const analysisData = await response.json()
      setAnalysis(analysisData)
    } catch (err) {
      log.error('Error analyzing team:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to analyze team')
    } finally {
      setIsAnalyzing(false)
    }
  }

  if (isLoading) {
    return (
      <LoadingScreen
        title="Loading Team..."
        description="Fetching team data and statistics."
      />
    )
  }

  if (error || !team || !stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error || 'Team not found'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push(`/league/${leagueId}`)} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to League
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const getFormColor = (formType: string) => {
    if (formType === 'hot') return 'text-red-500 dark:text-red-400'
    if (formType === 'cold') return 'text-blue-500 dark:text-blue-400'
    return 'text-gray-500 dark:text-gray-400'
  }

  return (
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => router.push(`/league/${leagueId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{team.name}</h1>
            <p className="text-sm text-muted-foreground">
              {stats.wins}-{stats.losses}-{stats.draws} &middot; {stats.totalPointsFor} PF, {stats.totalPointsAgainst} PA
            </p>
          </div>
        </div>


        {/* Form Indicator */}
        {form && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Current Form
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="flex gap-2">
                  {form.form.map((result, index) => (
                    <Badge
                      key={index}
                      variant={result === 'W' ? 'default' : result === 'L' ? 'destructive' : 'secondary'}
                      className="text-lg px-3 py-1"
                    >
                      {result}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold tracking-tight tabular-nums ${getFormColor(form.formType)}`}>
                    {form.formType === 'hot' ? '🔥' : form.formType === 'cold' ? '❄️' : '➖'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {form.streak.displayText} streak
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Privacy indicator */}
        {viewerRole !== 'owner' && (
          <Alert className="mb-6">
            <Eye className="h-4 w-4" />
            <AlertDescription>
              Viewing as {viewerRole === 'opponent' ? 'an opponent' : 'a spectator'}.
              {viewerRole === 'spectator' && ' Some data like draft costs and detailed KO stats are hidden.'}
              {viewerRole === 'opponent' && ' AI analysis and weakness data are hidden.'}
            </AlertDescription>
          </Alert>
        )}

        {/* AI Analysis Section - Owner only */}
        {viewerRole === 'owner' && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                AI Team Analysis
              </CardTitle>
              {canAnalyzeTeams ? (
                <Button
                  onClick={handleAnalyzeTeam}
                  disabled={isAnalyzing}
                  size="sm"
                >
                  {isAnalyzing ? (
                    <>
                      <Zap className="mr-2 h-4 w-4 animate-pulse" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" />
                      {analysis ? 'Re-analyze' : 'Analyze Team'}
                  </>
                )}
              </Button>
            ) : (
              accessChecked && (
                <Badge variant="secondary" className="text-xs">
                  Participants Only
                </Badge>
              )
            )}
            </div>
            <CardDescription>
              {canAnalyzeTeams
                ? 'Get AI-powered insights on your team\'s strengths, weaknesses, and recommendations'
                : 'AI analysis is only available to league participants'}
            </CardDescription>
          </CardHeader>
          {!canAnalyzeTeams && accessChecked ? (
            <CardContent>
              <Alert>
                <Brain className="h-4 w-4" />
                <AlertDescription>
                  AI team analysis is restricted to league participants. Spectators can view draft analysis on public drafts from the draft results page.
                </AlertDescription>
              </Alert>
            </CardContent>
          ) : analysis && (
            <CardContent className="space-y-4">
              {/* Playstyle */}
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Playstyle: <Badge>{analysis.playstyle}</Badge>
                </h3>
                <p className="text-sm text-muted-foreground">{analysis.recommendedStrategy}</p>
              </div>

              {/* Strengths */}
              {analysis.strengths.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
                    <TrendingUp className="h-4 w-4" />
                    Strengths
                  </h3>
                  <ul className="space-y-1">
                    {analysis.strengths.map((strength: string, index: number) => (
                      <li key={index} className="text-sm flex items-start gap-2">
                        <span className="text-green-500 mt-1">✓</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {analysis.weaknesses.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2 text-red-600 dark:text-red-400">
                    <TrendingDown className="h-4 w-4" />
                    Weaknesses
                  </h3>
                  <ul className="space-y-1">
                    {analysis.weaknesses.map((weakness: string, index: number) => (
                      <li key={index} className="text-sm flex items-start gap-2">
                        <span className="text-red-500 mt-1">✗</span>
                        <span>{weakness}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {analysis.recommendations.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <Zap className="h-4 w-4" />
                    Recommendations
                  </h3>
                  <ul className="space-y-1">
                    {analysis.recommendations.map((rec: string, index: number) => (
                      <li key={index} className="text-sm flex items-start gap-2">
                        <span className="text-blue-500 mt-1">→</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          )}
        </Card>
        )}

        {/* Restricted content placeholder for non-owners */}
        {viewerRole !== 'owner' && (
          <Card className="mb-6 border-dashed">
            <CardContent className="py-8 text-center">
              <Lock className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                AI analysis and weakness data are private to the team owner.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Detailed Stats Tabs */}
        <Tabs defaultValue="roster" className="space-y-4">
          <TabsList className={`grid w-full ${viewerRole === 'owner' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            {viewerRole === 'owner' && (
              <TabsTrigger value="stats">Advanced Stats</TabsTrigger>
            )}
            <TabsTrigger value="history">Match History</TabsTrigger>
          </TabsList>

          {/* Roster Tab */}
          <TabsContent value="roster" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Team Roster</CardTitle>
                <CardDescription>
                  {stats.activePokemon} active • {stats.faintedPokemon} fainted • {stats.deadPokemon} dead
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {picks.map(pick => {
                    const koStats = pokemonKOStats.get(pick.id)
                    return (
                      <RosterCard
                        key={pick.id}
                        pokemonId={pick.pokemonId}
                        pokemonName={pick.pokemonName}
                        cost={pick.cost}
                        showCost={viewerRole !== 'spectator'}
                        kills={koStats?.kills}
                        deaths={koStats?.deaths}
                        matchesPlayed={koStats?.matchesPlayed}
                        subtitle={`Round ${pick.round} · Pick #${pick.pickOrder}`}
                      />
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advanced Stats Tab */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Swords className="h-5 w-5 text-red-500" />
                    Offensive Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Points</span>
                    <span className="font-semibold">{stats.totalPointsFor}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Avg Points/Match</span>
                    <span className="font-semibold">{stats.avgPointsFor.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total KOs</span>
                    <span className="font-semibold">{stats.totalKOsGiven}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Avg KOs/Match</span>
                    <span className="font-semibold">{stats.avgKOsGiven.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-500" />
                    Defensive Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Points Against</span>
                    <span className="font-semibold">{stats.totalPointsAgainst}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Avg Points Against/Match</span>
                    <span className="font-semibold">{stats.avgPointsAgainst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Point Differential</span>
                    <span className={`font-semibold ${stats.pointDifferential >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {stats.pointDifferential > 0 ? '+' : ''}{stats.pointDifferential}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Avg Differential/Match</span>
                    <span className={`font-semibold ${stats.avgPointDifferential >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {stats.avgPointDifferential > 0 ? '+' : ''}{stats.avgPointDifferential.toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-500" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Record</span>
                    <span className="font-semibold">{stats.wins}-{stats.losses}-{stats.draws}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Win Percentage</span>
                    <span className="font-semibold">
                      {stats.matchesPlayed > 0 ? ((stats.wins / stats.matchesPlayed) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Expected Win%</span>
                    <span className="font-semibold">{(stats.pythagoreanExpectation * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Luck Factor</span>
                    <span className={`font-semibold ${
                      (stats.wins / Math.max(stats.matchesPlayed, 1)) > stats.pythagoreanExpectation ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {stats.matchesPlayed > 0 ?
                        (((stats.wins / stats.matchesPlayed) - stats.pythagoreanExpectation) * 100).toFixed(1)
                        : '0.0'}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Match History Tab */}
          <TabsContent value="history" className="space-y-3">
            {matchHistory.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">No completed matches yet.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Match Results ({matchHistory.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {matchHistory.map(m => (
                      <div
                        key={m.matchId}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/league/${leagueId}/matchup/${m.matchId}`)}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            m.result === 'W' ? 'bg-green-500 text-white' :
                            m.result === 'L' ? 'bg-red-500 text-white' :
                            'bg-gray-400 text-white'
                          }`}>{m.result}</span>
                          <div>
                            <div className="font-medium text-sm">vs {m.opponentName}</div>
                            <div className="text-xs text-muted-foreground">Week {m.weekNumber}</div>
                          </div>
                        </div>
                        <div className="text-right font-bold tabular-nums text-sm">
                          {m.myScore} – {m.theirScore}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}
