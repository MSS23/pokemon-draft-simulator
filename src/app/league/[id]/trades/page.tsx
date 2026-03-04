'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueService } from '@/lib/league-service'
import { TradeService } from '@/lib/trade-service'
import type { TradeWithDetails } from '@/lib/trade-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import { ArrowLeft, ArrowLeftRight, Clock, CheckCircle, XCircle, Send, Inbox, History, Shield } from 'lucide-react'
import type { League, Team, Pick, ExtendedLeagueSettings } from '@/types'
import { buildTeamColorMap } from '@/utils/team-colors'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'

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

  // Propose trade state
  const [selectedOpponent, setSelectedOpponent] = useState<string>('')
  const [myGives, setMyGives] = useState<Set<string>>(new Set())
  const [theirGives, setTheirGives] = useState<Set<string>>(new Set())
  const [tradeNotes, setTradeNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
        // Re-fetch trades on any update
        TradeService.getLeagueTrades(leagueId)
          .then(setTrades)
          .catch(() => {})
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

  const pendingCommissioner = useMemo(() =>
    trades.filter(t => t.status === 'accepted' && t.commissioner_approved === null),
    [trades]
  )

  const completedTrades = useMemo(() =>
    trades.filter(t => ['completed', 'rejected', 'cancelled'].includes(t.status)),
    [trades]
  )

  // Trade deadline check
  const isPastDeadline = useMemo(() => {
    if (!settings.tradeDeadlineWeek || !league) return false
    return league.currentWeek > settings.tradeDeadlineWeek
  }, [settings.tradeDeadlineWeek, league])

  const canPropose = userTeamId && settings.enableTrades !== false && !isPastDeadline

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
      const tradeData = await TradeService.getLeagueTrades(leagueId)
      setTrades(tradeData)
    } catch (err) {
      log.error('Failed to propose trade:', err)
      notify.error('Trade Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSubmitting(false)
    }
  }, [userTeamId, selectedOpponent, myGives, theirGives, leagueId, league?.currentWeek, tradeNotes])

  const handleRespondToTrade = useCallback(async (tradeId: string, accepted: boolean) => {
    try {
      await TradeService.respondToTrade(tradeId, accepted, settings.requireCommissionerApproval)
      notify.success(accepted ? 'Trade Accepted!' : 'Trade Rejected')
      const tradeData = await TradeService.getLeagueTrades(leagueId)
      setTrades(tradeData)
    } catch (err) {
      log.error('Failed to respond to trade:', err)
      notify.error('Error', err instanceof Error ? err.message : 'Unknown error')
    }
  }, [leagueId, settings.requireCommissionerApproval])

  const handleCancelTrade = useCallback(async (tradeId: string) => {
    try {
      await TradeService.cancelTrade(tradeId)
      notify.success('Trade Cancelled')
      const tradeData = await TradeService.getLeagueTrades(leagueId)
      setTrades(tradeData)
    } catch (err) {
      log.error('Failed to cancel trade:', err)
      notify.error('Error', err instanceof Error ? err.message : 'Unknown error')
    }
  }, [leagueId])

  const handleCommissionerApprove = useCallback(async (tradeId: string, approved: boolean) => {
    if (!userId) return
    try {
      await TradeService.approveTrade(tradeId, userId, approved)
      notify.success(approved ? 'Trade Approved & Executed!' : 'Trade Vetoed')
      const tradeData = await TradeService.getLeagueTrades(leagueId)
      setTrades(tradeData)
    } catch (err) {
      log.error('Failed to approve trade:', err)
      notify.error('Error', err instanceof Error ? err.message : 'Unknown error')
    }
  }, [leagueId, userId])

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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => router.push(`/league/${leagueId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowLeftRight className="h-6 w-6" />
              Trade Center
            </h1>
            <p className="text-sm text-muted-foreground">
              {league.name} &middot; Week {league.currentWeek}
              {isPastDeadline && ' (Trade deadline passed)'}
            </p>
          </div>
        </div>

        <Tabs defaultValue={canPropose ? 'propose' : 'pending'} className="space-y-4">
          <TabsList>
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

          {/* Propose Trade Tab */}
          {canPropose && (
            <TabsContent value="propose" className="space-y-4">
              {/* Select opponent */}
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
                      {/* My Pokemon (what I give) */}
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

                      {/* Their Pokemon (what I receive) */}
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

          {/* Pending Tab */}
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
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleRespondToTrade(trade.id, true)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Accept
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

            {pendingCount === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No pending trades
              </div>
            )}
          </TabsContent>

          {/* History Tab */}
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
      <img
        src={getPokemonAnimatedUrl(pick.pokemonId, pick.pokemonName)}
        alt={pick.pokemonName}
        className="w-8 h-8 object-contain"
        onError={e => {
          (e.target as HTMLImageElement).src = getPokemonAnimatedBackupUrl(pick.pokemonId)
        }}
        loading="lazy"
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
  }[trade.status] || ''

  const colorsA = teamColorMap.get(trade.team_a_id)
  const colorsB = teamColorMap.get(trade.team_b_id)

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            <span className={`text-sm font-medium px-1.5 rounded ${colorsA?.badge || ''}`}>
              {trade.teamAName || 'Team A'}
            </span>
            <span className="text-xs text-muted-foreground">with</span>
            <span className={`text-sm font-medium px-1.5 rounded ${colorsB?.badge || ''}`}>
              {trade.teamBName || 'Team B'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Wk {trade.week_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
              {trade.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Team A gives */}
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

          {/* Team B gives */}
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
          <p className="text-xs text-muted-foreground italic mb-2">&ldquo;{trade.notes}&rdquo;</p>
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
      <img
        src={getPokemonAnimatedUrl(pokemonId, pokemonName)}
        alt={pokemonName}
        className="w-6 h-6 object-contain"
        onError={e => {
          (e.target as HTMLImageElement).src = getPokemonAnimatedBackupUrl(pokemonId)
        }}
        loading="lazy"
      />
      <span className="text-xs capitalize">{pokemonName}</span>
    </div>
  )
}
