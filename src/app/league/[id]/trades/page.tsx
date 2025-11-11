'use client'

/**
 * League Trades Page
 *
 * View and manage Pokemon trades:
 * - Pending trade proposals
 * - Accept/reject incoming trades
 * - Trade history
 * - Propose new trades
 */

import { useState, useEffect, useCallback } from 'react'
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
import { ArrowLeft, Repeat, Check, X, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import type { TradeWithDetails, League, Team, Pick } from '@/types'

export default function LeagueTradesPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [pendingTrades, setPendingTrades] = useState<TradeWithDetails[]>([])
  const [tradeHistory, setTradeHistory] = useState<TradeWithDetails[]>([])
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false)
  const [selectedTeams, setSelectedTeams] = useState<{ from: Team; to: Team } | null>(null)
  const [teamPicks, setTeamPicks] = useState<{ [teamId: string]: Pick[] }>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTradesData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [leagueData, pending, history] = await Promise.all([
        LeagueService.getLeague(leagueId),
        TradeService.getTradeHistory(leagueId, false).then(trades =>
          trades.filter(t => t.status === 'proposed')
        ),
        TradeService.getTradeHistory(leagueId, true).then(trades =>
          trades.filter(t => t.status !== 'proposed')
        ),
      ])

      if (!leagueData) {
        setError('League not found')
        return
      }

      setLeague(leagueData)
      setPendingTrades(pending)
      setTradeHistory(history)

      // Load picks for all teams
      const { supabase } = await import('@/lib/supabase')
      if (supabase) {
        const picks: { [teamId: string]: Pick[] } = {}
        for (const team of leagueData.teams) {
          const picksResponse = await supabase
            .from('picks')
            .select('*')
            .eq('team_id', team.id)

          if (picksResponse.data) {
            picks[team.id] = (picksResponse.data as any[]).map((p: any) => ({
              id: p.id,
              draftId: p.draft_id,
              teamId: p.team_id,
              pokemonId: p.pokemon_id,
              pokemonName: p.pokemon_name,
              cost: p.cost,
              pickOrder: p.pick_order,
              round: p.round,
              createdAt: p.created_at,
            }))
          }
        }
        setTeamPicks(picks)
      }
    } catch (err) {
      console.error('Error loading trades:', err)
      setError(err instanceof Error ? err.message : 'Failed to load trades')
    } finally {
      setIsLoading(false)
    }
  }, [leagueId])

  useEffect(() => {
    loadTradesData()
  }, [loadTradesData])

  const handleAcceptTrade = async (tradeId: string, teamId: string) => {
    try {
      await TradeService.acceptTrade(tradeId, teamId)
      await TradeService.executeTrade(tradeId)
      await loadTradesData()
    } catch (err) {
      console.error('Failed to accept trade:', err)
      alert(err instanceof Error ? err.message : 'Failed to accept trade')
    }
  }

  const handleRejectTrade = async (tradeId: string, teamId: string) => {
    try {
      await TradeService.rejectTrade(tradeId, teamId)
      await loadTradesData()
    } catch (err) {
      console.error('Failed to reject trade:', err)
      alert(err instanceof Error ? err.message : 'Failed to reject trade')
    }
  }

  const handleProposeTrade = (fromTeam: Team, toTeam: Team) => {
    setSelectedTeams({ from: fromTeam, to: toTeam })
    setIsTradeModalOpen(true)
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
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent">
                Trade Center
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{league.name}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">
              Pending Trades ({pendingTrades.length})
            </TabsTrigger>
            <TabsTrigger value="history">Trade History</TabsTrigger>
            <TabsTrigger value="propose">Propose New Trade</TabsTrigger>
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
              pendingTrades.map(trade => (
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
                    <div className="grid grid-cols-3 gap-4 items-center">
                      {/* Team A */}
                      <div className="text-center">
                        <div className="font-semibold mb-2">{trade.teamAName}</div>
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

                      {/* Arrow */}
                      <div className="text-center">
                        <Repeat className="h-8 w-8 mx-auto text-blue-500" />
                      </div>

                      {/* Team B */}
                      <div className="text-center">
                        <div className="font-semibold mb-2">{trade.teamBName}</div>
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

                    {/* Actions (only show if user is the receiving team) */}
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="default"
                        onClick={() => handleAcceptTrade(trade.id, trade.teamBId)}
                        className="flex-1"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Accept Trade
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleRejectTrade(trade.id, trade.teamBId)}
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
