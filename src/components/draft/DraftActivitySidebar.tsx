'use client'

import { useState, useMemo, memo } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Pokemon } from '@/types'
import { TEAM_COLORS } from '@/utils/team-colors'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'

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

/** Type color mapping for small colored dots */
const TYPE_COLORS: Record<string, string> = {
  normal: 'bg-stone-400',
  fire: 'bg-orange-500',
  water: 'bg-blue-500',
  electric: 'bg-yellow-400',
  grass: 'bg-green-500',
  ice: 'bg-cyan-300',
  fighting: 'bg-red-700',
  poison: 'bg-purple-500',
  ground: 'bg-amber-600',
  flying: 'bg-indigo-300',
  psychic: 'bg-pink-500',
  bug: 'bg-lime-500',
  rock: 'bg-amber-700',
  ghost: 'bg-purple-700',
  dragon: 'bg-violet-600',
  dark: 'bg-stone-700',
  steel: 'bg-slate-400',
  fairy: 'bg-pink-300',
}

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

  // Group activities by round for section headers
  const groupedByRound = useMemo(() => {
    const groups: { round: number; items: typeof filteredActivities }[] = []
    let currentRound = -1

    for (const activity of filteredActivities) {
      if (activity.round !== currentRound) {
        currentRound = activity.round
        groups.push({ round: currentRound, items: [] })
      }
      groups[groups.length - 1].items.push(activity)
    }

    return groups
  }, [filteredActivities])

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
        <div className="flex flex-col h-full pb-[env(safe-area-inset-bottom)]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2.5">
              <History className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">Draft Activity</h2>
              {activities.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {activities.length} picks
                </span>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Filters */}
          <div className="px-4 py-2.5 border-b">
            <div className="flex gap-1.5">
              {(['all', 'my-team', 'opponents'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'flex-1 py-2.5 text-xs font-medium rounded-md transition-colors',
                    filter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  {f === 'all' ? 'All' : f === 'my-team' ? 'My Team' : 'Opponents'}
                </button>
              ))}
            </div>
          </div>

          {/* Activity List */}
          <ScrollArea className="flex-1">
            <div className="px-3 py-2">
              {filteredActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <p className="text-sm text-muted-foreground">No picks yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Picks will appear here as they happen</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {groupedByRound.map(({ round, items }) => (
                    <div key={round}>
                      {/* Round divider */}
                      <div className="flex items-center gap-2 mb-1.5 px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          Round {round}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <div className="space-y-0.5">
                        {items.map((activity) => {
                          const pokemonData = pokemonMap.get(activity.pokemonId)
                          const isUserTeam = activity.teamId === currentUserTeamId
                          const colors = teamColorMap.get(activity.teamId) || TEAM_COLORS[0]

                          return (
                            <div
                              key={activity.id}
                              className={cn(
                                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border-l-[3px] transition-colors',
                                colors.border,
                                isUserTeam ? colors.bg : 'hover:bg-muted/40'
                              )}
                            >
                              {/* Pick number */}
                              <span className="text-[10px] font-mono text-muted-foreground/50 w-4 text-right flex-shrink-0 tabular-nums">
                                {activity.pickNumber}
                              </span>

                              {/* Pokemon sprite */}
                              {pokemonData && (
                                <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={getPokemonAnimatedUrl(pokemonData.id, pokemonData.name)}
                                    alt={pokemonData.name}
                                    className="w-9 h-9"
                                    loading="lazy"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement
                                      if (!target.dataset.fallback) {
                                        target.dataset.fallback = '1'
                                        target.src = getPokemonAnimatedBackupUrl(pokemonData.id)
                                      }
                                    }}
                                  />
                                </div>
                              )}

                              {/* Pick info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-[13px] leading-tight truncate capitalize">
                                    {activity.pokemonName}
                                  </span>
                                  {/* Type dots */}
                                  <div className="flex gap-0.5 flex-shrink-0">
                                    {pokemonData?.types?.map(type => (
                                      <span
                                        key={type.name}
                                        title={type.name}
                                        className={cn(
                                          'w-2 h-2 rounded-full inline-block',
                                          TYPE_COLORS[type.name.toLowerCase()] || 'bg-gray-400'
                                        )}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <span className={cn('text-[11px] leading-tight', colors.text)}>
                                  {activity.teamName}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer Stats */}
          {activities.length > 0 && (
            <div className="px-4 py-2.5 border-t bg-muted/20">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">
                  <span className="font-semibold text-foreground">{activities.length}</span> picks
                </span>
                <span className="tabular-nums">
                  Round <span className="font-semibold text-foreground">{Math.max(...activities.map(a => a.round))}</span>
                </span>
                {currentUserTeamId && (
                  <span className="tabular-nums">
                    <span className="font-semibold text-foreground">
                      {activities.filter(a => a.teamId === currentUserTeamId).length}
                    </span> yours
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
})

export default DraftActivitySidebar
