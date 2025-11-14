'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Users, Clock, ChevronRight, Eye, Calendar } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { SidebarLayout } from '@/components/layout/SidebarLayout'

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
}

export default function DraftHistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [completedDrafts, setCompletedDrafts] = useState<CompletedDraft[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadCompletedDrafts = async () => {
      try {
        // Wait for auth to finish loading
        if (authLoading) return

        // Skip data fetch if not authenticated (will show empty state)
        if (!user) {
          setIsLoading(false)
          return
        }

        if (!supabase) {
          setIsLoading(false)
          return
        }

        // Query all teams user owns and join with completed drafts
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
          .eq('owner_id', user.id)
          .eq('draft.status', 'completed')
          .is('draft.deleted_at', null)
          .order('draft(updated_at)', { ascending: false })

        if (error) {
          console.error('Error loading completed drafts:', error)
          setIsLoading(false)
          return
        }

        // Get team counts and pick counts for each draft
        const draftsWithDetails = await Promise.all(
          (userTeams || []).map(async (team: any) => {
            const draft = team.draft

            // Get total teams in draft
            const { count: teamCount } = await supabase
              .from('teams')
              .select('*', { count: 'exact', head: true })
              .eq('draft_id', draft.id)

            // Get total picks for this user's team
            const { count: pickCount } = await supabase
              .from('picks')
              .select('*', { count: 'exact', head: true })
              .eq('team_id', team.id)

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
              isHost: draft.host_id === user.id,
              totalTeams: teamCount || 0,
              totalPicks: pickCount || 0
            }
          })
        )

        setCompletedDrafts(draftsWithDetails)
      } catch (error) {
        console.error('Error loading draft history:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadCompletedDrafts()
  }, [authLoading, user, router])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffInDays === 0) return 'Today'
    if (diffInDays === 1) return 'Yesterday'
    if (diffInDays < 7) return `${diffInDays} days ago`
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`
    return date.toLocaleDateString()
  }

  const getFormatDisplayName = (format: string) => {
    const formatMap: Record<string, string> = {
      'vgc-reg-h': 'VGC Regulation H',
      'smogon-ou': 'Smogon OU',
      'smogon-uu': 'Smogon UU',
      'custom': 'Custom Format'
    }
    return formatMap[format] || format.toUpperCase()
  }

  return (
    <SidebarLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            Draft History
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            View results from your completed drafts
          </p>
        </div>

        {/* Loading State */}
        {(authLoading || isLoading) && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Empty State */}
        {!authLoading && !isLoading && completedDrafts.length === 0 && (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Trophy className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">
                No completed drafts yet
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6 text-center max-w-md">
                Once you complete a draft, it will appear here so you can review the results anytime.
              </p>
              <Button onClick={() => router.push('/create-draft')}>
                Create Your First Draft
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Completed Drafts List */}
        {!authLoading && !isLoading && completedDrafts.length > 0 && (
          <div className="space-y-4">
            {completedDrafts.map((draft) => (
              <Card
                key={draft.id}
                className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-slate-200 dark:border-slate-700"
                onClick={() => router.push(`/draft/${draft.roomCode}/results`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Header */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                          <Trophy className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                              {draft.name}
                            </h3>
                            {draft.isHost && (
                              <Badge variant="outline" className="text-xs">
                                Host
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className="text-xs bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                            >
                              ✓ Completed
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            Room: {draft.roomCode.toUpperCase()}
                          </p>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-slate-500" />
                          <div>
                            <p className="text-slate-600 dark:text-slate-400">Team</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {draft.teamName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Trophy className="h-4 w-4 text-slate-500" />
                          <div>
                            <p className="text-slate-600 dark:text-slate-400">Picks</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {draft.totalPicks} Pokémon
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-slate-500" />
                          <div>
                            <p className="text-slate-600 dark:text-slate-400">Teams</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {draft.totalTeams}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-slate-500" />
                          <div>
                            <p className="text-slate-600 dark:text-slate-400">Completed</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {formatDate(draft.completedAt)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Format Badge */}
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {getFormatDisplayName(draft.format)}
                        </Badge>
                      </div>
                    </div>

                    {/* View Results Button */}
                    <div className="ml-4 flex-shrink-0">
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Results
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
