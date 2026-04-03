'use client'

/**
 * League Hub Page
 *
 * Clean dashboard showing standings + this week's fixtures at a glance.
 * Deep features (stats, trades, free agents) live on dedicated sub-pages.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LeagueService } from '@/lib/league-service'
import { MatchRecorderModal } from '@/components/league/MatchRecorderModal'
import { LeagueSettingsModal } from '@/components/league/LeagueSettingsModal'
import { StartPlayoffsModal } from '@/components/league/StartPlayoffsModal'
import { PlayoffBracket } from '@/components/league/PlayoffBracket'
import { TeamIcon } from '@/components/league/TeamIcon'
import { importTournament, type Tournament } from '@/lib/tournament-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import { LeagueNav } from '@/components/league/LeagueNav'
import {
  ArrowLeft, Trophy, TrendingUp, Loader2,
  ChevronLeft, ChevronRight, CalendarDays, Megaphone,
} from 'lucide-react'
import { PokemonSprite } from '@/components/ui/pokemon-sprite'
import type { League, Match, Standing, Team, Pick, ExtendedLeagueSettings } from '@/types'
import type { PickRow } from '@/types/supabase-helpers'
import { CommissionerService, type Announcement } from '@/lib/commissioner-service'
import { createLogger } from '@/lib/logger'
import { buildTeamColorMap } from '@/utils/team-colors'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'

const log = createLogger('LeaguePage')

export default function LeaguePage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [standings, setStandings] = useState<(Standing & { team: Team })[]>([])
  const [weekFixtures, setWeekFixtures] = useState<(Match & { homeTeam: Team; awayTeam: Team })[]>([])
  const [leagueSettings, setLeagueSettings] = useState<ExtendedLeagueSettings | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<(Match & { homeTeam: Team; awayTeam: Team }) | null>(null)
  const [homeTeamPicks, setHomeTeamPicks] = useState<Pick[]>([])
  const [awayTeamPicks, setAwayTeamPicks] = useState<Pick[]>([])
  const [viewingWeek, setViewingWeek] = useState<number | null>(null)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [userTeamId, setUserTeamId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canAdvance, setCanAdvance] = useState(false)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [siblingLeague, setSiblingLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [siblingStandings, setSiblingStandings] = useState<(Standing & { team: Team })[]>([])
  const [siblingFixtures, setSiblingFixtures] = useState<(Match & { homeTeam: Team; awayTeam: Team })[]>([])
  const [playoffTournament, setPlayoffTournament] = useState<Tournament | null>(null)
  const [showStartPlayoffs, setShowStartPlayoffs] = useState(false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [fixtureRosters, setFixtureRosters] = useState<Record<string, { home: Pick[]; away: Pick[] }>>({})
  const [fullSchedule, setFullSchedule] = useState<{ weekNumber: number; matches: (Match & { homeTeam: Team; awayTeam: Team })[] }[]>([])

  const { user } = useAuth()

  // Subscribe to trade events to invalidate cached rosters
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel(`league-roster-invalidate:${leagueId}`)
      .on('broadcast', { event: 'trade_update' }, () => {
        // Clear cached rosters — the auto-load effect will re-fetch
        setFixtureRosters({})
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId])

  // Determine commissioner status and user's team
  useEffect(() => {
    const checkUserRole = async () => {
      let userId = user?.id
      if (!userId) {
        try {
          const session = await UserSessionService.getOrCreateSession()
          userId = session.userId
        } catch { return }
      }
      if (!userId) return
      try {
        const result = await LeagueService.isLeagueCommissioner(leagueId, userId)
        setIsCommissioner(result)
      } catch {
        setIsCommissioner(false)
      }
      // Find user's team in this league
      if (league) {
        const myTeam = league.teams.find(t => t.ownerId === userId)
        setUserTeamId(myTeam?.id || null)
      }
    }
    void checkUserRole()
  }, [user?.id, leagueId, league])

  // Auto-load rosters for all fixtures when week changes
  useEffect(() => {
    if (weekFixtures.length === 0 || !supabase) return
    const loadAllRosters = async () => {
      const teamIds = weekFixtures.flatMap(m => [m.homeTeamId, m.awayTeamId])
      const uniqueTeamIds = [...new Set(teamIds)]
      try {
        const { data: allPicks } = await supabase
          .from('picks')
          .select('*')
          .in('team_id', uniqueTeamIds)
          .order('pick_order')

        if (!allPicks) return
        const mapPick = (p: PickRow): Pick => ({
          id: p.id, draftId: p.draft_id, teamId: p.team_id,
          pokemonId: p.pokemon_id, pokemonName: p.pokemon_name,
          cost: p.cost, pickOrder: p.pick_order, round: p.round,
          createdAt: p.created_at,
        })
        const mapped = allPicks.map(mapPick)
        const rostersByMatch: Record<string, { home: Pick[]; away: Pick[] }> = {}
        for (const match of weekFixtures) {
          rostersByMatch[match.id] = {
            home: mapped.filter(p => p.teamId === match.homeTeamId),
            away: mapped.filter(p => p.teamId === match.awayTeamId),
          }
        }
        setFixtureRosters(rostersByMatch)
      } catch (err) {
        log.error('Failed to load fixture rosters:', err)
      }
    }
    loadAllRosters()
  }, [weekFixtures])

  const loadLeagueData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const leagueData = await LeagueService.getLeague(leagueId)
      if (!leagueData) { setError('League not found'); return }
      setLeague(leagueData)

      const standingsData = await LeagueService.getStandings(leagueId)
      setStandings(standingsData)

      const currentWeek = leagueData.currentWeek || 1
      const fixtures = await LeagueService.getWeekFixtures(leagueId, currentWeek)
      setWeekFixtures(fixtures)

      const settings = await LeagueService.getLeagueSettings(leagueId)
      setLeagueSettings(settings)

      const canAdvanceWeek = await LeagueService.canAdvanceWeek(leagueId, leagueData.currentWeek || 1)
      setCanAdvance(canAdvanceWeek)

      // Full season schedule
      try {
        const schedule = await LeagueService.getFullSchedule(leagueId)
        setFullSchedule(schedule)
      } catch { /* non-critical */ }

      // Sibling conference
      if (leagueData.leagueType !== 'single') {
        const sibling = await LeagueService.getSiblingConference(leagueId)
        setSiblingLeague(sibling)
        if (sibling) {
          const [sibStandings, sibFixtures] = await Promise.all([
            LeagueService.getStandings(sibling.id),
            LeagueService.getWeekFixtures(sibling.id, leagueData.currentWeek || 1),
          ])
          setSiblingStandings(sibStandings)
          setSiblingFixtures(sibFixtures)
        }
      }

      // Announcements
      try {
        const anns = await CommissionerService.getAnnouncements(leagueId)
        setAnnouncements(anns)
      } catch { /* ignore */ }

      // Playoff state
      try {
        const playoffState = await LeagueService.getPlayoffState(leagueId)
        if (playoffState) {
          setPlayoffTournament(importTournament(JSON.stringify(playoffState)))
        }
      } catch { /* No playoffs yet */ }
    } catch (err) {
      log.error('Error loading league data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load league')
    } finally {
      setIsLoading(false)
    }
  }, [leagueId])

  useEffect(() => { loadLeagueData() }, [loadLeagueData])

  const handleAdvanceWeek = async () => {
    try {
      setIsAdvancing(true)
      await LeagueService.advanceToNextWeek(leagueId)
      await loadLeagueData()
    } catch (err) {
      log.error('Error advancing week:', err)
      alert(err instanceof Error ? err.message : 'Failed to advance to next week')
    } finally {
      setIsAdvancing(false)
    }
  }

  const currentViewWeek = viewingWeek ?? league?.currentWeek ?? 1

  const handleChangeWeek = async (newWeek: number) => {
    if (!league || newWeek < 1 || newWeek > league.totalWeeks) return
    setViewingWeek(newWeek)
    // Clear cached rosters from previous week
    setFixtureRosters({})
    try {
      const fixtures = await LeagueService.getWeekFixtures(leagueId, newWeek)
      setWeekFixtures(fixtures)
      if (siblingLeague) {
        const sibFixtures = await LeagueService.getWeekFixtures(siblingLeague.id, newWeek)
        setSiblingFixtures(sibFixtures)
      }
    } catch (err) {
      log.error('Error loading week fixtures:', err)
    }
  }

  const handleRecordMatch = async (match: Match & { homeTeam: Team; awayTeam: Team }) => {
    const { data: homePicks } = await (await import('@/lib/supabase')).supabase!
      .from('picks').select('*').eq('team_id', match.homeTeamId)
    const { data: awayPicks } = await (await import('@/lib/supabase')).supabase!
      .from('picks').select('*').eq('team_id', match.awayTeamId)

    if (homePicks && awayPicks) {
      const mapPick = (p: PickRow): Pick => ({
        id: p.id, draftId: p.draft_id, teamId: p.team_id,
        pokemonId: p.pokemon_id, pokemonName: p.pokemon_name,
        cost: p.cost, pickOrder: p.pick_order, round: p.round,
        createdAt: p.created_at,
      })
      setHomeTeamPicks(homePicks.map(mapPick))
      setAwayTeamPicks(awayPicks.map(mapPick))
      setSelectedMatch(match)
    }
  }

  if (isLoading) {
    return <LoadingScreen title="Loading League..." description="Fetching standings and fixtures." />
  }

  if (error || !league || !leagueSettings) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Error</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error || 'League not found'}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const allTeamIds = [...league.teams.map(t => t.id), ...(siblingLeague?.teams.map(t => t.id) || [])]
  const teamColorMap = buildTeamColorMap(allTeamIds)
  const isConference = league.leagueType !== 'single'
  const conferenceName = league.leagueType === 'split_conference_a' ? 'Conference A' : 'Conference B'
  const siblingConferenceName = league.leagueType === 'split_conference_a' ? 'Conference B' : 'Conference A'
  const completedThisWeek = weekFixtures.filter(m => m.status === 'completed').length

  return (
    <div className="min-h-screen bg-background">
      <LeagueNav
        leagueName={league.name}
        currentWeek={league.currentWeek}
        totalWeeks={league.totalWeeks}
        teamCount={league.teams.length}
        isCommissioner={isCommissioner}
        enableWaivers={leagueSettings.enableWaivers !== false}
        enableTrades={leagueSettings.enableTrades !== false}
        hasMatchResults={standings.some(s => s.wins > 0 || s.losses > 0 || s.draws > 0)}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      <div className="container mx-auto px-4 py-4 max-w-6xl">

        {/* Announcements */}
        {announcements.filter(a => a.pinned).length > 0 && (
          <div className="mb-4">
            {announcements.filter(a => a.pinned).map(ann => (
              <div key={ann.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5">
                <Megaphone className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-sm">{ann.title}</span>
                  {ann.body && <span className="text-xs text-muted-foreground ml-1.5">{ann.body}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* This Week's Match */}
        {weekFixtures.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous week" disabled={currentViewWeek <= 1} onClick={() => handleChangeWeek(currentViewWeek - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-base font-semibold">Week {currentViewWeek}</h2>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Next week" disabled={currentViewWeek >= league.totalWeeks} onClick={() => handleChangeWeek(currentViewWeek + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {currentViewWeek === league.currentWeek && (
                  <Badge variant="default" size="sm">Current</Badge>
                )}
              </div>
              {completedThisWeek > 0 && (
                <span className="text-xs text-muted-foreground">{completedThisWeek}/{weekFixtures.length} done</span>
              )}
            </div>

            <div className="grid gap-4">
              {weekFixtures.map(match => {
                const homeColors = teamColorMap.get(match.homeTeamId)
                const awayColors = teamColorMap.get(match.awayTeamId)
                const rosters = fixtureRosters[match.id]
                const isUserInMatch = userTeamId === match.homeTeamId || userTeamId === match.awayTeamId
                const canRecord = (match.status === 'scheduled' || match.status === 'in_progress') && (isUserInMatch || isCommissioner)

                return (
                  <Card
                    key={match.id}
                    className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => router.push(`/league/${leagueId}/matchup/${match.id}`)}
                  >
                    {/* Match header — teams + score */}
                    <div className="px-4 py-3 border-b bg-muted/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className={`w-2 h-8 rounded-full shrink-0 ${homeColors?.bg || 'bg-muted'}`} />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{match.homeTeam.name}</div>
                            <div className="text-[11px] text-muted-foreground">Home</div>
                          </div>
                        </div>
                        <div className="px-4 text-center shrink-0">
                          {match.status === 'completed' ? (
                            <div className="flex items-center gap-2">
                              <span className={`text-2xl font-bold tabular-nums ${match.winnerTeamId === match.homeTeamId ? 'text-green-500' : 'text-muted-foreground'}`}>{match.homeScore}</span>
                              <span className="text-muted-foreground">—</span>
                              <span className={`text-2xl font-bold tabular-nums ${match.winnerTeamId === match.awayTeamId ? 'text-green-500' : 'text-muted-foreground'}`}>{match.awayScore}</span>
                            </div>
                          ) : (
                            <div className="text-lg font-semibold text-muted-foreground">vs</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
                          <div className="min-w-0 text-right">
                            <div className="font-semibold text-sm truncate">{match.awayTeam.name}</div>
                            <div className="text-[11px] text-muted-foreground">Away</div>
                          </div>
                          <div className={`w-2 h-8 rounded-full shrink-0 ${awayColors?.bg || 'bg-muted'}`} />
                        </div>
                      </div>
                    </div>

                    {/* Rosters side-by-side */}
                    <div className="grid grid-cols-2 divide-x">
                      <div className="p-3 space-y-1">
                        {rosters ? (
                          rosters.home.length > 0 ? (
                            rosters.home.map(pick => (
                              <div key={pick.id} className="flex items-center gap-2">
                                <PokemonSprite pokemonId={pick.pokemonId} pokemonName={pick.pokemonName} className="w-7 h-7 object-contain" lazy />
                                <span className="text-xs font-medium capitalize truncate">{pick.pokemonName}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground py-2">No Pokemon drafted</p>
                          )
                        ) : (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-1">
                        {rosters ? (
                          rosters.away.length > 0 ? (
                            rosters.away.map(pick => (
                              <div key={pick.id} className="flex items-center gap-2 justify-end">
                                <span className="text-xs font-medium capitalize truncate">{pick.pokemonName}</span>
                                <PokemonSprite pokemonId={pick.pokemonId} pokemonName={pick.pokemonName} className="w-7 h-7 object-contain" lazy />
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground py-2 text-right">No Pokemon drafted</p>
                          )
                        ) : (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action bar */}
                    {canRecord && (
                      <div className="border-t px-4 py-2 bg-muted/10">
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={(e) => { e.stopPropagation(); handleRecordMatch(match) }}
                        >
                          Record Result
                        </Button>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>

            {/* Advance week */}
            {isCommissioner && canAdvance && currentViewWeek === league.currentWeek && (
              <Button
                onClick={handleAdvanceWeek}
                disabled={isAdvancing}
                size="sm"
                variant="outline"
                className="w-full mt-3"
              >
                {isAdvancing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : league.currentWeek === league.totalWeeks ? (
                  <><Trophy className="mr-1.5 h-3.5 w-3.5" />End Season</>
                ) : (
                  `Advance to Week ${league.currentWeek + 1}`
                )}
              </Button>
            )}
          </div>
        )}

        {weekFixtures.length === 0 && (
          <Card className="mb-6">
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="font-medium">No fixtures this week</p>
                <p className="text-sm text-muted-foreground mt-1">Use the week arrows to browse the schedule</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Season Schedule — all weeks at a glance */}
        {fullSchedule.length > 0 && (
          <div className="mb-6">
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Season Schedule
            </h2>
            <Card>
              <CardContent className="p-0">
                {fullSchedule.map((week, weekIdx) => {
                  const isCurrent = week.weekNumber === league.currentWeek
                  const isPast = week.weekNumber < (league.currentWeek || 1)
                  const allDone = week.matches.every(m => m.status === 'completed')

                  return (
                    <div
                      key={week.weekNumber}
                      className={`${weekIdx < fullSchedule.length - 1 ? 'border-b' : ''} ${isCurrent ? 'bg-primary/5' : ''}`}
                    >
                      {/* Week header row */}
                      <div className="flex items-center gap-2 px-4 py-2">
                        <span className={`text-sm font-semibold ${isCurrent ? 'text-primary' : isPast && allDone ? 'text-muted-foreground' : ''}`}>
                          Week {week.weekNumber}
                        </span>
                        {isCurrent && <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">Now</Badge>}
                        {isPast && allDone && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Done</Badge>}
                        {isPast && !allDone && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Partial</Badge>}
                      </div>

                      {/* Matches */}
                      <div className="px-4 pb-2 space-y-1">
                        {week.matches.map(match => (
                          <div
                            key={match.id}
                            className="flex items-center text-sm py-1 cursor-pointer hover:bg-muted/50 rounded px-2 -mx-2 transition-colors"
                            role="button"
                            tabIndex={0}
                            onClick={() => router.push(`/league/${leagueId}/matchup/${match.id}`)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/league/${leagueId}/matchup/${match.id}`) } }}
                          >
                            <span className={`flex-1 truncate font-medium ${match.winnerTeamId === match.homeTeamId ? 'text-green-600 dark:text-green-400' : ''}`}>
                              {match.homeTeam.name}
                            </span>
                            <span className="px-3 text-center shrink-0 tabular-nums text-xs">
                              {match.status === 'completed'
                                ? <span className="font-bold">{match.homeScore} - {match.awayScore}</span>
                                : <span className="text-muted-foreground">vs</span>
                              }
                            </span>
                            <span className={`flex-1 truncate font-medium text-right ${match.winnerTeamId === match.awayTeamId ? 'text-green-600 dark:text-green-400' : ''}`}>
                              {match.awayTeam.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Standings */}
        <div className="mb-6">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {isConference ? conferenceName : 'Standings'}
          </h2>

          {standings.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center text-center">
                  <TrendingUp className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="font-medium">No standings yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Rankings appear after matches are played</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {/* Table header */}
                <div className="grid grid-cols-[2rem_1fr_5rem_4rem] sm:grid-cols-[2rem_1fr_6rem_5rem_5rem] items-center gap-3 px-4 py-2 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  <div>#</div>
                  <div>Team</div>
                  <div className="text-center">Record</div>
                  <div className="text-right hidden sm:block">Pts</div>
                  <div className="text-right">+/-</div>
                </div>

                {standings.map((standing, index) => {
                  const colors = teamColorMap.get(standing.teamId)
                  const teamIndex = allTeamIds.indexOf(standing.teamId)
                  return (
                    <div
                      key={standing.id}
                      role="button"
                      tabIndex={0}
                      className={`grid grid-cols-[2rem_1fr_5rem_4rem] sm:grid-cols-[2rem_1fr_6rem_5rem_5rem] items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer border-l-[3px] ${colors?.border || 'border-transparent'} ${index < standings.length - 1 ? 'border-b' : ''}`}
                      onClick={() => router.push(`/league/${leagueId}/team/${standing.teamId}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/league/${leagueId}/team/${standing.teamId}`) } }}
                    >
                      <div className={`text-sm font-bold text-center ${
                        index === 0 ? 'text-yellow-500' :
                        index === 1 ? 'text-gray-400 dark:text-gray-500' :
                        index === 2 ? 'text-orange-600 dark:text-orange-400' :
                        'text-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TeamIcon teamName={standing.team.name} teamIndex={teamIndex >= 0 ? teamIndex : index} size="md" />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{standing.team.name}</div>
                          {standing.currentStreak && (
                            <Badge
                              variant={standing.currentStreak.startsWith('W') ? 'default' : 'destructive'}
                              className="text-[10px] px-1.5 py-0 h-4 mt-0.5"
                            >
                              {standing.currentStreak}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-center text-sm font-medium tabular-nums">
                        {standing.wins}-{standing.losses}-{standing.draws}
                      </div>
                      <div className="text-right text-sm font-medium tabular-nums hidden sm:block">
                        {standing.pointsFor}
                      </div>
                      <div className={`text-right text-sm font-medium tabular-nums ${
                        standing.pointDifferential > 0 ? 'text-green-600 dark:text-green-400' :
                        standing.pointDifferential < 0 ? 'text-red-600 dark:text-red-400' :
                        'text-muted-foreground'
                      }`}>
                        {standing.pointDifferential > 0 ? '+' : ''}{standing.pointDifferential}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sibling conference */}
        {isConference && siblingLeague && siblingStandings.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                {siblingConferenceName}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => router.push(`/league/${siblingLeague.id}`)}>
                View
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {siblingStandings.map((standing, index) => {
                  const colors = teamColorMap.get(standing.teamId)
                  const teamIndex = allTeamIds.indexOf(standing.teamId)
                  return (
                    <div
                      key={standing.id}
                      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer border-l-[3px] ${colors?.border || 'border-transparent'} ${index < siblingStandings.length - 1 ? 'border-b' : ''}`}
                      onClick={() => router.push(`/league/${siblingLeague.id}/team/${standing.teamId}`)}
                    >
                      <div className={`text-sm font-bold w-6 text-center ${
                        index === 0 ? 'text-yellow-500' : 'text-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <TeamIcon teamName={standing.team.name} teamIndex={teamIndex >= 0 ? teamIndex : index} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{standing.team.name}</div>
                        <span className="text-xs text-muted-foreground">
                          {standing.wins}W-{standing.losses}L-{standing.draws}D
                        </span>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Sibling conference fixtures */}
        {isConference && siblingLeague && siblingFixtures.length > 0 && (
          <div className="mb-6">
            <h2 className="text-base font-semibold mb-3">{siblingConferenceName} Fixtures</h2>
            <Card>
              <CardContent className="p-0">
                {siblingFixtures.map((match, index) => (
                  <div key={match.id} className={`flex items-center justify-between px-4 py-2.5 text-sm ${index < siblingFixtures.length - 1 ? 'border-b' : ''}`}>
                    <span className="font-medium truncate flex-1">{match.homeTeam.name}</span>
                    <span className="px-3 text-center shrink-0">
                      {match.status === 'completed'
                        ? <span className="font-bold tabular-nums">{match.homeScore} - {match.awayScore}</span>
                        : <span className="text-xs text-muted-foreground">vs</span>
                      }
                    </span>
                    <span className="font-medium truncate flex-1 text-right">{match.awayTeam.name}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Playoffs section */}
        {playoffTournament ? (
          <div className="mt-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  Playoffs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PlayoffBracket tournament={playoffTournament} />
              </CardContent>
            </Card>
          </div>
        ) : isCommissioner && (
          <div className="mt-6">
            <button
              onClick={() => setShowStartPlayoffs(true)}
              className="w-full flex items-center justify-center gap-2 p-3 border border-dashed rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              <Trophy className="h-4 w-4" />
              Start Playoffs
            </button>
          </div>
        )}

        {/* Modals */}
        {settingsOpen && leagueSettings && (
          <LeagueSettingsModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            leagueId={leagueId}
            currentSettings={leagueSettings}
            totalWeeks={league.totalWeeks}
            onSave={() => { setSettingsOpen(false); loadLeagueData() }}
          />
        )}

        <StartPlayoffsModal
          open={showStartPlayoffs}
          onOpenChange={setShowStartPlayoffs}
          leagueId={leagueId}
          leagueName={league.name}
          standings={standings}
          onPlayoffsStarted={(json) => setPlayoffTournament(importTournament(json))}
        />

        {selectedMatch && leagueSettings && (
          <MatchRecorderModal
            isOpen={!!selectedMatch}
            onClose={() => setSelectedMatch(null)}
            match={selectedMatch}
            homeTeamPicks={homeTeamPicks}
            awayTeamPicks={awayTeamPicks}
            currentUserTeamId={userTeamId}
            isCommissioner={isCommissioner}
            onSuccess={() => { setSelectedMatch(null); loadLeagueData() }}
          />
        )}
      </div>
    </div>
  )
}
