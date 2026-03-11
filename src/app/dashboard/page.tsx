'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import type { DraftSettings } from '@/types/supabase-helpers'
import type { League, Match, Team } from '@/types'
import { LeagueService } from '@/lib/league-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Loader2, Plus, Users, Trophy, Zap, Swords, Shield,
  ChevronRight, Trash2, Eye, TrendingUp, Clock, Crown
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
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.4, type: 'spring' as const, damping: 24 },
  }),
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [spectatedDrafts, setSpectatedDrafts] = useState<{ draft_id: string; draft_name: string; status: string; room_code: string }[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatch[]>([])
  const [leagueStandings, setLeagueStandings] = useState<LeagueStanding[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active')

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

        if (teamsError) {
          setFetchError(`Failed to load your drafts: ${teamsError.message}`)
          setDrafts([]); setLoading(false); return
        }

        const teams = (userTeams ?? []) as unknown as TeamWithDraft[]
        const teamIds = teams.map(t => t.id)
        let pickCounts: Record<string, number> = {}

        if (teamIds.length > 0) {
          const { data: picks, error: picksError } = await supabase
            .from('picks').select('team_id').in('team_id', teamIds)
          if (!picksError && picks) {
            pickCounts = picks.reduce<Record<string, number>>((acc, pick) => {
              acc[pick.team_id] = (acc[pick.team_id] ?? 0) + 1
              return acc
            }, {})
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* ═══════════════════ Header ═══════════════════ */}
        <motion.div
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div>
            <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-widest mb-1">Welcome back</p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{displayName}</h1>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="text-xs font-semibold" asChild>
              <Link href="/join-draft">Join Draft</Link>
            </Button>
            <Button size="sm" variant="brand" className="text-xs font-semibold" asChild>
              <Link href="/create-draft">
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Draft
              </Link>
            </Button>
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
            {
              icon: Trophy, label: 'Total Drafts', value: String(drafts.length),
              accent: 'text-amber-500', bg: 'bg-amber-500/8 dark:bg-amber-500/10',
            },
            {
              icon: Zap, label: 'Active Now', value: String(activeDrafts.length),
              accent: 'text-emerald-500', bg: 'bg-emerald-500/8 dark:bg-emerald-500/10',
            },
            {
              icon: Shield, label: 'Leagues', value: String(activeLeagueCount),
              accent: 'text-blue-500', bg: 'bg-blue-500/8 dark:bg-blue-500/10',
            },
            {
              icon: TrendingUp, label: 'Win Rate',
              value: winRate !== null ? `${winRate}%` : '-',
              sub: totalWins + totalLosses > 0 ? `${totalWins}W ${totalLosses}L` : undefined,
              accent: 'text-violet-500', bg: 'bg-violet-500/8 dark:bg-violet-500/10',
            },
          ].map((stat, i) => (
            <motion.div key={stat.label} custom={i} variants={fadeUp} initial="hidden" animate="visible">
              <Card className="stat-card group hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`h-8 w-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                      <stat.icon className={`h-4 w-4 ${stat.accent}`} />
                    </div>
                  </div>
                  <p className="text-3xl font-black tracking-tighter tabular-nums leading-none">{stat.value}</p>
                  <p className="text-[11px] font-medium text-muted-foreground/70 mt-1.5 uppercase tracking-wider">
                    {stat.label}
                    {stat.sub && <span className="ml-1.5 normal-case tracking-normal text-foreground/50">({stat.sub})</span>}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* ═══════════════════ Upcoming Matches ═══════════════════ */}
        {upcomingMatches.length > 0 && (
          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
            <div className="space-y-3" id="tour-matches">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
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
                          {/* Your team */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{matchup.userTeamName}</p>
                            <SpriteRow picks={matchup.userTeamPicks} />
                          </div>

                          {/* Score / VS */}
                          {matchup.match.status === 'completed' ? (
                            <div className="shrink-0 flex items-center gap-1 bg-muted/50 rounded-lg px-3 py-1.5">
                              <span className="text-xl font-black tabular-nums tracking-tighter">{userScore}</span>
                              <span className="text-muted-foreground/40 text-xs font-bold mx-0.5">-</span>
                              <span className="text-xl font-black tabular-nums tracking-tighter">{opponentScore}</span>
                            </div>
                          ) : (
                            <div className="shrink-0 px-3">
                              <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">vs</span>
                            </div>
                          )}

                          {/* Opponent */}
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
          </motion.div>
        )}

        {/* ═══════════════════ My Leagues ═══════════════════ */}
        {leagueStandings.length > 0 && (
          <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
            <div className="space-y-3" id="tour-leagues">
              <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
                <Shield className="h-4 w-4 text-primary" />
                My Leagues
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {leagueStandings.map(standing => {
                  const isCommissioner = standing.league.settings?.commissionerId === user?.id
                  const totalGames = standing.wins + standing.losses + standing.draws
                  const wPct = totalGames > 0 ? Math.round((standing.wins / totalGames) * 100) : 0

                  return (
                    <Card
                      key={standing.league.id}
                      className="card-interactive group"
                      onClick={() => router.push(`/league/${standing.league.id}`)}
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

                        {/* Stats row */}
                        <div className="flex items-center gap-4">
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black tabular-nums tracking-tighter">
                              {standing.wins}-{standing.losses}
                              {standing.draws > 0 && <span className="text-lg">-{standing.draws}</span>}
                            </span>
                          </div>

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

                        {/* Progress through season */}
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
          </motion.div>
        )}

        {/* ═══════════════════ Empty league CTA ═══════════════════ */}
        {leagueStandings.length === 0 && upcomingMatches.length === 0 && completedDrafts.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center space-y-2">
              <Shield className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">No leagues yet</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                You have completed drafts. Create a league to start battling with your team.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════ My Drafts ═══════════════════ */}
        <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
          <div className="space-y-3" id="tour-drafts">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide">My Drafts</h2>
              {drafts.length > 0 && (
                <span className="text-[11px] font-medium text-muted-foreground/60 tabular-nums">{drafts.length} total</span>
              )}
            </div>

            {drafts.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center space-y-4">
                  <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Trophy className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">No drafts yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Create your first draft to get started.</p>
                  </div>
                  <Button variant="brand" asChild>
                    <Link href="/create-draft">
                      <Plus className="h-4 w-4 mr-1.5" />
                      Create Draft
                    </Link>
                  </Button>
                </CardContent>
              </Card>
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
        </motion.div>

        {/* ═══════════════════ Spectating ═══════════════════ */}
        {spectatedDrafts.filter(d => d.status !== 'completed').length > 0 && (
          <motion.div custom={7} variants={fadeUp} initial="hidden" animate="visible">
            <div className="space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
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
          </motion.div>
        )}

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
