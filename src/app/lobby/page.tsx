'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Search, Users, Eye, Plus, Trophy,
  RefreshCw, Zap, ArrowRight, Globe
} from 'lucide-react'
import { DraftService } from '@/lib/draft-service'
import { LeagueService } from '@/lib/league-service'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { createLogger } from '@/lib/logger'
import type { League, Team } from '@/types'

const log = createLogger('LobbyPage')

interface PublicDraft {
  roomCode: string
  name: string
  status: string
  maxTeams: number
  currentTeams: number
  format: string
  createdAt: string
  description: string | null
  tags: string[] | null
  spectatorCount: number
}

type PublicLeague = League & { teams: Team[]; teamCount: number; draftFormat: string }

export default function LobbyPage() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<PublicDraft[]>([])
  const [leagues, setLeagues] = useState<PublicLeague[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'drafts' | 'leagues'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [draftsData, leaguesData] = await Promise.all([
        DraftService.getPublicDrafts().catch(() => []),
        LeagueService.getPublicLeagues().catch(() => [])
      ])
      setDrafts(draftsData as PublicDraft[])
      setLeagues(leaguesData as PublicLeague[])
      setLastRefresh(new Date())
    } catch (err) {
      log.error('Failed to load lobby data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const activeDrafts = drafts.filter(d => d.status === 'active' || d.status === 'setup')
  const activeLeagues = leagues.filter(l => l.status === 'active' || l.status === 'scheduled')

  const filteredDrafts = activeDrafts.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.format?.toLowerCase().includes(search.toLowerCase())
  )
  const filteredLeagues = activeLeagues.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalActive = activeDrafts.length + activeLeagues.length

  return (
    <SidebarLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Public Lobby</h1>
            {totalActive > 0 && (
              <Badge variant="secondary">{totalActive} active</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Browse open drafts and leagues. Join one or create your own.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => router.push('/create-draft')} className="flex-1">
            <Plus className="h-4 w-4 mr-2" />
            Create Draft
          </Button>
          <Button onClick={() => router.push('/join-draft')} variant="outline" className="flex-1">
            <Users className="h-4 w-4 mr-2" />
            Join by Code
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drafts and leagues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'drafts', 'leagues'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? 'default' : 'outline'}
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={loadData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Live Drafts */}
        {(filter === 'all' || filter === 'drafts') && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <h2 className="font-semibold">Live Drafts</h2>
              <Badge variant="outline" className="text-xs">{filteredDrafts.length}</Badge>
            </div>

            {filteredDrafts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">No public drafts right now.</p>
                  <Button
                    variant="link"
                    className="mt-2"
                    onClick={() => router.push('/create-draft')}
                  >
                    Create the first one
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filteredDrafts.map((draft) => (
                  <Card
                    key={draft.roomCode}
                    className="hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => router.push(
                      draft.status === 'setup'
                        ? `/join-draft?code=${draft.roomCode}`
                        : `/spectate/${draft.roomCode}`
                    )}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{draft.name}</span>
                            <Badge
                              variant={draft.status === 'active' ? 'default' : 'secondary'}
                              className="text-[10px]"
                            >
                              {draft.status === 'active' ? 'LIVE' : 'Open'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {draft.currentTeams}/{draft.maxTeams}
                            </span>
                            {draft.format && (
                              <span className="capitalize">{draft.format.replace(/-/g, ' ')}</span>
                            )}
                            {draft.spectatorCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {draft.spectatorCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button size="sm" variant="outline">
                          {draft.status === 'setup' ? 'Join' : 'Watch'}
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Leagues */}
        {(filter === 'all' || filter === 'leagues') && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <h2 className="font-semibold">Active Leagues</h2>
              <Badge variant="outline" className="text-xs">{filteredLeagues.length}</Badge>
            </div>

            {filteredLeagues.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">No public leagues right now.</p>
                  <p className="text-xs mt-1">Leagues are created after completing a draft.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filteredLeagues.map((league) => (
                  <Card
                    key={league.id}
                    className="hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/league/${league.id}`)}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{league.name}</span>
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {league.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {league.teamCount || league.teams?.length || 0} teams
                            </span>
                            <span>Week {league.currentWeek || 1}</span>
                          </div>
                        </div>
                        <Button size="sm" variant="outline">
                          View
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="text-center text-xs text-muted-foreground pt-4">
          Last refreshed {lastRefresh.toLocaleTimeString()}
        </div>
      </div>
    </SidebarLayout>
  )
}
