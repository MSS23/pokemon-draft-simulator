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

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueService } from '@/lib/league-service'
import { MatchKOService } from '@/lib/match-ko-service'
import { MatchRecorderModal } from '@/components/league/MatchRecorderModal'
import { LeagueSettingsModal } from '@/components/league/LeagueSettingsModal'
import { StartPlayoffsModal } from '@/components/league/StartPlayoffsModal'
import { PlayoffBracket } from '@/components/league/PlayoffBracket'
import { PokemonStatusBadge } from '@/components/league/PokemonStatusBadge'
import { TeamIcon } from '@/components/league/TeamIcon'
import { importTournament, type Tournament } from '@/lib/tournament-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import { ArrowLeft, Trophy, Calendar, TrendingUp, Swords, Users, Repeat, Loader2, ChevronLeft, ChevronRight, Settings, Copy, Check, CalendarDays, Skull, Crosshair, BarChart3, ShieldCheck, UserPlus, Megaphone, Lock } from 'lucide-react'
import type { League, Match, Standing, Team, Pick, TeamWithPokemonStatus, ExtendedLeagueSettings } from '@/types'
import type { PickRow } from '@/types/supabase-helpers'
import { CommissionerService, type Announcement } from '@/lib/commissioner-service'
import { createLogger } from '@/lib/logger'
import { buildTeamColorMap } from '@/utils/team-colors'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'
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
  const [teamsWithStatus, setTeamsWithStatus] = useState<TeamWithPokemonStatus[]>([])
  const [selectedMatch, setSelectedMatch] = useState<(Match & { homeTeam: Team; awayTeam: Team }) | null>(null)
  const [homeTeamPicks, setHomeTeamPicks] = useState<Pick[]>([])
  const [awayTeamPicks, setAwayTeamPicks] = useState<Pick[]>([])
  const [teamPicks, setTeamPicks] = useState<Record<string, Pick[]>>({})
  const [viewingWeek, setViewingWeek] = useState<number | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [draftRoomCode, setDraftRoomCode] = useState<string | null>(null)
  const [_draftHostId, setDraftHostId] = useState<string | null>(null)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canAdvance, setCanAdvance] = useState(false)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [siblingLeague, setSiblingLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [siblingStandings, setSiblingStandings] = useState<(Standing & { team: Team })[]>([])
  const [siblingFixtures, setSiblingFixtures] = useState<(Match & { homeTeam: Team; awayTeam: Team })[]>([])
  const [koLeaderboard, setKoLeaderboard] = useState<Array<{
    pickId: string; pokemonId: string; pokemonName: string; totalKos: number; matchesPlayed: number; teamId: string
  }>>([])
  const [deadPokemon, setDeadPokemon] = useState<Array<{
    pickId: string; teamId: string; pokemonName: string; deathDate: string | null
  }>>([])
  const [playoffTournament, setPlayoffTournament] = useState<Tournament | null>(null)
  const [showStartPlayoffs, setShowStartPlayoffs] = useState(false)
  const [pendingTradeCount, setPendingTradeCount] = useState(0)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const { user } = useAuth()

  // Determine commissioner status from auth user or guest session
  useEffect(() => {
    const checkCommissioner = async () => {
      // Try auth user first, then guest session
      let userId = user?.id
      if (!userId) {
        try {
          const session = await UserSessionService.getOrCreateSession()
          userId = session.userId
        } catch {
          return
        }
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

  const loadLeagueData = useCallback(async () => {
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

      // Load sibling conference data if this is a split conference
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

      // Load announcements
      try {
        const anns = await CommissionerService.getAnnouncements(leagueId)
        setAnnouncements(anns)
      } catch { /* ignore */ }

      // Load KO leaderboard and dead pokemon
      try {
        const [leaderboard, dead] = await Promise.all([
          MatchKOService.getKOLeaderboard(leagueId, 15),
          MatchKOService.getDeadPokemon(leagueId),
        ])
        setKoLeaderboard(leaderboard)

        // Map dead pokemon to include names from picks
        if (supabase && dead.length > 0) {
          const pickIds = dead.map(d => d.pickId)
          const { data: deadPicks } = await supabase
            .from('picks')
            .select('id, pokemon_name, team_id')
            .in('id', pickIds)

          const pickMap = new Map((deadPicks ?? []).map(p => [p.id, p]))
          setDeadPokemon(dead.map(d => {
            const pick = pickMap.get(d.pickId)
            return {
              pickId: d.pickId,
              teamId: d.teamId,
              pokemonName: pick?.pokemon_name || 'Unknown',
              deathDate: d.deathDate,
            }
          }))
        }
      } catch (err) {
        log.warn('Failed to load KO data (may not have match_pokemon_kos table):', err)
      }

      // Fetch picks for all teams (for Teams & Pokemon tab)
      if (supabase && leagueData.teams.length > 0) {
        const teamIds = leagueData.teams.map(t => t.id)
        const { data: allPicks } = await supabase
          .from('picks')
          .select('*')
          .in('team_id', teamIds)
          .order('pick_order', { ascending: true })

        if (allPicks) {
          const picksByTeam: Record<string, Pick[]> = {}
          for (const p of allPicks) {
            const pick: Pick = {
              id: p.id, draftId: p.draft_id, teamId: p.team_id,
              pokemonId: p.pokemon_id, pokemonName: p.pokemon_name,
              cost: p.cost, pickOrder: p.pick_order, round: p.round,
              createdAt: p.created_at,
            }
            if (!picksByTeam[p.team_id]) picksByTeam[p.team_id] = []
            picksByTeam[p.team_id].push(pick)
          }
          setTeamPicks(picksByTeam)
        }

        // Fetch draft room code for invite link
        const { data: draft } = await supabase
          .from('drafts')
          .select('room_code, host_id')
          .eq('id', leagueData.draftId)
          .single()

        if (draft) {
          setDraftRoomCode(draft.room_code)
          setDraftHostId(draft.host_id)
        }
      }

      // Load playoff state if exists
      try {
        const playoffState = await LeagueService.getPlayoffState(leagueId)
        if (playoffState) {
          const tournament = importTournament(JSON.stringify(playoffState))
          setPlayoffTournament(tournament)
        }
      } catch {
        // No playoffs yet, that's fine
      }
    } catch (err) {
      log.error('Error loading league data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load league')
    } finally {
      setIsLoading(false)
    }
  }, [leagueId])

  useEffect(() => {
    loadLeagueData()
  }, [loadLeagueData])

  // Fetch pending trade count and subscribe for real-time updates
  useEffect(() => {
    if (!supabase || !leagueSettings?.enableTrades) return

    const fetchPendingCount = async () => {
      try {
        const { count } = await supabase
          .from('trades')
          .select('*', { count: 'exact', head: true })
          .eq('league_id', leagueId)
          .eq('status', 'proposed')
        setPendingTradeCount(count || 0)
      } catch {
        // Non-critical
      }
    }

    void fetchPendingCount()

    const channel = supabase
      .channel(`league-trades-badge:${leagueId}`)
      .on('broadcast', { event: 'trade_proposed' }, () => void fetchPendingCount())
      .on('broadcast', { event: 'trade_accepted' }, () => void fetchPendingCount())
      .on('broadcast', { event: 'trade_rejected' }, () => void fetchPendingCount())
      .on('broadcast', { event: 'trade_executed' }, () => void fetchPendingCount())
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  }, [leagueId, leagueSettings?.enableTrades])

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
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
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
      const mapPick = (p: PickRow): Pick => ({
        id: p.id,
        draftId: p.draft_id,
        teamId: p.team_id,
        pokemonId: p.pokemon_id,
        pokemonName: p.pokemon_name,
        cost: p.cost,
        pickOrder: p.pick_order,
        round: p.round,
        createdAt: p.created_at,
      })
      setHomeTeamPicks(homePicks.map(mapPick))
      setAwayTeamPicks(awayPicks.map(mapPick))
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

  const allTeamIds = [...league.teams.map(t => t.id), ...(siblingLeague?.teams.map(t => t.id) || [])]
  const teamColorMap = buildTeamColorMap(allTeamIds)
  const isConference = league.leagueType !== 'single'
  const conferenceName = league.leagueType === 'split_conference_a' ? 'Conference A' : 'Conference B'
  const siblingConferenceName = league.leagueType === 'split_conference_a' ? 'Conference B' : 'Conference A'

  return (
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button variant="outline" size="sm" onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold brand-gradient-text truncate">
                {league.name}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary">Week {league.currentWeek} of {league.totalWeeks}</Badge>
                {draftRoomCode && (
                  <Badge variant="outline" className="font-mono">{draftRoomCode}</Badge>
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
            onClick={() => router.push(`/league/${leagueId}/schedule`)}
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            Schedule
          </Button>
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
              className="relative"
            >
              <Repeat className="h-4 w-4 mr-2" />
              Trade Center
              {pendingTradeCount > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1 text-xs">
                  {pendingTradeCount}
                </Badge>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/league/${leagueId}/stats`)}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Stats
          </Button>
          {leagueSettings.enableWaivers !== false && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/league/${leagueId}/free-agents`)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Free Agents
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyInvite}
          >
            {copiedInvite ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copiedInvite ? 'Copied!' : 'Share Link'}
          </Button>
          {isCommissioner && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/league/${leagueId}/admin`)}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Commissioner
            </Button>
          )}
          {isCommissioner && !playoffTournament && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStartPlayoffs(true)}
            >
              <Trophy className="h-4 w-4 mr-2" />
              Start Playoffs
            </Button>
          )}
          {isCommissioner && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4 mr-2" />
              League Settings
            </Button>
          )}
        </div>

        {/* Announcements */}
        {announcements.filter(a => a.pinned).length > 0 && (
          <div className="mb-4 space-y-2">
            {announcements.filter(a => a.pinned).map(ann => (
              <div key={ann.id} className="flex items-start gap-3 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
                <Megaphone className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm">{ann.title}</div>
                  {ann.body && <p className="text-xs text-muted-foreground mt-0.5">{ann.body}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-6">
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

        </div>

        <Tabs defaultValue="fixtures" className="space-y-4">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="fixtures" className="flex-1 min-w-0 text-xs sm:text-sm">Fixtures</TabsTrigger>
            <TabsTrigger value="standings" className="flex-1 min-w-0 text-xs sm:text-sm">Standings</TabsTrigger>
            {playoffTournament && (
              <TabsTrigger value="playoffs" className="flex-1 min-w-0 text-xs sm:text-sm">Playoffs</TabsTrigger>
            )}
            <TabsTrigger value="kill-leaders" className="flex-1 min-w-0 text-xs sm:text-sm">Kills</TabsTrigger>
            <TabsTrigger value="teams" className="flex-1 min-w-0 text-xs sm:text-sm">Teams</TabsTrigger>
          </TabsList>

          {/* Fixtures Tab */}
          <TabsContent value="fixtures" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Week {currentViewWeek} Fixtures
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={currentViewWeek <= 1}
                          onClick={() => handleChangeWeek(currentViewWeek - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={currentViewWeek >= league.totalWeeks}
                          onClick={() => handleChangeWeek(currentViewWeek + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                      {currentViewWeek === league.currentWeek && (
                        <Badge variant="default" size="sm">Current</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {leagueSettings.matchFormat?.replace('_', ' ') || 'Best of 3'} format
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
                  {isCommissioner && canAdvance && league.currentWeek < league.totalWeeks && (
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
                  {isCommissioner && league.currentWeek === league.totalWeeks && canAdvance && (
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
                    <Card
                      key={match.id}
                      className="border-2 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => router.push(`/league/${leagueId}/matchup/${match.id}`)}
                    >
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

                          {match.status === 'scheduled' && currentViewWeek === league.currentWeek && (
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleRecordMatch(match) }}>
                              Record Result
                            </Button>
                          )}
                          {match.status === 'scheduled' && currentViewWeek !== league.currentWeek && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              <Lock className="h-3 w-3 mr-1" />
                              {currentViewWeek > league.currentWeek ? 'Future week' : 'Past week'}
                            </Badge>
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

            {/* Sibling conference fixtures */}
            {isConference && siblingLeague && siblingFixtures.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="h-4 w-4" />
                    {siblingConferenceName} - Week {currentViewWeek}
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      onClick={() => router.push(`/league/${siblingLeague.id}`)}
                    >
                      View Full
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {siblingFixtures.map(match => (
                    <div key={match.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{match.homeTeam.name}</div>
                      </div>
                      <div className="text-center px-3">
                        {match.status === 'completed' ? (
                          <span className="text-lg font-bold">{match.homeScore} - {match.awayScore}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">vs</span>
                        )}
                      </div>
                      <div className="flex-1 text-right">
                        <div className="font-medium text-sm">{match.awayTeam.name}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Standings Tab */}
          <TabsContent value="standings" className="space-y-4">
            {/* Current conference standings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {isConference ? conferenceName : 'League Standings'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {standings.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No standings data yet</p>
                ) : (
                  <div className="space-y-2">
                    {standings.map((standing, index) => {
                      const colors = teamColorMap.get(standing.teamId)
                      const teamIndex = allTeamIds.indexOf(standing.teamId)
                      return (
                        <div
                          key={standing.id}
                          className={`flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border-l-[3px] ${colors?.border || ''}`}
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
                            <TeamIcon teamName={standing.team.name} teamIndex={teamIndex >= 0 ? teamIndex : index} size="md" />
                            <div>
                              <div className="font-semibold">{standing.team.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm text-muted-foreground">
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
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{standing.pointsFor} pts</div>
                            <div className={`text-sm ${
                              standing.pointDifferential > 0 ? 'text-green-600 dark:text-green-400' :
                              standing.pointDifferential < 0 ? 'text-red-600 dark:text-red-400' :
                              'text-muted-foreground'
                            }`}>
                              {standing.pointDifferential > 0 ? '+' : ''}{standing.pointDifferential} diff
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {standing.pointsFor} PF / {standing.pointsAgainst} PA
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
            {isConference && siblingLeague && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    {siblingConferenceName}
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      onClick={() => router.push(`/league/${siblingLeague.id}`)}
                    >
                      View Full
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {siblingStandings.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No standings data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {siblingStandings.map((standing, index) => {
                        const colors = teamColorMap.get(standing.teamId)
                        const teamIndex = allTeamIds.indexOf(standing.teamId)
                        return (
                          <div
                            key={standing.id}
                            className={`flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border-l-[3px] ${colors?.border || ''}`}
                            onClick={() => router.push(`/league/${siblingLeague.id}/team/${standing.teamId}`)}
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
                              <TeamIcon teamName={standing.team.name} teamIndex={teamIndex >= 0 ? teamIndex : index} size="md" />
                              <div>
                                <div className="font-semibold">{standing.team.name}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-sm text-muted-foreground">
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
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">{standing.pointsFor} pts</div>
                              <div className={`text-sm ${
                                standing.pointDifferential > 0 ? 'text-green-600 dark:text-green-400' :
                                standing.pointDifferential < 0 ? 'text-red-600 dark:text-red-400' :
                                'text-muted-foreground'
                              }`}>
                                {standing.pointDifferential > 0 ? '+' : ''}{standing.pointDifferential} diff
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Kill Leaders Tab */}
          <TabsContent value="kill-leaders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crosshair className="h-5 w-5" />
                  Kill Leaders
                </CardTitle>
                <CardDescription>Top Pokemon by total KOs across all matches</CardDescription>
              </CardHeader>
              <CardContent>
                {koLeaderboard.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No KO data recorded yet. Record match results to track Pokemon KOs.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {koLeaderboard.map((entry, index) => {
                      const team = league.teams.find(t => t.id === entry.teamId) || siblingLeague?.teams.find(t => t.id === entry.teamId)
                      const teamIndex = allTeamIds.indexOf(entry.teamId)
                      const colors = teamColorMap.get(entry.teamId)
                      return (
                        <div
                          key={entry.pickId}
                          className={`flex items-center gap-3 p-3 border rounded-lg border-l-[3px] ${colors?.border || ''}`}
                        >
                          <div className={`text-xl font-bold w-8 text-center ${
                            index === 0 ? 'text-yellow-500' :
                            index === 1 ? 'text-gray-400' :
                            index === 2 ? 'text-orange-600' :
                            'text-muted-foreground'
                          }`}>
                            {index + 1}
                          </div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getPokemonAnimatedUrl(entry.pokemonId, entry.pokemonName)}
                            alt={entry.pokemonName}
                            className="w-10 h-10 pixelated shrink-0"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              if (!target.dataset.fallback) {
                                target.dataset.fallback = '1'
                                target.src = getPokemonAnimatedBackupUrl(entry.pokemonId)
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm capitalize">{entry.pokemonName}</div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <TeamIcon teamName={team?.name || 'Unknown'} teamIndex={teamIndex >= 0 ? teamIndex : 0} size="sm" />
                              <span>{team?.name || 'Unknown'}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">{entry.totalKos}</div>
                            <div className="text-xs text-muted-foreground">
                              {entry.matchesPlayed > 0
                                ? `${(entry.totalKos / entry.matchesPlayed).toFixed(1)}/match`
                                : 'KOs'
                              }
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Graveyard - Dead Pokemon */}
            {deadPokemon.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Skull className="h-5 w-5 text-muted-foreground" />
                    Graveyard
                  </CardTitle>
                  <CardDescription>Pokemon eliminated from the league</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {deadPokemon.map((entry) => {
                      const team = league.teams.find(t => t.id === entry.teamId)
                      const colors = teamColorMap.get(entry.teamId)
                      return (
                        <div
                          key={entry.pickId}
                          className={`flex items-center gap-2 p-2 border rounded-md opacity-60 border-l-[3px] ${colors?.border || ''}`}
                        >
                          <Skull className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium capitalize truncate">{entry.pokemonName}</div>
                            <div className="text-xs text-muted-foreground truncate">{team?.name || 'Unknown'}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Playoffs Tab */}
          {playoffTournament && (
            <TabsContent value="playoffs" className="space-y-4">
              <PlayoffBracket tournament={playoffTournament} />
            </TabsContent>
          )}

          {/* Teams & Pokemon Tab */}
          <TabsContent value="teams" className="space-y-4">
            {teamsWithStatus.map(team => (
              <Card key={team.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{team.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{team.pokemonStatuses.length} Pokemon</Badge>
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
                  {(teamPicks[team.id] ?? []).length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {(teamPicks[team.id] ?? []).map(pick => {
                        const status = team.pokemonStatuses.find(s => s.pickId === pick.id)
                        return (
                          <div
                            key={pick.id}
                            className="flex items-center gap-2 p-2 border rounded-md"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={getPokemonAnimatedUrl(pick.pokemonId, pick.pokemonName)}
                              alt={pick.pokemonName}
                              className="w-10 h-10 pixelated shrink-0"
                              loading="lazy"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                if (!target.dataset.fallback) {
                                  target.dataset.fallback = '1'
                                  target.src = getPokemonAnimatedBackupUrl(pick.pokemonId)
                                }
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm capitalize truncate">{pick.pokemonName}</div>
                              <div className="text-xs text-muted-foreground">
                                {status ? `${status.totalKos} KOs • ${status.matchesPlayed} matches` : `${pick.cost} pts`}
                              </div>
                            </div>
                            {status && (
                              <PokemonStatusBadge status={status.status} size="sm" showText={false} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">No Pokemon data</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        {/* League Settings Modal */}
        {settingsOpen && leagueSettings && (
          <LeagueSettingsModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            leagueId={leagueId}
            currentSettings={leagueSettings}
            totalWeeks={league.totalWeeks}
            onSave={() => {
              setSettingsOpen(false)
              loadLeagueData()
            }}
          />
        )}

        {/* Start Playoffs Modal */}
        <StartPlayoffsModal
          open={showStartPlayoffs}
          onOpenChange={setShowStartPlayoffs}
          leagueId={leagueId}
          leagueName={league.name}
          standings={standings}
          onPlayoffsStarted={(json) => {
            setPlayoffTournament(importTournament(json))
          }}
        />

        {/* Match Recorder Modal */}
        {selectedMatch && leagueSettings && (
          <MatchRecorderModal
            isOpen={!!selectedMatch}
            onClose={() => setSelectedMatch(null)}
            match={selectedMatch}
            homeTeamPicks={homeTeamPicks}
            awayTeamPicks={awayTeamPicks}
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
