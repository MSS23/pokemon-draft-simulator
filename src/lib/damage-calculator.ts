/**
 * Pokemon Damage Calculator
 * Calculates damage ranges for moves in Pokemon battles
 * Based on Generation 9 damage formula
 */

import type { Pokemon } from '@/types'

export interface DamageCalcResult {
  minDamage: number
  maxDamage: number
  minPercent: number
  maxPercent: number
  possibleKOs: {
    description: string
    probability: number
  }[]
  isCritical: boolean
  effectiveness: number
  effectivenessText: string
}

export interface CalcOptions {
  attackerLevel?: number
  defenderLevel?: number
  attackerEVs?: {
    attack?: number
    special_attack?: number
  }
  defenderEVs?: {
    hp?: number
    defense?: number
    special_defense?: number
  }
  attackerIVs?: {
    attack?: number
    special_attack?: number
  }
  defenderIVs?: {
    hp?: number
    defense?: number
    special_defense?: number
  }
  attackerNature?: {
    attack?: number // 0.9, 1.0, or 1.1
    special_attack?: number
  }
  defenderNature?: {
    hp?: number
    defense?: number
    special_defense?: number
  }
  isCritical?: boolean
  weatherMultiplier?: number // 1.5 for boosting weather, 0.5 for reducing
  screenMultiplier?: number // 0.5 for Light Screen/Reflect
  otherMultipliers?: number[]
  attackerBoosts?: number // -6 to +6
  defenderBoosts?: number // -6 to +6
}

/**
 * Type effectiveness chart
 */
const TYPE_CHART: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
}

/**
 * Calculate type effectiveness
 */
function getTypeEffectiveness(moveType: string, defenderTypes: string[]): number {
  let multiplier = 1

  defenderTypes.forEach(defType => {
    const effectiveness = TYPE_CHART[moveType]?.[defType] || 1
    multiplier *= effectiveness
  })

  return multiplier
}

/**
 * Get effectiveness text
 */
function getEffectivenessText(multiplier: number): string {
  if (multiplier === 0) return 'No effect'
  if (multiplier < 0.5) return 'Extremely not very effective'
  if (multiplier < 1) return 'Not very effective'
  if (multiplier === 1) return 'Neutral'
  if (multiplier < 4) return 'Super effective'
  return 'Extremely super effective'
}

/**
 * Calculate actual stat from base stat
 */
function calculateStat(
  base: number,
  level: number,
  iv: number,
  ev: number,
  nature: number,
  isHP: boolean = false
): number {
  if (isHP) {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10
  }

  return Math.floor((Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5) * nature)
}

/**
 * Get stage multiplier for stat boosts/drops
 */
function getStageMultiplier(stages: number): number {
  const numerators = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8]
  const denominators = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2]
  const index = stages + 6
  return numerators[index] / denominators[index]
}

/**
 * Calculate damage
 */
export function calculateDamage(
  attacker: Pokemon,
  defender: Pokemon,
  move: {
    type: string
    power: number
    damage_class: 'physical' | 'special' | 'status'
  },
  options: CalcOptions = {}
): DamageCalcResult {
  // Default values
  const {
    attackerLevel = 50,
    defenderLevel = 50,
    attackerEVs = { attack: 252, special_attack: 252 },
    defenderEVs = { hp: 252, defense: 252, special_defense: 252 },
    attackerIVs = { attack: 31, special_attack: 31 },
    defenderIVs = { hp: 31, defense: 31, special_defense: 31 },
    attackerNature = { attack: 1.1, special_attack: 1.1 },
    defenderNature = { hp: 1.0, defense: 1.1, special_defense: 1.1 },
    isCritical = false,
    weatherMultiplier = 1.0,
    screenMultiplier = 1.0,
    otherMultipliers = [],
    attackerBoosts = 0,
    defenderBoosts = 0,
  } = options

  // Status moves don't deal damage
  if (move.damage_class === 'status' || move.power === 0) {
    return {
      minDamage: 0,
      maxDamage: 0,
      minPercent: 0,
      maxPercent: 0,
      possibleKOs: [],
      isCritical,
      effectiveness: 0,
      effectivenessText: 'Status move',
    }
  }

  // Determine if physical or special
  const isPhysical = move.damage_class === 'physical'

  // Calculate attacker's attack stat
  const attackerStat = calculateStat(
    isPhysical ? attacker.stats.attack : attacker.stats.specialAttack,
    attackerLevel,
    isPhysical ? (attackerIVs.attack || 31) : (attackerIVs.special_attack || 31),
    isPhysical ? (attackerEVs.attack || 0) : (attackerEVs.special_attack || 0),
    isPhysical ? (attackerNature.attack || 1.0) : (attackerNature.special_attack || 1.0)
  )

  // Calculate defender's defense stat
  const defenderStat = calculateStat(
    isPhysical ? defender.stats.defense : defender.stats.specialDefense,
    defenderLevel,
    isPhysical ? (defenderIVs.defense || 31) : (defenderIVs.special_defense || 31),
    isPhysical ? (defenderEVs.defense || 0) : (defenderEVs.special_defense || 0),
    isPhysical ? (defenderNature.defense || 1.0) : (defenderNature.special_defense || 1.0)
  )

  // Calculate defender's HP
  const defenderHP = calculateStat(
    defender.stats.hp,
    defenderLevel,
    defenderIVs.hp || 31,
    defenderEVs.hp || 0,
    1.0,
    true
  )

  // Apply stage multipliers
  const attackMultiplier = getStageMultiplier(attackerBoosts)
  const defenseMultiplier = isCritical && defenderBoosts > 0
    ? 1 // Crits ignore positive defense boosts
    : getStageMultiplier(defenderBoosts)

  const effectiveAttack = Math.floor(attackerStat * attackMultiplier)
  const effectiveDefense = Math.floor(defenderStat * defenseMultiplier)

  // Type effectiveness
  const defenderTypeNames = defender.types.map(t => typeof t === 'string' ? t : t.name)
  const effectiveness = getTypeEffectiveness(move.type, defenderTypeNames)

  // STAB (Same Type Attack Bonus)
  const attackerTypeNames = attacker.types.map(t => typeof t === 'string' ? t : t.name)
  const stab = attackerTypeNames.includes(move.type) ? 1.5 : 1

  // Base damage calculation
  const baseDamage = Math.floor(
    (Math.floor((2 * attackerLevel) / 5 + 2) * move.power * effectiveAttack) / effectiveDefense
  )
  const baseDamageWithLevel = Math.floor(baseDamage / 50)

  // Apply modifiers
  let modifier = stab * effectiveness * weatherMultiplier * screenMultiplier
  otherMultipliers.forEach(m => {
    modifier *= m
  })

  if (isCritical) {
    modifier *= 1.5
  }

  // Random roll (85% to 100%)
  const minRoll = 0.85
  const maxRoll = 1.0

  const minDamage = Math.max(1, Math.floor((baseDamageWithLevel + 2) * modifier * minRoll))
  const maxDamage = Math.max(1, Math.floor((baseDamageWithLevel + 2) * modifier * maxRoll))

  const minPercent = (minDamage / defenderHP) * 100
  const maxPercent = (maxDamage / defenderHP) * 100

  // Calculate KO probabilities
  const possibleKOs = calculateKOProbabilities(minDamage, maxDamage, defenderHP)

  return {
    minDamage,
    maxDamage,
    minPercent,
    maxPercent,
    possibleKOs,
    isCritical,
    effectiveness,
    effectivenessText: getEffectivenessText(effectiveness),
  }
}

/**
 * Calculate KO probabilities
 */
function calculateKOProbabilities(
  minDamage: number,
  maxDamage: number,
  defenderHP: number
): DamageCalcResult['possibleKOs'] {
  const kos: DamageCalcResult['possibleKOs'] = []

  // Calculate how many hits to KO
  for (let hits = 1; hits <= 4; hits++) {
    const minTotal = minDamage * hits
    const maxTotal = maxDamage * hits

    if (minTotal >= defenderHP) {
      kos.push({
        description: `Guaranteed ${hits}HKO`,
        probability: 100,
      })
      break
    } else if (maxTotal >= defenderHP) {
      // Calculate probability (simplified - assumes uniform distribution)
      const range = maxDamage - minDamage + 1
      const koRolls = Math.floor(defenderHP / hits) - minDamage + 1
      const probability = Math.min(100, (koRolls / range) * 100)

      kos.push({
        description: `Possible ${hits}HKO`,
        probability: Math.round(probability * 10) / 10,
      })
    }
  }

  if (kos.length === 0 && maxDamage * 4 < defenderHP) {
    kos.push({
      description: '4+ hits to KO',
      probability: 100,
    })
  }

  return kos
}

/**
 * Calculate speed comparison
 */
export function calculateSpeedComparison(
  pokemon1: Pokemon,
  pokemon2: Pokemon,
  options: {
    pokemon1Level?: number
    pokemon2Level?: number
    pokemon1EVs?: number
    pokemon2EVs?: number
    pokemon1IVs?: number
    pokemon2IVs?: number
    pokemon1Nature?: number
    pokemon2Nature?: number
    pokemon1Boosts?: number
    pokemon2Boosts?: number
    pokemon1Modifier?: number // For items like Choice Scarf (1.5x)
    pokemon2Modifier?: number
  } = {}
): {
  faster: Pokemon
  slower: Pokemon
  speed1: number
  speed2: number
  difference: number
} {
  const {
    pokemon1Level = 50,
    pokemon2Level = 50,
    pokemon1EVs = 252,
    pokemon2EVs = 252,
    pokemon1IVs = 31,
    pokemon2IVs = 31,
    pokemon1Nature = 1.1,
    pokemon2Nature = 1.1,
    pokemon1Boosts = 0,
    pokemon2Boosts = 0,
    pokemon1Modifier = 1.0,
    pokemon2Modifier = 1.0,
  } = options

  const speed1Base = calculateStat(
    pokemon1.stats.speed,
    pokemon1Level,
    pokemon1IVs,
    pokemon1EVs,
    pokemon1Nature
  )
  const speed1 = Math.floor(
    speed1Base * getStageMultiplier(pokemon1Boosts) * pokemon1Modifier
  )

  const speed2Base = calculateStat(
    pokemon2.stats.speed,
    pokemon2Level,
    pokemon2IVs,
    pokemon2EVs,
    pokemon2Nature
  )
  const speed2 = Math.floor(
    speed2Base * getStageMultiplier(pokemon2Boosts) * pokemon2Modifier
  )

  return {
    faster: speed1 >= speed2 ? pokemon1 : pokemon2,
    slower: speed1 >= speed2 ? pokemon2 : pokemon1,
    speed1,
    speed2,
    difference: Math.abs(speed1 - speed2),
  }
}

/**
 * Get recommended EV spread
 */
export function getRecommendedEVSpread(
  pokemon: Pokemon,
  role: 'sweeper' | 'tank' | 'balanced' | 'fast-attacker' | 'trick-room'
): {
  hp: number
  attack: number
  defense: number
  special_attack: number
  special_defense: number
  speed: number
  description: string
} {
  const isPhysical = pokemon.stats.attack > pokemon.stats.specialAttack
  const isSpecial = pokemon.stats.specialAttack > pokemon.stats.attack

  switch (role) {
    case 'sweeper':
      return isPhysical
        ? {
            hp: 4,
            attack: 252,
            defense: 0,
            special_attack: 0,
            special_defense: 0,
            speed: 252,
            description: 'Max Attack and Speed for physical sweeping',
          }
        : {
            hp: 4,
            attack: 0,
            defense: 0,
            special_attack: 252,
            special_defense: 0,
            speed: 252,
            description: 'Max Special Attack and Speed for special sweeping',
          }

    case 'tank':
      return {
        hp: 252,
        attack: 0,
        defense: 252,
        special_attack: 0,
        special_defense: 4,
        speed: 0,
        description: 'Max HP and Defense for physical tanking',
      }

    case 'balanced':
      return {
        hp: 252,
        attack: isPhysical ? 128 : 0,
        defense: 64,
        special_attack: isSpecial ? 128 : 0,
        special_defense: 64,
        speed: 0,
        description: 'Balanced bulk with offensive investment',
      }

    case 'fast-attacker':
      return isPhysical
        ? {
            hp: 0,
            attack: 252,
            defense: 0,
            special_attack: 0,
            special_defense: 0,
            speed: 252,
            description: 'Glass cannon physical attacker',
          }
        : {
            hp: 0,
            attack: 0,
            defense: 0,
            special_attack: 252,
            special_defense: 0,
            speed: 252,
            description: 'Glass cannon special attacker',
          }

    case 'trick-room':
      return isPhysical
        ? {
            hp: 252,
            attack: 252,
            defense: 4,
            special_attack: 0,
            special_defense: 0,
            speed: 0,
            description: 'Minimum Speed for Trick Room, max Attack',
          }
        : {
            hp: 252,
            attack: 0,
            defense: 0,
            special_attack: 252,
            special_defense: 4,
            speed: 0,
            description: 'Minimum Speed for Trick Room, max Special Attack',
          }

    default:
      return {
        hp: 252,
        attack: 0,
        defense: 0,
        special_attack: 0,
        special_defense: 0,
        speed: 252,
        description: 'Default spread',
      }
  }
}
