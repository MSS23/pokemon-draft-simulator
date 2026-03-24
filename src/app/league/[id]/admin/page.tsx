'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueService } from '@/lib/league-service'
import { CommissionerService, type Announcement } from '@/lib/commissioner-service'
import { TradeService, type TradeWithDetails } from '@/lib/trade-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft, Swords, Megaphone, Trophy, AlertTriangle,
  Check, X, Pin, PinOff, Trash2, Edit2, SkipForward,
  Lock, Unlock, CalendarX2, Timer, ShieldX, Settings
} from 'lucide-react'
import type { League, Team, Standing } from '@/types'
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

  // Commissioner settings state
  const [rosterLocked, setRosterLocked] = useState(false)
  const [waiverDeadline, setWaiverDeadline] = useState('')
  const [savingRosterLock, setSavingRosterLock] = useState(false)
  const [savingWaiverDeadline, setSavingWaiverDeadline] = useState(false)

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
        TradeService.getTradesPendingApproval(leagueId).catch((): TradeWithDetails[] => []),
        CommissionerService.getAnnouncements(leagueId).catch(() => []),
      ])

      if (!leagueData) { router.push('/dashboard'); return }
      setLeague(leagueData)
      // Initialize commissioner settings from league settings
      const settings = leagueData.settings || {}
      setRosterLocked(!!settings.rosterLocked)
      setWaiverDeadline((settings.waiverDeadline as string) || '')
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

  const handleVetoTrade = async (tradeId: string) => {
    try {
      let userId = user?.id
      if (!userId) {
        const session = await UserSessionService.getOrCreateSession()
        userId = session.userId
      }
      await TradeService.approveTrade(tradeId, userId, false, 'Commissioner vetoed this trade')
      notify.success('Trade Vetoed', 'The trade has been blocked by the commissioner.')
      loadData()
    } catch (err) {
      log.error('Failed to veto trade:', err)
      notify.error('Veto Failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleToggleRosterLock = async () => {
    if (!supabase || !leagueId || !league) return
    setSavingRosterLock(true)
    try {
      const newState = !rosterLocked
      const updatedSettings = { ...league.settings, rosterLocked: newState }
      const { error } = await supabase
        .from('leagues')
        .update({ settings: updatedSettings })
        .eq('id', leagueId)
      if (error) throw error
      setRosterLocked(newState)
      setLeague(prev => prev ? { ...prev, settings: updatedSettings } : prev)
      notify.success(newState ? 'Rosters Locked' : 'Rosters Unlocked', newState ? 'No trades or roster changes allowed.' : 'Trades and roster changes are now open.')
    } catch (err) {
      log.error('Failed to toggle roster lock:', err)
      notify.error('Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingRosterLock(false)
    }
  }

  const handleAdvanceWeek = async () => {
    if (!supabase || !leagueId || !league) return
    const nextWeek = (league.currentWeek || 1) + 1
    try {
      const { error } = await supabase
        .from('leagues')
        .update({ current_week: nextWeek })
        .eq('id', leagueId)
      if (error) throw error
      setLeague(prev => prev ? { ...prev, currentWeek: nextWeek } : prev)
      notify.success('Week Advanced', `Now on Week ${nextWeek}`)
    } catch (err) {
      log.error('Failed to advance week:', err)
      notify.error('Advance Failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleSaveWaiverDeadline = async () => {
    if (!supabase || !leagueId || !league) return
    setSavingWaiverDeadline(true)
    try {
      const updatedSettings = { ...league.settings, waiverDeadline }
      const { error } = await supabase
        .from('leagues')
        .update({ settings: updatedSettings })
        .eq('id', leagueId)
      if (error) throw error
      setLeague(prev => prev ? { ...prev, settings: updatedSettings } : prev)
      notify.success('Saved', 'Waiver deadline updated')
    } catch (err) {
      log.error('Failed to save waiver deadline:', err)
      notify.error('Save Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingWaiverDeadline(false)
    }
  }

  if (isLoading) return <LoadingScreen title="Loading Commissioner Tools..." description="Checking permissions." />
  if (!league || !isCommissioner) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => router.push(`/league/${leagueId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Commissioner Dashboard</h1>
            <p className="text-sm text-muted-foreground">{league.name}</p>
          </div>
        </div>

        <Tabs defaultValue="matches" className="space-y-4">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="matches" className="flex-1 text-xs sm:text-sm">Matches</TabsTrigger>
            <TabsTrigger value="trades" className="flex-1 text-xs sm:text-sm">Trades{pendingTrades.length > 0 && <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-xs">{pendingTrades.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="announcements" className="flex-1 text-xs sm:text-sm">Announcements</TabsTrigger>
            <TabsTrigger value="standings" className="flex-1 text-xs sm:text-sm">Standings</TabsTrigger>
            <TabsTrigger value="week" className="flex-1 text-xs sm:text-sm">Week</TabsTrigger>
            <TabsTrigger value="settings" className="flex-1 text-xs sm:text-sm">
              <Settings className="h-3 w-3 mr-1 hidden sm:inline" />
              Settings
            </TabsTrigger>
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
                    <Card className="border-yellow-500 dark:border-yellow-500/60 mt-4">
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
                              aria-label="Home team score"
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
                              aria-label="Away team score"
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
                  <ShieldX className="h-5 w-5" />
                  Trade Management
                </CardTitle>
                <CardDescription>Approve, reject, or veto pending trades</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingTrades.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">No trades pending approval.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingTrades.map(trade => (
                      <Card key={trade.id} className="border-yellow-500/50 dark:border-yellow-500/30">
                        <CardContent className="pt-4">
                          <div className="text-sm mb-3">
                            <span className="font-medium">{trade.teamAName || 'Team A'}</span>
                            <span className="text-muted-foreground mx-2">&harr;</span>
                            <span className="font-medium">{trade.teamBName || 'Team B'}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveTrade(trade.id, true)}>
                              <Check className="h-3 w-3 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleApproveTrade(trade.id, false)}>
                              <X className="h-3 w-3 mr-1" />Reject
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleVetoTrade(trade.id)}>
                              <ShieldX className="h-3 w-3 mr-1" />Veto
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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={league.currentWeek >= league.totalWeeks}
                        >
                          <SkipForward className="h-3 w-3 mr-1" />
                          Force Advance to Week {league.currentWeek + 1}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Force Advance Week?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will mark all incomplete matches in the current week as cancelled and advance to the next week. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleForceAdvance}>Advance Week</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            {/* Roster Lock */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {rosterLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                  Roster Management
                </CardTitle>
                <CardDescription>Lock rosters to prevent trades and roster changes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="font-medium text-sm">Roster Lock</div>
                    <div className="text-xs text-muted-foreground">
                      {rosterLocked
                        ? 'Rosters are locked \u2014 no trades or changes allowed'
                        : 'Rosters are unlocked \u2014 trades and changes are open'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={rosterLocked ? 'destructive' : 'outline'}
                    onClick={handleToggleRosterLock}
                    disabled={savingRosterLock}
                  >
                    {rosterLocked ? (
                      <><Unlock className="h-3 w-3 mr-1" />Unlock Rosters</>
                    ) : (
                      <><Lock className="h-3 w-3 mr-1" />Lock Rosters</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Schedule Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarX2 className="h-5 w-5" />
                  Schedule Management
                </CardTitle>
                <CardDescription>Quick week advancement and schedule adjustments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm">
                    Current Week: <strong>{league.currentWeek || 1}</strong> of {league.totalWeeks}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={league.currentWeek >= league.totalWeeks}
                      >
                        <SkipForward className="h-3 w-3 mr-1" />
                        Advance to Week {(league.currentWeek || 1) + 1}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Advance Week?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Advancing the week will lock the current week&apos;s unplayed matches as forfeits. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleAdvanceWeek}>Advance Week</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <p className="text-xs text-muted-foreground">
                  Advancing the week will lock the current week&apos;s unplayed matches as forfeits.
                </p>
              </CardContent>
            </Card>

            {/* Waiver Wire Deadline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  Waiver Wire
                </CardTitle>
                <CardDescription>Set deadlines for free agent claims</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label htmlFor="waiver-deadline" className="text-sm whitespace-nowrap">Waiver Deadline</Label>
                  <Input
                    id="waiver-deadline"
                    type="datetime-local"
                    value={waiverDeadline}
                    onChange={(e) => setWaiverDeadline(e.target.value)}
                    className="flex-1 h-8 text-xs"
                    aria-describedby="waiver-deadline-desc"
                  />
                  <Button size="sm" onClick={handleSaveWaiverDeadline} disabled={savingWaiverDeadline}>
                    Save
                  </Button>
                </div>
                {waiverDeadline ? (
                  <p id="waiver-deadline-desc" className="text-xs text-muted-foreground">
                    Free agent claims close at {new Date(waiverDeadline).toLocaleString()}
                  </p>
                ) : (
                  <p id="waiver-deadline-desc" className="text-xs text-muted-foreground">
                    No waiver deadline set. Free agent claims are open indefinitely.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
