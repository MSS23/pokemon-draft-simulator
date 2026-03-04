'use client'

import { useMemo, memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Crown, User } from 'lucide-react'
import { usePokemonList } from '@/hooks/usePokemon'
import { Pokemon } from '@/types'
import { cn } from '@/lib/utils'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'

interface TeamRosterProps {
  team: {
    id: string
    name: string
    userName: string
    draftOrder: number
    picks: string[]
    budgetRemaining?: number
  }
  isCurrentTeam?: boolean
  isUserTeam?: boolean
  showTurnIndicator?: boolean
  maxPokemonPerTeam?: number
}

const TeamRoster = memo(function TeamRoster({
  team,
  isCurrentTeam = false,
  isUserTeam = false,
  showTurnIndicator = true,
  maxPokemonPerTeam = 6
}: TeamRosterProps) {
  const { data: allPokemon } = usePokemonList()

  const teamPokemon = useMemo(() => {
    if (!allPokemon || !team.picks.length) return []
    return team.picks
      .map(pickId => allPokemon.find(p => p.id === pickId))
      .filter((p): p is Pokemon => p !== undefined)
  }, [allPokemon, team.picks])

  return (
    <Card className={cn(
      'w-full transition-all',
      isUserTeam && 'ring-2 ring-primary shadow-md',
      isCurrentTeam && !isUserTeam && 'border-yellow-400 border-2',
      isCurrentTeam && isUserTeam && 'ring-2 ring-yellow-400 shadow-lg',
      !isCurrentTeam && !isUserTeam && 'shadow-sm'
    )}>
      <CardContent className="p-3">
        {/* Team header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {isCurrentTeam && showTurnIndicator && (
              <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
            )}
            <span className="font-semibold text-sm truncate">{team.name}</span>
            {isUserTeam && (
              <Badge variant="secondary" size="sm" className="h-4 flex-shrink-0">You</Badge>
            )}
          </div>
          {team.budgetRemaining !== undefined && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              ${team.budgetRemaining}
            </span>
          )}
        </div>

        {/* Player name & pick count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span className="flex items-center gap-1 truncate">
            <User className="h-3 w-3" />
            {team.userName}
          </span>
          <span>{team.picks.length}/{maxPokemonPerTeam}</span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-1 mb-2">
          <div
            className={cn(
              'h-1 rounded-full transition-all duration-300',
              isCurrentTeam ? 'bg-yellow-500' : 'bg-primary'
            )}
            style={{ width: `${(team.picks.length / maxPokemonPerTeam) * 100}%` }}
          />
        </div>

        {/* Pokemon party - compact circles */}
        <div className="flex items-center gap-1 flex-wrap">
          {teamPokemon.map((pokemon) => (
            <div
              key={pokemon.id}
              className="relative group"
              title={`${pokemon.name} ($${pokemon.cost || 1})`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPokemonAnimatedUrl(pokemon.id, pokemon.name)}
                alt={pokemon.name}
                className="w-8 h-8 sm:w-9 sm:h-9 bg-muted rounded-full border border-border hover:border-primary transition-all hover:scale-110"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  if (!target.dataset.fallback) {
                    target.dataset.fallback = '1'
                    target.src = getPokemonAnimatedBackupUrl(pokemon.id)
                  }
                }}
              />
            </div>
          ))}
          {Array.from({ length: Math.max(0, maxPokemonPerTeam - teamPokemon.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="w-8 h-8 sm:w-9 sm:h-9 bg-muted/50 rounded-full border border-dashed border-border"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.team.id === nextProps.team.id &&
    prevProps.team.picks.length === nextProps.team.picks.length &&
    prevProps.team.picks.join(',') === nextProps.team.picks.join(',') &&
    prevProps.team.budgetRemaining === nextProps.team.budgetRemaining &&
    prevProps.isCurrentTeam === nextProps.isCurrentTeam &&
    prevProps.isUserTeam === nextProps.isUserTeam
  )
})

export default TeamRoster
