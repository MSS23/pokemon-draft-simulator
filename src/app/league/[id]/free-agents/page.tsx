'use client'

import { useState, useEffect, useMemo, useDeferredValue, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeagueService } from '@/lib/league-service'
import { WaiverService } from '@/lib/waiver-service'
import { usePokemonListByFormat } from '@/hooks/usePokemon'
import { LoadingScreen } from '@/components/ui/loading-states'
import { ArrowLeft, Search, UserPlus, History, Coins, Lock } from 'lucide-react'
import type { League, Team, Pick, WaiverClaim } from '@/types'
import type { Pokemon } from '@/types'
import { buildTeamColorMap } from '@/utils/team-colors'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, TYPE_COLORS } from '@/utils/pokemon'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'

const log = createLogger('FreeAgentsPage')

export default function FreeAgentsPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string
  const { user } = useAuth()

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [formatId, setFormatId] = useState<string | undefined>(undefined)
  const [customFormatId, setCustomFormatId] = useState<string | undefined>(undefined)
  const [draftedIds, setDraftedIds] = useState<Set<string>>(new Set())
  const [userTeamId, setUserTeamId] = useState<string | null>(null)
  const [userTeamPicks, setUserTeamPicks] = useState<Pick[]>([])
  const [userBudget, setUserBudget] = useState(0)
  const [claimsUsed, setClaimsUsed] = useState(0)
  const [maxClaims, setMaxClaims] = useState(3)
  const [waiverHistory, setWaiverHistory] = useState<WaiverClaim[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPokemon, setSelectedPokemon] = useState<Pokemon | null>(null)
  const [dropPickId, setDropPickId] = useState<string | null>(null)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const deferredSearch = useDeferredValue(searchQuery)

  // Fetch pokemon list based on format
  const { data: allPokemon, isLoading: pokemonLoading } = usePokemonListByFormat(
    formatId,
    customFormatId,
    !!formatId || !!customFormatId
  )

  useEffect(() => {
    const load = async () => {
      try {
        let userId = user?.id
        if (!userId) {
          try {
            const session = await UserSessionService.getOrCreateSession()
            userId = session.userId
          } catch { /* guest */ }
        }

        const leagueData = await LeagueService.getLeague(leagueId)
        if (!leagueData) { router.push('/dashboard'); return }
        setLeague(leagueData)
        setDraftId(leagueData.draftId)

        // Get draft settings for format
        if (supabase) {
          const { data: draft } = await supabase
            .from('drafts')
            .select('settings, custom_format_id, ruleset')
            .eq('id', leagueData.draftId)
            .single()

          if (draft) {
            const settings = draft.settings as Record<string, unknown>
            setFormatId((settings.formatId as string) || draft.ruleset || undefined)
            setCustomFormatId(draft.custom_format_id || undefined)
          }
        }

        // Get drafted Pokemon IDs
        const drafted = await WaiverService.getDraftedPokemonIds(leagueData.draftId)
        setDraftedIds(drafted)

        // Find user's team
        if (userId) {
          const userTeam = leagueData.teams.find(t => t.ownerId === userId)
          if (userTeam) {
            setUserTeamId(userTeam.id)
            setUserBudget(userTeam.budgetRemaining)

            // Load team picks for drop selection
            const picks = await WaiverService.getTeamPicks(userTeam.id)
            setUserTeamPicks(picks)

            // Load claims count
            const claims = await WaiverService.getTeamClaimsThisSeason(userTeam.id, leagueId)
            setClaimsUsed(claims)
          }
        }

        // Check if free agent claims are locked (first game played)
        const locked = await WaiverService.hasFirstGameBeenPlayed(leagueId)
        setIsLocked(locked)

        // Load waiver settings
        const settings = await LeagueService.getLeagueSettings(leagueId)
        setMaxClaims(settings.freeAgentPicksAllowed ?? settings.maxWaiverClaimsPerSeason ?? 3)

        // Load waiver history
        try {
          const history = await WaiverService.getWaiverHistory(leagueId)
          setWaiverHistory(history)
        } catch { /* table might not exist yet */ }
      } catch (err) {
        log.error('Failed to load free agents:', err)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [leagueId, router, user?.id])

  // Filter to only available (undrafted) Pokemon
  const availablePokemon = useMemo(() => {
    if (!allPokemon) return []
    return allPokemon.filter(p => !draftedIds.has(p.id))
  }, [allPokemon, draftedIds])

  // Search filter
  const filteredPokemon = useMemo(() => {
    if (!deferredSearch.trim()) return availablePokemon
    const query = deferredSearch.toLowerCase()
    return availablePokemon.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.types.some(t => t.name.toLowerCase().includes(query))
    )
  }, [availablePokemon, deferredSearch])

  // Compute net cost and whether the swap is affordable
  const dropPick = useMemo(() => {
    if (!dropPickId) return null
    return userTeamPicks.find(p => p.id === dropPickId) || null
  }, [dropPickId, userTeamPicks])

  const netCost = selectedPokemon && dropPick
    ? selectedPokemon.cost - dropPick.cost
    : selectedPokemon?.cost ?? 0

  const canAffordSwap = dropPick
    ? netCost <= 0 || userBudget >= netCost
    : false

  const handleClaim = useCallback(async () => {
    if (!selectedPokemon || !userTeamId || !draftId || !dropPickId) return
    setIsClaiming(true)

    try {
      await WaiverService.claimPokemon(
        leagueId,
        userTeamId,
        selectedPokemon.id,
        selectedPokemon.name,
        selectedPokemon.cost,
        dropPickId
      )

      notify.success('Pokemon Claimed!', `${selectedPokemon.name} has been added to your roster.`)

      // Update local state
      setDraftedIds(prev => new Set([...prev, selectedPokemon.id]))
      setClaimsUsed(prev => prev + 1)
      setSelectedPokemon(null)
      setDropPickId(null)

      // Reload picks
      const picks = await WaiverService.getTeamPicks(userTeamId)
      setUserTeamPicks(picks)

      // Reload history
      try {
        const history = await WaiverService.getWaiverHistory(leagueId)
        setWaiverHistory(history)
      } catch { /* ignore */ }
    } catch (err) {
      log.error('Failed to claim Pokemon:', err)
      notify.error('Claim Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsClaiming(false)
    }
  }, [selectedPokemon, userTeamId, draftId, leagueId, dropPickId])

  const teamColorMap = useMemo(() => {
    if (!league) return new Map()
    return buildTeamColorMap(league.teams.map(t => t.id))
  }, [league])

  if (isLoading) return <LoadingScreen title="Loading Free Agents..." description="Scanning available Pokemon." />
  if (!league) return null

  const canClaim = userTeamId && claimsUsed < maxClaims && !isLocked

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
            <h1 className="text-2xl font-bold">Free Agents</h1>
            <p className="text-sm text-muted-foreground">
              {league.name} &middot; {availablePokemon.length} Pokemon available
            </p>
          </div>
          {userTeamId && (
            <div className="text-right">
              <div className="text-sm font-medium">
                <Coins className="h-4 w-4 inline mr-1" />
                {userBudget} pts
              </div>
              <div className="text-xs text-muted-foreground">
                Claims: {claimsUsed}/{maxClaims}
              </div>
            </div>
          )}
        </div>

        <Tabs defaultValue="browse" className="space-y-4">
          <TabsList>
            <TabsTrigger value="browse" className="flex-1">
              <Search className="h-4 w-4 mr-1" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              <History className="h-4 w-4 mr-1" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or type..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-md bg-background text-sm"
              />
            </div>

            {/* Claim modal */}
            {selectedPokemon && (
              <Card className="border-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Claim {selectedPokemon.name}
                  </CardTitle>
                  <CardDescription>{selectedPokemon.cost} pts | Budget: {userBudget} pts remaining</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <img
                      src={getPokemonAnimatedUrl(selectedPokemon.id, selectedPokemon.name)}
                      alt={selectedPokemon.name}
                      className="w-16 h-16 object-contain"
                      onError={e => {
                        (e.target as HTMLImageElement).src = getPokemonAnimatedBackupUrl(selectedPokemon.id)
                      }}
                    />
                    <div>
                      <div className="font-bold capitalize text-lg">{selectedPokemon.name}</div>
                      <div className="flex gap-1">
                        {selectedPokemon.types.map(t => (
                          <span
                            key={t.name}
                            className="text-xs px-2 py-0.5 rounded-full text-white capitalize"
                            style={{ backgroundColor: TYPE_COLORS[t.name] || '#68A090' }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        BST: {selectedPokemon.stats.total}
                      </div>
                    </div>
                  </div>

                  {/* Drop selection (required) */}
                  <div className="mb-4">
                    <label className="text-sm font-medium mb-2 block">
                      Drop a Pokemon to swap (required):
                    </label>
                    {userTeamPicks.length === 0 ? (
                      <p className="text-xs text-red-500">No Pokemon on your roster to drop.</p>
                    ) : (
                      <>
                        <select
                          value={dropPickId || ''}
                          onChange={e => setDropPickId(e.target.value || null)}
                          className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                        >
                          <option value="">Select a Pokemon to drop...</option>
                          {userTeamPicks.map(pick => (
                            <option key={pick.id} value={pick.id}>
                              {pick.pokemonName} ({pick.cost} pts)
                            </option>
                          ))}
                        </select>
                        {dropPick && (
                          <div className={`text-xs mt-1.5 px-2 py-1 rounded ${
                            netCost <= 0
                              ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/40'
                              : canAffordSwap
                                ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40'
                                : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40'
                          }`}>
                            {netCost === 0 && `Even swap (both ${selectedPokemon.cost} pts)`}
                            {netCost < 0 && `+${Math.abs(netCost)} pts refund (drop ${dropPick.cost} → pick up ${selectedPokemon.cost})`}
                            {netCost > 0 && canAffordSwap && `Costs ${netCost} extra pts from budget (drop ${dropPick.cost} → pick up ${selectedPokemon.cost})`}
                            {netCost > 0 && !canAffordSwap && `Can't afford: need ${netCost} pts but only have ${userBudget} pts`}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleClaim}
                      disabled={!canClaim || isClaiming || !dropPickId || !canAffordSwap}
                    >
                      {isClaiming ? 'Claiming...' : `Swap for ${selectedPokemon.name}`}
                    </Button>
                    <Button variant="outline" onClick={() => { setSelectedPokemon(null); setDropPickId(null) }}>
                      Cancel
                    </Button>
                  </div>

                  {!canClaim && (
                    <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      {!userTeamId ? 'You are not part of this league.' : isLocked ? 'Free agent claims are locked — a match has already been played.' : `Free agent pick limit reached (${maxClaims} allowed).`}
                    </p>
                  )}
                  {!dropPickId && userTeamPicks.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Select a Pokemon to drop — free agent claims require a like-for-like swap.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Pokemon grid */}
            {pokemonLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading Pokemon data...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {filteredPokemon.slice(0, 100).map(pokemon => (
                  <Card
                    key={pokemon.id}
                    className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedPokemon?.id === pokemon.id ? 'border-blue-500 border-2' : ''
                    }`}
                    onClick={() => setSelectedPokemon(pokemon)}
                  >
                    <CardContent className="pt-3 pb-2 px-3 text-center">
                      <img
                        src={getPokemonAnimatedUrl(pokemon.id, pokemon.name)}
                        alt={pokemon.name}
                        className="w-12 h-12 mx-auto object-contain"
                        onError={e => {
                          (e.target as HTMLImageElement).src = getPokemonAnimatedBackupUrl(pokemon.id)
                        }}
                        loading="lazy"
                      />
                      <div className="font-medium text-xs capitalize mt-1 truncate">{pokemon.name}</div>
                      <div className="flex justify-center gap-0.5 mt-1">
                        {pokemon.types.map(t => (
                          <span
                            key={t.name}
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: TYPE_COLORS[t.name] || '#68A090' }}
                            title={t.name}
                          />
                        ))}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">{pokemon.cost} pts</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {filteredPokemon.length > 100 && (
              <p className="text-center text-sm text-muted-foreground">
                Showing first 100 of {filteredPokemon.length} results. Use search to narrow down.
              </p>
            )}

            {filteredPokemon.length === 0 && !pokemonLoading && (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? 'No Pokemon match your search.' : 'No free agents available.'}
              </div>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Waiver Transaction History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {waiverHistory.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">No waiver transactions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {waiverHistory.map(claim => {
                      const team = league.teams.find(t => t.id === claim.teamId)
                      const colors = teamColorMap.get(claim.teamId)
                      return (
                        <div key={claim.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <img
                              src={getPokemonAnimatedUrl(claim.claimedPokemonId, claim.claimedPokemonName)}
                              alt={claim.claimedPokemonName}
                              className="w-8 h-8 object-contain"
                              onError={e => {
                                (e.target as HTMLImageElement).src = getPokemonAnimatedBackupUrl(claim.claimedPokemonId)
                              }}
                              loading="lazy"
                            />
                            <div>
                              <div className="text-sm font-medium capitalize">{claim.claimedPokemonName}</div>
                              <div className="text-xs text-muted-foreground">
                                <span className={colors?.badge ? `px-1 rounded ${colors.badge}` : ''}>
                                  {team?.name || 'Unknown'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant={
                                claim.status === 'completed' ? 'default' :
                                claim.status === 'pending' ? 'secondary' :
                                claim.status === 'rejected' ? 'destructive' : 'outline'
                              }
                            >
                              {claim.status}
                            </Badge>
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(claim.claimedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
