'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LeagueService } from '@/lib/league-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import { ArrowLeft, Trophy, ChevronDown, ChevronUp } from 'lucide-react'
import type { League, Match, Team } from '@/types'
import { getTeamColor } from '@/utils/team-colors'
import { createLogger } from '@/lib/logger'

const log = createLogger('SchedulePage')

interface WeekGroup {
  weekNumber: number
  matches: (Match & { homeTeam: Team; awayTeam: Team })[]
}

export default function SchedulePage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [schedule, setSchedule] = useState<WeekGroup[]>([])
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [leagueData, scheduleData] = await Promise.all([
          LeagueService.getLeague(leagueId),
          LeagueService.getFullSchedule(leagueId),
        ])

        if (!leagueData) {
          router.push('/dashboard')
          return
        }

        setLeague(leagueData)
        setSchedule(scheduleData)

        // Auto-expand current week and its neighbors
        const currentWeek = leagueData.currentWeek || 1
        setExpandedWeeks(new Set([currentWeek - 1, currentWeek, currentWeek + 1].filter(w => w >= 1)))
      } catch (err) {
        log.error('Failed to load schedule:', err)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [leagueId, router])

  const toggleWeek = (week: number) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(week)) next.delete(week)
      else next.add(week)
      return next
    })
  }

  if (isLoading) {
    return (
      <LoadingScreen
        title="Loading Schedule..."
        description="Fetching season fixtures."
      />
    )
  }

  if (!league) return null

  const currentWeek = league.currentWeek || 1

  const getWeekStatus = (week: WeekGroup) => {
    if (week.weekNumber < currentWeek) {
      const allDone = week.matches.every(m => m.status === 'completed')
      return allDone ? 'completed' : 'partial'
    }
    if (week.weekNumber === currentWeek) return 'current'
    return 'upcoming'
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => router.push(`/league/${leagueId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{league.name}</h1>
            <p className="text-sm text-muted-foreground">
              Full Season Schedule &middot; {league.totalWeeks} weeks
            </p>
          </div>
        </div>

        {/* Schedule */}
        <div className="space-y-3">
          {schedule.map(week => {
            const status = getWeekStatus(week)
            const isExpanded = expandedWeeks.has(week.weekNumber)
            const completedCount = week.matches.filter(m => m.status === 'completed').length

            return (
              <Card
                key={week.weekNumber}
                className={
                  status === 'current'
                    ? 'border-blue-500 border-2'
                    : status === 'completed'
                    ? 'opacity-80'
                    : ''
                }
              >
                <CardHeader
                  className="cursor-pointer py-3"
                  onClick={() => toggleWeek(week.weekNumber)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      Week {week.weekNumber}
                      {status === 'current' && (
                        <Badge variant="default" size="sm">Current</Badge>
                      )}
                      {status === 'completed' && (
                        <Badge variant="secondary" size="sm">Completed</Badge>
                      )}
                      {status === 'partial' && (
                        <Badge variant="outline" size="sm">
                          {completedCount}/{week.matches.length} done
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {week.matches.length} {week.matches.length === 1 ? 'match' : 'matches'}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-2">
                    {week.matches.map(match => {
                      const homeColors = getTeamColor(league.teams.findIndex(t => t.id === match.homeTeamId))
                      const awayColors = getTeamColor(league.teams.findIndex(t => t.id === match.awayTeamId))

                      return (
                        <div
                          key={match.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/match/${match.id}`)}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-1 h-8 rounded-full ${homeColors.bg}`} />
                            <span className="font-medium text-sm truncate">{match.homeTeam.name}</span>
                          </div>

                          <div className="px-3 text-center shrink-0">
                            {match.status === 'completed' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold tabular-nums">{match.homeScore}</span>
                                <span className="text-xs text-muted-foreground">-</span>
                                <span className="text-lg font-bold tabular-nums">{match.awayScore}</span>
                                {match.winnerTeamId && (
                                  <Trophy className="h-3 w-3 text-yellow-500 ml-1" />
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground font-medium">vs</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
                            <span className="font-medium text-sm truncate">{match.awayTeam.name}</span>
                            <div className={`w-1 h-8 rounded-full ${awayColors.bg}`} />
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
