'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Trophy, Users, ArrowRight, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueService } from '@/lib/league-service'
import { UserSessionService } from '@/lib/user-session'
import { supabase } from '@/lib/supabase'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import type { Match, League, Team, Draft } from '@/types'
import { format, isPast, isFuture, isToday } from 'date-fns'

interface MatchWithDetails extends Match {
  league: League
  homeTeam: Team
  awayTeam: Team
  isUserHome: boolean
  opponentTeam: Team
  userTeam: Team
}

interface DraftWithTeam extends Draft {
  team: Team
}

export default function MyDraftsPage() {
  const router = useRouter()
  const [matches, setMatches] = useState<MatchWithDetails[]>([])
  const [drafts, setDrafts] = useState<DraftWithTeam[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const session = await UserSessionService.getSession()
        if (!session?.userId) {
          router.push('/')
          return
        }

        setUserId(session.userId)

        // Load matches
        const { matches: userMatches } = await LeagueService.getUserMatches(session.userId)

        // Enrich matches with user context
        const enrichedMatches: MatchWithDetails[] = userMatches.map(match => {
          const isUserHome = match.homeTeam.ownerId === session.userId
          return {
            ...match,
            isUserHome,
            userTeam: isUserHome ? match.homeTeam : match.awayTeam,
            opponentTeam: isUserHome ? match.awayTeam : match.homeTeam
          }
        })

        setMatches(enrichedMatches)

        // Load drafts user is participating in
        if (supabase) {
          const { data: userTeams } = await supabase
            .from('teams')
            .select(`
              *,
              draft:drafts(*)
            `)
            .eq('owner_id', session.userId)

          if (userTeams) {
            const draftsWithTeams: DraftWithTeam[] = userTeams
              .filter((t: any) => t.draft)
              .map((t: any) => {
                const draftData = Array.isArray(t.draft) ? t.draft[0] : t.draft
                return {
                  id: draftData.id,
                  name: draftData.name,
                  hostId: draftData.host_id,
                  format: draftData.format,
                  ruleset: draftData.ruleset,
                  budgetPerTeam: draftData.budget_per_team,
                  maxTeams: draftData.max_teams,
                  status: draftData.status,
                  currentTurn: draftData.current_turn,
                  currentRound: draftData.current_round,
                  settings: draftData.settings || {},
                  createdAt: draftData.created_at,
                  updatedAt: draftData.updated_at,
                  team: {
                    id: t.id,
                    draftId: t.draft_id,
                    name: t.name,
                    ownerId: t.owner_id,
                    budgetRemaining: t.budget_remaining,
                    draftOrder: t.draft_order,
                    picks: []
                  }
                }
              })
            setDrafts(draftsWithTeams)
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [router])

  const upcomingMatches = matches.filter(m =>
    m.status === 'scheduled' &&
    (!m.scheduledDate || isFuture(new Date(m.scheduledDate)) || isToday(new Date(m.scheduledDate)))
  )

  const completedMatches = matches.filter(m => m.status === 'completed')
  const inProgressMatches = matches.filter(m => m.status === 'in_progress')

  const handleMatchClick = (matchId: string) => {
    router.push(`/match/${matchId}`)
  }

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 min-h-full flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 dark:text-slate-400">Loading your matches...</p>
          </div>
        </div>
      </SidebarLayout>
    )
  }

  const handleDraftClick = (draftId: string) => {
    router.push(`/draft/${draftId}`)
  }

  if (matches.length === 0 && drafts.length === 0) {
    return (
      <SidebarLayout>
        <div className="bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 min-h-full">
          <div className="max-w-4xl mx-auto pt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-6 w-6 text-yellow-500" />
                  My Drafts
                </CardTitle>
                <CardDescription>
                  You haven't joined any drafts yet. Create or join a draft to get started!
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => router.push('/')}>
                  Go to Home
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      <div className="bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 min-h-full">
        <div className="max-w-6xl mx-auto pt-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <Trophy className="h-8 w-8 text-yellow-500" />
                My League Matches
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Track your upcoming games and view results
              </p>
            </div>
          </div>

        {/* Drafts Section */}
        {drafts.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <Users className="h-6 w-6 text-blue-500" />
              My Drafts
            </h2>
            <div className="grid gap-4">
              {drafts.map(draft => (
                <DraftCard key={draft.id} draft={draft} onClick={() => handleDraftClick(draft.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Tabs for filtering matches */}
        {matches.length > 0 && (
          <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="upcoming">
              Upcoming ({upcomingMatches.length})
            </TabsTrigger>
            <TabsTrigger value="live">
              Live ({inProgressMatches.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completedMatches.length})
            </TabsTrigger>
          </TabsList>

          {/* Upcoming Matches */}
          <TabsContent value="upcoming" className="space-y-4 mt-6">
            {upcomingMatches.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-slate-500">No upcoming matches</p>
                </CardContent>
              </Card>
            ) : (
              upcomingMatches.map(match => (
                <MatchCard key={match.id} match={match} onClick={() => handleMatchClick(match.id)} />
              ))
            )}
          </TabsContent>

          {/* Live Matches */}
          <TabsContent value="live" className="space-y-4 mt-6">
            {inProgressMatches.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-slate-500">No matches in progress</p>
                </CardContent>
              </Card>
            ) : (
              inProgressMatches.map(match => (
                <MatchCard key={match.id} match={match} onClick={() => handleMatchClick(match.id)} />
              ))
            )}
          </TabsContent>

          {/* Completed Matches */}
          <TabsContent value="completed" className="space-y-4 mt-6">
            {completedMatches.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-slate-500">No completed matches</p>
                </CardContent>
              </Card>
            ) : (
              completedMatches.map(match => (
                <MatchCard key={match.id} match={match} onClick={() => handleMatchClick(match.id)} />
              ))
            )}
          </TabsContent>
        </Tabs>
        )}
        </div>
      </div>
    </SidebarLayout>
  )
}

function DraftCard({ draft, onClick }: { draft: DraftWithTeam; onClick: () => void }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'setup': return 'bg-gray-500'
      case 'active': return 'bg-green-500'
      case 'completed': return 'bg-blue-500'
      case 'paused': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'setup': return 'Waiting for Players'
      case 'active': return 'Draft In Progress'
      case 'completed': return 'Draft Complete'
      case 'paused': return 'Paused'
      default: return status
    }
  }

  return (
    <Card
      className="hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {draft.name}
              </h3>
              <Badge className={`${getStatusColor(draft.status)} text-white`}>
                {getStatusText(draft.status)}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Your Team: <span className="font-semibold text-slate-900 dark:text-white">{draft.team.name}</span>
                </span>
                <span>•</span>
                <span className="capitalize">{draft.format} Draft</span>
                <span>•</span>
                <span>Round {draft.currentRound || 1}</span>
              </div>

              {draft.status === 'setup' && (
                <p className="text-sm text-slate-500">
                  Waiting for all teams to join before starting...
                </p>
              )}

              {draft.status === 'active' && (
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                  Your draft is live! Click to continue drafting.
                </p>
              )}

              {draft.status === 'completed' && (
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  Draft complete{draft.settings?.createLeague ? ' • League created' : ''}
                </p>
              )}
            </div>
          </div>

          <div className="ml-4">
            <ArrowRight className="h-6 w-6 text-slate-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MatchCard({ match, onClick }: { match: MatchWithDetails; onClick: () => void }) {
  const isCompleted = match.status === 'completed'
  const isLive = match.status === 'in_progress'
  const userWon = isCompleted && match.winnerTeamId === match.userTeam.id
  const userLost = isCompleted && match.winnerTeamId === match.opponentTeam.id

  return (
    <Card
      className="hover:shadow-lg transition-shadow cursor-pointer border-l-4"
      style={{
        borderLeftColor: isLive ? '#10b981' : isCompleted ? (userWon ? '#10b981' : '#ef4444') : '#6366f1'
      }}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          {/* Match Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <Badge variant="outline" className="text-xs">
                {match.league.name}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Week {match.weekNumber}
              </Badge>
              {isLive && (
                <Badge className="bg-green-500 text-white animate-pulse">
                  <Clock className="h-3 w-3 mr-1" />
                  LIVE
                </Badge>
              )}
              {isCompleted && userWon && (
                <Badge className="bg-green-600 text-white">WON</Badge>
              )}
              {isCompleted && userLost && (
                <Badge className="bg-red-600 text-white">LOST</Badge>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 items-center">
              {/* Your Team */}
              <div className="text-right">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {match.userTeam.name}
                </p>
                <p className="text-xs text-slate-500">Your Team</p>
              </div>

              {/* VS / Score */}
              <div className="text-center">
                {isCompleted ? (
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {match.isUserHome ? match.homeScore : match.awayScore}
                    {' - '}
                    {match.isUserHome ? match.awayScore : match.homeScore}
                  </div>
                ) : (
                  <div className="text-xl font-semibold text-slate-500">VS</div>
                )}
              </div>

              {/* Opponent Team */}
              <div className="text-left">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {match.opponentTeam.name}
                </p>
                <p className="text-xs text-slate-500">Opponent</p>
              </div>
            </div>

            {/* Date/Time */}
            {match.scheduledDate && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <Calendar className="h-4 w-4" />
                {format(new Date(match.scheduledDate), 'EEEE, MMMM d, yyyy • h:mm a')}
              </div>
            )}
          </div>

          {/* Arrow */}
          <div className="ml-4">
            <ArrowRight className="h-6 w-6 text-slate-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
