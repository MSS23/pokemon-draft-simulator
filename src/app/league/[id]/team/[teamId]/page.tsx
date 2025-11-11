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
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { LeagueStatsService } from '@/lib/league-stats-service'
import { AIAnalysisService } from '@/lib/ai-analysis-service'
import { AIAccessControl } from '@/lib/ai-access-control'
import { PokemonStatusBadge } from '@/components/league/PokemonStatusBadge'
import { LoadingScreen } from '@/components/ui/loading-states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Shield,
  Swords,
  Heart,
  Zap,
  Target,
  Award,
  Activity,
  Brain
} from 'lucide-react'
import type {
  AdvancedTeamStats,
  TeamFormIndicator,
  TeamAnalysis
} from '@/lib/league-stats-service'
import type { Pick, Team } from '@/types'

export default function TeamDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string
  const teamId = params.teamId as string

  const [team, setTeam] = useState<Team | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [stats, setStats] = useState<AdvancedTeamStats | null>(null)
  const [form, setForm] = useState<TeamFormIndicator | null>(null)
  const [analysis, setAnalysis] = useState<TeamAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [canAnalyzeTeams, setCanAnalyzeTeams] = useState(false)
  const [accessChecked, setAccessChecked] = useState(false)

  const loadTeamData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { supabase } = await import('@/lib/supabase')
      if (!supabase) throw new Error('Supabase not available')

      // Load team
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single()

      if (teamError) throw teamError
      setTeam(teamData)

      // Load picks
      const { data: picksData } = await supabase
        .from('picks')
        .select('*')
        .eq('team_id', teamId)
        .order('pick_order', { ascending: true })

      setPicks(picksData || [])

      // Load advanced stats
      const statsData = await LeagueStatsService.getAdvancedTeamStats(teamId)
      setStats(statsData)

      // Load form
      const formData = await LeagueStatsService.getTeamForm(teamId)
      setForm(formData)

      // Check AI analysis access
      const accessInfo = await AIAccessControl.getLeagueAccessInfo(leagueId)
      setCanAnalyzeTeams(accessInfo.canAnalyzeTeams)
      setAccessChecked(true)
    } catch (err) {
      console.error('Error loading team data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load team')
    } finally {
      setIsLoading(false)
    }
  }, [teamId, leagueId])

  useEffect(() => {
    loadTeamData()
  }, [loadTeamData])

  const handleAnalyzeTeam = async () => {
    if (!stats) return

    // Double-check access before making API call
    if (!canAnalyzeTeams) {
      alert('AI analysis is only available to league participants')
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
      console.error('Error analyzing team:', err)
      alert(err instanceof Error ? err.message : 'Failed to analyze team')
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
    if (formType === 'hot') return 'text-red-500'
    if (formType === 'cold') return 'text-blue-400'
    return 'text-gray-500'
  }

  return (
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push(`/league/${leagueId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to League
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent">
                {team.name}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {stats.wins}-{stats.losses}-{stats.draws} • {stats.totalPointsFor} PF, {stats.totalPointsAgainst} PA
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overall Rating</p>
                  <p className="text-2xl font-bold">{analysis?.overallRating.toFixed(0) || 'N/A'}</p>
                </div>
                <Award className="h-8 w-8 text-yellow-500" />
              </div>
              {analysis && (
                <Progress value={analysis.overallRating} className="mt-2" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Offensive Rating</p>
                  <p className="text-2xl font-bold">{stats.offensiveRating.toFixed(1)}</p>
                </div>
                <Swords className="h-8 w-8 text-red-500" />
              </div>
              <Progress value={Math.min(100, stats.offensiveRating * 10)} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Defensive Rating</p>
                  <p className="text-2xl font-bold">{stats.defensiveRating.toFixed(1)}</p>
                </div>
                <Shield className="h-8 w-8 text-blue-500" />
              </div>
              <Progress value={Math.min(100, stats.defensiveRating * 10)} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Roster Health</p>
                  <p className="text-2xl font-bold">{stats.healthyRosterPercentage.toFixed(0)}%</p>
                </div>
                <Heart className="h-8 w-8 text-green-500" />
              </div>
              <Progress value={stats.healthyRosterPercentage} className="mt-2" />
            </CardContent>
          </Card>
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
                  <span className={`text-2xl font-bold ${getFormColor(form.formType)}`}>
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

        {/* AI Analysis Section */}
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
                    {analysis.strengths.map((strength, index) => (
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
                    {analysis.weaknesses.map((weakness, index) => (
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
                    {analysis.recommendations.map((rec, index) => (
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

        {/* Detailed Stats Tabs */}
        <Tabs defaultValue="roster" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="stats">Advanced Stats</TabsTrigger>
            <TabsTrigger value="matchups">Matchups</TabsTrigger>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {picks.map(pick => (
                    <Card key={pick.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{pick.pokemonName}</span>
                          <Badge variant="outline">Cost: {pick.cost}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Round {pick.round} • Pick #{pick.pickOrder}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Offensive Rating</span>
                    <span className="font-semibold">{stats.offensiveRating.toFixed(2)}</span>
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
                    <span className={`font-semibold ${stats.pointDifferential >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {stats.pointDifferential > 0 ? '+' : ''}{stats.pointDifferential}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Avg Differential/Match</span>
                    <span className={`font-semibold ${stats.avgPointDifferential >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {stats.avgPointDifferential > 0 ? '+' : ''}{stats.avgPointDifferential.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Defensive Rating</span>
                    <span className="font-semibold">{stats.defensiveRating.toFixed(2)}</span>
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

          {/* Matchups Tab */}
          <TabsContent value="matchups">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Matchups</CardTitle>
                <CardDescription>
                  AI-powered predictions for upcoming matches
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-center text-muted-foreground py-8">
                  Matchup predictions coming soon...
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
