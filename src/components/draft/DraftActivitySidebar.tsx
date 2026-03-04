'use client'

import { useState, useMemo, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, History, Trophy } from 'lucide-react'
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

// Consistent team colors - assigned by index
const TEAM_COLORS = [
  { bg: 'bg-blue-500/10', border: 'border-l-blue-500', text: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
  { bg: 'bg-rose-500/10', border: 'border-l-rose-500', text: 'text-rose-600 dark:text-rose-400', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300' },
  { bg: 'bg-emerald-500/10', border: 'border-l-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' },
  { bg: 'bg-amber-500/10', border: 'border-l-amber-500', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  { bg: 'bg-purple-500/10', border: 'border-l-purple-500', text: 'text-purple-600 dark:text-purple-400', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' },
  { bg: 'bg-cyan-500/10', border: 'border-l-cyan-500', text: 'text-cyan-600 dark:text-cyan-400', badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300' },
  { bg: 'bg-orange-500/10', border: 'border-l-orange-500', text: 'text-orange-600 dark:text-orange-400', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' },
  { bg: 'bg-pink-500/10', border: 'border-l-pink-500', text: 'text-pink-600 dark:text-pink-400', badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300' },
]

const DraftActivitySidebar = memo(function DraftActivitySidebar({
  isOpen,
  onClose,
  activities,
  pokemon,
  currentUserTeamId
}: DraftActivitySidebarProps) {
  const [filter, setFilter] = useState<'all' | 'my-team' | 'opponents'>('all')

  // Create Pokemon Map for O(1) lookup
  const pokemonMap = useMemo(() => {
    const map = new Map<string, Pokemon>()
    pokemon.forEach(p => map.set(p.id, p))
    return map
  }, [pokemon])

  // Build stable team-to-color mapping
  const teamColorMap = useMemo(() => {
    const map = new Map<string, typeof TEAM_COLORS[0]>()
    const uniqueTeamIds = [...new Set(activities.map(a => a.teamId))]
    uniqueTeamIds.forEach((teamId, idx) => {
      map.set(teamId, TEAM_COLORS[idx % TEAM_COLORS.length])
    })
    return map
  }, [activities])

  const filteredActivities = useMemo(() =>
    activities.filter(activity => {
      if (filter === 'all') return true
      if (filter === 'my-team') return activity.teamId === currentUserTeamId
      if (filter === 'opponents') return activity.teamId !== currentUserTeamId
      return true
    }),
    [activities, filter, currentUserTeamId]
  )

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-full sm:w-[380px] bg-background border-l shadow-2xl z-50 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Draft Activity</h2>
              {activities.length > 0 && (
                <Badge variant="secondary" className="text-xs h-5 px-1.5">
                  {activities.length}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Filters */}
          <div className="px-4 py-2 border-b">
            <div className="flex gap-1.5">
              {(['all', 'my-team', 'opponents'] as const).map(f => (
                <Button
                  key={f}
                  variant={filter === f ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className={cn('flex-1 h-7 text-xs', filter !== f && 'text-muted-foreground')}
                >
                  {f === 'all' ? 'All' : f === 'my-team' ? 'My Team' : 'Opponents'}
                </Button>
              ))}
            </div>
          </div>

          {/* Activity List */}
          <ScrollArea className="flex-1">
            <div className="p-3">
              {filteredActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Trophy className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No picks yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredActivities.map((activity) => {
                    const pokemonData = pokemonMap.get(activity.pokemonId)
                    const isUserTeam = activity.teamId === currentUserTeamId
                    const colors = teamColorMap.get(activity.teamId) || TEAM_COLORS[0]

                    return (
                      <div
                        key={activity.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg border-l-[3px] transition-colors',
                          colors.border,
                          isUserTeam ? colors.bg : 'hover:bg-muted/50'
                        )}
                      >
                        {/* Pokemon sprite */}
                        {pokemonData && (
                          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonData.id}.png`}
                              alt={pokemonData.name}
                              className="w-10 h-10 pixelated"
                              loading="lazy"
                            />
                          </div>
                        )}

                        {/* Pick info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm truncate">
                              {activity.pokemonName}
                            </span>
                            {pokemonData?.types?.map(type => (
                              <Badge key={type.name} variant="outline" className="text-[10px] h-4 px-1 hidden sm:inline-flex">
                                {type.name}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={cn('text-xs font-medium', colors.text)}>
                              {activity.teamName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              R{activity.round} · #{activity.pickNumber}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer Stats */}
          {activities.length > 0 && (
            <div className="px-4 py-3 border-t bg-muted/30">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold">{activities.length}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Picks</div>
                </div>
                <div>
                  <div className="text-lg font-bold">
                    {Math.max(...activities.map(a => a.round))}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Round</div>
                </div>
                <div>
                  <div className="text-lg font-bold">
                    {currentUserTeamId
                      ? activities.filter(a => a.teamId === currentUserTeamId).length
                      : '-'}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Yours</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
})

export default DraftActivitySidebar
