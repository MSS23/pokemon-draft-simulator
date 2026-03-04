'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import type { DraftSettings } from '@/types/supabase-helpers'
import type { League, Match, Team } from '@/types'
import { LeagueService } from '@/lib/league-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Loader2, Plus, Users, Trophy, Zap, Swords, Shield, ChevronRight, CalendarDays, Trash2 } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { notify } from '@/lib/notifications'
import Link from 'next/link'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'
import { createLogger } from '@/lib/logger'

const log = createLogger('Dashboard')

type DraftRow = Database['public']['Tables']['drafts']['Row']

interface TeamWithDraft {
  id: string
  name: string
  owner_id: string | null
  budget_remaining: number
  draft_order: number
  drafts: DraftRow
}

interface DraftSummary {
  draft_id: string
  draft_name: string
  status: DraftRow['status']
  format: DraftRow['format']
  ruleset: string
  room_code: string
  host_id: string
  created_at: string
  updated_at: string
  max_teams: number
  pokemon_per_team: number
  current_turn: number | null
  spectator_count: number
  user_team_id: string
  user_team_name: string
  is_host: boolean
  budget_remaining: number
  draft_order: number
  picks_made: number
  progress_percent: number
}

interface UpcomingMatch {
  league: League
  match: Match & { homeTeam: Team; awayTeam: Team }
  userTeamId: string
  userTeamName: string
  opponentTeamId: string
  opponentTeamName: string
  userTeamPicks: { pokemonId: string; pokemonName: string }[]
  opponentTeamPicks: { pokemonId: string; pokemonName: string }[]
}

interface LeagueStanding {
  league: League
  userTeamId: string
  userTeamName: string
  wins: number
  losses: number
  draws: number
  rank: number | null
  currentStreak: string | null
}

function buildDraftSummaries(
  teams: TeamWithDraft[],
  pickCounts: Record<string, number>,
  userId: string
): DraftSummary[] {
  return teams.map((team) => {
    const draft = team.drafts
    const settings = (draft.settings ?? {}) as DraftSettings
    const pokemonPerTeam = settings.maxPokemonPerTeam ?? 6
    const picksMade = pickCounts[team.id] ?? 0
    const progress = pokemonPerTeam > 0
      ? Math.min(100, Math.round((picksMade / pokemonPerTeam) * 100))
      : 0

    return {
      draft_id: draft.id,
      draft_name: draft.name,
      status: draft.status,
      format: draft.format,
      ruleset: draft.ruleset,
      room_code: draft.room_code ?? '',
      host_id: draft.host_id,
      created_at: draft.created_at,
      updated_at: draft.updated_at,
      max_teams: draft.max_teams,
      pokemon_per_team: pokemonPerTeam,
      current_turn: draft.current_turn,
      spectator_count: draft.spectator_count,
      user_team_id: team.id,
      user_team_name: team.name,
      is_host: draft.host_id === userId,
      budget_remaining: team.budget_remaining,
      draft_order: team.draft_order,
      picks_made: picksMade,
      progress_percent: progress,
    }
  })
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatch[]>([])
  const [leagueStandings, setLeagueStandings] = useState<LeagueStanding[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null)

  const handleDeleteLeague = async (leagueId: string) => {
    if (!user) return
    try {
      await LeagueService.deleteLeague(leagueId, user.id)
      setLeagueStandings(prev => prev.filter(s => s.league.id !== leagueId))
      notify.success('League Deleted', 'The league has been removed.')
    } catch (err) {
      notify.error('Failed to Delete', err instanceof Error ? err.message : 'Could not delete league')
    } finally {
      setDeletingLeagueId(null)
    }
  }
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active')

  useEffect(() => {
    const loadDashboardData = async () => {
      if (authLoading) return
      if (!user) {
        setLoading(false)
        return
      }

      try {
        if (!supabase) {
          setDrafts([])
          setLoading(false)
          return
        }

        // Fetch teams with their draft data
        const { data: userTeams, error: teamsError } = await supabase
          .from('teams')
          .select(`
            id, name, owner_id, budget_remaining, draft_order,
            drafts!inner(id, name, status, format, ruleset, room_code, host_id,
              created_at, updated_at, max_teams, current_turn, spectator_count, settings, deleted_at)
          `)
          .eq('owner_id', user.id)
          .is('drafts.deleted_at', null)

        if (teamsError) {
          setFetchError(`Failed to load your drafts: ${teamsError.message}`)
          setDrafts([])
          setLoading(false)
          return
        }

        const teams = (userTeams ?? []) as unknown as TeamWithDraft[]

        // Batch-query pick counts for all user teams
        const teamIds = teams.map(t => t.id)
        let pickCounts: Record<string, number> = {}

        if (teamIds.length > 0) {
          const { data: picks, error: picksError } = await supabase
            .from('picks')
            .select('team_id')
            .in('team_id', teamIds)

          if (!picksError && picks) {
            pickCounts = picks.reduce<Record<string, number>>((acc, pick) => {
              acc[pick.team_id] = (acc[pick.team_id] ?? 0) + 1
              return acc
            }, {})
          }
        }

        setFetchError(null)
        setDrafts(buildDraftSummaries(teams, pickCounts, user.id))

        // Load league data in parallel
        try {
          const [matches, standings] = await Promise.all([
            LeagueService.getUpcomingMatches(user.id),
            LeagueService.getUserLeagueStandings(user.id),
          ])
          setUpcomingMatches(matches)
          setLeagueStandings(standings)
        } catch (err) {
          log.error('Failed to load league data:', err)
          // Non-fatal: leagues section just won't show
        }
      } catch {
        setFetchError('An unexpected error occurred. Please try again.')
        setDrafts([])
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [authLoading, user])

  if (authLoading || loading) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SidebarLayout>
    )
  }

  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <Card className="max-w-sm w-full">
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Sign in to continue</CardTitle>
              <CardDescription>
                View your drafts and league activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setAuthModalOpen(true)}>
                Sign In
              </Button>
            </CardContent>
          </Card>
          <AuthModal
            isOpen={authModalOpen}
            onClose={() => setAuthModalOpen(false)}
            redirectTo="/dashboard"
          />
        </div>
      </SidebarLayout>
    )
  }

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User'
  const activeDrafts = drafts.filter(d => d.status === 'active' || d.status === 'setup')
  const completedDrafts = drafts.filter(d => d.status === 'completed')

  // Aggregate league W-L across all leagues
  const totalWins = leagueStandings.reduce((sum, s) => sum + s.wins, 0)
  const totalLosses = leagueStandings.reduce((sum, s) => sum + s.losses, 0)
  const activeLeagueCount = leagueStandings.filter(s => s.league.status === 'active').length

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      setup: { label: 'Setup', variant: 'outline' },
      active: { label: 'Active', variant: 'default' },
      completed: { label: 'Completed', variant: 'secondary' },
      paused: { label: 'Paused', variant: 'outline' },
      scheduled: { label: 'Starts Soon', variant: 'outline' }
    }
    const c = config[status] || config.setup
    return <Badge variant={c.variant} size="sm">{c.label}</Badge>
  }

  const getMatchStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      scheduled: { label: 'Scheduled', variant: 'outline' },
      in_progress: { label: 'Live', variant: 'default' },
      completed: { label: 'Done', variant: 'secondary' },
      cancelled: { label: 'Cancelled', variant: 'outline' },
    }
    const c = config[status] || config.scheduled
    return <Badge variant={c.variant} size="sm">{c.label}</Badge>
  }

  const DraftCard = ({ draft }: { draft: DraftSummary }) => (
    <Card
      className="card-interactive"
      onClick={() => router.push(`/draft/${draft.room_code.toLowerCase()}`)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{draft.draft_name}</p>
              {draft.is_host && <Badge variant="host" size="sm" className="shrink-0">Host</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-mono">{draft.room_code}</span> &middot; {draft.user_team_name}
            </p>
          </div>
          {getStatusBadge(draft.status)}
        </div>

        {draft.status !== 'setup' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span className="font-medium text-foreground">{draft.progress_percent}%</span>
            </div>
            <Progress value={draft.progress_percent} className="h-1.5" />
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Picks</p>
            <p className="text-sm font-semibold">{draft.picks_made}/{draft.pokemon_per_team}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Budget</p>
            <p className="text-sm font-semibold">{draft.budget_remaining}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Format</p>
            <p className="text-sm font-semibold capitalize">{draft.format}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const PokemonGifRow = ({ picks, maxShow = 6 }: { picks: { pokemonId: string; pokemonName: string }[]; maxShow?: number }) => (
    <div className="flex items-center justify-center gap-0.5">
      {picks.slice(0, maxShow).map((p) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={p.pokemonId}
          src={getPokemonAnimatedUrl(p.pokemonId, p.pokemonName)}
          alt={p.pokemonName}
          className="w-8 h-8 pixelated"
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            if (!target.dataset.fallback) {
              target.dataset.fallback = '1'
              target.src = getPokemonAnimatedBackupUrl(p.pokemonId)
            }
          }}
        />
      ))}
    </div>
  )

  const MatchupCard = ({ matchup }: { matchup: UpcomingMatch }) => {
    const isHome = matchup.match.homeTeamId === matchup.userTeamId
    const userScore = isHome ? matchup.match.homeScore : matchup.match.awayScore
    const opponentScore = isHome ? matchup.match.awayScore : matchup.match.homeScore

    return (
      <Card
        className="card-interactive"
        onClick={() => router.push(`/league/${matchup.league.id}/team/${matchup.opponentTeamId}`)}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {matchup.league.name}
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" size="sm">
                Week {matchup.league.currentWeek}/{matchup.league.totalWeeks}
              </Badge>
              {getMatchStatusBadge(matchup.match.status)}
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            <div className="flex-1 text-right space-y-1">
              <p className="text-sm font-semibold truncate">{matchup.userTeamName}</p>
              <PokemonGifRow picks={matchup.userTeamPicks} />
            </div>

            {matchup.match.status === 'completed' ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-muted/50 shrink-0">
                <span className="text-lg font-bold tabular-nums">{userScore}</span>
                <span className="text-xs text-muted-foreground">-</span>
                <span className="text-lg font-bold tabular-nums">{opponentScore}</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 shrink-0">
                <Swords className="h-5 w-5 text-muted-foreground" />
              </div>
            )}

            <div className="flex-1 text-left space-y-1">
              <p className="text-sm font-semibold truncate">{matchup.opponentTeamName}</p>
              <PokemonGifRow picks={matchup.opponentTeamPicks} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              className="text-[10px] text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/league/${matchup.league.id}/schedule`)
              }}
            >
              <CalendarDays className="h-3 w-3" />
              {matchup.match.scheduledDate
                ? new Date(matchup.match.scheduledDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                : 'Full Schedule'}
            </button>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              View opponent&apos;s team <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {displayName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your drafts and leagues.
          </p>
        </div>

        {/* Error */}
        {fetchError && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm font-medium text-destructive">{fetchError}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Total Drafts</p>
                <Trophy className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-2xl font-bold">{drafts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Active Drafts</p>
                <Zap className="h-3.5 w-3.5 text-success" />
              </div>
              <p className="text-2xl font-bold">{activeDrafts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Active Leagues</p>
                <Shield className="h-3.5 w-3.5 text-info" />
              </div>
              <p className="text-2xl font-bold">{activeLeagueCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">League W-L</p>
                <Users className="h-3.5 w-3.5 text-accent" />
              </div>
              <p className="text-2xl font-bold">
                {totalWins + totalLosses > 0 ? `${totalWins}-${totalLosses}` : '-'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* This Week's Matches */}
        {upcomingMatches.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Swords className="h-4 w-4" />
                  This Week&apos;s Matches
                </CardTitle>
                <Badge variant="secondary" size="sm">
                  {upcomingMatches.length} {upcomingMatches.length === 1 ? 'match' : 'matches'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {upcomingMatches.map(matchup => (
                  <MatchupCard key={matchup.match.id} matchup={matchup} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* My Leagues */}
        {leagueStandings.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  My Leagues
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {leagueStandings.map(standing => (
                  <Card
                    key={standing.league.id}
                    className="card-interactive"
                    onClick={() => router.push(`/league/${standing.league.id}`)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{standing.league.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {standing.userTeamName}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {getStatusBadge(standing.league.status)}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeletingLeagueId(standing.league.id) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">Record</p>
                          <p className="text-sm font-semibold">
                            {standing.wins}-{standing.losses}{standing.draws > 0 ? `-${standing.draws}` : ''}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Week</p>
                          <p className="text-sm font-semibold">
                            {standing.league.currentWeek}/{standing.league.totalWeeks}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Rank</p>
                          <p className="text-sm font-semibold">
                            {standing.rank ? `#${standing.rank}` : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Streak</p>
                          <p className={`text-sm font-semibold ${
                            standing.currentStreak?.startsWith('W') ? 'text-success' :
                            standing.currentStreak?.startsWith('L') ? 'text-destructive' : ''
                          }`}>
                            {standing.currentStreak || '-'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={!!deletingLeagueId} onOpenChange={() => setDeletingLeagueId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete League?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the league and all its matches, standings, and trade history. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deletingLeagueId && handleDeleteLeague(deletingLeagueId)}
              >
                Delete League
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Empty state for leagues */}
        {leagueStandings.length === 0 && upcomingMatches.length === 0 && drafts.some(d => d.status === 'completed') && (
          <Card>
            <CardContent className="py-8 text-center space-y-2">
              <Shield className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm font-medium">No leagues yet</p>
              <p className="text-xs text-muted-foreground">
                Complete a draft and create a league to start battling.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Drafts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Drafts</CardTitle>
              <Button size="sm" asChild>
                <Link href="/create-draft">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New Draft
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {drafts.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <Trophy className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <div>
                  <p className="font-medium text-sm">No drafts yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Create your first draft to get started.</p>
                </div>
                <Button size="sm" asChild>
                  <Link href="/create-draft">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Create Draft
                  </Link>
                </Button>
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="mb-4">
                  <TabsTrigger value="active">Active ({activeDrafts.length})</TabsTrigger>
                  <TabsTrigger value="completed">Completed ({completedDrafts.length})</TabsTrigger>
                  <TabsTrigger value="all">All ({drafts.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="active">
                  {activeDrafts.length === 0 ? (
                    <p className="text-center py-8 text-sm text-muted-foreground">No active drafts.</p>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {activeDrafts.map(draft => <DraftCard key={draft.draft_id} draft={draft} />)}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="completed">
                  {completedDrafts.length === 0 ? (
                    <p className="text-center py-8 text-sm text-muted-foreground">No completed drafts.</p>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {completedDrafts.map(draft => <DraftCard key={draft.draft_id} draft={draft} />)}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="all">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {drafts.map(draft => <DraftCard key={draft.draft_id} draft={draft} />)}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  )
}
