'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LeagueService } from '@/lib/league-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import { LeagueNav } from '@/components/league/LeagueNav'
import { Trophy, CalendarDays, Filter, User } from 'lucide-react'
import type { League, Match, Team } from '@/types'
import { getTeamColor } from '@/utils/team-colors'
import { createLogger } from '@/lib/logger'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'

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
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userTeamId, setUserTeamId] = useState<string | null>(null)

  // Filters
  const [filterWeek, setFilterWeek] = useState<number | 'all'>('all')
  const [myGamesOnly, setMyGamesOnly] = useState(false)

  const { user } = useAuth()

  // Identify user's team
  useEffect(() => {
    const identify = async () => {
      let userId = user?.id
      if (!userId) {
        try {
          const session = await UserSessionService.getOrCreateSession()
          userId = session.userId
        } catch { return }
      }
      if (!userId || !league) return
      const myTeam = league.teams.find(t => t.ownerId === userId)
      if (myTeam) {
        setUserTeamId(myTeam.id)
        setMyGamesOnly(true) // default to My Games for managers
      }
    }
    void identify()
  }, [user?.id, league])

  const loadData = async () => {
    setError(null)
    setIsLoading(true)
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
    } catch (err) {
      log.error('Failed to load schedule:', err)
      setError('Failed to load schedule')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  // Filtered schedule
  const filteredSchedule = useMemo(() => {
    let weeks = schedule

    // Week filter
    if (filterWeek !== 'all') {
      weeks = weeks.filter(w => w.weekNumber === filterWeek)
    }

    // My Games filter
    if (myGamesOnly && userTeamId) {
      weeks = weeks
        .map(w => ({
          ...w,
          matches: w.matches.filter(
            m => m.homeTeamId === userTeamId || m.awayTeamId === userTeamId
          ),
        }))
        .filter(w => w.matches.length > 0)
    }

    return weeks
  }, [schedule, filterWeek, myGamesOnly, userTeamId])

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

  const _totalWeeks = schedule.length

  return (
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <LeagueNav
        leagueName={league.name}
        currentWeek={league.currentWeek || 1}
        totalWeeks={league.totalWeeks}
        teamCount={league.teams.length}
      />
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Week filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={filterWeek}
              onChange={(e) => setFilterWeek(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Weeks</option>
              {schedule.map(w => (
                <option key={w.weekNumber} value={w.weekNumber}>
                  Week {w.weekNumber}{w.weekNumber === currentWeek ? ' (Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* My Games toggle — only visible for managers */}
          {userTeamId && (
            <Button
              variant={myGamesOnly ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setMyGamesOnly(prev => !prev)}
            >
              <User className="h-3.5 w-3.5 mr-1" />
              My Games
            </Button>
          )}

          {/* Quick counts */}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredSchedule.reduce((sum, w) => sum + w.matches.length, 0)} matches
            {filterWeek !== 'all' || myGamesOnly ? ` (filtered from ${schedule.reduce((sum, w) => sum + w.matches.length, 0)} total)` : ''}
          </span>
        </div>

        {/* Error State */}
        {error && (
          <div className="text-center py-8">
            <p className="text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={loadData}>Try Again</Button>
          </div>
        )}

        {/* Empty State */}
        {!error && filteredSchedule.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <CalendarDays className="h-6 w-6 text-muted-foreground" />
            </div>
            {schedule.length === 0 ? (
              <>
                <p className="font-semibold">No weeks scheduled yet</p>
                <p className="text-sm text-muted-foreground mt-1">Matches will appear here once the schedule is generated.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">No matches found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => { setFilterWeek('all'); setMyGamesOnly(false) }}
                >
                  Clear Filters
                </Button>
              </>
            )}
          </div>
        )}

        {/* Full Season Schedule */}
        <div className="space-y-3">
          {filteredSchedule.map(week => {
            const status = getWeekStatus(week)
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
                <CardHeader className="py-3">
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
                    <span className="text-xs text-muted-foreground">
                      {week.matches.length} {week.matches.length === 1 ? 'match' : 'matches'}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-2">
                  {week.matches.map(match => {
                    const homeColors = getTeamColor(league.teams.findIndex(t => t.id === match.homeTeamId))
                    const awayColors = getTeamColor(league.teams.findIndex(t => t.id === match.awayTeamId))
                    const isMyMatch = userTeamId && (match.homeTeamId === userTeamId || match.awayTeamId === userTeamId)

                    return (
                      <div
                        key={match.id}
                        className={`flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          isMyMatch ? 'ring-1 ring-primary/30 bg-primary/5' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/league/${leagueId}/matchup/${match.id}`)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/league/${leagueId}/matchup/${match.id}`) } }}
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
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
