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
import {
  ArrowLeft, Trophy, TrendingUp, Loader2,
  ChevronLeft, ChevronRight, Settings, Copy, Check,
  CalendarDays, BarChart3, ShieldCheck, UserPlus,
  Megaphone, ArrowLeftRight, ChevronDown, ChevronUp,
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
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [draftRoomCode, setDraftRoomCode] = useState<string | null>(null)
  const [isCommissioner, setIsCommissioner] = useState(false)
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
  const [expandedFixture, setExpandedFixture] = useState<string | null>(null)
  const [fixtureRosters, setFixtureRosters] = useState<Record<string, { home: Pick[]; away: Pick[] }>>({})

  const { user } = useAuth()

  // Determine commissioner status
  useEffect(() => {
    const checkCommissioner = async () => {
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
    }
    void checkCommissioner()
  }, [user?.id, leagueId])

  // Load rosters for expanded fixture
  const handleToggleFixture = useCallback(async (matchId: string, homeTeamId: string, awayTeamId: string) => {
    if (expandedFixture === matchId) {
      setExpandedFixture(null)
      return
    }
    setExpandedFixture(matchId)

    // Don't re-fetch if already loaded
    if (fixtureRosters[matchId]) return

    try {
      const sb = (await import('@/lib/supabase')).supabase!
      const [{ data: homePicks }, { data: awayPicks }] = await Promise.all([
        sb.from('picks').select('*').eq('team_id', homeTeamId).order('pick_order'),
        sb.from('picks').select('*').eq('team_id', awayTeamId).order('pick_order'),
      ])
      const mapPick = (p: PickRow): Pick => ({
        id: p.id, draftId: p.draft_id, teamId: p.team_id,
        pokemonId: p.pokemon_id, pokemonName: p.pokemon_name,
        cost: p.cost, pickOrder: p.pick_order, round: p.round,
        createdAt: p.created_at,
      })
      setFixtureRosters(prev => ({
        ...prev,
        [matchId]: {
          home: (homePicks || []).map(mapPick),
          away: (awayPicks || []).map(mapPick),
        },
      }))
    } catch (err) {
      log.error('Failed to load fixture rosters:', err)
    }
  }, [expandedFixture, fixtureRosters])

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

      // Draft room code for invite
      if (supabase && leagueData.teams.length > 0) {
        const { data: draft } = await supabase
          .from('drafts')
          .select('room_code, host_id')
          .eq('id', leagueData.draftId)
          .single()
        if (draft) setDraftRoomCode(draft.room_code)
      }

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

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}/league/${leagueId}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: league?.name || 'Pokemon Draft League',
          text: `Check out our draft league${draftRoomCode ? ` (Code: ${draftRoomCode})` : ''}!`,
          url,
        })
        return
      } catch { /* fall through to clipboard */ }
    }
    await navigator.clipboard.writeText(url)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
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
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6 max-w-6xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{league.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Week {league.currentWeek} of {league.totalWeeks} &middot; {league.teams.length} teams
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isCommissioner && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)} title="League Settings">
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopyInvite} title={copiedInvite ? 'Copied!' : 'Share invite link'}>
              {copiedInvite ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Announcements */}
        {announcements.filter(a => a.pinned).length > 0 && (
          <div className="mb-3 ml-11">
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

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 mb-6 border-b border-border overflow-x-auto pb-px -mx-4 px-4 sm:mx-0 sm:px-0">
          {[
            { label: 'Overview', active: true },
            { label: 'Schedule', href: `/league/${leagueId}/schedule`, icon: CalendarDays },
            { label: 'Stats', href: `/league/${leagueId}/stats`, icon: BarChart3 },
            { label: 'Trades', href: `/league/${leagueId}/trades`, icon: ArrowLeftRight },
            ...(leagueSettings.enableWaivers !== false ? [{ label: 'Free Agents', href: `/league/${leagueId}/free-agents`, icon: UserPlus }] : []),
            ...(isCommissioner ? [
              { label: 'Admin', href: `/league/${leagueId}/admin`, icon: ShieldCheck },
            ] : []),
          ].map((tab) => (
            <button
              key={tab.label}
              onClick={() => {
                if ('href' in tab && tab.href) router.push(tab.href)
              }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                'active' in tab && tab.active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              }`}
            >
              {'icon' in tab && tab.icon && <tab.icon className="h-3.5 w-3.5" />}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Main Content: Standings + Fixtures side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Standings - takes more space */}
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" />
                  {isConference ? conferenceName : 'Standings'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {standings.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No standings data yet</p>
                ) : (
                  <div role="list" className="space-y-1.5">
                    {standings.map((standing, index) => {
                      const colors = teamColorMap.get(standing.teamId)
                      const teamIndex = allTeamIds.indexOf(standing.teamId)
                      return (
                        <div
                          key={standing.id}
                          className={`flex items-center gap-3 p-2.5 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border-l-[3px] ${colors?.border || ''}`}
                          onClick={() => router.push(`/league/${leagueId}/team/${standing.teamId}`)}
                        >
                          <div className={`text-lg font-bold w-6 text-center ${
                            index === 0 ? 'text-yellow-500' :
                            index === 1 ? 'text-gray-400 dark:text-gray-500' :
                            index === 2 ? 'text-orange-600 dark:text-orange-400' :
                            'text-muted-foreground'
                          }`}>
                            {index + 1}
                          </div>
                          <TeamIcon teamName={standing.team.name} teamIndex={teamIndex >= 0 ? teamIndex : index} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{standing.team.name}</div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {standing.wins}W-{standing.losses}L-{standing.draws}D
                              </span>
                              {standing.currentStreak && (
                                <Badge
                                  variant={standing.currentStreak.startsWith('W') ? 'default' : 'destructive'}
                                  size="sm"
                                >
                                  {standing.currentStreak}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right hidden sm:block">
                            <div className="text-sm font-medium tabular-nums">{standing.pointsFor} pts</div>
                            <div className={`text-xs ${
                              standing.pointDifferential > 0 ? 'text-green-600 dark:text-green-400' :
                              standing.pointDifferential < 0 ? 'text-red-600 dark:text-red-400' :
                              'text-muted-foreground'
                            }`}>
                              {standing.pointDifferential > 0 ? '+' : ''}{standing.pointDifferential}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sibling conference standings */}
            {isConference && siblingLeague && siblingStandings.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      {siblingConferenceName}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/league/${siblingLeague.id}`)}>
                      View
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {siblingStandings.map((standing, index) => {
                      const colors = teamColorMap.get(standing.teamId)
                      const teamIndex = allTeamIds.indexOf(standing.teamId)
                      return (
                        <div
                          key={standing.id}
                          className={`flex items-center gap-3 p-2 border rounded-lg hover:bg-muted/50 cursor-pointer border-l-[3px] ${colors?.border || ''}`}
                          onClick={() => router.push(`/league/${siblingLeague.id}/team/${standing.teamId}`)}
                        >
                          <div className={`text-lg font-bold w-6 text-center ${
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
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Fixtures - right column */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous week" disabled={currentViewWeek <= 1} onClick={() => handleChangeWeek(currentViewWeek - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <CardTitle className="text-base whitespace-nowrap">
                      Week {currentViewWeek}
                    </CardTitle>
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
              </CardHeader>
              <CardContent className="space-y-2">
                {weekFixtures.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">
                    No fixtures this week
                  </p>
                ) : (
                  weekFixtures.map(match => {
                    const homeColors = teamColorMap.get(match.homeTeamId)
                    const awayColors = teamColorMap.get(match.awayTeamId)
                    const isExpanded = expandedFixture === match.id
                    const rosters = fixtureRosters[match.id]
                    const canRecord = (match.status === 'scheduled' || match.status === 'in_progress')

                    return (
                      <div key={match.id} className="border rounded-lg overflow-hidden">
                        {/* Match header row */}
                        <div
                          className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => handleToggleFixture(match.id, match.homeTeamId, match.awayTeamId)}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`w-1 h-8 rounded-full shrink-0 ${homeColors?.bg || 'bg-muted'}`} />
                            <span className="font-medium text-sm truncate">{match.homeTeam.name}</span>
                          </div>
                          <div className="px-2 text-center shrink-0 flex items-center gap-1.5">
                            {match.status === 'completed' ? (
                              <>
                                <span className="text-lg font-bold tabular-nums">{match.homeScore}</span>
                                <span className="text-xs text-muted-foreground">-</span>
                                <span className="text-lg font-bold tabular-nums">{match.awayScore}</span>
                                {match.winnerTeamId && <Trophy className="h-3 w-3 text-yellow-500" />}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground font-medium">vs</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                            <span className="font-medium text-sm truncate">{match.awayTeam.name}</span>
                            <div className={`w-1 h-8 rounded-full shrink-0 ${awayColors?.bg || 'bg-muted'}`} />
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground ml-1 shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground ml-1 shrink-0" />}
                        </div>

                        {/* Expanded: team rosters + actions */}
                        {isExpanded && (
                          <div className="border-t px-3 py-3 bg-muted/20 space-y-3">
                            {rosters ? (
                              <div className="grid grid-cols-2 gap-3">
                                {/* Home roster */}
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">{match.homeTeam.name}</p>
                                  <div className="space-y-1">
                                    {rosters.home.map(pick => (
                                      <div key={pick.id} className="flex items-center gap-1.5">
                                        <PokemonSprite pokemonId={pick.pokemonId} pokemonName={pick.pokemonName} className="w-6 h-6 object-contain" lazy />
                                        <span className="text-xs capitalize truncate">{pick.pokemonName}</span>
                                      </div>
                                    ))}
                                    {rosters.home.length === 0 && <p className="text-xs text-muted-foreground">No Pokemon</p>}
                                  </div>
                                </div>
                                {/* Away roster */}
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">{match.awayTeam.name}</p>
                                  <div className="space-y-1">
                                    {rosters.away.map(pick => (
                                      <div key={pick.id} className="flex items-center gap-1.5">
                                        <PokemonSprite pokemonId={pick.pokemonId} pokemonName={pick.pokemonName} className="w-6 h-6 object-contain" lazy />
                                        <span className="text-xs capitalize truncate">{pick.pokemonName}</span>
                                      </div>
                                    ))}
                                    {rosters.away.length === 0 && <p className="text-xs text-muted-foreground">No Pokemon</p>}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 pt-1 border-t">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs flex-1"
                                onClick={() => router.push(`/league/${leagueId}/matchup/${match.id}`)}
                              >
                                View Matchup
                              </Button>
                              {canRecord && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs flex-1"
                                  onClick={(e) => { e.stopPropagation(); handleRecordMatch(match) }}
                                >
                                  Record Result
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}

                {/* Advance week button for commissioner */}
                {isCommissioner && canAdvance && currentViewWeek === league.currentWeek && (
                  <Button
                    onClick={handleAdvanceWeek}
                    disabled={isAdvancing}
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                  >
                    {isAdvancing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : league.currentWeek === league.totalWeeks ? (
                      <>
                        <Trophy className="mr-1.5 h-3.5 w-3.5" />End Season
                      </>
                    ) : (
                      `Advance to Week ${league.currentWeek + 1}`
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Sibling conference fixtures */}
            {isConference && siblingLeague && siblingFixtures.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{siblingConferenceName}</span>
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/league/${siblingLeague.id}`)}>
                      View
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {siblingFixtures.map(match => (
                    <div key={match.id} className="flex items-center justify-between p-2.5 border rounded-lg text-sm">
                      <span className="font-medium truncate flex-1">{match.homeTeam.name}</span>
                      <span className="px-2 text-center shrink-0">
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
            )}
          </div>
        </div>

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
            onSuccess={() => { setSelectedMatch(null); loadLeagueData() }}
          />
        )}
      </div>
    </div>
  )
}
