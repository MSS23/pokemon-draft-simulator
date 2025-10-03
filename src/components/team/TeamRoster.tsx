'use client'

import { useMemo } from 'react'
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

export default function TeamRoster({
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
    <Card className={`w-full ${isUserTeam ? 'ring-2 ring-blue-500' : ''} ${isCurrentTeam ? 'border-yellow-400 shadow-lg' : ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {isCurrentTeam && showTurnIndicator && (
            <Crown className="h-4 w-4 text-yellow-500" />
          )}
          {team.name}
          <div className="flex gap-1">
            {isUserTeam && <Badge variant="secondary" className="text-xs">You</Badge>}
            {isCurrentTeam && <Badge variant="default" className="text-xs">Current Turn</Badge>}
          </div>
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <User className="h-3 w-3" />
          {team.userName} • Draft Order #{team.draftOrder}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Team Stats */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="font-semibold">{team.picks.length}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Picks</div>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="font-semibold">{totalValue}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Total Cost</div>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="font-semibold">{averageCost}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Avg Cost</div>
          </div>
        </div>

        {/* Pokemon List */}
        {teamPokemon.length > 0 ? (
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">Pokemon Roster</h4>
            <div className="space-y-1">
              {teamPokemon.map((pokemon, index) => (
                <div
                  key={pokemon.id}
                  className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded"
                >
                  <img
                    src={pokemon.sprite}
                    alt={pokemon.name}
                    className="w-8 h-8"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{pokemon.name}</div>
                    <div className="flex items-center gap-1">
                      {pokemon.types.map((type, typeIndex) => (
                        <Badge
                          key={typeIndex}
                          variant="secondary"
                          className={`text-xs px-1 py-0 ${getPokemonTypeColors(pokemon.types)}`}
                        >
                          {type.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">#{index + 1}</div>
                    <div className="text-xs text-gray-500">Cost: {pokemon.cost || 1}</div>
                  </div>
                </div>
              ))}
            </div>
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
}