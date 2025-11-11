'use client'

/**
 * Power Rankings Page
 *
 * Shows all teams ranked by overall power score,
 * considering record, form, and performance metrics.
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { LeagueStatsService } from '@/lib/league-stats-service'
import { AIAnalysisService } from '@/lib/ai-analysis-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Flame,
  Snowflake,
  Target
} from 'lucide-react'
import type { AdvancedTeamStats, TeamFormIndicator } from '@/lib/league-stats-service'
import type { Team } from '@/types'

interface PowerRanking {
  rank: number
  previousRank: number
  team: Team
  stats: AdvancedTeamStats
  form: TeamFormIndicator
  powerScore: number
  trend: 'up' | 'down' | 'same'
}

export default function PowerRankingsPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  const [rankings, setRankings] = useState<PowerRanking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRankings()
  }, [leagueId])

  const loadRankings = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { supabase } = await import('@/lib/supabase')
      if (!supabase) throw new Error('Supabase not available')

      // Get league to find draft_id
      const { data: league } = await supabase
        .from('leagues')
        .select('draft_id')
        .eq('id', leagueId)
        .single()

      if (!league) throw new Error('League not found')

      // Get all teams
      const { data: teams } = await supabase
        .from('teams')
        .select('*')
        .eq('draft_id', league.draft_id)

      if (!teams) throw new Error('No teams found')

      // Load stats and form for each team
      const teamRankings = await Promise.all(
        teams.map(async (team) => {
          const [stats, form] = await Promise.all([
            LeagueStatsService.getAdvancedTeamStats(team.id),
            LeagueStatsService.getTeamForm(team.id)
          ])

          if (!stats || !form) return null

          // Calculate power score (0-100)
          const winRate = stats.matchesPlayed > 0 ? stats.wins / stats.matchesPlayed : 0
          const recentWinRate = form.last5Wins / Math.max(form.form.length, 1)

          const powerScore =
            (winRate * 30) +  // 30% weight on overall win rate
            (recentWinRate * 20) +  // 20% on recent form
            (stats.offensiveRating * 2.5) +  // 25% on offense
            (stats.defensiveRating * 2.5) +  // 25% on defense
            ((stats.pythagoreanExpectation) * 10) // 10% on expected wins

          return {
            rank: 0,  // Will be set after sorting
            previousRank: 0,
            team,
            stats,
            form,
            powerScore,
            trend: 'same' as const
          }
        })
      )

      // Filter nulls and sort by power score
      const validRankings = teamRankings
        .filter((r): r is PowerRanking => r !== null)
        .sort((a, b) => b.powerScore - a.powerScore)
        .map((ranking, index) => ({
          ...ranking,
          rank: index + 1,
          previousRank: index + 1  // TODO: Store previous rankings to calculate trend
        }))

      // Calculate trend (for now, use form as indicator)
      const finalRankings = validRankings.map(ranking => ({
        ...ranking,
        trend: ranking.form.formType === 'hot' ? 'up' as const :
               ranking.form.formType === 'cold' ? 'down' as const :
               'same' as const
      }))

      setRankings(finalRankings)
    } catch (err) {
      console.error('Error loading rankings:', err)
      setError(err instanceof Error ? err.message : 'Failed to load rankings')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <LoadingScreen
        title="Calculating Power Rankings..."
        description="Analyzing team performance and statistics."
      />
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
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

  const getTrendIcon = (trend: 'up' | 'down' | 'same') => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />
    return <Minus className="h-4 w-4 text-gray-400" />
  }

  const getFormIcon = (formType: string) => {
    if (formType === 'hot') return <Flame className="h-4 w-4 text-red-500" />
    if (formType === 'cold') return <Snowflake className="h-4 w-4 text-blue-400" />
    return <Target className="h-4 w-4 text-gray-400" />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push(`/league/${leagueId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to League
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent">
                Power Rankings
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Teams ranked by overall performance and form
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Rankings */}
        <div className="space-y-3">
          {rankings.map((ranking, index) => (
            <Card
              key={ranking.team.id}
              className={`cursor-pointer hover:shadow-lg transition-all ${
                index === 0 ? 'border-2 border-yellow-500' : ''
              }`}
              onClick={() => router.push(`/league/${leagueId}/team/${ranking.team.id}`)}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-6">
                  {/* Rank */}
                  <div className="flex flex-col items-center min-w-[80px]">
                    <div className={`text-4xl font-bold ${
                      index === 0 ? 'text-yellow-500' :
                      index === 1 ? 'text-gray-400' :
                      index === 2 ? 'text-orange-600' :
                      'text-muted-foreground'
                    }`}>
                      {ranking.rank}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {getTrendIcon(ranking.trend)}
                      <span className="text-xs text-muted-foreground">
                        {ranking.previousRank !== ranking.rank ?
                          `${Math.abs(ranking.previousRank - ranking.rank)}` :
                          '-'
                        }
                      </span>
                    </div>
                  </div>

                  {/* Trophy for #1 */}
                  {index === 0 && (
                    <Trophy className="h-12 w-12 text-yellow-500" />
                  )}

                  {/* Team Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold">{ranking.team.name}</h3>
                      {getFormIcon(ranking.form.formType)}
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <Badge variant="outline">
                        {ranking.stats.wins}-{ranking.stats.losses}-{ranking.stats.draws}
                      </Badge>

                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Form:</span>
                        <div className="flex gap-1">
                          {ranking.form.form.map((result, idx) => (
                            <Badge
                              key={idx}
                              variant={result === 'W' ? 'default' : result === 'L' ? 'destructive' : 'secondary'}
                              className="text-xs px-2 py-0"
                            >
                              {result}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <span className="text-muted-foreground">
                        Streak: <span className="font-semibold">{ranking.form.streak.displayText}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-6 mt-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Power Score:</span>
                        <span className="ml-2 font-semibold">{ranking.powerScore.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Off Rating:</span>
                        <span className="ml-2 font-semibold">{ranking.stats.offensiveRating.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Def Rating:</span>
                        <span className="ml-2 font-semibold">{ranking.stats.defensiveRating.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Point Diff:</span>
                        <span className={`ml-2 font-semibold ${
                          ranking.stats.pointDifferential >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {ranking.stats.pointDifferential > 0 ? '+' : ''}{ranking.stats.pointDifferential}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ArrowLeft className="h-5 w-5 text-muted-foreground rotate-180" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {rankings.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Rankings Yet</h3>
              <p className="text-sm text-muted-foreground">
                Rankings will appear after teams play some matches
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
