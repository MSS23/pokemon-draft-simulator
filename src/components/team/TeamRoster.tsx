'use client'

import { useMemo, memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Crown, User } from 'lucide-react'
import { usePokemonList } from '@/hooks/usePokemon'
import { Pokemon } from '@/types'
import { cn } from '@/lib/utils'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'
import { PokeballIcon } from '@/components/ui/pokeball-icon'
import { getTeamColor } from '@/utils/team-colors'

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
  const teamColor = getTeamColor(team.draftOrder - 1)

  const teamPokemon = useMemo(() => {
    if (!allPokemon || !team.picks.length) return []
    return team.picks
      .map(pickId => allPokemon.find(p => p.id === pickId))
      .filter((p): p is Pokemon => p !== undefined)
  }, [allPokemon, team.picks])

  return (
    <Card className={cn(
      'w-full transition-all border-l-4',
      teamColor.border,
      isUserTeam && 'ring-2 ring-primary shadow-md',
      isCurrentTeam && !isUserTeam && 'border-t-2 border-t-yellow-400',
      isCurrentTeam && isUserTeam && 'ring-2 ring-yellow-400 shadow-lg',
      !isCurrentTeam && !isUserTeam && 'shadow-sm'
    )}>
      <CardContent className="p-3 sm:p-4">
        {/* Team header */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <PokeballIcon size="sm" color={teamColor.hex} className="flex-shrink-0" />
            {isCurrentTeam && showTurnIndicator && (
              <Crown className="h-4 w-4 text-yellow-500 flex-shrink-0 animate-pulse" />
            )}
            <span className="font-bold text-sm truncate">{team.name}</span>
            {isUserTeam && (
              <Badge variant="secondary" size="sm" className="h-4 flex-shrink-0 text-[10px]">You</Badge>
            )}
          </div>
          {team.budgetRemaining !== undefined && (
            <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5 flex-shrink-0">
              ${team.budgetRemaining}
            </Badge>
          )}
        </div>

        {/* Player name & pick count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span className="flex items-center gap-1 truncate">
            <User className="h-3 w-3" />
            {team.userName}
          </span>
          <span className="font-medium">{team.picks.length}/{maxPokemonPerTeam}</span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-1.5 mb-3">
          <div
            className="h-1.5 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(team.picks.length / maxPokemonPerTeam) * 100}%`, backgroundColor: teamColor.hex }}
          />
        </div>

        {/* Pokemon party */}
        <div className="flex items-center gap-1.5 flex-wrap">
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
                className="w-11 h-11 sm:w-12 sm:h-12 bg-muted/50 rounded-lg border border-border hover:border-primary transition-all hover:scale-110 shadow-sm"
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
              className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center opacity-20"
            >
              <PokeballIcon size="md" color={teamColor.hex} />
            </div>
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
