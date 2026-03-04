'use client'

/**
 * League Trades Page
 *
 * View and manage Pokemon trades:
 * - Pending trade proposals
 * - Accept/reject incoming trades
 * - Commissioner approval section (when required)
 * - Trade history
 * - Propose new trades
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { TradeService } from '@/lib/trade-service'
import { LeagueService } from '@/lib/league-service'
import { TradeProposalModal } from '@/components/league/TradeProposalModal'
import { LoadingScreen } from '@/components/ui/loading-states'
import { ArrowLeft, Repeat, Check, X, Clock, CheckCircle, ShieldCheck, AlertCircle } from 'lucide-react'
import { PokemonStatusBadge } from '@/components/league/PokemonStatusBadge'
import type { TradeWithDetails, League, Team, Pick, ExtendedLeagueSettings } from '@/types'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notifications'
import { UserSessionService } from '@/lib/user-session'
import { createLogger } from '@/lib/logger'

const log = createLogger('LeagueTradesPage')

export default function LeagueTradesPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [pendingTrades, setPendingTrades] = useState<TradeWithDetails[]>([])
  const [tradesAwaitingApproval, setTradesAwaitingApproval] = useState<TradeWithDetails[]>([])
  const [tradeHistory, setTradeHistory] = useState<TradeWithDetails[]>([])
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false)
  const [selectedTeams, setSelectedTeams] = useState<{ from: Team; to: Team } | null>(null)
  const [teamPicks, setTeamPicks] = useState<{ [teamId: string]: Pick[] }>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [leagueSettings, setLeagueSettings] = useState<ExtendedLeagueSettings | null>(null)

  // Load current user identity
  useEffect(() => {
    UserSessionService.getOrCreateSession().then(session => {
      setCurrentUserId(session.userId)
    }).catch(() => {})
  }, [])

  const loadTradesData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [leagueData, allTrades, settings] = await Promise.all([
        LeagueService.getLeague(leagueId),
        TradeService.getTradeHistory(leagueId, true),
        LeagueService.getLeagueSettings(leagueId),
      ])

      if (!leagueData) {
        setError('League not found')
        return
      }

      setLeague(leagueData)
      setLeagueSettings(settings)

      // Split trades into categories
      const pending = allTrades.filter(t => t.status === 'proposed')
      const awaitingApproval = allTrades.filter(
        t => t.status === 'accepted' && t.commissionerApproved === null && settings.requireCommissionerApproval
      )
      const history = allTrades.filter(
        t => t.status !== 'proposed' && !(t.status === 'accepted' && t.commissionerApproved === null)
      )

      setPendingTrades(pending)
      setTradesAwaitingApproval(awaitingApproval)
      setTradeHistory(history)

      // Load picks and Pokemon status for all teams
      const { supabase } = await import('@/lib/supabase')
      if (supabase) {
        // Fetch all Pokemon statuses for this league
        const { data: statusData } = await supabase
          .from('team_pokemon_status')
          .select('*')
          .eq('league_id', leagueId)
        const statusMap = new Map(
          (statusData || []).map(s => [s.pick_id, s])
        )

        const picks: { [teamId: string]: Pick[] } = {}
        for (const team of leagueData.teams) {
          const picksResponse = await supabase
            .from('picks')
            .select('*')
            .eq('team_id', team.id)

          if (picksResponse.data) {
            picks[team.id] = picksResponse.data.map((p): Pick & { status?: { status: 'alive' | 'fainted' | 'dead' } } => {
              const pokemonStatus = statusMap.get(p.id)
              return {
                id: p.id,
                draftId: p.draft_id,
                teamId: p.team_id,
                pokemonId: p.pokemon_id,
                pokemonName: p.pokemon_name,
                cost: p.cost,
                pickOrder: p.pick_order,
                round: p.round,
                createdAt: p.created_at,
                ...(pokemonStatus ? { status: { status: pokemonStatus.status as 'alive' | 'fainted' | 'dead' } } : {}),
              }
            })
          }
        }
        setTeamPicks(picks)
      }
    } catch (err) {
      log.error('Error loading trades:', err)
      setError(err instanceof Error ? err.message : 'Failed to load trades')
    } finally {
      setIsLoading(false)
    }
  }, [leagueId])

  // Check commissioner status when userId is available
  useEffect(() => {
    if (!currentUserId || !leagueId) return
    LeagueService.isLeagueCommissioner(leagueId, currentUserId)
      .then(setIsCommissioner)
      .catch(() => setIsCommissioner(false))
  }, [currentUserId, leagueId])

  useEffect(() => {
    loadTradesData()
  }, [loadTradesData])

  // Find the current user's team in this league
  const currentUserTeamId = league?.teams.find(t => t.ownerId === currentUserId)?.id || null

  // Real-time trade event subscription
  const loadTradesRef = useRef(loadTradesData)
  loadTradesRef.current = loadTradesData
  const leagueRef = useRef(league)
  leagueRef.current = league
  const currentUserTeamIdRef = useRef(currentUserTeamId)
  currentUserTeamIdRef.current = currentUserTeamId

  useEffect(() => {
    if (!supabase) return

    const getTeamName = (teamId: string) =>
      leagueRef.current?.teams.find(t => t.id === teamId)?.name || 'A team'

    const channel = supabase
      .channel(`league-trades:${leagueId}`)
      .on('broadcast', { event: 'trade_proposed' }, ({ payload }) => {
        const isReceiver = payload.toTeamId === currentUserTeamIdRef.current
        if (isReceiver) {
          notify.tradeReceived(getTeamName(payload.fromTeamId), {
            action: {
              label: 'View',
              onClick: () => {
                const pendingTab = document.querySelector('[data-value="pending"]') as HTMLButtonElement
                pendingTab?.click()
              }
            }
          })
        } else {
          notify.tradeProposed(
            getTeamName(payload.fromTeamId),
            getTeamName(payload.toTeamId)
          )
        }
        void loadTradesRef.current()
      })
      .on('broadcast', { event: 'trade_accepted' }, ({ payload }) => {
        notify.tradeAccepted(getTeamName(payload.acceptedByTeamId))
        void loadTradesRef.current()
      })
      .on('broadcast', { event: 'trade_rejected' }, ({ payload }) => {
        notify.tradeRejected(
          getTeamName(payload.rejectedByTeamId),
          payload.reason
        )
        void loadTradesRef.current()
      })
      .on('broadcast', { event: 'trade_executed' }, ({ payload }) => {
        notify.tradeExecuted(
          payload.teamAName || getTeamName(payload.teamAId),
          payload.teamBName || getTeamName(payload.teamBId)
        )
        void loadTradesRef.current()
      })
      .on('broadcast', { event: 'trade_pending_approval' }, () => {
        notify.tradePendingApproval()
        void loadTradesRef.current()
      })
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  }, [leagueId])

  const handleAcceptTrade = async (tradeId: string, teamId: string) => {
    try {
      // acceptTrade in trade-service handles commissioner approval logic:
      // - If requireCommissionerApproval is ON, it sets status to 'accepted' but does NOT execute
      // - If OFF, it auto-executes the trade
      await TradeService.acceptTrade(tradeId, teamId)
      await loadTradesData()
    } catch (err) {
      log.error('Failed to accept trade:', err)
      alert(err instanceof Error ? err.message : 'Failed to accept trade')
    }
  }

  const handleRejectTrade = async (tradeId: string, teamId: string) => {
    try {
      await TradeService.rejectTrade(tradeId, teamId)
      await loadTradesData()
    } catch (err) {
      log.error('Failed to reject trade:', err)
      alert(err instanceof Error ? err.message : 'Failed to reject trade')
    }
  }

  const handleCommissionerApprove = async (tradeId: string) => {
    if (!currentUserId) return
    try {
      await TradeService.approveTrade(tradeId, currentUserId, true)
      await TradeService.executeTrade(tradeId)
      await loadTradesData()
    } catch (err) {
      log.error('Failed to approve trade:', err)
      alert(err instanceof Error ? err.message : 'Failed to approve trade')
    }
  }

  const handleCommissionerReject = async (tradeId: string) => {
    if (!currentUserId) return
    try {
      await TradeService.approveTrade(tradeId, currentUserId, false, 'Rejected by commissioner')
      await loadTradesData()
    } catch (err) {
      log.error('Failed to reject trade:', err)
      alert(err instanceof Error ? err.message : 'Failed to reject trade')
    }
  }

  const handleProposeTrade = (fromTeam: Team, toTeam: Team) => {
    setSelectedTeams({ from: fromTeam, to: toTeam })
    setIsTradeModalOpen(true)
  }

  /** Check if the current user can act on a pending trade (is the receiving team) */
  const canRespondToTrade = (trade: TradeWithDetails) => {
    if (!currentUserTeamId) return false
    // The receiving team (not the proposer) can accept/reject
    const isTeamA = trade.teamAId === currentUserTeamId
    const isTeamB = trade.teamBId === currentUserTeamId
    if (!isTeamA && !isTeamB) return false
    // The proposer cannot accept their own trade
    return trade.proposedBy !== currentUserTeamId
  }

  const requiresApproval = leagueSettings?.requireCommissionerApproval || false

  // Count for tabs: pending proposals + trades awaiting commissioner approval
  const _tabCount = pendingTrades.length + (isCommissioner ? tradesAwaitingApproval.length : 0)

  /** Look up a Pokemon's KO/faint status from teamPicks data */
  const getPickStatus = (pickId: string): 'alive' | 'fainted' | 'dead' | null => {
    for (const picks of Object.values(teamPicks)) {
      const pick = picks.find(p => p.id === pickId) as (Pick & { status?: { status: 'alive' | 'fainted' | 'dead' } }) | undefined
      if (pick?.status) return pick.status.status
    }
    return null
  }

  if (isLoading) {
    return (
      <LoadingScreen
        title="Loading Trades..."
        description="Fetching trade proposals and history."
      />
    )
  }

  if (error || !league) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error || 'League not found'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push(`/league/${leagueId}`)} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to League
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push(`/league/${leagueId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to League
            </Button>
            <div>
              <h1 className="text-3xl font-bold brand-gradient-text">
                Trade Center
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-muted-foreground">{league.name}</p>
                {isCommissioner && (
                  <Badge variant="default" className="text-xs flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Commissioner
                  </Badge>
                )}
                {requiresApproval && (
                  <Badge variant="outline" className="text-xs">Approval Required</Badge>
                )}
              </div>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList className={`grid w-full ${isCommissioner && requiresApproval ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="pending" className="text-xs sm:text-sm">
              Pending ({pendingTrades.length})
            </TabsTrigger>
            {isCommissioner && requiresApproval && (
              <TabsTrigger value="approval" className="text-xs sm:text-sm">
                Approval ({tradesAwaitingApproval.length})
              </TabsTrigger>
            )}
            <TabsTrigger value="history" className="text-xs sm:text-sm">History</TabsTrigger>
            <TabsTrigger value="propose" className="text-xs sm:text-sm">Propose</TabsTrigger>
          </TabsList>

          {/* Pending Trades */}
          <TabsContent value="pending" className="space-y-4">
            {pendingTrades.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Repeat className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Pending Trades</h3>
                  <p className="text-sm text-muted-foreground">
                    No trade proposals awaiting response
                  </p>
                </CardContent>
              </Card>
            ) : (
              pendingTrades.map(trade => {
                const canRespond = canRespondToTrade(trade)
                return (
                  <Card key={trade.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Trade Proposal</CardTitle>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(trade.proposedAt).toLocaleDateString()}
                        </Badge>
                      </div>
                      <CardDescription>
                        Proposed by {trade.proposedByName} • Week {trade.weekNumber}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2 sm:gap-4 items-center">
                        {/* Team A */}
                        <div className="text-center min-w-0">
                          <div className="font-semibold mb-2 text-sm sm:text-base truncate">{trade.teamAName}</div>
                          <div className="space-y-1">
                            {trade.teamAGivesPokemon?.map(pick => {
                              const status = getPickStatus(pick.id)
                              return (
                                <div key={pick.id} className="flex items-center justify-center gap-1">
                                  <Badge variant="outline" className="text-xs">
                                    {pick.pokemonName}
                                  </Badge>
                                  {status && status !== 'alive' && (
                                    <PokemonStatusBadge status={status} size="sm" showText={false} />
                                  )}
                                </div>
                              )
                            }) || (
                              <p className="text-sm text-muted-foreground">
                                {trade.teamAGives.length} Pokemon
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Arrow */}
                        <div className="text-center">
                          <Repeat className="h-8 w-8 mx-auto text-blue-500" />
                        </div>

                        {/* Team B */}
                        <div className="text-center">
                          <div className="font-semibold mb-2">{trade.teamBName}</div>
                          <div className="space-y-1">
                            {trade.teamBGivesPokemon?.map(pick => {
                              const status = getPickStatus(pick.id)
                              return (
                                <div key={pick.id} className="flex items-center justify-center gap-1">
                                  <Badge variant="outline" className="text-xs">
                                    {pick.pokemonName}
                                  </Badge>
                                  {status && status !== 'alive' && (
                                    <PokemonStatusBadge status={status} size="sm" showText={false} />
                                  )}
                                </div>
                              )
                            }) || (
                              <p className="text-sm text-muted-foreground">
                                {trade.teamBGives.length} Pokemon
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {trade.notes && (
                        <Alert className="mt-4">
                          <AlertDescription>{trade.notes}</AlertDescription>
                        </Alert>
                      )}

                      {requiresApproval && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          This trade will require commissioner approval after acceptance
                        </p>
                      )}

                      {/* Actions: only show if user is the receiving team */}
                      {canRespond ? (
                        <div className="flex gap-2 mt-4">
                          <Button
                            variant="default"
                            onClick={() => handleAcceptTrade(trade.id, currentUserTeamId!)}
                            className="flex-1"
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Accept Trade
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleRejectTrade(trade.id, currentUserTeamId!)}
                            className="flex-1"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Reject Trade
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-4 text-center">
                          {currentUserTeamId
                            ? 'Waiting for the other team to respond'
                            : 'You are not part of this trade'}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}

            {/* Show trades awaiting commissioner approval to non-commissioners */}
            {!isCommissioner && requiresApproval && tradesAwaitingApproval.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Awaiting Commissioner Approval
                </h3>
                {tradesAwaitingApproval.map(trade => (
                  <Card key={trade.id} className="border-yellow-500/30">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {trade.teamAName} ↔ {trade.teamBName}
                        </CardTitle>
                        <Badge variant="secondary" className="flex items-center gap-1 bg-yellow-500/10 text-yellow-600">
                          <Clock className="h-3 w-3" />
                          Awaiting Approval
                        </Badge>
                      </div>
                      <CardDescription>
                        Both teams accepted • Pending commissioner sign-off
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2 sm:gap-4 items-center">
                        <div className="text-center min-w-0">
                          <div className="font-semibold mb-2 text-sm truncate">{trade.teamAName}</div>
                          <div className="space-y-1">
                            {trade.teamAGivesPokemon?.map(pick => (
                              <Badge key={pick.id} variant="outline" className="block text-xs">
                                {pick.pokemonName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-center">
                          <Repeat className="h-6 w-6 mx-auto text-muted-foreground" />
                        </div>
                        <div className="text-center min-w-0">
                          <div className="font-semibold mb-2 text-sm truncate">{trade.teamBName}</div>
                          <div className="space-y-1">
                            {trade.teamBGivesPokemon?.map(pick => (
                              <Badge key={pick.id} variant="outline" className="block text-xs">
                                {pick.pokemonName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Commissioner Approval Tab */}
          {isCommissioner && requiresApproval && (
            <TabsContent value="approval" className="space-y-4">
              {tradesAwaitingApproval.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Trades Pending Approval</h3>
                    <p className="text-sm text-muted-foreground">
                      All trades have been reviewed
                    </p>
                  </CardContent>
                </Card>
              ) : (
                tradesAwaitingApproval.map(trade => (
                  <Card key={trade.id} className="border-yellow-500/30">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {trade.teamAName} ↔ {trade.teamBName}
                        </CardTitle>
                        <Badge variant="secondary" className="flex items-center gap-1 bg-yellow-500/10 text-yellow-600">
                          <Clock className="h-3 w-3" />
                          Needs Your Approval
                        </Badge>
                      </div>
                      <CardDescription>
                        Both teams accepted • Proposed on {new Date(trade.proposedAt).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2 sm:gap-4 items-center">
                        <div className="text-center min-w-0">
                          <div className="font-semibold mb-2 text-sm truncate">{trade.teamAName} gives:</div>
                          <div className="space-y-1">
                            {trade.teamAGivesPokemon?.map(pick => (
                              <Badge key={pick.id} variant="outline" className="block">
                                {pick.pokemonName}
                              </Badge>
                            )) || (
                              <p className="text-sm text-muted-foreground">
                                {trade.teamAGives.length} Pokemon
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-center">
                          <Repeat className="h-8 w-8 mx-auto text-blue-500" />
                        </div>
                        <div className="text-center min-w-0">
                          <div className="font-semibold mb-2 text-sm truncate">{trade.teamBName} gives:</div>
                          <div className="space-y-1">
                            {trade.teamBGivesPokemon?.map(pick => (
                              <Badge key={pick.id} variant="outline" className="block">
                                {pick.pokemonName}
                              </Badge>
                            )) || (
                              <p className="text-sm text-muted-foreground">
                                {trade.teamBGives.length} Pokemon
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {trade.notes && (
                        <Alert className="mt-4">
                          <AlertDescription>{trade.notes}</AlertDescription>
                        </Alert>
                      )}

                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="default"
                          onClick={() => handleCommissionerApprove(trade.id)}
                          className="flex-1"
                        >
                          <ShieldCheck className="h-4 w-4 mr-2" />
                          Approve & Execute
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleCommissionerReject(trade.id)}
                          className="flex-1"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Reject Trade
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          )}

          {/* Trade History */}
          <TabsContent value="history" className="space-y-4">
            {tradeHistory.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Repeat className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Trade History</h3>
                  <p className="text-sm text-muted-foreground">
                    No completed or rejected trades yet
                  </p>
                </CardContent>
              </Card>
            ) : (
              tradeHistory.map(trade => (
                <Card key={trade.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {trade.teamAName} ↔ {trade.teamBName}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            trade.status === 'completed'
                              ? 'default'
                              : trade.status === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="flex items-center gap-1"
                        >
                          {trade.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                          {trade.status === 'rejected' && <X className="h-3 w-3" />}
                          {trade.status}
                        </Badge>
                        <Badge variant="outline">Week {trade.weekNumber}</Badge>
                      </div>
                    </div>
                    <CardDescription>
                      {trade.completedAt
                        ? `Completed on ${new Date(trade.completedAt).toLocaleDateString()}`
                        : `Proposed on ${new Date(trade.proposedAt).toLocaleDateString()}`}
                      {trade.commissionerNotes && ` • Commissioner: ${trade.commissionerNotes}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 items-center">
                      <div className="text-center">
                        <div className="font-medium mb-2">{trade.teamAName} gave:</div>
                        <div className="space-y-1">
                          {trade.teamAGivesPokemon?.map(pick => (
                            <Badge key={pick.id} variant="outline" className="block text-xs">
                              {pick.pokemonName}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="text-center">
                        <Repeat className="h-6 w-6 mx-auto text-muted-foreground" />
                      </div>

                      <div className="text-center">
                        <div className="font-medium mb-2">{trade.teamBName} gave:</div>
                        <div className="space-y-1">
                          {trade.teamBGivesPokemon?.map(pick => (
                            <Badge key={pick.id} variant="outline" className="block text-xs">
                              {pick.pokemonName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Propose New Trade */}
          <TabsContent value="propose" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Propose New Trade</CardTitle>
                <CardDescription>
                  Select two teams to start a trade proposal
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {league.teams.map(teamA =>
                    league.teams
                      .filter(teamB => teamB.id !== teamA.id)
                      .map(teamB => (
                        <Button
                          key={`${teamA.id}-${teamB.id}`}
                          variant="outline"
                          onClick={() => handleProposeTrade(teamA, teamB)}
                          className="h-auto py-4"
                        >
                          <div className="flex items-center gap-2 text-left">
                            <Repeat className="h-5 w-5 flex-shrink-0" />
                            <div>
                              <div className="font-semibold">{teamA.name}</div>
                              <div className="text-xs text-muted-foreground">trades with</div>
                              <div className="font-semibold">{teamB.name}</div>
                            </div>
                          </div>
                        </Button>
                      ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Trade Proposal Modal */}
        {selectedTeams && (
          <TradeProposalModal
            isOpen={isTradeModalOpen}
            onClose={() => {
              setIsTradeModalOpen(false)
              setSelectedTeams(null)
            }}
            leagueId={leagueId}
            currentWeek={league.currentWeek || 1}
            fromTeamId={selectedTeams.from.id}
            fromTeamName={selectedTeams.from.name}
            toTeamId={selectedTeams.to.id}
            toTeamName={selectedTeams.to.name}
            fromTeamPicks={teamPicks[selectedTeams.from.id] || []}
            toTeamPicks={teamPicks[selectedTeams.to.id] || []}
            onSuccess={() => {
              setIsTradeModalOpen(false)
              setSelectedTeams(null)
              loadTradesData()
            }}
          />
        )}
      </div>
    </div>
  )
}
