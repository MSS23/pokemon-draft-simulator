/**
 * Type effectiveness calculations for Pokemon battles
 * Based on Generation 9 type chart
 */

export type PokemonTypeName =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy'

export const TYPE_CHART: Record<PokemonTypeName, {
  weakTo: PokemonTypeName[]
  resistsTo: PokemonTypeName[]
  immuneTo: PokemonTypeName[]
}> = {
  normal: {
    weakTo: ['fighting'],
    resistsTo: [],
    immuneTo: ['ghost']
  },
  fire: {
    weakTo: ['water', 'ground', 'rock'],
    resistsTo: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'],
    immuneTo: []
  },
  water: {
    weakTo: ['electric', 'grass'],
    resistsTo: ['fire', 'water', 'ice', 'steel'],
    immuneTo: []
  },
  electric: {
    weakTo: ['ground'],
    resistsTo: ['electric', 'flying', 'steel'],
    immuneTo: []
  },
  grass: {
    weakTo: ['fire', 'ice', 'poison', 'flying', 'bug'],
    resistsTo: ['water', 'electric', 'grass', 'ground'],
    immuneTo: []
  },
  ice: {
    weakTo: ['fire', 'fighting', 'rock', 'steel'],
    resistsTo: ['ice'],
    immuneTo: []
  },
  fighting: {
    weakTo: ['flying', 'psychic', 'fairy'],
    resistsTo: ['bug', 'rock', 'dark'],
    immuneTo: []
  },
  poison: {
    weakTo: ['ground', 'psychic'],
    resistsTo: ['grass', 'fighting', 'poison', 'bug', 'fairy'],
    immuneTo: []
  },
  ground: {
    weakTo: ['water', 'grass', 'ice'],
    resistsTo: ['poison', 'rock'],
    immuneTo: ['electric']
  },
  flying: {
    weakTo: ['electric', 'ice', 'rock'],
    resistsTo: ['grass', 'fighting', 'bug'],
    immuneTo: ['ground']
  },
  psychic: {
    weakTo: ['bug', 'ghost', 'dark'],
    resistsTo: ['fighting', 'psychic'],
    immuneTo: []
  },
  bug: {
    weakTo: ['fire', 'flying', 'rock'],
    resistsTo: ['grass', 'fighting', 'ground'],
    immuneTo: []
  },
  rock: {
    weakTo: ['water', 'grass', 'fighting', 'ground', 'steel'],
    resistsTo: ['normal', 'fire', 'poison', 'flying'],
    immuneTo: []
  },
  ghost: {
    weakTo: ['ghost', 'dark'],
    resistsTo: ['poison', 'bug'],
    immuneTo: ['normal', 'fighting']
  },
  dragon: {
    weakTo: ['ice', 'dragon', 'fairy'],
    resistsTo: ['fire', 'water', 'electric', 'grass'],
    immuneTo: []
  },
  dark: {
    weakTo: ['fighting', 'bug', 'fairy'],
    resistsTo: ['ghost', 'dark'],
    immuneTo: ['psychic']
  },
  steel: {
    weakTo: ['fire', 'fighting', 'ground'],
    resistsTo: ['normal', 'grass', 'ice', 'flying', 'psychic', 'bug', 'rock', 'dragon', 'steel', 'fairy'],
    immuneTo: ['poison']
  },
  fairy: {
    weakTo: ['poison', 'steel'],
    resistsTo: ['fighting', 'bug', 'dark'],
    immuneTo: ['dragon']
  }
}

/**
 * Calculate type effectiveness multiplier
 */
export function getTypeEffectiveness(
  attackingType: PokemonTypeName,
  defendingTypes: PokemonTypeName[]
): number {
  let multiplier = 1

  defendingTypes.forEach(defType => {
    const defenseChart = TYPE_CHART[defType]

    if (defenseChart.immuneTo.includes(attackingType)) {
      multiplier = 0
    } else if (defenseChart.weakTo.includes(attackingType)) {
      multiplier *= 2
    } else if (defenseChart.resistsTo.includes(attackingType)) {
      multiplier *= 0.5
    }
  })

  return multiplier
}

/**
 * Get all weaknesses for a Pokemon (types that deal 2x+ damage)
 */
export function getWeaknesses(types: PokemonTypeName[]): PokemonTypeName[] {
  const weaknesses = new Set<PokemonTypeName>()

  Object.keys(TYPE_CHART).forEach(attackType => {
    const effectiveness = getTypeEffectiveness(
      attackType as PokemonTypeName,
      types
    )
    if (effectiveness >= 2) {
      weaknesses.add(attackType as PokemonTypeName)
    }
  })

  return Array.from(weaknesses)
}

/**
 * Get all resistances for a Pokemon (types that deal 0.5x or 0x damage)
 */
export function getResistances(types: PokemonTypeName[]): PokemonTypeName[] {
  const resistances = new Set<PokemonTypeName>()

  Object.keys(TYPE_CHART).forEach(attackType => {
    const effectiveness = getTypeEffectiveness(
      attackType as PokemonTypeName,
      types
    )
    if (effectiveness > 0 && effectiveness <= 0.5) {
      resistances.add(attackType as PokemonTypeName)
    }
  })

  return Array.from(resistances)
}

/**
 * Get immunities for a Pokemon (types that deal 0x damage)
 */
export function getImmunities(types: PokemonTypeName[]): PokemonTypeName[] {
  const immunities = new Set<PokemonTypeName>()

  Object.keys(TYPE_CHART).forEach(attackType => {
    const effectiveness = getTypeEffectiveness(
      attackType as PokemonTypeName,
      types
    )
    if (effectiveness === 0) {
      immunities.add(attackType as PokemonTypeName)
    }
  })

  return Array.from(immunities)
}

/**
 * Analyze team type coverage
 * Returns map of attacking types to coverage quality
 */
export interface TypeCoverage {
  type: PokemonTypeName
  count: number // Number of Pokemon that can hit this type
  quality: 'excellent' | 'good' | 'poor' | 'none'
}

export function analyzeTeamTypeCoverage(
  teamPokemon: Array<{ types: Array<{ name: string }> }>
): TypeCoverage[] {
  const allTypes = Object.keys(TYPE_CHART) as PokemonTypeName[]
  const coverage: Record<PokemonTypeName, number> = {} as any

  // Initialize
  allTypes.forEach(type => {
    coverage[type] = 0
  })

  // Count how many Pokemon on team can hit each type effectively
  teamPokemon.forEach(pokemon => {
    const pokemonTypes = pokemon.types.map(t => t.name.toLowerCase() as PokemonTypeName)

    // Each type this Pokemon has can hit certain types super-effectively
    pokemonTypes.forEach(ownType => {
      allTypes.forEach(targetType => {
        const effectiveness = getTypeEffectiveness(ownType, [targetType])
        if (effectiveness >= 2) {
          coverage[targetType]++
        }
      })
    })
  })

  // Convert to coverage array with quality rating
  return allTypes.map(type => {
    const count = coverage[type]
    let quality: TypeCoverage['quality']

    if (count === 0) {
      quality = 'none'
    } else if (count <= 1) {
      quality = 'poor'
    } else if (count <= 2) {
      quality = 'good'
    } else {
      quality = 'excellent'
    }

    return { type, count, quality }
  }).sort((a, b) => b.count - a.count)
}
