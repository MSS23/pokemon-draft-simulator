'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import type { DraftSettings } from '@/types/supabase-helpers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Loader2, Plus, Users, Trophy, Clock, Zap } from 'lucide-react'
import Link from 'next/link'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'

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
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
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

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      setup: { label: 'Setup', variant: 'outline' },
      active: { label: 'Active', variant: 'default' },
      completed: { label: 'Completed', variant: 'secondary' },
      paused: { label: 'Paused', variant: 'outline' }
    }
    const c = config[status] || config.setup
    return <Badge variant={c.variant} className="text-[10px]">{c.label}</Badge>
  }

  const DraftCard = ({ draft }: { draft: DraftSummary }) => (
    <Card
      className="hover:border-primary/30 transition-colors cursor-pointer"
      onClick={() => router.push(`/draft/${draft.room_code.toLowerCase()}`)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{draft.draft_name}</p>
              {draft.is_host && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Host</Badge>}
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

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {displayName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your drafts and track progress.
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
                <p className="text-xs text-muted-foreground">Total</p>
                <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{drafts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Active</p>
                <Zap className="h-3.5 w-3.5 text-green-500" />
              </div>
              <p className="text-2xl font-bold">{activeDrafts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Completed</p>
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{completedDrafts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{drafts.length > 0 ? `${Math.round((completedDrafts.length / drafts.length) * 100)}%` : '-'}</p>
            </CardContent>
          </Card>
        </div>

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
