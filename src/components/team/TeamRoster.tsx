'use client'

import { useMemo, memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Crown, User } from 'lucide-react'
import { usePokemonList } from '@/hooks/usePokemon'
import { Pokemon, TierDefinition } from '@/types'
import { cn } from '@/lib/utils'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'
import { PokeballIcon } from '@/components/ui/pokeball-icon'
import { getTeamColor } from '@/utils/team-colors'
import { getPokemonTier } from '@/lib/tier-utils'

interface TeamRosterProps {
  team: {
    id: string
    name: string
    userName: string
    draftOrder: number
    picks: string[]
    budgetRemaining?: number
    pickCosts?: number[]
  }
  isCurrentTeam?: boolean
  isUserTeam?: boolean
  showTurnIndicator?: boolean
  maxPokemonPerTeam?: number
  scoringSystem?: 'budget' | 'tiered'
  tierConfig?: { tiers: TierDefinition[] }
}

const TeamRoster = memo(function TeamRoster({
  team,
  isCurrentTeam = false,
  isUserTeam = false,
  showTurnIndicator = true,
  maxPokemonPerTeam = 6,
  scoringSystem,
  tierConfig,
}: TeamRosterProps) {
  const { data: allPokemon } = usePokemonList()
  const teamColor = getTeamColor(team.draftOrder - 1)
  const isTiered = scoringSystem === 'tiered' && tierConfig?.tiers?.length

  const teamPokemon = useMemo(() => {
    if (!allPokemon || !team.picks.length) return []
    return team.picks
      .map(pickId => allPokemon.find(p => p.id === pickId))
      .filter((p): p is Pokemon => p !== undefined)
  }, [allPokemon, team.picks])

  // In budget-based tiered drafts, budget remaining is the constraint — no separate slot tracking

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
              {team.budgetRemaining}pts
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

        {/* Progress bar — same for both tiered and budget drafts */}
        <div className="w-full bg-muted rounded-full h-1.5 mb-3">
          <div
            className="h-1.5 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(team.picks.length / maxPokemonPerTeam) * 100}%`, backgroundColor: teamColor.hex }}
          />
        </div>

        {/* Pokemon party */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {teamPokemon.map((pokemon) => {
            const tier = isTiered && tierConfig ? getPokemonTier(pokemon.cost, tierConfig.tiers) : null
            return (
              <div
                key={pokemon.id}
                className="relative group"
                title={tier ? `${pokemon.name} [${tier.name}]` : `${pokemon.name} (${pokemon.cost}pts)`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getPokemonAnimatedUrl(pokemon.id, pokemon.name)}
                  alt={pokemon.name}
                  className="w-11 h-11 sm:w-12 sm:h-12 bg-muted/30 rounded-xl border border-black/[0.06] dark:border-white/[0.08] hover:border-primary/50 transition-all duration-200 hover:scale-110 hover:shadow-md shadow-sm"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    if (!target.dataset.fallback) {
                      target.dataset.fallback = '1'
                      target.src = getPokemonAnimatedBackupUrl(pokemon.id)
                    }
                  }}
                />
                {tier && (
                  <span
                    className="absolute -top-1 -right-1 text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center text-white shadow-sm"
                    style={{ backgroundColor: tier.color }}
                  >
                    {tier.name}
                  </span>
                )}
              </div>
            )
          })}
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
