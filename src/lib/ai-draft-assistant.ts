/**
 * AI-Powered Draft Assistant
 * Provides intelligent pick recommendations based on:
 * - Team composition analysis
 * - Type coverage optimization
 * - Budget management
 * - Meta-game considerations
 * - Opponent team analysis
 */

import type { Pokemon, Team, Draft, Format } from '@/types'

export interface PickRecommendation {
  pokemon: Pokemon
  score: number
  reasoning: {
    primary: string
    factors: {
      typeCoverage: number
      budgetValue: number
      statBalance: number
      synergy: number
      counterPicks: number
    }
  }
  tags: string[]
}

export interface AssistantAnalysis {
  recommendations: PickRecommendation[]
  teamNeeds: {
    offensiveTypes: string[]
    defensiveTypes: string[]
    statGaps: { stat: string; priority: 'high' | 'medium' | 'low' }[]
    roleGaps: string[]
  }
  budgetStrategy: {
    remainingBudget: number
    remainingPicks: number
    suggestedBudgetPerPick: number
    canAffordExpensive: boolean
  }
  opponentAnalysis: {
    commonWeaknesses: string[]
    threatPokemon: { name: string; threat: number }[]
    suggectedCounters: string[]
  }
}

/**
 * Type effectiveness chart
 */
const TYPE_EFFECTIVENESS: Record<string, { strong: string[]; weak: string[] }> = {
  normal: { strong: [], weak: ['fighting'] },
  fire: { strong: ['grass', 'ice', 'bug', 'steel'], weak: ['water', 'ground', 'rock'] },
  water: { strong: ['fire', 'ground', 'rock'], weak: ['electric', 'grass'] },
  electric: { strong: ['water', 'flying'], weak: ['ground'] },
  grass: { strong: ['water', 'ground', 'rock'], weak: ['fire', 'ice', 'poison', 'flying', 'bug'] },
  ice: { strong: ['grass', 'ground', 'flying', 'dragon'], weak: ['fire', 'fighting', 'rock', 'steel'] },
  fighting: { strong: ['normal', 'ice', 'rock', 'dark', 'steel'], weak: ['flying', 'psychic', 'fairy'] },
  poison: { strong: ['grass', 'fairy'], weak: ['ground', 'psychic'] },
  ground: { strong: ['fire', 'electric', 'poison', 'rock', 'steel'], weak: ['water', 'grass', 'ice'] },
  flying: { strong: ['grass', 'fighting', 'bug'], weak: ['electric', 'ice', 'rock'] },
  psychic: { strong: ['fighting', 'poison'], weak: ['bug', 'ghost', 'dark'] },
  bug: { strong: ['grass', 'psychic', 'dark'], weak: ['fire', 'flying', 'rock'] },
  rock: { strong: ['fire', 'ice', 'flying', 'bug'], weak: ['water', 'grass', 'fighting', 'ground', 'steel'] },
  ghost: { strong: ['psychic', 'ghost'], weak: ['ghost', 'dark'] },
  dragon: { strong: ['dragon'], weak: ['ice', 'dragon', 'fairy'] },
  dark: { strong: ['psychic', 'ghost'], weak: ['fighting', 'bug', 'fairy'] },
  steel: { strong: ['ice', 'rock', 'fairy'], weak: ['fire', 'fighting', 'ground'] },
  fairy: { strong: ['fighting', 'dragon', 'dark'], weak: ['poison', 'steel'] },
}

/**
 * Pokemon roles based on stats
 */
export function classifyRole(pokemon: Pokemon): string[] {
  const roles: string[] = []
  const stats = pokemon.stats

  const totalOffense = stats.attack + stats.specialAttack
  const totalDefense = stats.defense + stats.specialDefense + stats.hp

  if (stats.speed >= 100) roles.push('Speed Sweeper')
  if (stats.attack >= 120) roles.push('Physical Attacker')
  if (stats.specialAttack >= 120) roles.push('Special Attacker')
  if (totalDefense >= 300) roles.push('Tank')
  if (stats.hp >= 100 && totalDefense >= 250) roles.push('Wall')
  if (totalOffense >= 200 && stats.speed >= 80) roles.push('Mixed Attacker')
  if (stats.speed <= 50 && totalDefense >= 250) roles.push('Trick Room')

  // Balanced
  if (roles.length === 0) roles.push('Balanced')

  return roles
}

/**
 * Calculate type coverage score
 */
function calculateTypeCoverage(
  pokemon: Pokemon,
  currentTeam: Pokemon[],
  availablePokemon: Pokemon[]
): number {
  let score = 0
  const teamTypes = new Set(currentTeam.flatMap(p => p.types))
  const teamTypeNames = new Set(currentTeam.flatMap(p => p.types.map(t => typeof t === 'string' ? t : t.name)))
  const pokemonTypes = new Set(pokemon.types)

  // Bonus for new type coverage
  pokemonTypes.forEach(type => {
    if (!teamTypes.has(type)) score += 15
  })

  // Check offensive coverage
  const offensiveTypes = new Set(
    pokemon.moves
      ?.filter(m => m.damageClass !== 'status')
      .map(m => m.type) || []
  )

  // Bonus for diverse offensive coverage
  const uniqueOffensiveTypes = Array.from(offensiveTypes).filter(
    type => !teamTypeNames.has(type)
  )
  score += uniqueOffensiveTypes.length * 10

  // Check if this Pokemon covers team weaknesses
  const teamWeaknesses = calculateTeamWeaknesses(currentTeam)
  pokemon.types.forEach(defenseType => {
    const typeName = typeof defenseType === 'string' ? defenseType : defenseType.name
    const resistances = TYPE_EFFECTIVENESS[typeName]?.strong || []
    teamWeaknesses.forEach(weakness => {
      if (resistances.includes(weakness)) score += 20
    })
  })

  return Math.min(score, 100)
}

/**
 * Calculate team weaknesses
 */
function calculateTeamWeaknesses(team: Pokemon[]): string[] {
  const weaknessCount: Record<string, number> = {}

  team.forEach(pokemon => {
    pokemon.types.forEach(type => {
      const typeName = typeof type === 'string' ? type : type.name
      const weaknesses = TYPE_EFFECTIVENESS[typeName]?.weak || []
      weaknesses.forEach(weakness => {
        weaknessCount[weakness] = (weaknessCount[weakness] || 0) + 1
      })
    })
  })

  return Object.entries(weaknessCount)
    .filter(([_, count]) => count >= 2)
    .map(([type]) => type)
}

/**
 * Calculate budget value score
 */
function calculateBudgetValue(
  pokemon: Pokemon,
  remainingBudget: number,
  remainingPicks: number
): number {
  const cost = pokemon.cost || 0
  const bst = pokemon.stats.hp + pokemon.stats.attack + pokemon.stats.defense +
              pokemon.stats.specialAttack + pokemon.stats.specialDefense + pokemon.stats.speed

  // BST per cost point
  const efficiency = cost > 0 ? bst / cost : bst

  // Can we afford it?
  if (cost > remainingBudget) return 0

  // Is it good value?
  const avgBudgetPerPick = remainingBudget / remainingPicks

  let score = 50

  // Reward good efficiency
  if (efficiency >= 20) score += 30
  else if (efficiency >= 15) score += 20
  else if (efficiency >= 10) score += 10

  // Adjust for budget position
  if (remainingPicks > 3 && cost < avgBudgetPerPick * 0.7) {
    score += 15 // Good to save budget early
  } else if (remainingPicks <= 2 && cost < avgBudgetPerPick * 0.5) {
    score -= 10 // Don't be too cheap at the end
  }

  return Math.min(score, 100)
}

/**
 * Calculate stat balance score
 */
function calculateStatBalance(pokemon: Pokemon, currentTeam: Pokemon[]): number {
  if (currentTeam.length === 0) return 70 // First pick doesn't need balance

  const teamAvg = {
    hp: 0,
    attack: 0,
    defense: 0,
    specialAttack: 0,
    specialDefense: 0,
    speed: 0,
  }

  currentTeam.forEach(p => {
    teamAvg.hp += p.stats.hp
    teamAvg.attack += p.stats.attack
    teamAvg.defense += p.stats.defense
    teamAvg.specialAttack += p.stats.specialAttack
    teamAvg.specialDefense += p.stats.specialDefense
    teamAvg.speed += p.stats.speed
  })

  const count = currentTeam.length
  Object.keys(teamAvg).forEach(key => {
    teamAvg[key as keyof typeof teamAvg] /= count
  })

  let score = 50

  // Identify weak stats
  if (teamAvg.speed < 80 && pokemon.stats.speed >= 100) score += 20
  if (teamAvg.attack < 90 && pokemon.stats.attack >= 110) score += 15
  if (teamAvg.specialAttack < 90 && pokemon.stats.specialAttack >= 110) score += 15
  if (teamAvg.defense < 80 && pokemon.stats.defense >= 100) score += 10
  if (teamAvg.specialDefense < 80 && pokemon.stats.specialDefense >= 100) score += 10
  if (teamAvg.hp < 85 && pokemon.stats.hp >= 100) score += 10

  return Math.min(score, 100)
}

/**
 * Calculate synergy score
 */
function calculateSynergy(pokemon: Pokemon, currentTeam: Pokemon[]): number {
  if (currentTeam.length === 0) return 60

  let score = 50

  const roles = classifyRole(pokemon)
  const teamRoles = new Set(currentTeam.flatMap(p => classifyRole(p)))

  // Bonus for diverse roles
  roles.forEach(role => {
    if (!teamRoles.has(role)) score += 10
  })

  // Check for speed tiers
  const teamSpeeds = currentTeam.map(p => p.stats.speed).sort((a, b) => b - a)
  const pokemonSpeed = pokemon.stats.speed

  // Bonus for filling speed gaps
  if (teamSpeeds.length > 0) {
    const fastest = teamSpeeds[0]
    const slowest = teamSpeeds[teamSpeeds.length - 1]

    if (pokemonSpeed > fastest + 20) score += 10
    if (pokemonSpeed < slowest - 20 && slowest < 60) score += 10
    if (pokemonSpeed > 60 && pokemonSpeed < 100 && !teamSpeeds.some(s => s > 60 && s < 100)) {
      score += 15 // Mid-speed tier
    }
  }

  // Check ability synergies (basic check)
  const hasWeatherSetter = currentTeam.some(p =>
    p.abilities?.some(a => ['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning'].includes(a))
  )
  const benefitsFromWeather = pokemon.abilities?.some(a =>
    ['Swift Swim', 'Chlorophyll', 'Sand Rush', 'Slush Rush'].includes(a)
  )

  if (hasWeatherSetter && benefitsFromWeather) score += 20

  return Math.min(score, 100)
}

/**
 * Calculate counter-pick score
 */
function calculateCounterPicks(
  pokemon: Pokemon,
  opponentTeams: Team[]
): number {
  // TODO: Implement counter picks calculation by looking up opponent Pokemon
  // Currently returning default score as Pick objects don't include full Pokemon data
  return 50
}

/**
 * Generate pick recommendations
 */
export function generateRecommendations(
  availablePokemon: Pokemon[],
  currentTeam: Pokemon[],
  opponentTeams: Team[],
  remainingBudget: number,
  remainingPicks: number,
  format: Format
): PickRecommendation[] {
  const recommendations: PickRecommendation[] = []

  availablePokemon
    .filter(p => (p.cost || 0) <= remainingBudget)
    .forEach(pokemon => {
      const factors = {
        typeCoverage: calculateTypeCoverage(pokemon, currentTeam, availablePokemon),
        budgetValue: calculateBudgetValue(pokemon, remainingBudget, remainingPicks),
        statBalance: calculateStatBalance(pokemon, currentTeam),
        synergy: calculateSynergy(pokemon, currentTeam),
        counterPicks: calculateCounterPicks(pokemon, opponentTeams),
      }

      // Weighted score calculation
      const weights = {
        typeCoverage: 0.25,
        budgetValue: 0.20,
        statBalance: 0.20,
        synergy: 0.20,
        counterPicks: 0.15,
      }

      const score =
        factors.typeCoverage * weights.typeCoverage +
        factors.budgetValue * weights.budgetValue +
        factors.statBalance * weights.statBalance +
        factors.synergy * weights.synergy +
        factors.counterPicks * weights.counterPicks

      // Generate reasoning
      const reasoning = generateReasoning(pokemon, factors, currentTeam)

      // Generate tags
      const tags = generateTags(pokemon, factors, currentTeam)

      recommendations.push({
        pokemon,
        score: Math.round(score),
        reasoning: {
          primary: reasoning,
          factors,
        },
        tags,
      })
    })

  // Sort by score descending
  return recommendations.sort((a, b) => b.score - a.score).slice(0, 10)
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  pokemon: Pokemon,
  factors: PickRecommendation['reasoning']['factors'],
  currentTeam: Pokemon[]
): string {
  const reasons: string[] = []

  if (factors.typeCoverage >= 70) {
    reasons.push('excellent type coverage')
  }
  if (factors.budgetValue >= 70) {
    reasons.push('great budget value')
  }
  if (factors.statBalance >= 70) {
    reasons.push('fills stat gaps in team')
  }
  if (factors.synergy >= 70) {
    reasons.push('strong synergy with current picks')
  }
  if (factors.counterPicks >= 70) {
    reasons.push('counters multiple opponent Pokemon')
  }

  if (reasons.length === 0) {
    return 'Solid all-around pick'
  }

  const primary = reasons[0]
  return primary.charAt(0).toUpperCase() + primary.slice(1)
}

/**
 * Generate tags for quick scanning
 */
function generateTags(
  pokemon: Pokemon,
  factors: PickRecommendation['reasoning']['factors'],
  currentTeam: Pokemon[]
): string[] {
  const tags: string[] = []
  const roles = classifyRole(pokemon)

  // Add primary role
  if (roles.length > 0) tags.push(roles[0])

  // Add value tags
  if (factors.budgetValue >= 80) tags.push('Great Value')
  if (factors.budgetValue <= 30) tags.push('Expensive')

  // Add coverage tags
  if (factors.typeCoverage >= 80) tags.push('Coverage')
  if (factors.counterPicks >= 70) tags.push('Counter Pick')

  // Add synergy tags
  if (factors.synergy >= 80) tags.push('High Synergy')

  // Add stat tags
  if (pokemon.stats.speed >= 110) tags.push('Fast')
  if (pokemon.stats.speed <= 50) tags.push('Trick Room')

  const bst = pokemon.stats.hp + pokemon.stats.attack + pokemon.stats.defense +
              pokemon.stats.specialAttack + pokemon.stats.specialDefense + pokemon.stats.speed
  if (bst >= 600) tags.push('Legendary Stats')

  return tags.slice(0, 4)
}

/**
 * Generate full assistant analysis
 */
export function generateAssistantAnalysis(
  availablePokemon: Pokemon[],
  currentTeam: Pokemon[],
  opponentTeams: Team[],
  remainingBudget: number,
  remainingPicks: number,
  format: Format
): AssistantAnalysis {
  const recommendations = generateRecommendations(
    availablePokemon,
    currentTeam,
    opponentTeams,
    remainingBudget,
    remainingPicks,
    format
  )

  // Analyze team needs
  const teamWeaknesses = calculateTeamWeaknesses(currentTeam)
  const teamRoles = new Set(currentTeam.flatMap(p => classifyRole(p)))

  const allRoles = ['Speed Sweeper', 'Physical Attacker', 'Special Attacker', 'Tank', 'Wall', 'Mixed Attacker']
  const roleGaps = allRoles.filter(role => !teamRoles.has(role))

  // Calculate stat gaps
  const statGaps = calculateStatGaps(currentTeam)

  // Budget strategy
  const suggestedBudgetPerPick = remainingPicks > 0 ? remainingBudget / remainingPicks : 0
  const canAffordExpensive = remainingBudget >= 25 && remainingPicks >= 2

  // Opponent analysis
  const opponentAnalysis = analyzeOpponents(opponentTeams)

  return {
    recommendations,
    teamNeeds: {
      offensiveTypes: identifyNeededTypes(currentTeam, 'offense'),
      defensiveTypes: identifyNeededTypes(currentTeam, 'defense'),
      statGaps,
      roleGaps,
    },
    budgetStrategy: {
      remainingBudget,
      remainingPicks,
      suggestedBudgetPerPick,
      canAffordExpensive,
    },
    opponentAnalysis,
  }
}

/**
 * Calculate stat gaps
 */
function calculateStatGaps(team: Pokemon[]): { stat: string; priority: 'high' | 'medium' | 'low' }[] {
  if (team.length === 0) return []

  const avgStats = {
    hp: team.reduce((sum, p) => sum + p.stats.hp, 0) / team.length,
    attack: team.reduce((sum, p) => sum + p.stats.attack, 0) / team.length,
    defense: team.reduce((sum, p) => sum + p.stats.defense, 0) / team.length,
    specialAttack: team.reduce((sum, p) => sum + p.stats.specialAttack, 0) / team.length,
    specialDefense: team.reduce((sum, p) => sum + p.stats.specialDefense, 0) / team.length,
    speed: team.reduce((sum, p) => sum + p.stats.speed, 0) / team.length,
  }

  const gaps: { stat: string; priority: 'high' | 'medium' | 'low' }[] = []

  Object.entries(avgStats).forEach(([stat, value]) => {
    if (value < 70) {
      gaps.push({ stat, priority: 'high' })
    } else if (value < 85) {
      gaps.push({ stat, priority: 'medium' })
    } else if (value < 95) {
      gaps.push({ stat, priority: 'low' })
    }
  })

  return gaps
}

/**
 * Identify needed types
 */
function identifyNeededTypes(team: Pokemon[], category: 'offense' | 'defense'): string[] {
  const existingTypes = new Set(team.flatMap(p => p.types))
  const allTypes = Object.keys(TYPE_EFFECTIVENESS)

  if (category === 'offense') {
    // Find types we can't hit super effectively
    const covered = new Set<string>()
    team.forEach(p => {
      p.moves?.forEach(m => {
        const superEffective = TYPE_EFFECTIVENESS[m.type]?.strong || []
        superEffective.forEach(t => covered.add(t))
      })
    })

    return allTypes.filter(t => !covered.has(t)).slice(0, 5)
  } else {
    // Find types we lack defensive coverage for
    const weaknesses = calculateTeamWeaknesses(team)
    return weaknesses.slice(0, 5)
  }
}

/**
 * Analyze opponents
 */
function analyzeOpponents(opponentTeams: Team[]): AssistantAnalysis['opponentAnalysis'] {
  const weaknessCount: Record<string, number> = {}
  const threatPokemon: { name: string; threat: number }[] = []

  // TODO: Implement opponent analysis - currently picks don't include full Pokemon data
  // opponentTeams.forEach(team => {
  //   team.picks?.forEach(pick => {
  //     // Would need to look up Pokemon by pick.pokemonId from availablePokemon
  //   })
  // })

  const commonWeaknesses = Object.entries(weaknessCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type)

  const topThreats = threatPokemon
    .sort((a, b) => b.threat - a.threat)
    .slice(0, 5)

  // Suggest counter types
  const suggectedCounters = Array.from(new Set(
    commonWeaknesses.flatMap(weakness =>
      Object.entries(TYPE_EFFECTIVENESS)
        .filter(([_, data]) => data.strong.includes(weakness))
        .map(([type]) => type)
    )
  )).slice(0, 5)

  return {
    commonWeaknesses,
    threatPokemon: topThreats,
    suggectedCounters,
  }
}

/**
 * Get quick pick suggestion
 */
export function getQuickSuggestion(
  availablePokemon: Pokemon[],
  currentTeam: Pokemon[],
  remainingBudget: number
): Pokemon | null {
  const recommendations = generateRecommendations(
    availablePokemon,
    currentTeam,
    [],
    remainingBudget,
    1,
    {} as Format
  )

  return recommendations[0]?.pokemon || null
}
