import { Pokemon, Pick, Team } from '@/types'

export interface TeamStats {
  teamId: string
  teamName: string
  totalPokemon: number
  budgetUsed: number
  budgetRemaining: number

  // Type coverage
  typeDistribution: Record<string, number>
  typeCount: number
  uniqueTypes: string[]

  // Stats analysis
  avgHP: number
  avgAttack: number
  avgDefense: number
  avgSpecialAttack: number
  avgSpecialDefense: number
  avgSpeed: number
  avgBST: number
  totalBST: number

  // Strengths & Weaknesses
  strongestStat: { stat: string; value: number }
  weakestStat: { stat: string; value: number }
  mostExpensivePick: { pokemon: string; cost: number } | null
  cheapestPick: { pokemon: string; cost: number } | null

  // Legendary/Mythical count
  legendaryCount: number
  mythicalCount: number

  // Abilities
  uniqueAbilities: string[]
  abilityCount: number
}

export interface TeamComparison {
  team1: TeamStats
  team2: TeamStats
  comparison: {
    budgetDifference: number
    bstDifference: number
    typeAdvantage: {
      team1HasAdvantage: boolean
      advantageTypes: string[]
    }
    statComparison: {
      hp: number
      attack: number
      defense: number
      specialAttack: number
      specialDefense: number
      speed: number
    }
    diversityComparison: {
      team1TypeDiversity: number
      team2TypeDiversity: number
      moreDiverse: 1 | 2 | 'tie'
    }
  }
}

/**
 * Calculates comprehensive statistics for a team
 */
export function calculateTeamStats(
  team: Team,
  picks: Pick[],
  allPokemon: Pokemon[]
): TeamStats {
  const teamPicks = picks.filter(p => p.teamId === team.id)
  const pokemonDetails = teamPicks.map(pick =>
    allPokemon.find(p => p.id === pick.pokemonId)
  ).filter(Boolean) as Pokemon[]

  if (pokemonDetails.length === 0) {
    return getEmptyTeamStats(team)
  }

  // Type distribution
  const typeDistribution: Record<string, number> = {}
  const allTypes: string[] = []
  pokemonDetails.forEach(p => {
    p.types.forEach(t => {
      typeDistribution[t.name] = (typeDistribution[t.name] || 0) + 1
      allTypes.push(t.name)
    })
  })

  // Stats calculations
  const totalHP = pokemonDetails.reduce((sum, p) => sum + p.stats.hp, 0)
  const totalAttack = pokemonDetails.reduce((sum, p) => sum + p.stats.attack, 0)
  const totalDefense = pokemonDetails.reduce((sum, p) => sum + p.stats.defense, 0)
  const totalSpAtk = pokemonDetails.reduce((sum, p) => sum + p.stats.specialAttack, 0)
  const totalSpDef = pokemonDetails.reduce((sum, p) => sum + p.stats.specialDefense, 0)
  const totalSpeed = pokemonDetails.reduce((sum, p) => sum + p.stats.speed, 0)
  const totalBST = pokemonDetails.reduce((sum, p) => sum + p.stats.total, 0)

  const count = pokemonDetails.length

  const avgStats = {
    hp: Math.round(totalHP / count),
    attack: Math.round(totalAttack / count),
    defense: Math.round(totalDefense / count),
    specialAttack: Math.round(totalSpAtk / count),
    specialDefense: Math.round(totalSpDef / count),
    speed: Math.round(totalSpeed / count)
  }

  // Find strongest and weakest stats
  const statEntries = Object.entries(avgStats)
  const strongest = statEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max)
  const weakest = statEntries.reduce((min, curr) => curr[1] < min[1] ? curr : min)

  // Pick analysis
  const pickCosts = teamPicks.map(p => ({ pokemon: p.pokemonName, cost: p.cost }))
  const mostExpensive = pickCosts.length > 0
    ? pickCosts.reduce((max, curr) => curr.cost > max.cost ? curr : max)
    : null
  const cheapest = pickCosts.length > 0
    ? pickCosts.reduce((min, curr) => curr.cost < min.cost ? curr : min)
    : null

  // Legendary/Mythical count
  const legendaryCount = pokemonDetails.filter(p => p.isLegendary).length
  const mythicalCount = pokemonDetails.filter(p => p.isMythical).length

  // Abilities
  const allAbilities = pokemonDetails.flatMap(p => p.abilities)
  const uniqueAbilities = [...new Set(allAbilities)]

  return {
    teamId: team.id,
    teamName: team.name,
    totalPokemon: count,
    budgetUsed: teamPicks.reduce((sum, p) => sum + p.cost, 0),
    budgetRemaining: team.budgetRemaining,

    typeDistribution,
    typeCount: allTypes.length,
    uniqueTypes: Object.keys(typeDistribution),

    avgHP: avgStats.hp,
    avgAttack: avgStats.attack,
    avgDefense: avgStats.defense,
    avgSpecialAttack: avgStats.specialAttack,
    avgSpecialDefense: avgStats.specialDefense,
    avgSpeed: avgStats.speed,
    avgBST: Math.round(totalBST / count),
    totalBST,

    strongestStat: { stat: strongest[0], value: strongest[1] },
    weakestStat: { stat: weakest[0], value: weakest[1] },
    mostExpensivePick: mostExpensive,
    cheapestPick: cheapest,

    legendaryCount,
    mythicalCount,

    uniqueAbilities,
    abilityCount: allAbilities.length
  }
}

/**
 * Compares two teams head-to-head
 */
export function compareTeams(stats1: TeamStats, stats2: TeamStats): TeamComparison {
  const budgetDifference = stats1.budgetUsed - stats2.budgetUsed
  const bstDifference = stats1.totalBST - stats2.totalBST

  // Type diversity comparison
  const diversity1 = stats1.uniqueTypes.length / stats1.totalPokemon
  const diversity2 = stats2.uniqueTypes.length / stats2.totalPokemon
  const moreDiverse = diversity1 > diversity2 ? 1 : diversity2 > diversity1 ? 2 : 'tie' as const

  return {
    team1: stats1,
    team2: stats2,
    comparison: {
      budgetDifference,
      bstDifference,
      typeAdvantage: {
        team1HasAdvantage: false, // This would require type effectiveness matrix
        advantageTypes: []
      },
      statComparison: {
        hp: stats1.avgHP - stats2.avgHP,
        attack: stats1.avgAttack - stats2.avgAttack,
        defense: stats1.avgDefense - stats2.avgDefense,
        specialAttack: stats1.avgSpecialAttack - stats2.avgSpecialAttack,
        specialDefense: stats1.avgSpecialDefense - stats2.avgSpecialDefense,
        speed: stats1.avgSpeed - stats2.avgSpeed
      },
      diversityComparison: {
        team1TypeDiversity: diversity1,
        team2TypeDiversity: diversity2,
        moreDiverse
      }
    }
  }
}

/**
 * Returns empty stats for a team with no picks
 */
function getEmptyTeamStats(team: Team): TeamStats {
  return {
    teamId: team.id,
    teamName: team.name,
    totalPokemon: 0,
    budgetUsed: 0,
    budgetRemaining: team.budgetRemaining,

    typeDistribution: {},
    typeCount: 0,
    uniqueTypes: [],

    avgHP: 0,
    avgAttack: 0,
    avgDefense: 0,
    avgSpecialAttack: 0,
    avgSpecialDefense: 0,
    avgSpeed: 0,
    avgBST: 0,
    totalBST: 0,

    strongestStat: { stat: 'none', value: 0 },
    weakestStat: { stat: 'none', value: 0 },
    mostExpensivePick: null,
    cheapestPick: null,

    legendaryCount: 0,
    mythicalCount: 0,

    uniqueAbilities: [],
    abilityCount: 0
  }
}

/**
 * Analyzes team weaknesses based on type coverage
 */
export function analyzeTeamWeaknesses(teamStats: TeamStats): {
  weakToTypes: string[]
  resistantToTypes: string[]
  immuneToTypes: string[]
} {
  // This is a simplified analysis
  // A full implementation would use the complete type effectiveness chart
  const typeWeaknesses: Record<string, string[]> = {
    fire: ['water', 'ground', 'rock'],
    water: ['electric', 'grass'],
    grass: ['fire', 'ice', 'poison', 'flying', 'bug'],
    electric: ['ground'],
    // Add more type matchups as needed
  }

  const weaknesses = new Set<string>()

  teamStats.uniqueTypes.forEach(type => {
    const weak = typeWeaknesses[type.toLowerCase()] || []
    weak.forEach(w => weaknesses.add(w))
  })

  return {
    weakToTypes: Array.from(weaknesses),
    resistantToTypes: [], // Would calculate based on resistances
    immuneToTypes: [] // Would calculate based on immunities
  }
}

/**
 * Generates a team rating (0-100)
 */
export function rateTeam(stats: TeamStats): {
  overall: number
  breakdown: {
    offense: number
    defense: number
    speed: number
    diversity: number
    value: number // Budget efficiency
  }
} {
  // Offense rating (0-100)
  const offense = Math.min(100, ((stats.avgAttack + stats.avgSpecialAttack) / 2 / 255) * 100)

  // Defense rating (0-100)
  const defense = Math.min(100, ((stats.avgDefense + stats.avgSpecialDefense + stats.avgHP) / 3 / 255) * 100)

  // Speed rating (0-100)
  const speed = Math.min(100, (stats.avgSpeed / 255) * 100)

  // Diversity rating (0-100)
  const diversity = Math.min(100, (stats.uniqueTypes.length / 18) * 100)

  // Value rating (0-100) - BST per budget point
  const bstPerCost = stats.budgetUsed > 0 ? stats.totalBST / stats.budgetUsed : 0
  const value = Math.min(100, (bstPerCost / 50) * 100) // Assuming ~50 BST per point is good value

  // Overall rating
  const overall = Math.round((offense * 0.25 + defense * 0.25 + speed * 0.2 + diversity * 0.15 + value * 0.15))

  return {
    overall,
    breakdown: {
      offense: Math.round(offense),
      defense: Math.round(defense),
      speed: Math.round(speed),
      diversity: Math.round(diversity),
      value: Math.round(value)
    }
  }
}
