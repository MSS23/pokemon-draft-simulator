'use client'

import { useMemo, memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Crown, User } from 'lucide-react'
import { usePokemonList } from '@/hooks/usePokemon'
import { Pokemon } from '@/types'

interface TeamRosterProps {
  team: {
    id: string
    name: string
    userName: string
    draftOrder: number
    picks: string[]
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

  // Get full Pokemon data for the team's picks
  const teamPokemon = useMemo(() => {
    if (!allPokemon || !team.picks.length) return []
    return team.picks
      .map(pickId => allPokemon.find(p => p.id === pickId))
      .filter((p): p is Pokemon => p !== undefined)
  }, [allPokemon, team.picks])

  const totalValue = teamPokemon.reduce((sum, pokemon) => sum + (pokemon.cost || 1), 0)
  const averageCost = teamPokemon.length > 0 ? Math.round(totalValue / teamPokemon.length) : 0

  const getPokemonTypeColors = (types: Pokemon['types']) => {
    if (!types.length) return 'bg-gray-100 text-gray-800'
    const primaryType = types[0]
    return `bg-${primaryType.color}-100 text-${primaryType.color}-800 dark:bg-${primaryType.color}-900 dark:text-${primaryType.color}-100`
  }

  return (
    <Card className={`w-full transition-all ${isUserTeam ? 'ring-2 ring-blue-500 shadow-md' : 'shadow-sm'} ${isCurrentTeam ? 'border-yellow-400 border-2 shadow-lg' : ''}`}>
      <CardHeader className="pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {isCurrentTeam && showTurnIndicator && (
              <Crown className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
            )}
            <span className="truncate">{team.name}</span>
          </CardTitle>
          <div className="flex gap-1">
            {isUserTeam && <Badge variant="secondary" className="text-xs">You</Badge>}
            {isCurrentTeam && <Badge className="text-xs bg-yellow-500 text-yellow-950">Active</Badge>}
          </div>
        </div>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <User className="h-3 w-3" />
          <span className="truncate">{team.userName}</span>
          <span className="text-slate-400">•</span>
          <span>#{team.draftOrder}</span>
        </CardDescription>

        {/* Pokemon Party Icons */}
        {teamPokemon.length > 0 && (
          <div className="flex items-center gap-1 mt-3 flex-wrap">
            {teamPokemon.map((pokemon) => (
              <div
                key={pokemon.id}
                className="relative group"
                title={pokemon.name}
              >
                <img
                  src={pokemon.sprite}
                  alt={pokemon.name}
                  className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200 hover:scale-110"
                />
              </div>
            ))}
            {/* Empty slots */}
            {Array.from({ length: maxPokemonPerTeam - teamPokemon.length }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="w-10 h-10 bg-gray-50 dark:bg-gray-900 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-700"
              />
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        {/* Team Stats - Compact */}
        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-700">
          <span>{team.picks.length}/{maxPokemonPerTeam} Picks</span>
          <span>Cost: {totalValue}</span>
          <span>Avg: {averageCost}</span>
        </div>

        {/* Pokemon List */}
        {teamPokemon.length > 0 ? (
          <div className="space-y-1.5">
            {teamPokemon.map((pokemon, index) => (
              <div
                key={pokemon.id}
                className="flex items-center gap-2 p-1.5 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
              >
                <img
                  src={pokemon.sprite}
                  alt={pokemon.name}
                  className="w-7 h-7"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs truncate">{pokemon.name}</div>
                  <div className="flex items-center gap-0.5">
                    {pokemon.types.slice(0, 2).map((type, typeIndex) => (
                      <Badge
                        key={typeIndex}
                        variant="secondary"
                        className="text-[10px] px-1 py-0 h-4"
                      >
                        {type.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  {pokemon.cost || 1}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            <div className="text-sm">No Pokemon drafted yet</div>
            <div className="text-xs">
              {maxPokemonPerTeam - team.picks.length} picks remaining
            </div>
          </div>
        )}

        {/* Progress indicator */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>Draft Progress</span>
            <span>{team.picks.length} / {maxPokemonPerTeam}</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(team.picks.length / maxPokemonPerTeam) * 100}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.team.id === nextProps.team.id &&
    prevProps.team.picks.length === nextProps.team.picks.length &&
    prevProps.team.picks.join(',') === nextProps.team.picks.join(',') &&
    prevProps.isCurrentTeam === nextProps.isCurrentTeam &&
    prevProps.isUserTeam === nextProps.isUserTeam
  )
})

export default TeamRoster