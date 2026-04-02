'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import type { DraftSettings } from '@/types/supabase-helpers'
import type { League, Match, Team } from '@/types'
import { LeagueService } from '@/lib/league-service'
import { getFormatById } from '@/lib/formats'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Loader2, Plus, Users, Trophy, Swords, Shield,
  ChevronRight, Trash2, Eye, Clock, Crown
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { notify } from '@/lib/notifications'
import Link from 'next/link'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'
import { createLogger } from '@/lib/logger'
import { motion } from 'framer-motion'

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

interface TeamRoster {
  teamId: string
  teamName: string
  draftName: string
  draftStatus: string
  roomCode: string
  leagueId?: string
  leagueName?: string
  picks: { pokemonId: string; pokemonName: string }[]
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

/* ── Fade-in animation helpers ── */
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [teamRosters, setTeamRosters] = useState<TeamRoster[]>([])
  const [spectatedDrafts, setSpectatedDrafts] = useState<{ draft_id: string; draft_name: string; status: string; room_code: string }[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatch[]>([])
  const [leagueStandings, setLeagueStandings] = useState<LeagueStanding[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active')
  const [dashboardView, setDashboardView] = useState<'drafts' | 'leagues' | 'tournaments'>('drafts')

  const handleDeleteLeague = useCallback(async (leagueId: string) => {
    if (!user) return
    try {
      const leagueDraftId = leagueStandings.find(s => s.league.id === leagueId)?.league.draftId
      await LeagueService.deleteLeague(leagueId, user.id)
      setLeagueStandings(prev => prev.filter(s => s.league.id !== leagueId))
      setUpcomingMatches(prev => prev.filter(m => m.league.id !== leagueId))
      if (leagueDraftId) {
        setDrafts(prev => prev.filter(d => d.draft_id !== leagueDraftId))
      }
      notify.success('League Deleted', 'The league and its draft have been removed.')
    } catch (err) {
      notify.error('Failed to Delete', err instanceof Error ? err.message : 'Could not delete league')
    } finally {
      setDeletingLeagueId(null)
    }
  }, [user, leagueStandings])

  const handleDeleteDraft = useCallback(async (draftId: string, roomCode: string) => {
    if (!user) return
    try {
      const { DraftService } = await import('@/lib/draft-service')
      await DraftService.deleteDraft(roomCode.toLowerCase(), user.id)
      setDrafts(prev => prev.filter(d => d.draft_id !== draftId))
      notify.success('Draft Deleted', 'The draft has been removed.')
    } catch (err) {
      notify.error('Failed to Delete', err instanceof Error ? err.message : 'Could not delete draft')
    } finally {
      setDeletingDraftId(null)
    }
  }, [user])

  useEffect(() => {
    const loadDashboardData = async () => {
      if (authLoading) return
      if (!user) { setLoading(false); return }

      try {
        if (!supabase) { setDrafts([]); setLoading(false); return }

        const { data: userTeams, error: teamsError } = await supabase
          .from('teams')
          .select(`
            id, name, owner_id, budget_remaining, draft_order,
            drafts!inner(id, name, status, format, ruleset, room_code, host_id,
              created_at, updated_at, max_teams, current_turn, spectator_count, settings, deleted_at)
          `)
          .eq('owner_id', user.id)
          .is('drafts.deleted_at', null)
          .limit(50)

        if (teamsError) {
          setFetchError(`Failed to load your drafts: ${teamsError.message}`)
          setDrafts([]); setLoading(false); return
        }

        const teams = (userTeams ?? []) as unknown as TeamWithDraft[]
        const teamIds = teams.map(t => t.id)
        let pickCounts: Record<string, number> = {}

        if (teamIds.length > 0) {
          const { data: picks, error: picksError } = await supabase
            .from('picks').select('team_id, pokemon_id, pokemon_name, pick_order').in('team_id', teamIds)
          if (!picksError && picks) {
            pickCounts = picks.reduce<Record<string, number>>((acc, pick) => {
              acc[pick.team_id] = (acc[pick.team_id] ?? 0) + 1
              return acc
            }, {})

            // Build team rosters grouped by team
            const picksByTeam = picks.reduce<Record<string, { pokemonId: string; pokemonName: string; pickOrder: number }[]>>((acc, pick) => {
              if (!acc[pick.team_id]) acc[pick.team_id] = []
              acc[pick.team_id].push({ pokemonId: pick.pokemon_id, pokemonName: pick.pokemon_name, pickOrder: pick.pick_order })
              return acc
            }, {})

            const rosters: TeamRoster[] = teams
              .filter(t => (picksByTeam[t.id]?.length ?? 0) > 0)
              .map(t => ({
                teamId: t.id,
                teamName: t.name,
                draftName: t.drafts.name,
                draftStatus: t.drafts.status,
                roomCode: t.drafts.room_code ?? '',
                picks: (picksByTeam[t.id] ?? [])
                  .sort((a, b) => a.pickOrder - b.pickOrder)
                  .map(p => ({ pokemonId: p.pokemonId, pokemonName: p.pokemonName })),
              }))
            setTeamRosters(rosters)
          }
        }

        setFetchError(null)
        const draftSummaries = buildDraftSummaries(teams, pickCounts, user.id)
        setDrafts(draftSummaries)

        // Spectated drafts
        const participantDraftIds = new Set(draftSummaries.map(d => d.draft_id))
        const { data: spectatorRows } = await supabase
          .from('participants')
          .select('draft_id, drafts!inner(id, name, status, room_code, deleted_at)')
          .eq('user_id', user.id)
          .is('team_id', null)
          .is('drafts.deleted_at', null)

        if (spectatorRows) {
          const unique = spectatorRows
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((r: any) => ({
              draft_id: r.drafts.id as string,
              draft_name: r.drafts.name as string,
              status: r.drafts.status as string,
              room_code: r.drafts.room_code as string,
            }))
            .filter(d => !participantDraftIds.has(d.draft_id))
          setSpectatedDrafts(unique)
        }

        // League data
        try {
          const [matches, standings] = await Promise.all([
            LeagueService.getUpcomingMatches(user.id),
            LeagueService.getUserLeagueStandings(user.id),
          ])
          setUpcomingMatches(matches)
          setLeagueStandings(standings)
        } catch (err) {
          log.error('Failed to load league data:', err)
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

  /* ── Loading ── */
  if (authLoading || loading) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SidebarLayout>
    )
  }

  /* ── Not authenticated ── */
  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <Card className="max-w-sm w-full text-center">
            <CardContent className="pt-8 pb-6 px-6 space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Trophy className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Sign in to continue</h2>
                <p className="text-sm text-muted-foreground mt-1">View your drafts and league activity.</p>
              </div>
              <Button variant="brand" className="w-full" onClick={() => setAuthModalOpen(true)}>
                Sign In
              </Button>
            </CardContent>
          </Card>
          <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} redirectTo="/dashboard" />
        </div>
      </SidebarLayout>
    )
  }

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Trainer'
  const activeDrafts = drafts.filter(d => d.status === 'active' || d.status === 'setup')
  const completedDrafts = drafts.filter(d => d.status === 'completed')
  const totalWins = leagueStandings.reduce((sum, s) => sum + s.wins, 0)
  const totalLosses = leagueStandings.reduce((sum, s) => sum + s.losses, 0)
  const activeLeagueCount = leagueStandings.filter(s => s.league.status === 'active').length
  const winRate = totalWins + totalLosses > 0
    ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
    : null

  /* ── Status badge helper ── */
  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'success' | 'live' }> = {
      setup: { label: 'Setup', variant: 'outline' },
      active: { label: 'Live', variant: 'live' },
      completed: { label: 'Completed', variant: 'secondary' },
      paused: { label: 'Paused', variant: 'outline' },
      scheduled: { label: 'Scheduled', variant: 'outline' },
      in_progress: { label: 'In Progress', variant: 'live' },
    }
    const c = map[status] || map.setup
    return <Badge variant={c.variant} size="sm">{c.label}</Badge>
  }

  /* ── Pokemon sprite row ── */
  const SpriteRow = ({ picks, max = 6 }: { picks: { pokemonId: string; pokemonName: string }[]; max?: number }) => (
    <div className="flex items-center gap-0.5">
      {picks.slice(0, max).map((p) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={p.pokemonId}
          src={getPokemonAnimatedUrl(p.pokemonId, p.pokemonName)}
          alt={p.pokemonName}
          className="w-7 h-7 pixelated"
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

  return (
    <SidebarLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <motion.div
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div>
            <p className="text-xs text-muted-foreground mb-1">Welcome back</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{displayName}</h1>
          </div>
          <div className="flex gap-2">
            {dashboardView === 'drafts' && (
              <>
                <Button size="sm" variant="outline" className="text-xs" asChild>
                  <Link href="/join-draft">Join Draft</Link>
                </Button>
                <Button size="sm" className="text-xs" asChild>
                  <Link href="/create-draft">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    New Draft
                  </Link>
                </Button>
              </>
            )}
            {dashboardView === 'tournaments' && (
              <>
                <Button size="sm" variant="outline" className="text-xs" asChild>
                  <Link href="/join-tournament">Join Tournament</Link>
                </Button>
                <Button size="sm" className="text-xs" asChild>
                  <Link href="/create-tournament">
                    <Swords className="h-3.5 w-3.5 mr-1" />
                    New Tournament
                  </Link>
                </Button>
              </>
            )}
          </div>
        </motion.div>

        {/* ═══════════════════ Error ═══════════════════ */}
        {fetchError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            {fetchError}
          </div>
        )}

        {/* ═══════════════════ Stat Cards ═══════════════════ */}
        <div id="tour-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Drafts', value: String(drafts.length) },
            { label: 'Active Now', value: String(activeDrafts.length) },
            { label: 'Leagues', value: String(activeLeagueCount) },
            {
              label: 'Win Rate',
              value: winRate !== null ? `${winRate}%` : '-',
              sub: totalWins + totalLosses > 0 ? `${totalWins}W ${totalLosses}L` : undefined,
            },
          ].map((stat, i) => (
            <motion.div key={stat.label} custom={i} variants={fadeUp} initial="hidden" animate="visible">
              <Card>
                <CardContent className="p-4">
                  <p className="text-2xl font-bold tabular-nums tracking-tight">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.label}
                    {stat.sub && <span className="ml-1 text-foreground/50">({stat.sub})</span>}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* ═══════════════════ View Tabs ═══════════════════ */}
        <Tabs id="tour-view-tabs" value={dashboardView} onValueChange={(v) => setDashboardView(v as typeof dashboardView)}>
          <TabsList>
            <TabsTrigger value="drafts" className="gap-1.5">
              <Trophy className="h-3.5 w-3.5" />
              Drafts
              {drafts.length > 0 && <Badge variant="secondary" size="sm" className="ml-1 text-[10px] px-1.5">{drafts.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="leagues" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Leagues
              {leagueStandings.filter(s => s.league.leagueType !== 'knockout').length > 0 && (
                <Badge variant="secondary" size="sm" className="ml-1 text-[10px] px-1.5">
                  {leagueStandings.filter(s => s.league.leagueType !== 'knockout').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tournaments" className="gap-1.5">
              <Swords className="h-3.5 w-3.5" />
              Tournaments
              {leagueStandings.filter(s => s.league.leagueType === 'knockout').length > 0 && (
                <Badge variant="secondary" size="sm" className="ml-1 text-[10px] px-1.5">
                  {leagueStandings.filter(s => s.league.leagueType === 'knockout').length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════ DRAFTS TAB ═══════════════════ */}
          <TabsContent value="drafts" className="mt-4 space-y-6">
            {/* My Drafts */}
            <div className="space-y-3" id="tour-drafts">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">My Drafts</h2>
                {drafts.length > 0 && (
                  <span className="text-[11px] font-medium text-muted-foreground/60 tabular-nums">{drafts.length} total</span>
                )}
              </div>

              {drafts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Swords className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-base">No drafts yet</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Create your first draft to start building your team.
                  </p>
                  <Button className="mt-4" onClick={() => router.push('/create-draft')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Draft
                  </Button>
                </div>
              ) : (
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                  <TabsList>
                    <TabsTrigger value="active">Active ({activeDrafts.length})</TabsTrigger>
                    <TabsTrigger value="completed">Completed ({completedDrafts.length})</TabsTrigger>
                    <TabsTrigger value="all">All ({drafts.length})</TabsTrigger>
                  </TabsList>

                  {(['active', 'completed', 'all'] as const).map(tab => {
                    const list = tab === 'active' ? activeDrafts : tab === 'completed' ? completedDrafts : drafts
                    return (
                      <TabsContent key={tab} value={tab} className="mt-3">
                        {list.length === 0 ? (
                          <p className="text-center py-8 text-sm text-muted-foreground">
                            No {tab === 'all' ? '' : tab} drafts.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {list.map((draft, i) => (
                              <motion.div key={draft.draft_id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                                <Card
                                  className="card-interactive group"
                                  onClick={() => router.push(`/draft/${draft.room_code.toLowerCase()}`)}
                                >
                                  <CardContent className="p-4 space-y-3">
                                    {/* Title row */}
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <p className="font-semibold text-sm truncate">{draft.draft_name}</p>
                                          {draft.is_host && <Badge variant="host" size="sm" className="shrink-0">Host</Badge>}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          <span className="font-mono">{draft.room_code}</span>
                                          <span className="mx-1">&middot;</span>
                                          {draft.user_team_name}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {statusBadge(draft.status)}
                                        {draft.is_host && (
                                          <button
                                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                            title="Delete draft"
                                            onClick={(e) => { e.stopPropagation(); setDeletingDraftId(draft.draft_id) }}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Progress bar */}
                                    {draft.status !== 'setup' && (
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">
                                            {draft.picks_made}/{draft.pokemon_per_team} picks
                                          </span>
                                          <span className="font-medium tabular-nums">{draft.progress_percent}%</span>
                                        </div>
                                        <Progress value={draft.progress_percent} className="h-1.5" />
                                      </div>
                                    )}

                                    {/* Stats row */}
                                    <div className="flex items-center gap-4 text-xs">
                                      <div className="flex items-center gap-1 text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        <span className="capitalize">{draft.format}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-muted-foreground">
                                        <Users className="h-3 w-3" />
                                        <span>{draft.max_teams} teams</span>
                                      </div>
                                      <div className="flex-1" />
                                      <span className="font-medium tabular-nums text-foreground">
                                        {draft.budget_remaining} pts
                                      </span>
                                    </div>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                    )
                  })}
                </Tabs>
              )}
            </div>

            {/* My Teams */}
            {teamRosters.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  My Teams
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {teamRosters.map(roster => (
                    <Card
                      key={roster.teamId}
                      className="card-interactive group"
                      onClick={() => router.push(`/draft/${roster.roomCode.toLowerCase()}`)}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{roster.teamName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {roster.draftName}
                              <span className="mx-1">&middot;</span>
                              {roster.picks.length} picks
                            </p>
                          </div>
                          {statusBadge(roster.draftStatus)}
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {roster.picks.map((p) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={p.pokemonId}
                              src={getPokemonAnimatedUrl(p.pokemonId, p.pokemonName)}
                              alt={p.pokemonName}
                              title={p.pokemonName.charAt(0).toUpperCase() + p.pokemonName.slice(1)}
                              className="w-10 h-10 pixelated"
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Spectating */}
            {spectatedDrafts.filter(d => d.status !== 'completed').length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  Spectating
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {spectatedDrafts.filter(d => d.status !== 'completed').map(d => (
                    <Card
                      key={d.draft_id}
                      className="card-interactive"
                      onClick={() => router.push(`/draft/${d.room_code.toLowerCase()}?spectator=true`)}
                    >
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{d.draft_name}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{d.room_code}</p>
                        </div>
                        {statusBadge(d.status)}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════ LEAGUES TAB ═══════════════════ */}
          <TabsContent value="leagues" className="mt-4 space-y-6">
            {/* Upcoming Matches */}
            {upcomingMatches.length > 0 && (
              <div className="space-y-3" id="tour-matches">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Swords className="h-4 w-4 text-primary" />
                    This Week
                  </h2>
                  <Badge variant="outline" size="sm" className="font-semibold tabular-nums">
                    {upcomingMatches.length} {upcomingMatches.length === 1 ? 'match' : 'matches'}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {upcomingMatches.map(matchup => {
                    const isHome = matchup.match.homeTeamId === matchup.userTeamId
                    const userScore = isHome ? matchup.match.homeScore : matchup.match.awayScore
                    const opponentScore = isHome ? matchup.match.awayScore : matchup.match.homeScore

                    return (
                      <Card
                        key={matchup.match.id}
                        className="card-interactive group"
                        onClick={() => router.push(`/league/${matchup.league.id}/team/${matchup.opponentTeamId}`)}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground truncate max-w-[60%]">
                              {matchup.league.name} &middot; Week {matchup.league.currentWeek}
                            </p>
                            {statusBadge(matchup.match.status)}
                          </div>

                          {/* VS layout */}
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{matchup.userTeamName}</p>
                              <SpriteRow picks={matchup.userTeamPicks} />
                            </div>

                            {matchup.match.status === 'completed' ? (
                              <div className="shrink-0 flex items-center gap-1 bg-muted/50 rounded-lg px-3 py-1.5">
                                <span className="text-xl font-bold tabular-nums tracking-tight">{userScore}</span>
                                <span className="text-muted-foreground/40 text-xs font-bold mx-0.5">-</span>
                                <span className="text-xl font-bold tabular-nums tracking-tight">{opponentScore}</span>
                              </div>
                            ) : (
                              <div className="shrink-0 px-3">
                                <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">vs</span>
                              </div>
                            )}

                            <div className="flex-1 min-w-0 text-right">
                              <p className="text-sm font-semibold truncate">{matchup.opponentTeamName}</p>
                              <div className="flex justify-end">
                                <SpriteRow picks={matchup.opponentTeamPicks} />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            View matchup <ChevronRight className="h-3 w-3 ml-0.5" />
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {/* League Standings */}
            {leagueStandings.filter(s => s.league.leagueType !== 'knockout').length > 0 ? (
              <div className="space-y-3" id="tour-leagues">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  My Leagues
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {leagueStandings.filter(s => s.league.leagueType !== 'knockout').map(standing => {
                    const isCommissioner = standing.league.settings?.commissionerId === user?.id
                    const totalGames = standing.wins + standing.losses + standing.draws
                    const wPct = totalGames > 0 ? Math.round((standing.wins / totalGames) * 100) : 0
                    const leagueUrl = `/league/${standing.league.id}`

                    return (
                      <Card
                        key={standing.league.id}
                        className="card-interactive group"
                        onClick={() => router.push(leagueUrl)}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-sm truncate">{standing.league.name}</p>
                                {isCommissioner && (
                                  <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {standing.userTeamName} &middot; Week {standing.league.currentWeek}/{standing.league.totalWeeks}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {statusBadge(standing.league.status)}
                              {isCommissioner && (
                                <button
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                  title="Delete league"
                                  onClick={(e) => { e.stopPropagation(); setDeletingLeagueId(standing.league.id) }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className="text-2xl font-bold tabular-nums tracking-tight">
                              {standing.wins}-{standing.losses}
                              {standing.draws > 0 && <span className="text-lg">-{standing.draws}</span>}
                            </span>

                            {standing.rank && (
                              <Badge variant="outline" size="sm" className="tabular-nums">
                                #{standing.rank}
                              </Badge>
                            )}

                            {standing.currentStreak && (
                              <span className={`text-xs font-semibold ${
                                standing.currentStreak.startsWith('W') ? 'text-green-600 dark:text-green-400' :
                                standing.currentStreak.startsWith('L') ? 'text-red-500 dark:text-red-400' :
                                'text-muted-foreground'
                              }`}>
                                {standing.currentStreak}
                              </span>
                            )}

                            <div className="flex-1" />
                            <span className="text-xs text-muted-foreground tabular-nums">{wPct}% WR</span>
                          </div>

                          <Progress
                            value={Math.round((standing.league.currentWeek / standing.league.totalWeeks) * 100)}
                            className="h-1"
                          />
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Trophy className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-semibold text-base">No leagues yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Complete a draft to start a league with your group.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════ TOURNAMENTS TAB ═══════════════════ */}
          <TabsContent value="tournaments" className="mt-4 space-y-6">
            {leagueStandings.filter(s => s.league.leagueType === 'knockout').length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Swords className="h-4 w-4 text-red-500" />
                  My Tournaments
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {leagueStandings.filter(s => s.league.leagueType === 'knockout').map(standing => {
                    const isCommissioner = standing.league.settings?.commissionerId === user?.id
                    const leagueUrl = `/tournament/${standing.league.id}`
                    const formatId = (standing.league.settings as Record<string, unknown>)?.formatId as string | undefined
                    const format = formatId ? getFormatById(formatId) : null
                    return (
                      <Card key={standing.league.id} className="card-interactive group" onClick={() => router.push(leagueUrl)}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-sm truncate">{standing.league.name}</p>
                                {isCommissioner && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {format && <Badge variant="outline" size="sm" className="text-[10px]">{format.shortName}</Badge>}
                                <span className="text-xs text-muted-foreground">
                                  Round {standing.league.currentWeek}/{standing.league.totalWeeks}
                                </span>
                              </div>
                            </div>
                            {statusBadge(standing.league.status)}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-bold tabular-nums">{standing.wins}W-{standing.losses}L</span>
                            {standing.league.status === 'completed' && standing.wins > standing.losses && (
                              <Trophy className="h-4 w-4 text-yellow-500" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Swords className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-semibold text-base">No tournaments yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Create a knockout tournament and invite players.
                </p>
                <Button className="mt-4" variant="outline" onClick={() => router.push('/create-tournament')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Tournament
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ═══════════════════ Delete Dialogs ═══════════════════ */}
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

        <AlertDialog open={!!deletingDraftId} onOpenChange={() => setDeletingDraftId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Draft?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the draft and all its picks. All participants will be notified. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const draft = drafts.find(d => d.draft_id === deletingDraftId)
                  if (draft) handleDeleteDraft(draft.draft_id, draft.room_code)
                }}
              >
                Delete Draft
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SidebarLayout>
  )
}
