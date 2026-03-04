'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueService } from '@/lib/league-service'
import { CommissionerService, type Announcement } from '@/lib/commissioner-service'
import { TradeService } from '@/lib/trade-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import {
  ArrowLeft, Swords, Repeat, Megaphone, Trophy, AlertTriangle,
  Check, X, Pin, PinOff, Trash2, Edit2, SkipForward
} from 'lucide-react'
import type { League, Team, Standing, TradeWithDetails } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'
import { createLogger } from '@/lib/logger'
import { notify } from '@/lib/notifications'

const log = createLogger('CommissionerPage')

export default function CommissionerPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string
  const { user } = useAuth()

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof CommissionerService.getAllMatches>>>([])
  const [standings, setStandings] = useState<(Standing & { team: Team })[]>([])
  const [pendingTrades, setPendingTrades] = useState<TradeWithDetails[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Override modal state
  const [editingMatch, setEditingMatch] = useState<string | null>(null)
  const [editHomeScore, setEditHomeScore] = useState(0)
  const [editAwayScore, setEditAwayScore] = useState(0)

  // Announcement form
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newPinned, setNewPinned] = useState(false)

  const loadData = useCallback(async () => {
    try {
      let userId = user?.id
      if (!userId) {
        try {
          const session = await UserSessionService.getOrCreateSession()
          userId = session.userId
        } catch { /* guest */ }
      }

      if (!userId) { router.push('/dashboard'); return }

      const commCheck = await LeagueService.isLeagueCommissioner(leagueId, userId)
      setIsCommissioner(commCheck)
      if (!commCheck) { router.push(`/league/${leagueId}`); return }

      const [leagueData, matchesData, standingsData, tradesData, announcementsData] = await Promise.all([
        LeagueService.getLeague(leagueId),
        CommissionerService.getAllMatches(leagueId),
        LeagueService.getStandings(leagueId),
        TradeService.getTradesPendingApproval(leagueId).catch(() => []),
        CommissionerService.getAnnouncements(leagueId).catch(() => []),
      ])

      if (!leagueData) { router.push('/dashboard'); return }
      setLeague(leagueData)
      setMatches(matchesData)
      setStandings(standingsData)
      setPendingTrades(tradesData)
      setAnnouncements(announcementsData)
    } catch (err) {
      log.error('Failed to load commissioner data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [leagueId, router, user?.id])

  useEffect(() => { loadData() }, [loadData])

  const handleOverrideMatch = async (matchId: string) => {
    try {
      const winnerId = editHomeScore > editAwayScore
        ? matches.find(m => m.id === matchId)?.homeTeamId
        : editAwayScore > editHomeScore
        ? matches.find(m => m.id === matchId)?.awayTeamId
        : null

      await CommissionerService.overrideMatchResult(matchId, editHomeScore, editAwayScore, winnerId || null)
      notify.success('Match Result Overridden', 'Standings have been recalculated.')
      setEditingMatch(null)
      loadData()
    } catch (err) {
      log.error('Failed to override match:', err)
      notify.error('Override Failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleForceAdvance = async () => {
    try {
      await CommissionerService.forceAdvanceWeek(leagueId)
      notify.success('Week Advanced', 'Incomplete matches were cancelled.')
      loadData()
    } catch (err) {
      log.error('Failed to force advance:', err)
      notify.error('Advance Failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleApproveTrade = async (tradeId: string, approved: boolean) => {
    try {
      let userId = user?.id
      if (!userId) {
        const session = await UserSessionService.getOrCreateSession()
        userId = session.userId
      }
      await TradeService.approveTrade(tradeId, userId, approved, approved ? 'Commissioner approved' : 'Commissioner rejected')
      notify.success(approved ? 'Trade Approved' : 'Trade Rejected', '')
      loadData()
    } catch (err) {
      log.error('Failed to handle trade:', err)
      notify.error('Action Failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handlePostAnnouncement = async () => {
    if (!newTitle.trim()) return
    try {
      await CommissionerService.postAnnouncement(leagueId, newTitle.trim(), newBody.trim(), newPinned)
      setNewTitle('')
      setNewBody('')
      setNewPinned(false)
      notify.success('Announcement Posted', '')
      loadData()
    } catch (err) {
      log.error('Failed to post announcement:', err)
      notify.error('Post Failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await CommissionerService.deleteAnnouncement(leagueId, id)
      loadData()
    } catch (err) {
      log.error('Failed to delete announcement:', err)
    }
  }

  const handleTogglePin = async (id: string) => {
    try {
      await CommissionerService.togglePinAnnouncement(leagueId, id)
      loadData()
    } catch (err) {
      log.error('Failed to toggle pin:', err)
    }
  }

  const handleRecalculate = async () => {
    try {
      await LeagueService.recalculateStandings(leagueId)
      notify.success('Standings Recalculated', '')
      loadData()
    } catch (err) {
      log.error('Failed to recalculate:', err)
      notify.error('Recalculate Failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  if (isLoading) return <LoadingScreen title="Loading Commissioner Tools..." description="Checking permissions." />
  if (!league || !isCommissioner) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => router.push(`/league/${leagueId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Commissioner Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {league.name} &middot; Week {league.currentWeek} of {league.totalWeeks}
            </p>
          </div>
        </div>

        <Tabs defaultValue="matches" className="space-y-4">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="matches" className="flex-1 text-xs sm:text-sm">Matches</TabsTrigger>
            <TabsTrigger value="trades" className="flex-1 text-xs sm:text-sm">
              Trades
              {pendingTrades.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-xs">{pendingTrades.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="announcements" className="flex-1 text-xs sm:text-sm">Announcements</TabsTrigger>
            <TabsTrigger value="standings" className="flex-1 text-xs sm:text-sm">Standings</TabsTrigger>
            <TabsTrigger value="week" className="flex-1 text-xs sm:text-sm">Week</TabsTrigger>
          </TabsList>

          {/* Matches Tab */}
          <TabsContent value="matches" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Swords className="h-5 w-5" />
                  Match Management
                </CardTitle>
                <CardDescription>Override results or force-complete disputed matches</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {matches.map(match => (
                  <div key={match.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground shrink-0">Wk {match.weekNumber}</span>
                      <span className="text-sm font-medium truncate">{match.homeTeamName}</span>
                      <span className="text-sm tabular-nums font-bold">{match.homeScore} - {match.awayScore}</span>
                      <span className="text-sm font-medium truncate">{match.awayTeamName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={match.status === 'completed' ? 'default' : match.status === 'scheduled' ? 'outline' : 'secondary'}>
                        {match.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingMatch(match.id)
                          setEditHomeScore(match.homeScore)
                          setEditAwayScore(match.awayScore)
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Override modal */}
                {editingMatch && (() => {
                  const match = matches.find(m => m.id === editingMatch)
                  if (!match) return null
                  return (
                    <Card className="border-yellow-500 mt-4">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          Override: {match.homeTeamName} vs {match.awayTeamName}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 mb-4">
                          <div className="flex-1">
                            <label className="text-xs text-muted-foreground">{match.homeTeamName}</label>
                            <input
                              type="number"
                              min={0}
                              value={editHomeScore}
                              onChange={e => setEditHomeScore(Number(e.target.value))}
                              className="w-full mt-1 px-3 py-2 border rounded-md bg-background text-sm"
                            />
                          </div>
                          <span className="text-muted-foreground mt-4">-</span>
                          <div className="flex-1">
                            <label className="text-xs text-muted-foreground">{match.awayTeamName}</label>
                            <input
                              type="number"
                              min={0}
                              value={editAwayScore}
                              onChange={e => setEditAwayScore(Number(e.target.value))}
                              className="w-full mt-1 px-3 py-2 border rounded-md bg-background text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleOverrideMatch(editingMatch)}>
                            <Check className="h-3 w-3 mr-1" />
                            Confirm Override
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingMatch(null)}>
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trades Tab */}
          <TabsContent value="trades" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Repeat className="h-5 w-5" />
                  Trade Approval Queue
                </CardTitle>
                <CardDescription>Review and approve/reject pending trades</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingTrades.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">No trades pending approval.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingTrades.map(trade => (
                      <Card key={trade.id} className="border-yellow-500/50">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm">
                              <span className="font-medium">{trade.teamAName}</span>
                              <span className="text-muted-foreground mx-2">&harr;</span>
                              <span className="font-medium">{trade.teamBName}</span>
                            </div>
                            <Badge variant="outline">Week {trade.weekNumber}</Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-3">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">{trade.teamAName} sends:</div>
                              {trade.teamAGivesPokemon?.map(p => (
                                <div key={p.id} className="text-sm capitalize">{p.pokemonName}</div>
                              ))}
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">{trade.teamBName} sends:</div>
                              {trade.teamBGivesPokemon?.map(p => (
                                <div key={p.id} className="text-sm capitalize">{p.pokemonName}</div>
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveTrade(trade.id, true)}>
                              <Check className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleApproveTrade(trade.id, false)}>
                              <X className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  Post Announcement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Announcement title"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  />
                  <textarea
                    placeholder="Announcement body (optional)"
                    value={newBody}
                    onChange={e => setNewBody(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
                  />
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newPinned}
                        onChange={e => setNewPinned(e.target.checked)}
                        className="rounded"
                      />
                      Pin announcement
                    </label>
                    <Button size="sm" onClick={handlePostAnnouncement} disabled={!newTitle.trim()}>
                      Post
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {announcements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Existing Announcements</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {announcements.map(ann => (
                    <div key={ann.id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {ann.pinned && <Pin className="h-3 w-3 text-blue-500" />}
                          <span className="font-medium text-sm">{ann.title}</span>
                        </div>
                        {ann.body && <p className="text-xs text-muted-foreground mt-1">{ann.body}</p>}
                        <span className="text-xs text-muted-foreground">
                          {new Date(ann.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleTogglePin(ann.id)}>
                          {ann.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteAnnouncement(ann.id)}>
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Standings Tab */}
          <TabsContent value="standings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Standings Management
                </CardTitle>
                <CardDescription>Recalculate standings or make manual adjustments</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" onClick={handleRecalculate} className="mb-4">
                  Recalculate Standings
                </Button>

                <div className="space-y-2">
                  {standings.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <span className="font-medium text-sm">{s.team.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {s.wins}W-{s.losses}L-{s.draws}D
                        </span>
                      </div>
                      <div className="text-sm tabular-nums">
                        PF: {s.pointsFor} PA: {s.pointsAgainst} Diff: {s.pointDifferential > 0 ? '+' : ''}{s.pointDifferential}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Week Management Tab */}
          <TabsContent value="week" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SkipForward className="h-5 w-5" />
                  Week Management
                </CardTitle>
                <CardDescription>
                  Currently on Week {league.currentWeek} of {league.totalWeeks}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg border-yellow-500/50 bg-yellow-500/5">
                    <h3 className="font-medium text-sm flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Force Advance Week
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      This will cancel any incomplete matches for Week {league.currentWeek} and advance to Week {league.currentWeek + 1}.
                      This action cannot be undone.
                    </p>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleForceAdvance}
                      disabled={league.currentWeek >= league.totalWeeks}
                    >
                      <SkipForward className="h-3 w-3 mr-1" />
                      Force Advance to Week {league.currentWeek + 1}
                    </Button>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p>Current week matches:</p>
                    <ul className="list-disc list-inside mt-1">
                      {matches.filter(m => m.weekNumber === league.currentWeek).map(m => (
                        <li key={m.id}>
                          {m.homeTeamName} vs {m.awayTeamName} — <Badge variant="outline" className="text-[10px]">{m.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
