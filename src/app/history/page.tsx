'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, Trophy } from 'lucide-react'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'

interface LeagueHistory {
  id: string
  name: string
  placement: number
  status: string
  ended_at: string
  total_teams: number
  wins: number
  losses: number
  drafted_team: Array<{
    id: string
    name: string
    sprite_url: string
  }>
}

export default function HistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [leagues, setLeagues] = useState<LeagueHistory[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'placement' | 'all'>('date')
  const [filterPlacement, setFilterPlacement] = useState<'all' | '1' | '2' | '3'>('all')

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
  }, [authLoading, user, router])

  async function loadUserHistory(userId: string) {
    if (!supabase) return

    // Load user's league participations through junction table
    const leaguesResponse = await supabase
      .from('league_teams')
      .select(`
        id,
        team_id,
        league_id,
        final_placement,
        teams!inner (
          id,
          name,
          owner_id
        ),
        leagues!inner (
          id,
          name,
          status,
          ended_at
        )
      `)
      .eq('teams.owner_id', userId) as any

    // Mock data for demonstration
    const mockLeagues: LeagueHistory[] = [
      {
        id: '1',
        name: 'Kanto Classic - Season 5',
        placement: 1,
        status: 'completed',
        ended_at: '2024-05-15',
        total_teams: 8,
        wins: 8,
        losses: 2,
        drafted_team: [
          { id: '6', name: 'Charizard', sprite_url: '/pokemon/charizard.png' },
          { id: '134', name: 'Blastoise', sprite_url: '/pokemon/blastoise.png' },
          { id: '3', name: 'Venusaur', sprite_url: '/pokemon/venusaur.png' },
          { id: '25', name: 'Pikachu', sprite_url: '/pokemon/pikachu.png' },
          { id: '149', name: 'Dragonite', sprite_url: '/pokemon/dragonite.png' },
          { id: '143', name: 'Snorlax', sprite_url: '/pokemon/snorlax.png' },
        ]
      },
      {
        id: '2',
        name: 'Sinnoh Superstars S3',
        placement: 3,
        status: 'completed',
        ended_at: '2024-03-20',
        total_teams: 12,
        wins: 6,
        losses: 4,
        drafted_team: [
          { id: '448', name: 'Lucario', sprite_url: '/pokemon/lucario.png' },
          { id: '445', name: 'Garchomp', sprite_url: '/pokemon/garchomp.png' },
          { id: '392', name: 'Infernape', sprite_url: '/pokemon/infernape.png' },
        ]
      },
      {
        id: '3',
        name: 'Johto Journey League',
        placement: 4,
        status: 'completed',
        ended_at: '2023-12-01',
        total_teams: 12,
        wins: 4,
        losses: 8,
        drafted_team: []
      },
    ]

    setLeagues(mockLeagues)
    setLoading(false)
  }

  const stats = {
    totalLeagues: leagues.length,
    championships: leagues.filter(l => l.placement === 1).length,
    winRate: leagues.length > 0
      ? Math.round((leagues.reduce((sum, l) => sum + l.wins, 0) /
          (leagues.reduce((sum, l) => sum + l.wins + l.losses, 0) || 1)) * 100)
      : 0,
    mostDrafted: 'Charizard'
  }

  const filteredLeagues = leagues
    .filter(league =>
      league.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (filterPlacement === 'all' || league.placement === parseInt(filterPlacement))
    )
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime()
      if (sortBy === 'placement') return a.placement - b.placement
      return 0
    })

  const getPlacementBadge = (placement: number) => {
    const badges: Record<number, { label: string; color: string }> = {
      1: { label: 'Champion', color: 'bg-yellow-500 text-yellow-950' },
      2: { label: '2nd Place', color: 'bg-slate-400 text-slate-950' },
      3: { label: '3rd Place', color: 'bg-orange-600 text-white' },
    }
    return badges[placement] || { label: `${placement}/12`, color: 'bg-slate-600 text-white' }
  }

  if (loading) {
    return (
      <SidebarLayout>
        <div className="min-h-full bg-slate-950 flex items-center justify-center">
          <div className="text-white">Loading...</div>
        </div>
      </SidebarLayout>
    )
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'ash_ketchum'

  return (
    <SidebarLayout>
      <div className="min-h-full bg-slate-950 p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">{displayName}&apos;s Draft Archive</h1>
          <p className="text-slate-400">An overview of your past league performances and drafted teams.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <Card className="bg-slate-900 border-slate-800 p-6">
            <div className="text-slate-400 text-sm mb-2">Total Leagues</div>
            <div className="text-4xl font-bold text-white">{stats.totalLeagues}</div>
          </Card>

          <Card className="bg-slate-900 border-slate-800 p-6">
            <div className="text-slate-400 text-sm mb-2">Championships</div>
            <div className="text-4xl font-bold text-white">{stats.championships}</div>
          </Card>

          <Card className="bg-slate-900 border-slate-800 p-6">
            <div className="text-slate-400 text-sm mb-2">Overall Win %</div>
            <div className="text-4xl font-bold text-white">{stats.winRate}%</div>
          </Card>

          <Card className="bg-slate-900 border-slate-800 p-6 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-slate-400 text-sm mb-2">Most Drafted</div>
              <div className="text-xl font-bold text-white">{stats.mostDrafted}</div>
            </div>
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-lg" />
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search leagues by name..."
              className="pl-10 bg-slate-900 border-slate-800 text-white"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
          >
            <option value="date">Sort by Date</option>
            <option value="placement">Placement</option>
            <option value="all">All Leagues</option>
          </select>

          <select
            value={filterPlacement}
            onChange={(e) => setFilterPlacement(e.target.value as any)}
            className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
          >
            <option value="all">All Placements</option>
            <option value="1">1st Place</option>
            <option value="2">2nd Place</option>
            <option value="3">3rd Place</option>
          </select>
        </div>

        {/* League History List */}
        <div className="space-y-4">
          {filteredLeagues.map((league) => {
            const badge = getPlacementBadge(league.placement)
            return (
              <Card key={league.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition cursor-pointer">
                <div className="p-6">
                  <div className="flex items-start gap-6">
                    {/* Left side - League info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-semibold text-white">{league.name}</h3>
                        <Badge className={`${badge.color} font-semibold`}>
                          {badge.label}
                        </Badge>
                      </div>
                      <div className="text-sm text-slate-400 mb-4">
                        Ended: {new Date(league.ended_at).toLocaleDateString()}
                      </div>

                      {league.drafted_team.length > 0 && (
                        <>
                          <div className="text-sm text-slate-400 mb-3 font-semibold">My Drafted Team</div>
                          <div className="flex gap-2">
                            {league.drafted_team.map((pokemon) => (
                              <div key={pokemon.id} className="group relative">
                                <div className="w-16 h-16 bg-slate-800 rounded-lg flex items-center justify-center">
                                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded" />
                                </div>
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-950 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                                  {pokemon.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Right side - Results */}
                    <div className="w-80">
                      <div className="text-sm text-slate-400 mb-3 font-semibold">League Results</div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-slate-800 rounded">
                          <span className="text-slate-300">Record: {league.wins}W - {league.losses}L</span>
                          <span className="text-white font-semibold">{league.wins}-{league.losses}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        {/* Create New League Button */}
        <div className="mt-8">
          <Button className="bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-semibold w-full py-6">
            Create New League
          </Button>
        </div>
      </div>
    </SidebarLayout>
  )
}
