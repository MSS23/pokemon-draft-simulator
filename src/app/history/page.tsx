'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Trophy, Calendar, TrendingUp, Award, Zap } from 'lucide-react'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'

interface LeagueHistory {
  // League metadata
  league_id: string
  league_name: string
  league_status: string
  start_date: string | null
  end_date: string | null
  total_weeks: number | null
  current_week: number | null
  draft_id: string

  // Team info
  team_id: string
  team_name: string
  user_id: string

  // League team info
  league_team_id: string
  seed: number | null
  final_placement: number | null

  // Standings
  standings_id: string | null
  wins: number
  losses: number
  draws: number
  points_for: number
  points_against: number
  current_rank: number
  current_streak: string | null

  // Aggregated data
  total_teams: number
  total_picks: number
}

interface PokemonPick {
  id: string
  pokemon_id: string
  pokemon_name: string
  team_id: string
}

export default function HistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [leagues, setLeagues] = useState<LeagueHistory[]>([])
  const [pokemonPicks, setPokemonPicks] = useState<Record<string, PokemonPick[]>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed'>('all')
  const [authModalOpen, setAuthModalOpen] = useState(false)

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return

    // Skip data fetch if not authenticated (will show empty state)
    if (!user) {
      setLoading(false)
      return
    }

    // Load user's league history
    loadUserHistory(user.id)
  }, [authLoading, user])

  async function loadUserHistory(userId: string) {
    if (!supabase) {
      console.error('[History] Supabase not available')
      setLoading(false)
      return
    }

    try {
      console.log('[History] Fetching league history for user:', userId)

      // Query the user_league_history view
      const { data: leagueData, error } = await supabase
        .from('user_league_history')
        .select('*')
        .eq('user_id', userId)
        .order('end_date', { ascending: false, nullsFirst: false }) as any

      if (error) {
        console.error('[History] Error fetching league history:', error)
        setLeagues([])
        setLoading(false)
        return
      }

      console.log('[History] Fetched league history:', leagueData)

      if (!leagueData || leagueData.length === 0) {
        console.log('[History] No league history found for user')
        setLeagues([])
        setLoading(false)
        return
      }

      setLeagues(leagueData)

      // Fetch Pokemon picks for each team
      const teamIds = leagueData.map((l: LeagueHistory) => l.team_id)
      const { data: picksData, error: picksError } = await supabase
        .from('picks')
        .select('id, pokemon_id, pokemon_name, team_id')
        .in('team_id', teamIds) as any

      if (picksError) {
        console.error('[History] Error fetching picks:', picksError)
      } else if (picksData) {
        // Group picks by team_id
        const picksByTeam: Record<string, PokemonPick[]> = {}
        picksData.forEach((pick: PokemonPick) => {
          if (!picksByTeam[pick.team_id]) {
            picksByTeam[pick.team_id] = []
          }
          picksByTeam[pick.team_id].push(pick)
        })
        setPokemonPicks(picksByTeam)
        console.log('[History] Fetched Pokemon picks:', picksByTeam)
      }
    } catch (err) {
      console.error('[History] Unexpected error:', err)
      setLeagues([])
    } finally {
      setLoading(false)
    }
  }

  // Calculate statistics
  const stats = useMemo(() => {
    if (leagues.length === 0) {
      return {
        totalLeagues: 0,
        championships: 0,
        winRate: 0,
        totalWins: 0,
        totalLosses: 0,
        mostPicked: null
      }
    }

    const totalWins = leagues.reduce((sum, l) => sum + l.wins, 0)
    const totalLosses = leagues.reduce((sum, l) => sum + l.losses, 0)
    const totalGames = totalWins + totalLosses
    const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0

    // Find most picked Pokemon across all leagues
    const pokemonCounts: Record<string, { name: string; count: number; id: string }> = {}
    Object.values(pokemonPicks).forEach(picks => {
      picks.forEach(pick => {
        if (!pokemonCounts[pick.pokemon_id]) {
          pokemonCounts[pick.pokemon_id] = {
            name: pick.pokemon_name,
            count: 0,
            id: pick.pokemon_id
          }
        }
        pokemonCounts[pick.pokemon_id].count++
      })
    })

    const mostPicked = Object.values(pokemonCounts).sort((a, b) => b.count - a.count)[0] || null

    return {
      totalLeagues: leagues.length,
      championships: leagues.filter(l => l.final_placement === 1 || l.current_rank === 1).length,
      winRate,
      totalWins,
      totalLosses,
      mostPicked
    }
  }, [leagues, pokemonPicks])

  // Filter leagues
  const filteredLeagues = useMemo(() => {
    let filtered = leagues

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(league =>
        league.league_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        league.team_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Filter by status tab
    if (activeTab === 'active') {
      filtered = filtered.filter(l => l.league_status === 'active' || l.league_status === 'scheduled')
    } else if (activeTab === 'completed') {
      filtered = filtered.filter(l => l.league_status === 'completed')
    }

    return filtered
  }, [leagues, searchQuery, activeTab])

  const getPlacementBadge = (placement: number | null, rank: number | null) => {
    const finalPlacement = placement || rank || 0
    if (finalPlacement === 0) return null

    const badges: Record<number, { label: string; className: string }> = {
      1: { label: '🥇 Champion', className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' },
      2: { label: '🥈 2nd Place', className: 'bg-slate-400/20 text-slate-400 border-slate-400/30' },
      3: { label: '🥉 3rd Place', className: 'bg-orange-600/20 text-orange-600 border-orange-600/30' },
    }
    const badge = badges[finalPlacement] || {
      label: `#${finalPlacement}`,
      className: 'bg-slate-600/20 text-slate-600 border-slate-600/30'
    }
    return <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      scheduled: { label: 'Scheduled', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
      active: { label: 'Active', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
      completed: { label: 'Completed', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
    }
    const variant = variants[status] || variants.scheduled
    return <Badge variant="outline" className={variant.className}>{variant.label}</Badge>
  }

  // Helper to get Pokemon sprite URL
  const getPokemonSprite = (pokemonId: string) => {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png`
  }

  if (loading) {
    return (
      <SidebarLayout>
        <div className="min-h-full bg-background flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </SidebarLayout>
    )
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-full p-8">
          <div className="container mx-auto px-4 py-8">
            <Card className="max-w-md mx-auto">
              <CardHeader>
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="h-6 w-6 text-yellow-500" />
                  <h2 className="text-xl font-bold">League History Access Required</h2>
                </div>
                <p className="text-muted-foreground">
                  You need to be logged in to view your league history, past performances, and drafted teams.
                </p>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => setAuthModalOpen(true)}
                >
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

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'ash_ketchum'

  return (
    <SidebarLayout>
      <div className="min-h-full p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold mb-2">{displayName}&apos;s League Archive</h1>
            <p className="text-muted-foreground">
              An overview of your competitive league performances and drafted teams.
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-muted-foreground">Total Leagues</p>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalLeagues}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-muted-foreground">Championships</p>
                <Trophy className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-500">{stats.championships}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-muted-foreground">Win Rate</p>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-500">{stats.winRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.totalWins}W - {stats.totalLosses}L
                </p>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-muted-foreground">Most Drafted</p>
                <Zap className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                {stats.mostPicked ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={getPokemonSprite(stats.mostPicked.id)}
                      alt={stats.mostPicked.name}
                      className="w-12 h-12 pixelated"
                    />
                    <div>
                      <div className="text-xl font-bold capitalize">{stats.mostPicked.name}</div>
                      <p className="text-xs text-muted-foreground">
                        {stats.mostPicked.count} {stats.mostPicked.count === 1 ? 'time' : 'times'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-xl font-bold text-muted-foreground">-</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Empty State */}
          {stats.totalLeagues === 0 && (
            <Card className="text-center py-12">
              <CardContent className="space-y-4">
                <Trophy className="h-16 w-16 mx-auto text-muted-foreground" />
                <div>
                  <h3 className="text-xl font-semibold mb-2">No League History Yet</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-4">
                    Leagues are competitive seasons where you battle other trainers with your drafted team.
                    Complete a draft first, then convert it to a league to start competing!
                  </p>
                  <Button asChild>
                    <a href="/create-draft">Create Your First Draft</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leagues List */}
          {stats.totalLeagues > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <CardTitle>League History</CardTitle>

                  {/* Search */}
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search leagues..."
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="all">
                      All ({leagues.length})
                    </TabsTrigger>
                    <TabsTrigger value="active">
                      Active ({leagues.filter(l => l.league_status === 'active' || l.league_status === 'scheduled').length})
                    </TabsTrigger>
                    <TabsTrigger value="completed">
                      Completed ({leagues.filter(l => l.league_status === 'completed').length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value={activeTab} className="space-y-4">
                    {filteredLeagues.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No leagues found matching your filters.
                      </div>
                    ) : (
                      filteredLeagues.map((league) => {
                        const teamPicks = pokemonPicks[league.team_id] || []
                        const placement = getPlacementBadge(league.final_placement, league.current_rank)

                        return (
                          <Card
                            key={league.league_id}
                            className="hover:shadow-lg transition-shadow cursor-pointer"
                            onClick={() => router.push(`/league/${league.league_id}`)}
                          >
                            <CardContent className="p-6">
                              <div className="flex flex-col lg:flex-row items-start gap-6">
                                {/* Left side - League info */}
                                <div className="flex-1 space-y-3 w-full">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <h3 className="text-xl font-semibold">{league.league_name}</h3>
                                    {getStatusBadge(league.league_status)}
                                    {placement}
                                  </div>

                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Trophy className="h-4 w-4" />
                                    <span className="font-medium">{league.team_name}</span>
                                  </div>

                                  {league.end_date && (
                                    <div className="text-sm text-muted-foreground">
                                      Ended: {new Date(league.end_date).toLocaleDateString()}
                                    </div>
                                  )}

                                  {/* Pokemon Team */}
                                  {teamPicks.length > 0 && (
                                    <div className="pt-2">
                                      <div className="text-sm font-medium text-muted-foreground mb-2">
                                        Drafted Team ({teamPicks.length} Pokémon)
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {teamPicks.slice(0, 8).map((pick) => (
                                          <div key={pick.id} className="group relative">
                                            <div className="w-14 h-14 bg-secondary rounded-lg flex items-center justify-center overflow-hidden">
                                              <img
                                                src={getPokemonSprite(pick.pokemon_id)}
                                                alt={pick.pokemon_name}
                                                className="w-12 h-12 pixelated"
                                                loading="lazy"
                                              />
                                            </div>
                                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none border shadow-lg z-10">
                                              {pick.pokemon_name}
                                            </div>
                                          </div>
                                        ))}
                                        {teamPicks.length > 8 && (
                                          <div className="w-14 h-14 bg-secondary rounded-lg flex items-center justify-center text-xs font-medium text-muted-foreground">
                                            +{teamPicks.length - 8}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Right side - Results */}
                                <div className="w-full lg:w-80">
                                  <div className="text-sm font-medium text-muted-foreground mb-3">League Results</div>
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                                      <span className="text-sm">Record</span>
                                      <span className="font-semibold">
                                        {league.wins}W - {league.losses}L {league.draws > 0 && `- ${league.draws}D`}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                                      <span className="text-sm">Rank</span>
                                      <span className="font-semibold">
                                        {league.current_rank || league.final_placement || '-'} / {league.total_teams}
                                      </span>
                                    </div>

                                    {league.points_for > 0 && (
                                      <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                                        <span className="text-sm">Points</span>
                                        <span className="font-semibold">
                                          {league.points_for} - {league.points_against}
                                        </span>
                                      </div>
                                    )}

                                    {league.current_streak && (
                                      <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                                        <span className="text-sm">Streak</span>
                                        <Badge variant="outline" className="font-semibold">
                                          {league.current_streak}
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
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
