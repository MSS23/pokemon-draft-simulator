'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Search, Users, History, TrendingUp, Clock } from 'lucide-react'
import { Pokemon, Team, Pick } from '@/types'
import { cn } from '@/lib/utils'

interface MobileDraftViewProps {
  pokemon: Pokemon[]
  teams: Team[]
  picks: Pick[]
  currentUserTeamId?: string | null
  isUserTurn?: boolean
  timeRemaining?: number
  onPokemonSelect?: (pokemon: Pokemon) => void
  className?: string
}

type TabType = 'pick' | 'team' | 'activity' | 'stats'

/**
 * MobileDraftView - Optimized mobile interface for draft
 *
 * Features:
 * - Bottom tab navigation
 * - Compact Pokemon cards
 * - Touch-optimized controls
 * - Swipeable tabs (future enhancement)
 * - Mobile-friendly search
 */
export default function MobileDraftView({
  pokemon,
  teams,
  picks,
  currentUserTeamId,
  isUserTurn = false,
  timeRemaining = 0,
  onPokemonSelect,
  className
}: MobileDraftViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('pick')
  const [searchQuery, setSearchQuery] = useState('')

  const userTeam = useMemo(
    () => teams.find(t => t.id === currentUserTeamId),
    [teams, currentUserTeamId]
  )

  const filteredPokemon = useMemo(() => {
    if (!searchQuery) return pokemon

    const query = searchQuery.toLowerCase()
    return pokemon.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.types.some(t => t.name.toLowerCase().includes(query))
    )
  }, [pokemon, searchQuery])

  const sortedPicks = useMemo(() => {
    return [...picks].sort((a, b) => b.pickOrder - a.pickOrder)
  }, [picks])

  const userPicks = useMemo(() => {
    if (!currentUserTeamId) return []
    return picks.filter(p => p.teamId === currentUserTeamId)
  }, [picks, currentUserTeamId])

  const getRelativeTime = (timestamp: string) => {
    const now = Date.now()
    const pickTime = new Date(timestamp).getTime()
    const diff = now - pickTime
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)

    if (seconds < 60) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    return 'Earlier'
  }

  return (
    <div className={cn('flex flex-col h-screen bg-slate-50 dark:bg-slate-950', className)}>
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Pokemon Draft
            </h1>
            {userTeam && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {userTeam.name} • ${userTeam.budgetRemaining} left
              </p>
            )}
          </div>

          {isUserTurn && timeRemaining > 0 && (
            <Badge
              variant={timeRemaining <= 10 ? 'destructive' : 'default'}
              className="text-lg font-bold px-3 py-1"
            >
              <Clock className="h-4 w-4 mr-1" />
              {timeRemaining}s
            </Badge>
          )}
        </div>

        {isUserTurn && (
          <div className="bg-blue-100 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg p-2 text-center">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Your turn! Pick a Pokemon
            </p>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {/* Pick Tab */}
        {activeTab === 'pick' && (
          <div className="h-full flex flex-col">
            {/* Search */}
            <div className="flex-shrink-0 p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search Pokemon..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-search-input
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{filteredPokemon.length} available</span>
                <span>Tap to select</span>
              </div>
            </div>

            {/* Pokemon Grid */}
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 gap-2 p-4">
                {filteredPokemon.map(poke => (
                  <button
                    key={poke.id}
                    onClick={() => onPokemonSelect?.(poke)}
                    className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg p-3 active:scale-95 transition-transform"
                  >
                    <img
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${poke.id}.png`}
                      alt={poke.name}
                      className="w-20 h-20 mx-auto pixelated"
                    />
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate mt-1">
                      {poke.name}
                    </div>
                    <div className="flex gap-1 mt-1 justify-center flex-wrap">
                      {poke.types.slice(0, 2).map(type => (
                        <Badge key={type.name} variant="secondary" className="text-xs">
                          {type.name}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        BST: {poke.stats.total}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        ${poke.cost}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {teams.map(team => {
                const teamPicks = picks.filter(p => p.teamId === team.id)
                const isUserTeam = team.id === currentUserTeamId

                return (
                  <Card
                    key={team.id}
                    className={cn(
                      isUserTeam && 'border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                    )}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-slate-100">
                            {team.name}
                          </h3>
                          {isUserTeam && (
                            <Badge variant="default" className="mt-1">
                              Your Team
                            </Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            ${team.budgetRemaining}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {teamPicks.length} picks
                          </div>
                        </div>
                      </div>

                      {teamPicks.length === 0 ? (
                        <div className="text-center text-slate-500 dark:text-slate-400 py-4">
                          No picks yet
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {teamPicks.map(pick => {
                            const pokemonData = pokemon.find(p => p.id === pick.pokemonId)
                            return (
                              <div
                                key={pick.id}
                                className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 text-center"
                              >
                                {pokemonData && (
                                  <>
                                    <img
                                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonData.id}.png`}
                                      alt={pokemonData.name}
                                      className="w-12 h-12 mx-auto pixelated"
                                    />
                                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate mt-1">
                                      {pokemonData.name}
                                    </div>
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {sortedPicks.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                    <History className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
                    <p className="text-slate-500 dark:text-slate-400">
                      No picks yet
                    </p>
                  </CardContent>
                </Card>
              ) : (
                sortedPicks.map(pick => {
                  const team = teams.find(t => t.id === pick.teamId)
                  const pokemonData = pokemon.find(p => p.id === pick.pokemonId)

                  return (
                    <Card key={pick.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          {pokemonData && (
                            <img
                              src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonData.id}.png`}
                              alt={pokemonData.name}
                              className="w-12 h-12 pixelated flex-shrink-0"
                            />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {pick.pokemonName}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                                  {team?.name}
                                </p>
                              </div>
                              <Badge variant="outline" className="flex-shrink-0 text-xs">
                                Pick #{pick.pickOrder}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-500">
                              <Clock className="h-3 w-3" />
                              <span>{getRelativeTime(pick.createdAt)}</span>
                              <span className="text-slate-300 dark:text-slate-700">•</span>
                              <span>Round {pick.round}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </div>
          </ScrollArea>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4">
                    Draft Overview
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Total Picks</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {picks.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Teams</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {teams.length}
                      </span>
                    </div>
                    {userPicks.length > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Your Picks</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {userPicks.length}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {userTeam && (
                <Card className="border-2 border-blue-500">
                  <CardContent className="pt-6">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4">
                      Your Team
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Budget Remaining</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          ${userTeam.budgetRemaining}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Picks Made</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {userPicks.length}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 safe-area-bottom">
        <div className="grid grid-cols-4 gap-1">
          <Button
            variant={activeTab === 'pick' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('pick')}
            className="flex-col h-auto py-2"
          >
            <Search className="h-5 w-5" />
            <span className="text-xs mt-1">Pick</span>
          </Button>

          <Button
            variant={activeTab === 'team' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('team')}
            className="flex-col h-auto py-2"
          >
            <Users className="h-5 w-5" />
            <span className="text-xs mt-1">Teams</span>
          </Button>

          <Button
            variant={activeTab === 'activity' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('activity')}
            className="flex-col h-auto py-2 relative"
          >
            <History className="h-5 w-5" />
            <span className="text-xs mt-1">Activity</span>
            {picks.length > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {picks.length}
              </Badge>
            )}
          </Button>

          <Button
            variant={activeTab === 'stats' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('stats')}
            className="flex-col h-auto py-2"
          >
            <TrendingUp className="h-5 w-5" />
            <span className="text-xs mt-1">Stats</span>
          </Button>
        </div>
      </nav>
    </div>
  )
}
