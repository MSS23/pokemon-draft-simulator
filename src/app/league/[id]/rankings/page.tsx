'use client'

/**
 * Power Rankings Page
 *
 * Shows all teams ranked by overall power score,
 * considering record, form, and performance metrics.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LeagueStatsService } from '@/lib/league-stats-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import { TeamIcon } from '@/components/league/TeamIcon'
import { LeagueNav } from '@/components/league/LeagueNav'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Flame,
  Snowflake,
  Target,
  ChevronUp as VoteUp
} from 'lucide-react'
import type { AdvancedTeamStats, TeamFormIndicator } from '@/lib/league-stats-service'
import type { Team } from '@/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('LeagueRankingsPage')

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
  const [userVotes, setUserVotes] = useState<Record<string, number>>({})
  const [showVoting, setShowVoting] = useState(false)
  const [voteSubmitted, setVoteSubmitted] = useState(false)
  const [currentWeek, setCurrentWeek] = useState<number>(1)
  const [leagueName, setLeagueName] = useState('')
  const [totalWeeks, setTotalWeeks] = useState(0)

  const loadRankings = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { supabase } = await import('@/lib/supabase')
      if (!supabase) throw new Error('Supabase not available')

      // Get league to find draft_id and current week
      const leagueResponse = await supabase
        .from('leagues')
        .select('draft_id, current_week, name, total_weeks')
        .eq('id', leagueId)
        .maybeSingle()

      if (leagueResponse.error) throw leagueResponse.error
      const league = leagueResponse.data as { draft_id: string; current_week: number; name: string; total_weeks: number } | null
      if (!league) throw new Error('League not found')

      const draftId = league.draft_id
      setCurrentWeek(league.current_week || 1)
      setLeagueName(league.name || 'League')
      setTotalWeeks(league.total_weeks || 0)

      // Get all teams
      const teamsResponse = await supabase
        .from('teams')
        .select('*')
        .eq('draft_id', draftId)

      if (teamsResponse.error) throw teamsResponse.error
      const teams = teamsResponse.data as unknown as Team[]
      if (!teams || teams.length === 0) throw new Error('No teams found')

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
        .filter((r) => r !== null)
        .sort((a, b) => b!.powerScore - a!.powerScore)
        .map((ranking, index) => ({
          ...ranking!,
          rank: index + 1,
          previousRank: index + 1
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
      log.error('Error loading rankings:', err)
      setError(err instanceof Error ? err.message : 'Failed to load rankings')
    } finally {
      setIsLoading(false)
    }
  }, [leagueId])

  useEffect(() => {
    loadRankings()
  }, [loadRankings])

  // Load previously submitted votes from localStorage
  useEffect(() => {
    if (leagueId) {
      const voteKey = `power-rankings-vote-${leagueId}-${currentWeek}`
      const saved = localStorage.getItem(voteKey)
      if (saved) {
        try {
          setUserVotes(JSON.parse(saved))
          setVoteSubmitted(true)
        } catch { /* ignore malformed data */ }
      }
    }
  }, [leagueId, currentWeek])

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
      <div className="min-h-screen bg-background flex items-center justify-center">
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
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <LeagueNav
        leagueName={leagueName}
        currentWeek={currentWeek}
        totalWeeks={totalWeeks}
      />
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        {/* Page-specific header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Power Rankings</h2>
            <p className="text-xs text-muted-foreground">Ranked by performance and form</p>
          </div>
          {rankings.length > 0 && (
            <Button
              size="sm"
              variant={showVoting ? 'default' : 'outline'}
              onClick={() => {
                setShowVoting(!showVoting)
                if (!showVoting && Object.keys(userVotes).length === 0) {
                  const initial: Record<string, number> = {}
                  rankings.forEach((r) => { initial[r.team.id] = r.rank })
                  setUserVotes(initial)
                }
              }}
            >
              <VoteUp className="h-4 w-4 mr-1.5" />
              {showVoting ? 'Cancel' : 'Vote'}
            </Button>
          )}
        </div>

        {/* Vote submitted banner */}
        {voteSubmitted && !showVoting && (
          <div className="text-center py-2 mb-3 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
            Your power rankings vote has been recorded for Week {currentWeek}!
          </div>
        )}

        {/* Rankings */}
        <div className="space-y-1.5">
          {rankings.map((ranking, index) => {
            const isFirst = index === 0
            return (
              <div
                key={ranking.team.id}
                className={`flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer ${
                  isFirst ? 'border-yellow-500/50 bg-yellow-500/5' : ''
                }`}
                onClick={() => router.push(`/league/${leagueId}/team/${ranking.team.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/league/${leagueId}/team/${ranking.team.id}`) } }}
              >
                {/* Rank */}
                <div className={`text-xl font-bold w-8 text-center shrink-0 ${
                  index === 0 ? 'text-yellow-500' :
                  index === 1 ? 'text-gray-400 dark:text-gray-500' :
                  index === 2 ? 'text-orange-600 dark:text-orange-400' :
                  'text-muted-foreground'
                }`}>
                  {ranking.rank}
                </div>

                {/* Trend */}
                <div className="shrink-0">
                  {getTrendIcon(ranking.trend)}
                </div>

                {/* Vote input */}
                {showVoting && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="number"
                      min={1}
                      max={rankings.length}
                      value={userVotes[ranking.team.id] || index + 1}
                      onChange={(e) => setUserVotes(prev => ({
                        ...prev,
                        [ranking.team.id]: parseInt(e.target.value) || index + 1
                      }))}
                      className="w-12 h-7 text-xs text-center"
                      aria-label={`Your rank for ${ranking.team.name}`}
                    />
                  </div>
                )}

                {/* Team icon + name */}
                <TeamIcon teamName={ranking.team.name} teamIndex={index} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{ranking.team.name}</span>
                    {isFirst && <Trophy className="h-3.5 w-3.5 text-yellow-500 shrink-0" />}
                    {getFormIcon(ranking.form.formType)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {ranking.stats.wins}-{ranking.stats.losses}-{ranking.stats.draws}
                    </span>
                    <div className="hidden sm:flex gap-0.5">
                      {ranking.form.form.map((result, idx) => (
                        <Badge
                          key={idx}
                          variant={result === 'W' ? 'default' : result === 'L' ? 'destructive' : 'secondary'}
                          className="text-[10px] px-1.5 py-0 h-4"
                        >
                          {result}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Stats -- desktop only */}
                <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                  <div className="text-center">
                    <div className="font-semibold text-foreground">{ranking.powerScore.toFixed(0)}</div>
                    <div>PWR</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-foreground">{ranking.stats.offensiveRating.toFixed(1)}</div>
                    <div>OFF</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-foreground">{ranking.stats.defensiveRating.toFixed(1)}</div>
                    <div>DEF</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-semibold ${
                      ranking.stats.pointDifferential >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {ranking.stats.pointDifferential > 0 ? '+' : ''}{ranking.stats.pointDifferential}
                    </div>
                    <div>DIFF</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Submit vote panel */}
        {showVoting && rankings.length > 0 && (
          <div className="mt-3 p-3 rounded-lg border flex items-center justify-between bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Rank each team from 1 (best) to {rankings.length} (worst)
            </p>
            <Button
              size="sm"
              onClick={() => {
                const voteKey = `power-rankings-vote-${leagueId}-${currentWeek}`
                localStorage.setItem(voteKey, JSON.stringify(userVotes))
                setVoteSubmitted(true)
                setShowVoting(false)
              }}
            >
              Submit Vote
            </Button>
          </div>
        )}

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
