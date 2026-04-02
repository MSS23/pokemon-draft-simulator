'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Database } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Search,
  Trophy,
  Calendar,
  TrendingUp,
  Zap,
  Users,
  ChevronRight,
  Eye,
  Swords,
} from 'lucide-react'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'
import { PokemonSprite } from '@/components/ui/pokemon-sprite'
import { createLogger } from '@/lib/logger'

const log = createLogger('HistoryPage')

// ── Types ──────────────────────────────────────────────

interface CompletedDraft {
  id: string
  roomCode: string
  name: string
  format: string
  status: string
  completedAt: string
  createdAt: string
  teamId: string
  teamName: string
  isHost: boolean
  totalTeams: number
  totalPicks: number
  picks: { id: string; pokemon_id: string; pokemon_name: string }[]
}

interface LeagueHistory {
  league_id: string
  league_name: string
  league_status: string
  start_date: string | null
  end_date: string | null
  total_weeks: number | null
  current_week: number | null
  draft_id: string
  team_id: string
  team_name: string
  user_id: string
  league_team_id: string
  seed: number | null
  final_placement: number | null
  standings_id: string | null
  wins: number
  losses: number
  draws: number
  points_for: number
  points_against: number
  current_rank: number
  current_streak: string | null
  total_teams: number
  total_picks: number
}

interface PokemonPick {
  id: string
  pokemon_id: string
  pokemon_name: string
  team_id: string
}

// ── Helpers ────────────────────────────────────────────

function formatDate(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (diffInDays === 0) return 'Today'
  if (diffInDays === 1) return 'Yesterday'
  if (diffInDays < 7) return `${diffInDays} days ago`
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`
  return date.toLocaleDateString()
}

function getFormatDisplayName(format: string) {
  const map: Record<string, string> = {
    'vgc-reg-h': 'VGC Regulation H',
    'smogon-ou': 'Smogon OU',
    'smogon-uu': 'Smogon UU',
    custom: 'Custom Format',
  }
  return map[format] || format.toUpperCase()
}

// ── Page ───────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<CompletedDraft[]>([])
  const [leagues, setLeagues] = useState<LeagueHistory[]>([])
  const [leaguePicks, setLeaguePicks] = useState<Record<string, PokemonPick[]>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'drafts' | 'leagues'>('drafts')
  const [authModalOpen, setAuthModalOpen] = useState(false)

  // ── Data fetching ──

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    loadAllHistory(user.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  async function loadAllHistory(userId: string) {
    if (!supabase) {
      log.error('Supabase not available')
      setLoading(false)
      return
    }

    try {
      // Fetch drafts and leagues in parallel
      const [draftsResult, leaguesResult] = await Promise.all([
        loadCompletedDrafts(userId),
        loadLeagueHistory(userId),
      ])

      setDrafts(draftsResult)
      setLeagues(leaguesResult.leagues)
      setLeaguePicks(leaguesResult.picks)

      // Default to whichever tab has data
      if (draftsResult.length === 0 && leaguesResult.leagues.length > 0) {
        setActiveTab('leagues')
      }
    } catch (err) {
      log.error('Unexpected error loading history:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadCompletedDrafts(userId: string): Promise<CompletedDraft[]> {
    if (!supabase) return []

    type TeamWithDraft = Database['public']['Tables']['teams']['Row'] & {
      draft: Database['public']['Tables']['drafts']['Row']
    }

    const { data: userTeams, error } = await supabase
      .from('teams')
      .select(`
        id,
        name,
        owner_id,
        draft_id,
        draft:drafts!inner(
          id,
          room_code,
          name,
          format,
          status,
          host_id,
          created_at,
          updated_at
        )
      `)
      .eq('owner_id', userId)
      .eq('draft.status', 'completed')
      .is('draft.deleted_at', null)
      .order('draft(updated_at)', { ascending: false })
      .limit(50)

    if (error) {
      log.error('Error loading completed drafts:', error)
      return []
    }

    // Batch-fetch team counts, pick counts, and picks data
    const results = await Promise.all(
      (userTeams || []).map(async (team) => {
        const typedTeam = team as unknown as TeamWithDraft
        const draft = typedTeam.draft

        const [teamCountRes, picksRes] = await Promise.all([
          supabase
            .from('teams')
            .select('*', { count: 'exact', head: true })
            .eq('draft_id', draft.id),
          supabase
            .from('picks')
            .select('id, pokemon_id, pokemon_name, team_id')
            .eq('team_id', team.id),
        ])

        const picks = (picksRes.data || []) as PokemonPick[]

        return {
          id: draft.id,
          roomCode: draft.room_code || draft.id,
          name: draft.name || 'Unnamed Draft',
          format: draft.format || 'custom',
          status: draft.status,
          completedAt: draft.updated_at,
          createdAt: draft.created_at,
          teamId: team.id,
          teamName: team.name,
          isHost: draft.host_id === userId,
          totalTeams: teamCountRes.count || 0,
          totalPicks: picks.length,
          picks: picks.map((p) => ({
            id: p.id,
            pokemon_id: p.pokemon_id,
            pokemon_name: p.pokemon_name,
          })),
        }
      })
    )

    return results
  }

  async function loadLeagueHistory(
    userId: string
  ): Promise<{ leagues: LeagueHistory[]; picks: Record<string, PokemonPick[]> }> {
    if (!supabase) return { leagues: [], picks: {} }

    const { data: leagueData, error } = (await supabase
      .from('user_league_history')
      .select('*')
      .eq('user_id', userId)
      .order('end_date', {
        ascending: false,
        nullsFirst: false,
      })
      .limit(50)) as unknown as {
      data: LeagueHistory[] | null
      error: { message: string } | null
    }

    if (error || !leagueData || leagueData.length === 0) {
      if (error) log.error('Error fetching league history:', error)
      return { leagues: [], picks: {} }
    }

    // Fetch picks for all league teams
    const teamIds = leagueData.map((l) => l.team_id)
    const { data: picksData, error: picksError } = await supabase
      .from('picks')
      .select('id, pokemon_id, pokemon_name, team_id')
      .in('team_id', teamIds)

    const picksByTeam: Record<string, PokemonPick[]> = {}
    if (!picksError && picksData) {
      ;(picksData as PokemonPick[]).forEach((pick) => {
        if (!picksByTeam[pick.team_id]) picksByTeam[pick.team_id] = []
        picksByTeam[pick.team_id].push(pick)
      })
    }

    return { leagues: leagueData, picks: picksByTeam }
  }

  // ── Computed stats ──

  const stats = useMemo(() => {
    const totalDrafts = drafts.length
    const totalLeagues = leagues.length

    const totalWins = leagues.reduce((s, l) => s + l.wins, 0)
    const totalLosses = leagues.reduce((s, l) => s + l.losses, 0)
    const totalGames = totalWins + totalLosses
    const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0
    const championships = leagues.filter(
      (l) => l.final_placement === 1 || l.current_rank === 1
    ).length

    // Most-picked Pokemon across ALL drafts + leagues
    const counts: Record<string, { name: string; count: number; id: string }> = {}
    const countPick = (id: string, name: string) => {
      if (!counts[id]) counts[id] = { name, count: 0, id }
      counts[id].count++
    }
    drafts.forEach((d) => d.picks.forEach((p) => countPick(p.pokemon_id, p.pokemon_name)))
    Object.values(leaguePicks).forEach((picks) =>
      picks.forEach((p) => countPick(p.pokemon_id, p.pokemon_name))
    )
    const mostPicked =
      Object.values(counts).sort((a, b) => b.count - a.count)[0] || null

    return {
      totalDrafts,
      totalLeagues,
      championships,
      winRate,
      totalWins,
      totalLosses,
      mostPicked,
    }
  }, [drafts, leagues, leaguePicks])

  // ── Filtered lists ──

  const filteredDrafts = useMemo(() => {
    if (!searchQuery.trim()) return drafts
    const q = searchQuery.toLowerCase()
    return drafts.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.teamName.toLowerCase().includes(q) ||
        d.roomCode.toLowerCase().includes(q)
    )
  }, [drafts, searchQuery])

  const filteredLeagues = useMemo(() => {
    if (!searchQuery.trim()) return leagues
    const q = searchQuery.toLowerCase()
    return leagues.filter(
      (l) =>
        l.league_name.toLowerCase().includes(q) ||
        l.team_name.toLowerCase().includes(q)
    )
  }, [leagues, searchQuery])

  // ── Badge helpers ──

  function getPlacementBadge(placement: number | null, rank: number | null) {
    const p = placement || rank || 0
    if (p === 0) return null
    const badges: Record<number, { label: string; className: string }> = {
      1: { label: '1st', className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' },
      2: { label: '2nd', className: 'bg-muted text-muted-foreground border-border' },
      3: { label: '3rd', className: 'bg-orange-600/20 text-orange-600 border-orange-600/30' },
    }
    const badge = badges[p] || { label: `#${p}`, className: 'bg-muted text-muted-foreground border-border' }
    return (
      <Badge variant="outline" className={badge.className}>
        {badge.label}
      </Badge>
    )
  }

  function getLeagueStatusBadge(status: string) {
    const map: Record<string, { label: string; className: string }> = {
      scheduled: { label: 'Scheduled', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
      active: { label: 'Active', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
      completed: { label: 'Completed', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
    }
    const v = map[status] || map.scheduled
    return (
      <Badge variant="outline" className={v.className}>
        {v.label}
      </Badge>
    )
  }

  // ── Render ──

  if (loading || authLoading) {
    return (
      <SidebarLayout>
        <div className="min-h-full bg-background flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </SidebarLayout>
    )
  }

  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-full p-8">
          <div className="container mx-auto px-4 py-8">
            <Card className="max-w-md mx-auto">
              <CardHeader>
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="h-6 w-6 text-yellow-500" />
                  <h2 className="text-xl font-bold">Sign In Required</h2>
                </div>
                <p className="text-muted-foreground">
                  Sign in to view your draft results, league performances, and
                  drafted teams.
                </p>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => setAuthModalOpen(true)}>
                  Sign In
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          redirectTo="/history"
        />
      </SidebarLayout>
    )
  }

  const displayName =
    user.user_metadata?.display_name || user.email?.split('@')[0] || 'Trainer'
  const isEmpty = stats.totalDrafts === 0 && stats.totalLeagues === 0

  return (
    <SidebarLayout>
      <div className="min-h-full p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">
              {displayName}&apos;s History
            </h1>
            <p className="text-muted-foreground">
              Your completed drafts and league performances.
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <p className="text-xs font-medium text-muted-foreground">Drafts</p>
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight tabular-nums leading-none">{stats.totalDrafts}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <p className="text-xs font-medium text-muted-foreground">Leagues</p>
                <Swords className="h-3.5 w-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight tabular-nums leading-none">{stats.totalLeagues}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Championships
                </p>
                <Trophy className="h-3.5 w-3.5 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight tabular-nums leading-none text-yellow-500">
                  {stats.championships}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <p className="text-xs font-medium text-muted-foreground">Win Rate</p>
                <TrendingUp className="h-3.5 w-3.5 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight tabular-nums leading-none text-green-500">
                  {stats.winRate}%
                </div>
                {(stats.totalWins > 0 || stats.totalLosses > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {stats.totalWins}W – {stats.totalLosses}L
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="col-span-2 md:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Most Drafted
                </p>
                <Zap className="h-3.5 w-3.5 text-blue-500" />
              </CardHeader>
              <CardContent>
                {stats.mostPicked ? (
                  <div className="flex items-center gap-2">
                    <PokemonSprite
                      pokemonId={stats.mostPicked.id}
                      pokemonName={stats.mostPicked.name}
                      className="w-10 h-10 object-contain"
                    />
                    <div>
                      <div className="text-sm font-bold capitalize">
                        {stats.mostPicked.name}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stats.mostPicked.count}x
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-xl font-bold text-muted-foreground">–</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Empty state */}
          {isEmpty && (
            <Card className="text-center py-12">
              <CardContent className="space-y-4">
                <Trophy className="h-16 w-16 mx-auto text-muted-foreground" />
                <div>
                  <h3 className="text-xl font-semibold mb-2">No History Yet</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-4">
                    Complete a draft to see it here. If you&apos;re in a league,
                    your performances will show up too.
                  </p>
                  <Button onClick={() => router.push('/create-draft')}>
                    Create Your First Draft
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabbed content */}
          {!isEmpty && (
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <CardTitle>History</CardTitle>
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search drafts & leagues..."
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as 'drafts' | 'leagues')}
                >
                  <TabsList className="mb-4">
                    <TabsTrigger value="drafts">
                      Drafts ({drafts.length})
                    </TabsTrigger>
                    <TabsTrigger value="leagues">
                      Leagues ({leagues.length})
                    </TabsTrigger>
                  </TabsList>

                  {/* ── Drafts tab ── */}
                  <TabsContent value="drafts" className="space-y-3">
                    {filteredDrafts.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {searchQuery
                          ? 'No drafts match your search.'
                          : 'No completed drafts yet.'}
                      </div>
                    ) : (
                      filteredDrafts.map((draft) => (
                        <Card
                          key={draft.id}
                          className="hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() =>
                            router.push(`/draft/${draft.roomCode}/results`)
                          }
                        >
                          <CardContent className="p-4 md:p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0 space-y-3">
                                {/* Title row */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-lg font-semibold truncate">
                                    {draft.name}
                                  </h3>
                                  {draft.isHost && (
                                    <Badge variant="outline" className="text-xs">
                                      Host
                                    </Badge>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    {getFormatDisplayName(draft.format)}
                                  </Badge>
                                </div>

                                {/* Meta row */}
                                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" />
                                    {draft.teamName}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Trophy className="h-3.5 w-3.5" />
                                    {draft.totalPicks} picks
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" />
                                    {draft.totalTeams} teams
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {formatDate(draft.completedAt)}
                                  </span>
                                </div>

                                {/* Pokemon sprites */}
                                {draft.picks.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {draft.picks.slice(0, 8).map((pick) => (
                                      <div
                                        key={pick.id}
                                        className="group relative"
                                      >
                                        <div className="w-11 h-11 bg-secondary rounded-lg flex items-center justify-center overflow-hidden">
                                          <PokemonSprite
                                            pokemonId={pick.pokemon_id}
                                            pokemonName={pick.pokemon_name}
                                            className="w-9 h-9 object-contain"
                                          />
                                        </div>
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none border shadow-lg z-10 capitalize">
                                          {pick.pokemon_name}
                                        </div>
                                      </div>
                                    ))}
                                    {draft.picks.length > 8 && (
                                      <div className="w-11 h-11 bg-secondary rounded-lg flex items-center justify-center text-xs font-medium text-muted-foreground">
                                        +{draft.picks.length - 8}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* CTA */}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="flex-shrink-0 hidden md:flex"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Results
                                <ChevronRight className="h-4 w-4 ml-1" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  {/* ── Leagues tab ── */}
                  <TabsContent value="leagues" className="space-y-3">
                    {filteredLeagues.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {searchQuery
                          ? 'No leagues match your search.'
                          : 'No league history yet. Convert a completed draft into a league to start competing!'}
                      </div>
                    ) : (
                      filteredLeagues.map((league) => {
                        const teamPicks = leaguePicks[league.team_id] || []
                        const placement = getPlacementBadge(
                          league.final_placement,
                          league.current_rank
                        )

                        return (
                          <Card
                            key={league.league_id}
                            className="hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() =>
                              router.push(`/league/${league.league_id}`)
                            }
                          >
                            <CardContent className="p-4 md:p-5">
                              <div className="flex flex-col lg:flex-row items-start gap-5">
                                {/* Left — info */}
                                <div className="flex-1 space-y-3 w-full">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-lg font-semibold">
                                      {league.league_name}
                                    </h3>
                                    {getLeagueStatusBadge(league.league_status)}
                                    {placement}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Trophy className="h-3.5 w-3.5" />
                                      {league.team_name}
                                    </span>
                                    {league.end_date && (
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5" />
                                        Ended {formatDate(league.end_date)}
                                      </span>
                                    )}
                                  </div>

                                  {/* Pokemon sprites */}
                                  {teamPicks.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {teamPicks.slice(0, 8).map((pick) => (
                                        <div
                                          key={pick.id}
                                          className="group relative"
                                        >
                                          <div className="w-11 h-11 bg-secondary rounded-lg flex items-center justify-center overflow-hidden">
                                            <PokemonSprite
                                              pokemonId={pick.pokemon_id}
                                              pokemonName={pick.pokemon_name}
                                              className="w-9 h-9 object-contain"
                                            />
                                          </div>
                                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none border shadow-lg z-10 capitalize">
                                            {pick.pokemon_name}
                                          </div>
                                        </div>
                                      ))}
                                      {teamPicks.length > 8 && (
                                        <div className="w-11 h-11 bg-secondary rounded-lg flex items-center justify-center text-xs font-medium text-muted-foreground">
                                          +{teamPicks.length - 8}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Right — league results */}
                                <div className="w-full lg:w-72 space-y-1.5">
                                  <div className="flex items-center justify-between p-2.5 bg-secondary rounded-lg text-sm">
                                    <span className="text-muted-foreground">
                                      Record
                                    </span>
                                    <span className="font-semibold">
                                      {league.wins}W – {league.losses}L
                                      {league.draws > 0 && ` – ${league.draws}D`}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between p-2.5 bg-secondary rounded-lg text-sm">
                                    <span className="text-muted-foreground">
                                      Rank
                                    </span>
                                    <span className="font-semibold">
                                      {league.current_rank ||
                                        league.final_placement ||
                                        '–'}{' '}
                                      / {league.total_teams}
                                    </span>
                                  </div>
                                  {league.points_for > 0 && (
                                    <div className="flex items-center justify-between p-2.5 bg-secondary rounded-lg text-sm">
                                      <span className="text-muted-foreground">
                                        Points
                                      </span>
                                      <span className="font-semibold">
                                        {league.points_for} – {league.points_against}
                                      </span>
                                    </div>
                                  )}
                                  {league.current_streak && (
                                    <div className="flex items-center justify-between p-2.5 bg-secondary rounded-lg text-sm">
                                      <span className="text-muted-foreground">
                                        Streak
                                      </span>
                                      <Badge variant="outline" className="font-semibold">
                                        {league.current_streak}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </SidebarLayout>
  )
}
