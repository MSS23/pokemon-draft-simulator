'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, History, Clock, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Pokemon } from '@/types'

interface DraftActivityItem {
  id: string
  teamId: string
  teamName: string
  userName: string
  pokemonId: string
  pokemonName: string
  pickNumber: number
  round: number
  timestamp: number
}

interface DraftActivitySidebarProps {
  isOpen: boolean
  onClose: () => void
  activities: DraftActivityItem[]
  pokemon: Pokemon[]
  currentUserTeamId?: string | null
}

export default function DraftActivitySidebar({
  isOpen,
  onClose,
  activities,
  pokemon,
  currentUserTeamId
}: DraftActivitySidebarProps) {
  const [filter, setFilter] = useState<'all' | 'my-team' | 'opponents'>('all')

  const filteredActivities = activities.filter(activity => {
    if (filter === 'all') return true
    if (filter === 'my-team') return activity.teamId === currentUserTeamId
    if (filter === 'opponents') return activity.teamId !== currentUserTeamId
    return true
  })

  const getPokemonData = (pokemonId: string) => {
    return pokemon.find(p => p.id === pokemonId)
  }

  const getRelativeTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return 'Earlier'
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-full sm:w-96 bg-white dark:bg-slate-900 shadow-2xl z-50 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Draft Activity
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
                className="flex-1"
              >
                All Picks
              </Button>
              {currentUserTeamId && (
                <>
                  <Button
                    variant={filter === 'my-team' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('my-team')}
                    className="flex-1"
                  >
                    My Team
                  </Button>
                  <Button
                    variant={filter === 'opponents' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('opponents')}
                    className="flex-1"
                  >
                    Opponents
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Activity List */}
          <ScrollArea className="flex-1 p-4">
            {filteredActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Trophy className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
                <p className="text-slate-500 dark:text-slate-400">
                  No draft activity yet
                </p>
                <p className="text-sm text-slate-400 dark:text-slate-600 mt-1">
                  Picks will appear here as they happen
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredActivities.map((activity) => {
                  const pokemonData = getPokemonData(activity.pokemonId)
                  const isUserTeam = activity.teamId === currentUserTeamId

                  return (
                    <Card
                      key={activity.id}
                      className={cn(
                        'transition-all duration-200 hover:shadow-md',
                        isUserTeam && 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10'
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Pokemon Image */}
                          {pokemonData && (
                            <div className="flex-shrink-0">
                              <img
                                src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonData.id}.png`}
                                alt={pokemonData.name}
                                className="w-12 h-12 pixelated"
                              />
                            </div>
                          )}

                          {/* Activity Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {activity.pokemonName}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                                  {activity.teamName}
                                </p>
                              </div>
                              <Badge variant="outline" className="flex-shrink-0 text-xs">
                                Pick #{activity.pickNumber}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-500">
                              <Clock className="h-3 w-3" />
                              <span>{getRelativeTime(activity.timestamp)}</span>
                              <span className="text-slate-300 dark:text-slate-700">•</span>
                              <span>Round {activity.round}</span>
                            </div>

                            {/* Pokemon Types */}
                            {pokemonData && pokemonData.types && (
                              <div className="flex gap-1 mt-2">
                                {pokemonData.types.map((type) => (
                                  <Badge
                                    key={type.name}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {type.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </ScrollArea>

          {/* Footer Stats */}
          {activities.length > 0 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {activities.length}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Total Picks
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {Math.max(...activities.map(a => a.round))}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Current Round
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {currentUserTeamId
                      ? activities.filter(a => a.teamId === currentUserTeamId).length
                      : '-'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Your Picks
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
