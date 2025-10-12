import { useMemo } from 'react'
import { useDraftStore } from '@/stores/draftStore'
import { Pokemon } from '@/types'

export interface TeamStats {
  id: string
  name: string
  totalBST: number
  avgBST: number
  avgCost: number
  budgetRemaining: number
  pickCount: number
  typeDistribution: Record<string, number>
}

export interface DraftStats {
  teams: TeamStats[]
  typeDistribution: Array<{ type: string; count: number }>
  mostPicked: Array<{ id: string; name: string; pickCount: number }>
  averageCost: number
  totalPicks: number
  currentRound: number
}

/**
 * Hook to compute comprehensive draft statistics
 */
export function useDraftStats(pokemon: Pokemon[]): DraftStats {
  const teams = useDraftStore(state => state.teamIds.map(id => state.teamsById[id]))
  const picks = useDraftStore(state => state.pickIds.map(id => state.picksById[id]))
  const draft = useDraftStore(state => state.draft)
  const picksByTeamId = useDraftStore(state => state.picksByTeamId)

  // Create pokemon lookup map
  const pokemonMap = useMemo(() => {
    const map = new Map<string, Pokemon>()
    pokemon.forEach(p => map.set(p.id, p))
    return map
  }, [pokemon])

  return useMemo(() => {
    // Calculate team statistics
    const teamStats: TeamStats[] = teams.map(team => {
      const teamPicks = (picksByTeamId[team.id] || [])
        .map(pickId => picks.find(p => p.id === pickId))
        .filter(Boolean)

      const teamPokemon = teamPicks
        .map(pick => pokemonMap.get(pick!.pokemonId))
        .filter(Boolean) as Pokemon[]

      const totalBST = teamPokemon.reduce((sum, p) => sum + p.stats.total, 0)
      const totalCost = teamPicks.reduce((sum, pick) => sum + pick!.cost, 0)

      // Calculate type distribution for this team
      const typeDistribution: Record<string, number> = {}
      teamPokemon.forEach(p => {
        p.types.forEach(type => {
          typeDistribution[type.name] = (typeDistribution[type.name] || 0) + 1
        })
      })

      return {
        id: team.id,
        name: team.name,
        totalBST,
        avgBST: teamPicks.length > 0 ? Math.round(totalBST / teamPicks.length) : 0,
        avgCost: teamPicks.length > 0 ? Math.round(totalCost / teamPicks.length) : 0,
        budgetRemaining: team.budgetRemaining,
        pickCount: teamPicks.length,
        typeDistribution
      }
    })

    // Calculate global type distribution
    const globalTypeDistribution: Record<string, number> = {}
    picks.forEach(pick => {
      const pokemon = pokemonMap.get(pick.pokemonId)
      if (pokemon) {
        pokemon.types.forEach(type => {
          globalTypeDistribution[type.name] = (globalTypeDistribution[type.name] || 0) + 1
        })
      }
    })

    const typeDistribution = Object.entries(globalTypeDistribution)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)

    // Calculate most picked Pokemon (track duplicates if any)
    const pokemonPickCount: Record<string, { id: string; name: string; count: number }> = {}
    picks.forEach(pick => {
      if (!pokemonPickCount[pick.pokemonId]) {
        pokemonPickCount[pick.pokemonId] = {
          id: pick.pokemonId,
          name: pick.pokemonName,
          count: 0
        }
      }
      pokemonPickCount[pick.pokemonId].count++
    })

    const mostPicked = Object.values(pokemonPickCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(p => ({ id: p.id, name: p.name, pickCount: p.count }))

    // Calculate average cost
    const totalCost = picks.reduce((sum, pick) => sum + pick.cost, 0)
    const averageCost = picks.length > 0 ? Math.round(totalCost / picks.length) : 0

    return {
      teams: teamStats,
      typeDistribution,
      mostPicked,
      averageCost,
      totalPicks: picks.length,
      currentRound: draft?.currentRound || 0
    }
  }, [teams, picks, draft, picksByTeamId, pokemonMap])
}
