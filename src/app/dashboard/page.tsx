'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Loader2, Plus, Users, Trophy, Clock, Zap, Calendar, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'

interface DraftSummary {
  // Draft metadata
  draft_id: string
  draft_name: string
  status: 'setup' | 'active' | 'completed' | 'paused'
  format: 'snake' | 'auction'
  ruleset: string
  room_code: string
  host_id: string
  created_at: string
  updated_at: string
  max_teams: number
  pokemon_per_team: number
  current_turn: number | null
  spectator_count: number

  // User's team
  user_team_id: string
  user_team_name: string
  user_id: string
  budget_remaining: number
  draft_order: number
  is_host: boolean

  // Statistics
  picks_made: number
  total_picks: number
  max_possible_picks: number
  progress_percent: number
  active_participant_count: number
  total_participant_count: number

  // League association
  league_id: string | null
  league_status: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active')

  useEffect(() => {
    const loadDashboardData = async () => {
      // Wait for auth to finish loading
      if (authLoading) {
        console.log('[Dashboard] Auth still loading, skipping data fetch')
        return
      }

      // Skip data fetch if not authenticated
      if (!user) {
        console.log('[Dashboard] No user authenticated')
        setLoading(false)
        return
      }

      try {
        console.log('[Dashboard] Loading drafts for user:', user.id)

        if (!supabase) {
          console.error('[Dashboard] Supabase not available')
          setDrafts([])
          setLoading(false)
          return
        }

        // Query the user_draft_summary view for efficient data retrieval
        const { data: draftSummaries, error } = await supabase
          .from('user_draft_summary')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }) as any

        if (error) {
          console.error('[Dashboard] Error fetching drafts:', error)
          setDrafts([])
          setLoading(false)
          return
        }

        console.log('[Dashboard] Fetched draft summaries:', draftSummaries)
        setDrafts(draftSummaries || [])
      } catch (err) {
        console.error('[Dashboard] Unexpected error:', err)
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
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </SidebarLayout>
    )
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-screen p-8">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Dashboard Access Required
              </CardTitle>
              <CardDescription>
                Sign in to view your drafts and league activity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your dashboard shows your active drafts, league participation, and recent activity.
                Please log in to access these features.
              </p>
              <Button
                className="w-full"
                onClick={() => setAuthModalOpen(true)}
              >
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          redirectTo="/dashboard"
        />
      </SidebarLayout>
    )
  }

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User'

  // Filter drafts by status
  const activeDrafts = drafts.filter(d => d.status === 'active' || d.status === 'setup')
  const completedDrafts = drafts.filter(d => d.status === 'completed')

  // Calculate statistics
  const totalDrafts = drafts.length
  const totalActive = activeDrafts.length
  const totalCompleted = completedDrafts.length
  const draftsWithLeagues = drafts.filter(d => d.league_id).length

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      setup: { label: 'Setup', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
      active: { label: 'Active', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
      completed: { label: 'Completed', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
      paused: { label: 'Paused', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20' }
    }
    const variant = variants[status] || variants.setup
    return <Badge variant="outline" className={variant.className}>{variant.label}</Badge>
  }

  const DraftCard = ({ draft }: { draft: DraftSummary }) => {
    const progressColor = draft.progress_percent >= 100 ? 'bg-green-500' : 'bg-blue-500'

    return (
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push(`/draft/${draft.room_code.toLowerCase()}`)}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CardTitle className="text-xl">{draft.draft_name}</CardTitle>
                {draft.is_host && (
                  <Badge variant="secondary" className="text-xs">
                    Host
                  </Badge>
                )}
              </div>
              <CardDescription className="flex items-center gap-2">
                <span className="font-mono text-sm">{draft.room_code}</span>
                <span>•</span>
                <span>{draft.user_team_name}</span>
              </CardDescription>
            </div>
            {getStatusBadge(draft.status)}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Progress Bar */}
          {draft.status !== 'setup' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Draft Progress</span>
                <span className="font-medium">{draft.progress_percent}%</span>
              </div>
              <Progress value={draft.progress_percent} className={progressColor} />
              <div className="text-xs text-muted-foreground">
                {draft.total_picks} / {draft.max_possible_picks} picks made
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Your Picks */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Trophy className="h-3 w-3" />
                <span>Your Picks</span>
              </div>
              <div className="text-lg font-semibold">
                {draft.picks_made}/{draft.pokemon_per_team}
              </div>
            </div>

            {/* Budget */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                <span>Budget</span>
              </div>
              <div className="text-lg font-semibold">
                {draft.budget_remaining}
              </div>
            </div>

            {/* Participants */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>Teams</span>
              </div>
              <div className="text-lg font-semibold">
                {draft.total_participant_count}/{draft.max_teams}
              </div>
            </div>

            {/* Format */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Zap className="h-3 w-3" />
                <span>Format</span>
              </div>
              <div className="text-sm font-semibold capitalize">
                {draft.format}
              </div>
            </div>
          </div>

          {/* League Status */}
          {draft.league_id && (
            <div className="flex items-center gap-2 p-2 bg-purple-500/10 rounded-md border border-purple-500/20">
              <Trophy className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-purple-500 font-medium">
                League Created - {draft.league_status}
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {draft.status === 'active' && (
              <Button
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/draft/${draft.room_code.toLowerCase()}`)
                }}
              >
                Continue Draft
              </Button>
            )}

            {draft.status === 'setup' && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/draft/${draft.room_code.toLowerCase()}`)
                }}
              >
                Setup Draft
              </Button>
            )}

            {draft.status === 'completed' && !draft.league_id && (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/draft/${draft.room_code.toLowerCase()}/results`)
                  }}
                >
                  View Results
                </Button>
                <Button
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    // TODO: Implement league creation
                    alert('League creation coming soon!')
                  }}
                >
                  Create League
                </Button>
              </>
            )}

            {draft.status === 'completed' && draft.league_id && (
              <Button
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/league/${draft.league_id}`)
                }}
              >
                View League
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <SidebarLayout>
      <main className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold mb-2">Welcome back, {displayName}!</h1>
            <p className="text-muted-foreground">
              Manage your drafts, view your teams, and track your progress.
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Drafts</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalDrafts}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Drafts</CardTitle>
                <Zap className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{totalActive}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <Clock className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">{totalCompleted}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leagues</CardTitle>
                <Users className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-500">{draftsWithLeagues}</div>
              </CardContent>
            </Card>
          </div>

          {/* Drafts Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>My Drafts</CardTitle>
                  <CardDescription>View and manage all your draft rooms</CardDescription>
                </div>
                <Button asChild>
                  <Link href="/create-draft">
                    <Plus className="h-4 w-4 mr-2" />
                    New Draft
                  </Link>
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {totalDrafts === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No drafts yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first draft to get started!
                  </p>
                  <Button asChild>
                    <Link href="/create-draft">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Draft
                    </Link>
                  </Button>
                </div>
              ) : (
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="active">
                      Active ({totalActive})
                    </TabsTrigger>
                    <TabsTrigger value="completed">
                      Completed ({totalCompleted})
                    </TabsTrigger>
                    <TabsTrigger value="all">
                      All ({totalDrafts})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="active" className="space-y-4">
                    {activeDrafts.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No active drafts. Create one to get started!
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {activeDrafts.map(draft => (
                          <DraftCard key={draft.draft_id} draft={draft} />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="completed" className="space-y-4">
                    {completedDrafts.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No completed drafts yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {completedDrafts.map(draft => (
                          <DraftCard key={draft.draft_id} draft={draft} />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="all" className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {drafts.map(draft => (
                        <DraftCard key={draft.draft_id} draft={draft} />
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </SidebarLayout>
  )
}
