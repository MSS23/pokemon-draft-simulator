/**
 * Damage Calculation Service
 *
 * Wraps @smogon/calc for easy damage calculations in the draft context.
 * Accepts simplified inputs (Pokemon name + optional set details) and
 * resolves them to full calculation inputs.
 *
 * Handles the case where @smogon/calc doesn't work in browser via
 * dynamic import with graceful fallback.
 */

import { createLogger } from '@/lib/logger'

const log = createLogger('DamageCalcService')

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimplePokemonInput {
  name: string
  level?: number
  nature?: string
  evs?: { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number }
  ivs?: { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number }
  item?: string
  ability?: string
  boosts?: { atk?: number; def?: number; spa?: number; spd?: number; spe?: number }
}

export interface SimpleMoveInput {
  name: string
  basePower?: number
  type?: string
  category?: 'Physical' | 'Special' | 'Status'
}

export interface SimpleFieldInput {
  weather?: 'Sun' | 'Rain' | 'Sand' | 'Snow' | 'Harsh Sunshine' | 'Heavy Rain' | 'Strong Winds'
  terrain?: 'Electric' | 'Grassy' | 'Misty' | 'Psychic'
  isDoubles?: boolean
  attackerSide?: {
    isReflect?: boolean
    isLightScreen?: boolean
    isAuroraVeil?: boolean
    isHelpingHand?: boolean
    isFriendGuard?: boolean
  }
  defenderSide?: {
    isReflect?: boolean
    isLightScreen?: boolean
    isAuroraVeil?: boolean
    isFriendGuard?: boolean
  }
}

export interface DamageResult {
  minDamage: number
  maxDamage: number
  minPercent: number
  maxPercent: number
  koChance: KOChance
  description: string
  rawDamageRange: number[]
}

export type KOChance = 'OHKO' | '2HKO' | '3HKO' | '4HKO+' | 'Never'

// ─── Lazy-loaded Calculator ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let calcModule: any = null
let calcLoadFailed = false

async function loadCalcModule(): Promise<typeof calcModule> {
  if (calcModule) return calcModule
  if (calcLoadFailed) return null

  try {
    const mod = await import('@smogon/calc')
    calcModule = mod
    log.info('Loaded @smogon/calc successfully')
    return calcModule
  } catch (error) {
    calcLoadFailed = true
    log.warn('@smogon/calc could not be loaded (may not work in browser):', error)
    return null
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class DamageCalcService {
  /**
   * Calculate damage between two Pokemon.
   *
   * Returns null if the calculator module is unavailable.
   */
  static async calculateDamage(
    attacker: SimplePokemonInput,
    defender: SimplePokemonInput,
    move: SimpleMoveInput,
    field?: SimpleFieldInput
  ): Promise<DamageResult | null> {
    const calc = await loadCalcModule()
    if (!calc) {
      log.warn('Damage calculator unavailable')
      return null
    }

    try {
      const gen = calc.Generations.get(9)

      // Build attacker
      const attackerPokemon = new calc.Pokemon(gen, attacker.name, {
        level: attacker.level || 50,
        nature: attacker.nature,
        evs: attacker.evs ? {
          hp: attacker.evs.hp || 0,
          atk: attacker.evs.atk || 0,
          def: attacker.evs.def || 0,
          spa: attacker.evs.spa || 0,
          spd: attacker.evs.spd || 0,
          spe: attacker.evs.spe || 0,
        } : undefined,
        ivs: attacker.ivs ? {
          hp: attacker.ivs.hp ?? 31,
          atk: attacker.ivs.atk ?? 31,
          def: attacker.ivs.def ?? 31,
          spa: attacker.ivs.spa ?? 31,
          spd: attacker.ivs.spd ?? 31,
          spe: attacker.ivs.spe ?? 31,
        } : undefined,
        item: attacker.item,
        ability: attacker.ability,
        boosts: attacker.boosts,
      })

      // Build defender
      const defenderPokemon = new calc.Pokemon(gen, defender.name, {
        level: defender.level || 50,
        nature: defender.nature,
        evs: defender.evs ? {
          hp: defender.evs.hp || 0,
          atk: defender.evs.atk || 0,
          def: defender.evs.def || 0,
          spa: defender.evs.spa || 0,
          spd: defender.evs.spd || 0,
          spe: defender.evs.spe || 0,
        } : undefined,
        ivs: defender.ivs ? {
          hp: defender.ivs.hp ?? 31,
          atk: defender.ivs.atk ?? 31,
          def: defender.ivs.def ?? 31,
          spa: defender.ivs.spa ?? 31,
          spd: defender.ivs.spd ?? 31,
          spe: defender.ivs.spe ?? 31,
        } : undefined,
        item: defender.item,
        ability: defender.ability,
        boosts: defender.boosts,
      })

      // Build move
      const calcMove = new calc.Move(gen, move.name)

      // Build field
      const calcField = new calc.Field({
        gameType: field?.isDoubles ? 'Doubles' : 'Singles',
        weather: field?.weather,
        terrain: field?.terrain,
        attackerSide: field?.attackerSide ? {
          isReflect: field.attackerSide.isReflect,
          isLightScreen: field.attackerSide.isLightScreen,
          isAuroraVeil: field.attackerSide.isAuroraVeil,
          isHelpingHand: field.attackerSide.isHelpingHand,
          isFriendGuard: field.attackerSide.isFriendGuard,
        } : undefined,
        defenderSide: field?.defenderSide ? {
          isReflect: field.defenderSide.isReflect,
          isLightScreen: field.defenderSide.isLightScreen,
          isAuroraVeil: field.defenderSide.isAuroraVeil,
          isFriendGuard: field.defenderSide.isFriendGuard,
        } : undefined,
      })

      // Calculate
      const result = calc.calculate(gen, attackerPokemon, defenderPokemon, calcMove, calcField)

      // Extract damage range
      const damageRange = result.damage as number[] | number
      const rawRange = Array.isArray(damageRange) ? damageRange : [damageRange]

      const minDamage = Math.min(...rawRange)
      const maxDamage = Math.max(...rawRange)

      const defenderHP = defenderPokemon.maxHP()
      const minPercent = (minDamage / defenderHP) * 100
      const maxPercent = (maxDamage / defenderHP) * 100

      const koChance = this.getKOChance(minPercent, maxPercent)

      return {
        minDamage,
        maxDamage,
        minPercent: Math.round(minPercent * 10) / 10,
        maxPercent: Math.round(maxPercent * 10) / 10,
        koChance,
        description: result.fullDesc(),
        rawDamageRange: rawRange,
      }
    } catch (error) {
      log.error('Damage calculation failed:', error)
      return null
    }
  }

  /**
   * Determine the KO chance from damage percentages.
   */
  static getKOChance(minPercent: number, maxPercent: number): KOChance {
    if (minPercent >= 100) return 'OHKO'
    if (maxPercent >= 100) return 'OHKO' // guaranteed at high roll
    if (minPercent >= 50) return '2HKO'
    if (maxPercent >= 50) return '2HKO'
    if (minPercent >= 33.4) return '3HKO'
    if (maxPercent >= 33.4) return '3HKO'
    if (maxPercent > 10) return '4HKO+'
    return 'Never'
  }

  /**
   * Check if the damage calculator is available in this environment.
   */
  static async isAvailable(): Promise<boolean> {
    const mod = await loadCalcModule()
    return mod !== null
  }
}
