'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueService } from '@/lib/league-service'
import { TradeService } from '@/lib/trade-service'
import type { TradeWithDetails, LeagueActivityItem } from '@/lib/trade-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import {
  ArrowLeft, ArrowLeftRight, Clock, CheckCircle, XCircle, Send, Inbox, History,
  Shield, Activity, Repeat, Swords, UserPlus,
} from 'lucide-react'
import type { League, Team, Pick, ExtendedLeagueSettings } from '@/types'
import { buildTeamColorMap } from '@/utils/team-colors'
import { PokemonSprite } from '@/components/ui/pokemon-sprite'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'
import { canTrade, formatTradeDeadline } from '@/lib/trade-deadline'

const log = createLogger('TradesPage')

interface PickWithTeam extends Pick {
  teamName?: string
}

export default function TradesPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string
  const { user } = useAuth()

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [trades, setTrades] = useState<TradeWithDetails[]>([])
  const [allPicks, setAllPicks] = useState<PickWithTeam[]>([])
  const [userTeamId, setUserTeamId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [settings, setSettings] = useState<ExtendedLeagueSettings>({})
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activityFeed, setActivityFeed] = useState<LeagueActivityItem[]>([])

  // Propose trade state
  const [selectedOpponent, setSelectedOpponent] = useState<string>('')
  const [myGives, setMyGives] = useState<Set<string>>(new Set())
  const [theirGives, setTheirGives] = useState<Set<string>>(new Set())
  const [tradeNotes, setTradeNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Counter-offer state
  const [counteringTradeId, setCounteringTradeId] = useState<string | null>(null)
  const [counterMyGives, setCounterMyGives] = useState<Set<string>>(new Set())
  const [counterTheirGives, setCounterTheirGives] = useState<Set<string>>(new Set())
  const [counterNotes, setCounterNotes] = useState('')

  // Hijack state
  const [hijackingTradeId, setHijackingTradeId] = useState<string | null>(null)
  const [hijackTargetTeamId, setHijackTargetTeamId] = useState<string | null>(null)
  const [hijackMyGives, setHijackMyGives] = useState<Set<string>>(new Set())
  const [hijackTheirGives, setHijackTheirGives] = useState<Set<string>>(new Set())
  const [hijackNotes, setHijackNotes] = useState('')

  // Load data
  useEffect(() => {
    const load = async () => {
      try {
        let uid = user?.id
        if (!uid) {
          try {
            const session = await UserSessionService.getOrCreateSession()
            uid = session.userId
          } catch { /* guest */ }
        }
        setUserId(uid || null)

        const leagueData = await LeagueService.getLeague(leagueId)
        if (!leagueData) { router.push('/dashboard'); return }
        setLeague(leagueData)

        // Find user's team
        if (uid) {
          const userTeam = leagueData.teams.find(t => t.ownerId === uid)
          if (userTeam) setUserTeamId(userTeam.id)
        }

        // Load all picks for all teams
        if (supabase) {
          const teamIds = leagueData.teams.map(t => t.id)
          const { data: picks } = await supabase
            .from('picks')
            .select('*')
            .in('team_id', teamIds)
            .order('pick_order', { ascending: true })

          if (picks) {
            const teamNameMap = new Map(leagueData.teams.map(t => [t.id, t.name]))
            setAllPicks(picks.map(p => ({
              id: p.id,
              draftId: p.draft_id,
              teamId: p.team_id,
              pokemonId: p.pokemon_id,
              pokemonName: p.pokemon_name,
              cost: p.cost,
              pickOrder: p.pick_order,
              round: p.round,
              createdAt: p.created_at,
              teamName: teamNameMap.get(p.team_id),
            })))
          }
        }

        // Load trades
        try {
          const tradeData = await TradeService.getLeagueTrades(leagueId)
          setTrades(tradeData)
        } catch { /* trades table might not exist */ }

        // Load activity feed
        try {
          const activity = await TradeService.getLeagueActivity(leagueId)
          setActivityFeed(activity)
        } catch { /* ignore */ }

        // Load settings
        try {
          const s = await LeagueService.getLeagueSettings(leagueId)
          setSettings(s)
        } catch { /* ignore */ }

        // Check commissioner
        if (uid) {
          try {
            const isCom = await LeagueService.isLeagueCommissioner(leagueId, uid)
            setIsCommissioner(isCom)
          } catch { /* ignore */ }
        }
      } catch (err) {
        log.error('Failed to load trades page:', err)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [leagueId, router, user?.id])

  // Real-time subscription for trade updates
  useEffect(() => {
    if (!supabase || !leagueId) return

    const channel = supabase.channel(`league-trades:${leagueId}`)
    channel
      .on('broadcast', { event: 'trade_update' }, () => {
        // Re-fetch trades + activity on any update
        TradeService.getLeagueTrades(leagueId).then(setTrades).catch(() => {})
        TradeService.getLeagueActivity(leagueId).then(setActivityFeed).catch(() => {})
      })
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [leagueId])

  const teamColorMap = useMemo(() => {
    if (!league) return new Map<string, { bg: string; border: string; badge: string }>()
    return buildTeamColorMap(league.teams.map(t => t.id))
  }, [league])

  // Picks grouped by team
  const picksByTeam = useMemo(() => {
    const map = new Map<string, PickWithTeam[]>()
    for (const p of allPicks) {
      const existing = map.get(p.teamId) || []
      existing.push(p)
      map.set(p.teamId, existing)
    }
    return map
  }, [allPicks])

  // My picks and opponent picks for trade proposal
  const myPicks = useMemo(() => {
    if (!userTeamId) return []
    return picksByTeam.get(userTeamId) || []
  }, [userTeamId, picksByTeam])

  const opponentPicks = useMemo(() => {
    if (!selectedOpponent) return []
    return picksByTeam.get(selectedOpponent) || []
  }, [selectedOpponent, picksByTeam])

  // Trade categorization
  const pendingIncoming = useMemo(() =>
    trades.filter(t => t.status === 'proposed' && t.team_b_id === userTeamId),
    [trades, userTeamId]
  )

  const pendingOutgoing = useMemo(() =>
    trades.filter(t => t.status === 'proposed' && t.team_a_id === userTeamId),
    [trades, userTeamId]
  )

  // All pending trades visible to everyone (for hijack)
  const allPendingTrades = useMemo(() =>
    trades.filter(t => t.status === 'proposed'),
    [trades]
  )

  // Trades from other managers that user can hijack
  const hijackableTrades = useMemo(() =>
    allPendingTrades.filter(t =>
      t.team_a_id !== userTeamId && t.team_b_id !== userTeamId && userTeamId
    ),
    [allPendingTrades, userTeamId]
  )

  const pendingCommissioner = useMemo(() =>
    trades.filter(t => t.status === 'accepted' && t.commissioner_approved === null),
    [trades]
  )

  const completedTrades = useMemo(() =>
    trades.filter(t => ['completed', 'rejected', 'cancelled', 'countered'].includes(t.status)),
    [trades]
  )

  // Trade deadline check (weekly Sunday + season deadline + admin override)
  const tradeEligibility = useMemo(() => {
    if (!league) return { allowed: false, reason: 'Loading...' }
    return canTrade({
      enableTrades: settings.enableTrades,
      weeklyTradeDeadline: settings.weeklyTradeDeadline,
      tradeDeadlineWeek: settings.tradeDeadlineWeek,
      currentWeek: league.currentWeek,
      isCommissioner,
      adminOverrideTradeDeadline: settings.adminOverrideTradeDeadline,
    })
  }, [settings, league, isCommissioner])

  const tradeDeadlineDisplay = useMemo(() => {
    if (settings.weeklyTradeDeadline !== false) return formatTradeDeadline()
    return null
  }, [settings.weeklyTradeDeadline])

  const canPropose = userTeamId && tradeEligibility.allowed

  const toggleMyGive = useCallback((pickId: string) => {
    setMyGives(prev => {
      const next = new Set(prev)
      if (next.has(pickId)) next.delete(pickId)
      else next.add(pickId)
      return next
    })
  }, [])

  const toggleTheirGive = useCallback((pickId: string) => {
    setTheirGives(prev => {
      const next = new Set(prev)
      if (next.has(pickId)) next.delete(pickId)
      else next.add(pickId)
      return next
    })
  }, [])

  const handleProposeTrade = useCallback(async () => {
    if (!userTeamId || !selectedOpponent || myGives.size === 0 || theirGives.size === 0) return
    setIsSubmitting(true)

    try {
      await TradeService.proposeTrade(
        leagueId,
        userTeamId,
        selectedOpponent,
        Array.from(myGives),
        Array.from(theirGives),
        userTeamId,
        league?.currentWeek || 1,
        tradeNotes || undefined
      )

      notify.success('Trade Proposed!', 'Waiting for the other team to respond.')

      // Reset form
      setMyGives(new Set())
      setTheirGives(new Set())
      setTradeNotes('')
      setSelectedOpponent('')

      // Refresh
      const [tradeData, activity] = await Promise.all([
        TradeService.getLeagueTrades(leagueId),
        TradeService.getLeagueActivity(leagueId),
      ])
      setTrades(tradeData)
      setActivityFeed(activity)
    } catch (err) {
      log.error('Failed to propose trade:', err)
      notify.error('Trade Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSubmitting(false)
    }
  }, [userTeamId, selectedOpponent, myGives, theirGives, leagueId, league?.currentWeek, tradeNotes])

  const reloadPicks = useCallback(async (teams: Team[]) => {
    if (!supabase) return
    const teamIds = teams.map(t => t.id)
    const { data: picks } = await supabase
      .from('picks')
      .select('*')
      .in('team_id', teamIds)
      .order('pick_order', { ascending: true })

    if (picks) {
      const teamNameMap = new Map(teams.map(t => [t.id, t.name]))
      setAllPicks(picks.map(p => ({
        id: p.id,
        draftId: p.draft_id,
        teamId: p.team_id,
        pokemonId: p.pokemon_id,
        pokemonName: p.pokemon_name,
        cost: p.cost,
        pickOrder: p.pick_order,
        round: p.round,
        createdAt: p.created_at,
        teamName: teamNameMap.get(p.team_id),
      })))
    }
  }, [])

  const refreshAll = useCallback(async () => {
    const [tradeData, activity] = await Promise.all([
      TradeService.getLeagueTrades(leagueId),
      TradeService.getLeagueActivity(leagueId),
    ])
    setTrades(tradeData)
    setActivityFeed(activity)
  }, [leagueId])

  const handleRespondToTrade = useCallback(async (tradeId: string, accepted: boolean) => {
    try {
      await TradeService.respondToTrade(tradeId, accepted, settings.requireCommissionerApproval)
      notify.success(accepted ? 'Trade Accepted!' : 'Trade Rejected')
      if (accepted && league) await reloadPicks(league.teams)
      await refreshAll()
    } catch (err) {
      log.error('Failed to respond to trade:', err)
      notify.error('Error', err instanceof Error ? err.message : 'Unknown error')
    }
  }, [league, settings.requireCommissionerApproval, reloadPicks, refreshAll])

  const handleCancelTrade = useCallback(async (tradeId: string) => {
    try {
      await TradeService.cancelTrade(tradeId)
      notify.success('Trade Cancelled')
      await refreshAll()
    } catch (err) {
      log.error('Failed to cancel trade:', err)
      notify.error('Error', err instanceof Error ? err.message : 'Unknown error')
    }
  }, [refreshAll])

  const handleCommissionerApprove = useCallback(async (tradeId: string, approved: boolean) => {
    if (!userId) return
    try {
      await TradeService.approveTrade(tradeId, userId, approved)
      notify.success(approved ? 'Trade Approved & Executed!' : 'Trade Vetoed')
      if (approved && league) await reloadPicks(league.teams)
      await refreshAll()
    } catch (err) {
      log.error('Failed to approve trade:', err)
      notify.error('Error', err instanceof Error ? err.message : 'Unknown error')
    }
  }, [userId, league, reloadPicks, refreshAll])

  // Counter-offer handlers
  const handleStartCounter = useCallback((trade: TradeWithDetails) => {
    setCounteringTradeId(trade.id)
    // Pre-populate: the counter goes from current user to the original proposer
    setCounterMyGives(new Set())
    setCounterTheirGives(new Set())
    setCounterNotes('')
  }, [])

  const handleSubmitCounter = useCallback(async () => {
    if (!counteringTradeId || !userTeamId || counterMyGives.size === 0 || counterTheirGives.size === 0) return
    setIsSubmitting(true)

    try {
      const originalTrade = trades.find(t => t.id === counteringTradeId)
      if (!originalTrade) throw new Error('Original trade not found')

      // Counter goes from me (team_a) to them (team_b = original proposer)
      await TradeService.counterTrade(
        counteringTradeId,
        userTeamId,
        originalTrade.team_a_id, // send back to the original proposer
        Array.from(counterMyGives),
        Array.from(counterTheirGives),
        userTeamId,
        league?.currentWeek || 1,
        counterNotes || undefined
      )

      notify.success('Counter-Offer Sent!', 'The other team will review your counter.')
      setCounteringTradeId(null)
      setCounterMyGives(new Set())
      setCounterTheirGives(new Set())
      setCounterNotes('')
      await refreshAll()
    } catch (err) {
      log.error('Failed to counter trade:', err)
      notify.error('Counter Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSubmitting(false)
    }
  }, [counteringTradeId, userTeamId, counterMyGives, counterTheirGives, trades, league?.currentWeek, counterNotes, refreshAll])

  // Hijack handlers
  const handleStartHijack = useCallback((trade: TradeWithDetails) => {
    setHijackingTradeId(trade.id)
    // The hijacker targets one of the teams in the original trade
    // Default to team_b (the one receiving the offer) — hijacker offers them a better deal
    setHijackTargetTeamId(trade.team_b_id)
    setHijackMyGives(new Set())
    setHijackTheirGives(new Set())
    setHijackNotes('')
  }, [])

  const handleSubmitHijack = useCallback(async () => {
    if (!hijackingTradeId || !userTeamId || !hijackTargetTeamId || hijackMyGives.size === 0 || hijackTheirGives.size === 0) return
    setIsSubmitting(true)

    try {
      await TradeService.hijackTrade(
        hijackingTradeId,
        userTeamId,
        Array.from(hijackMyGives),
        Array.from(hijackTheirGives),
        hijackTargetTeamId,
        userTeamId,
        league?.currentWeek || 1,
        hijackNotes || undefined
      )

      notify.success('Competing Offer Sent!', 'Your trade offer is now on the table.')
      setHijackingTradeId(null)
      setHijackMyGives(new Set())
      setHijackTheirGives(new Set())
      setHijackNotes('')
      await refreshAll()
    } catch (err) {
      log.error('Failed to hijack trade:', err)
      notify.error('Hijack Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSubmitting(false)
    }
  }, [hijackingTradeId, userTeamId, hijackTargetTeamId, hijackMyGives, hijackTheirGives, league?.currentWeek, hijackNotes, refreshAll])

  // Helper to resolve pick IDs to pokemon names
  const getPickName = useCallback((pickId: string) => {
    const pick = allPicks.find(p => p.id === pickId)
    return pick?.pokemonName || 'Unknown'
  }, [allPicks])

  const getPickPokemonId = useCallback((pickId: string) => {
    const pick = allPicks.find(p => p.id === pickId)
    return pick?.pokemonId || ''
  }, [allPicks])

  if (isLoading) return <LoadingScreen title="Loading Trade Center..." description="Fetching trade data." />
  if (!league) return null

  const pendingCount = pendingIncoming.length + pendingOutgoing.length + (isCommissioner ? pendingCommissioner.length : 0)

  // Get picks for counter-offer
  const counterTrade = counteringTradeId ? trades.find(t => t.id === counteringTradeId) : null
  const counterOpponentId = counterTrade?.team_a_id
  const counterOpponentPicks = counterOpponentId ? (picksByTeam.get(counterOpponentId) || []) : []

  // Get picks for hijack
  const hijackTargetPicks = hijackTargetTeamId ? (picksByTeam.get(hijackTargetTeamId) || []) : []

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => router.push(`/league/${leagueId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Trade Center</h1>
            <p className="text-sm text-muted-foreground">
              {league.name}
              {!tradeEligibility.allowed && tradeEligibility.reason && (
                <span className="text-destructive"> ({tradeEligibility.reason})</span>
              )}
              {tradeDeadlineDisplay && tradeEligibility.allowed && (
                <span className="text-muted-foreground"> &middot; {tradeDeadlineDisplay}</span>
              )}
            </p>
          </div>
        </div>

        <Tabs defaultValue="activity" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="activity" className="flex-1">
              <Activity className="h-4 w-4 mr-1" />
              Activity
            </TabsTrigger>
            {canPropose && (
              <TabsTrigger value="propose" className="flex-1">
                <Send className="h-4 w-4 mr-1" />
                Propose
              </TabsTrigger>
            )}
            <TabsTrigger value="pending" className="flex-1 relative">
              <Inbox className="h-4 w-4 mr-1" />
              Pending
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] text-[10px] px-1">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              <History className="h-4 w-4 mr-1" />
              History
            </TabsTrigger>
          </TabsList>

          {/* ============ ACTIVITY TAB (visible to all) ============ */}
          <TabsContent value="activity" className="space-y-4">
            {activityFeed.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No activity yet. Trades and free agent claims will appear here.
              </div>
            ) : (
              <div className="space-y-1">
                {activityFeed.map(item => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    teamColorMap={teamColorMap}
                  />
                ))}
              </div>
            )}

            {/* Open trades visible to all */}
            {allPendingTrades.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Open Trades</h3>
                <div className="space-y-3">
                  {allPendingTrades.map(trade => (
                    <TradeCard
                      key={trade.id}
                      trade={trade}
                      getPickName={getPickName}
                      getPickPokemonId={getPickPokemonId}
                      teamColorMap={teamColorMap}
                      actions={
                        hijackableTrades.some(h => h.id === trade.id) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStartHijack(trade)}
                            className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                          >
                            <Swords className="h-4 w-4 mr-1" />
                            Compete
                          </Button>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ============ PROPOSE TRADE TAB ============ */}
          {canPropose && (
            <TabsContent value="propose" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Propose a Trade</CardTitle>
                  <CardDescription>Select a team and pick the Pokemon to exchange</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Trade with:</label>
                    <select
                      value={selectedOpponent}
                      onChange={e => {
                        setSelectedOpponent(e.target.value)
                        setTheirGives(new Set())
                      }}
                      className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                    >
                      <option value="">Select a team...</option>
                      {league.teams
                        .filter(t => t.id !== userTeamId)
                        .map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))
                      }
                    </select>
                  </div>

                  {selectedOpponent && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium mb-2 text-red-600 dark:text-red-400">
                          You Give ({myGives.size} selected)
                        </h3>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {myPicks.map(pick => (
                            <PokemonPickRow
                              key={pick.id}
                              pick={pick}
                              selected={myGives.has(pick.id)}
                              onToggle={() => toggleMyGive(pick.id)}
                            />
                          ))}
                          {myPicks.length === 0 && (
                            <p className="text-xs text-muted-foreground py-4 text-center">No Pokemon on your team</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium mb-2 text-green-600 dark:text-green-400">
                          You Receive ({theirGives.size} selected)
                        </h3>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {opponentPicks.map(pick => (
                            <PokemonPickRow
                              key={pick.id}
                              pick={pick}
                              selected={theirGives.has(pick.id)}
                              onToggle={() => toggleTheirGive(pick.id)}
                            />
                          ))}
                          {opponentPicks.length === 0 && (
                            <p className="text-xs text-muted-foreground py-4 text-center">No Pokemon on their team</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedOpponent && (myGives.size > 0 || theirGives.size > 0) && (
                    <>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
                        <input
                          type="text"
                          value={tradeNotes}
                          onChange={e => setTradeNotes(e.target.value)}
                          placeholder="Add a message..."
                          className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                        />
                      </div>

                      <Button
                        onClick={handleProposeTrade}
                        disabled={isSubmitting || myGives.size === 0 || theirGives.size === 0}
                        className="w-full"
                      >
                        {isSubmitting ? 'Sending...' : `Propose Trade (${myGives.size} for ${theirGives.size})`}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ============ PENDING TAB ============ */}
          <TabsContent value="pending" className="space-y-4">
            {/* Incoming trades */}
            {pendingIncoming.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Inbox className="h-4 w-4" />
                  Incoming Trades
                </h3>
                {pendingIncoming.map(trade => (
                  <TradeCard
                    key={trade.id}
                    trade={trade}
                    getPickName={getPickName}
                    getPickPokemonId={getPickPokemonId}
                    teamColorMap={teamColorMap}
                    actions={
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          onClick={() => handleRespondToTrade(trade.id, true)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStartCounter(trade)}
                          className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                        >
                          <Repeat className="h-4 w-4 mr-1" />
                          Counter
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRespondToTrade(trade.id, false)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    }
                  />
                ))}
              </div>
            )}

            {/* Counter-offer form */}
            {counteringTradeId && counterTrade && (
              <Card className="border-blue-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-blue-600" />
                    Counter-Offer to {counterTrade.teamAName}
                  </CardTitle>
                  <CardDescription>Propose different terms for this trade</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium mb-2 text-red-600 dark:text-red-400">
                        You Give ({counterMyGives.size} selected)
                      </h3>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {myPicks.map(pick => (
                          <PokemonPickRow
                            key={pick.id}
                            pick={pick}
                            selected={counterMyGives.has(pick.id)}
                            onToggle={() => {
                              setCounterMyGives(prev => {
                                const next = new Set(prev)
                                if (next.has(pick.id)) next.delete(pick.id)
                                else next.add(pick.id)
                                return next
                              })
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium mb-2 text-green-600 dark:text-green-400">
                        You Want ({counterTheirGives.size} selected)
                      </h3>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {counterOpponentPicks.map(pick => (
                          <PokemonPickRow
                            key={pick.id}
                            pick={pick}
                            selected={counterTheirGives.has(pick.id)}
                            onToggle={() => {
                              setCounterTheirGives(prev => {
                                const next = new Set(prev)
                                if (next.has(pick.id)) next.delete(pick.id)
                                else next.add(pick.id)
                                return next
                              })
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={counterNotes}
                    onChange={e => setCounterNotes(e.target.value)}
                    placeholder="Counter-offer message..."
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSubmitCounter}
                      disabled={isSubmitting || counterMyGives.size === 0 || counterTheirGives.size === 0}
                    >
                      {isSubmitting ? 'Sending...' : 'Send Counter-Offer'}
                    </Button>
                    <Button variant="outline" onClick={() => setCounteringTradeId(null)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Hijack form */}
            {hijackingTradeId && (
              <Card className="border-amber-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Swords className="h-4 w-4 text-amber-600" />
                    Competing Offer
                  </CardTitle>
                  <CardDescription>Propose a better deal to one of the teams</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Target team selector */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Make offer to:</label>
                    <select
                      value={hijackTargetTeamId || ''}
                      onChange={e => {
                        setHijackTargetTeamId(e.target.value)
                        setHijackTheirGives(new Set())
                      }}
                      className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                    >
                      {(() => {
                        const origTrade = trades.find(t => t.id === hijackingTradeId)
                        if (!origTrade) return null
                        return [
                          <option key={origTrade.team_a_id} value={origTrade.team_a_id}>
                            {origTrade.teamAName}
                          </option>,
                          <option key={origTrade.team_b_id} value={origTrade.team_b_id}>
                            {origTrade.teamBName}
                          </option>,
                        ]
                      })()}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium mb-2 text-red-600 dark:text-red-400">
                        You Give ({hijackMyGives.size} selected)
                      </h3>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {myPicks.map(pick => (
                          <PokemonPickRow
                            key={pick.id}
                            pick={pick}
                            selected={hijackMyGives.has(pick.id)}
                            onToggle={() => {
                              setHijackMyGives(prev => {
                                const next = new Set(prev)
                                if (next.has(pick.id)) next.delete(pick.id)
                                else next.add(pick.id)
                                return next
                              })
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium mb-2 text-green-600 dark:text-green-400">
                        You Want ({hijackTheirGives.size} selected)
                      </h3>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {hijackTargetPicks.map(pick => (
                          <PokemonPickRow
                            key={pick.id}
                            pick={pick}
                            selected={hijackTheirGives.has(pick.id)}
                            onToggle={() => {
                              setHijackTheirGives(prev => {
                                const next = new Set(prev)
                                if (next.has(pick.id)) next.delete(pick.id)
                                else next.add(pick.id)
                                return next
                              })
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={hijackNotes}
                    onChange={e => setHijackNotes(e.target.value)}
                    placeholder="Why your deal is better..."
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSubmitHijack}
                      disabled={isSubmitting || hijackMyGives.size === 0 || hijackTheirGives.size === 0}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      {isSubmitting ? 'Sending...' : 'Submit Competing Offer'}
                    </Button>
                    <Button variant="outline" onClick={() => setHijackingTradeId(null)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Outgoing trades */}
            {pendingOutgoing.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Outgoing Trades
                </h3>
                {pendingOutgoing.map(trade => (
                  <TradeCard
                    key={trade.id}
                    trade={trade}
                    getPickName={getPickName}
                    getPickPokemonId={getPickPokemonId}
                    teamColorMap={teamColorMap}
                    actions={
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelTrade(trade.id)}
                      >
                        Cancel
                      </Button>
                    }
                  />
                ))}
              </div>
            )}

            {/* Commissioner approval */}
            {isCommissioner && pendingCommissioner.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Awaiting Commissioner Approval
                </h3>
                {pendingCommissioner.map(trade => (
                  <TradeCard
                    key={trade.id}
                    trade={trade}
                    getPickName={getPickName}
                    getPickPokemonId={getPickPokemonId}
                    teamColorMap={teamColorMap}
                    actions={
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleCommissionerApprove(trade.id, true)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleCommissionerApprove(trade.id, false)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Veto
                        </Button>
                      </div>
                    }
                  />
                ))}
              </div>
            )}

            {pendingCount === 0 && !counteringTradeId && !hijackingTradeId && (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No pending trades
              </div>
            )}
          </TabsContent>

          {/* ============ HISTORY TAB ============ */}
          <TabsContent value="history" className="space-y-3">
            {completedTrades.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No trade history yet
              </div>
            ) : (
              completedTrades.map(trade => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  getPickName={getPickName}
                  getPickPokemonId={getPickPokemonId}
                  teamColorMap={teamColorMap}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ============================================
// Sub-components
// ============================================

function PokemonPickRow({ pick, selected, onToggle }: {
  pick: PickWithTeam
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-2 p-2 rounded-md border text-left transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
          : 'border-transparent hover:bg-muted/50'
      }`}
    >
      <PokemonSprite
        pokemonId={pick.pokemonId}
        pokemonName={pick.pokemonName}
        className="w-8 h-8 object-contain"
      />
      <span className="text-sm capitalize flex-1">{pick.pokemonName}</span>
      <span className="text-xs text-muted-foreground">{pick.cost} pts</span>
      {selected && <CheckCircle className="h-4 w-4 text-blue-500" />}
    </button>
  )
}

function TradeCard({ trade, getPickName, getPickPokemonId, teamColorMap, actions }: {
  trade: TradeWithDetails
  getPickName: (id: string) => string
  getPickPokemonId: (id: string) => string
  teamColorMap: Map<string, { bg: string; border: string; badge: string }>
  actions?: React.ReactNode
}) {
  const statusColor = {
    proposed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    accepted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300',
    countered: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  }[trade.status] || ''

  const colorsA = teamColorMap.get(trade.team_a_id)
  const colorsB = teamColorMap.get(trade.team_b_id)

  const isCounter = trade.notes?.startsWith('[Counter')
  const isHijack = trade.notes?.startsWith('[Hijack]') || trade.notes?.startsWith('[Competing')

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {isHijack ? (
              <Swords className="h-4 w-4 text-amber-500" />
            ) : isCounter ? (
              <Repeat className="h-4 w-4 text-blue-500" />
            ) : (
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={`text-sm font-medium px-1.5 rounded ${colorsA?.badge || ''}`}>
              {trade.teamAName || 'Team A'}
            </span>
            <span className="text-xs text-muted-foreground">with</span>
            <span className={`text-sm font-medium px-1.5 rounded ${colorsB?.badge || ''}`}>
              {trade.teamBName || 'Team B'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isCounter && (
              <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">Counter</Badge>
            )}
            {isHijack && (
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Competing</Badge>
            )}
            <span className="text-xs text-muted-foreground">Wk {trade.week_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
              {trade.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {trade.teamAName} sends
            </p>
            <div className="space-y-1">
              {(trade.team_a_gives || []).map(pickId => (
                <PokemonMiniRow
                  key={pickId}
                  pokemonId={getPickPokemonId(pickId)}
                  pokemonName={getPickName(pickId)}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {trade.teamBName} sends
            </p>
            <div className="space-y-1">
              {(trade.team_b_gives || []).map(pickId => (
                <PokemonMiniRow
                  key={pickId}
                  pokemonId={getPickPokemonId(pickId)}
                  pokemonName={getPickName(pickId)}
                />
              ))}
            </div>
          </div>
        </div>

        {trade.notes && (
          <p className="text-xs text-muted-foreground italic mb-2">
            &ldquo;{trade.notes.replace(/^\[(Counter|Hijack|Competing offer)\]\s?/, '')}&rdquo;
          </p>
        )}

        {trade.proposed_at && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(trade.proposed_at).toLocaleDateString()} {new Date(trade.proposed_at).toLocaleTimeString()}
          </p>
        )}

        {actions && <div className="mt-3 pt-3 border-t">{actions}</div>}
      </CardContent>
    </Card>
  )
}

function PokemonMiniRow({ pokemonId, pokemonName }: { pokemonId: string; pokemonName: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <PokemonSprite
        pokemonId={pokemonId}
        pokemonName={pokemonName}
        className="w-6 h-6 object-contain"
      />
      <span className="text-xs capitalize">{pokemonName}</span>
    </div>
  )
}

function ActivityRow({ item, teamColorMap }: {
  item: LeagueActivityItem
  teamColorMap: Map<string, { bg: string; border: string; badge: string }>
}) {
  const colorsA = item.teamAId ? teamColorMap.get(item.teamAId) : undefined
  const colorsB = item.teamBId ? teamColorMap.get(item.teamBId) : undefined

  const iconMap: Record<string, { icon: React.ReactNode; color: string }> = {
    trade_proposed: { icon: <Send className="h-3.5 w-3.5" />, color: 'text-yellow-600' },
    trade_accepted: { icon: <CheckCircle className="h-3.5 w-3.5" />, color: 'text-blue-600' },
    trade_rejected: { icon: <XCircle className="h-3.5 w-3.5" />, color: 'text-red-600' },
    trade_completed: { icon: <ArrowLeftRight className="h-3.5 w-3.5" />, color: 'text-green-600' },
    trade_cancelled: { icon: <XCircle className="h-3.5 w-3.5" />, color: 'text-gray-500' },
    trade_countered: { icon: <Repeat className="h-3.5 w-3.5" />, color: 'text-blue-500' },
    trade_hijacked: { icon: <Swords className="h-3.5 w-3.5" />, color: 'text-amber-500' },
    waiver_claim: { icon: <UserPlus className="h-3.5 w-3.5" />, color: 'text-purple-600' },
  }

  const { icon, color } = iconMap[item.type] || { icon: <Activity className="h-3.5 w-3.5" />, color: 'text-muted-foreground' }

  const labelMap: Record<string, string> = {
    trade_proposed: 'proposed a trade with',
    trade_accepted: 'accepted trade with',
    trade_rejected: 'rejected trade from',
    trade_completed: 'completed trade with',
    trade_cancelled: 'cancelled trade with',
    trade_countered: 'countered trade from',
    trade_hijacked: 'made competing offer to',
    waiver_claim: 'claimed free agent',
  }

  const timeAgo = getTimeAgo(item.timestamp)

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-muted/30 transition-colors">
      <div className={`mt-0.5 ${color}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className={`font-medium px-1 rounded ${colorsA?.badge || ''}`}>
            {item.teamAName}
          </span>
          {' '}
          <span className="text-muted-foreground">{labelMap[item.type] || item.type}</span>
          {' '}
          {item.type === 'waiver_claim' ? (
            <span className="font-medium capitalize">{item.pokemonNames?.[0]}</span>
          ) : (
            <span className={`font-medium px-1 rounded ${colorsB?.badge || ''}`}>
              {item.teamBName}
            </span>
          )}
        </p>
        {item.notes && !item.notes.startsWith('[') && (
          <p className="text-xs text-muted-foreground italic truncate">{item.notes}</p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo}</span>
    </div>
  )
}

function getTimeAgo(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
