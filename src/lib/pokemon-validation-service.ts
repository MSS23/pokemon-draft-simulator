/**
 * Pokemon Validation Service
 *
 * Centralized service for validating Pokemon legality and costs across the application.
 * Ensures consistency between UI, draft picks, and database state.
 */

import { createFormatRulesEngine, type ValidationResult } from '@/domain/rules'
import type { Pokemon } from '@/types'
import { DEFAULT_FORMAT } from '@/lib/formats'

interface PokemonWithValidation extends Pokemon {
  validationResult: ValidationResult
}

class PokemonValidationService {
  private static instance: PokemonValidationService
  private rulesEngineCache = new Map<string, ReturnType<typeof createFormatRulesEngine>>()

  static getInstance(): PokemonValidationService {
    if (!PokemonValidationService.instance) {
      PokemonValidationService.instance = new PokemonValidationService()
    }
    return PokemonValidationService.instance
  }

  /**
   * Get or create a rules engine for a format
   */
  private getRulesEngine(formatId: string = DEFAULT_FORMAT) {
    if (!this.rulesEngineCache.has(formatId)) {
      try {
        const engine = createFormatRulesEngine(formatId)
        this.rulesEngineCache.set(formatId, engine)
      } catch (error) {
        console.error(`Failed to create rules engine for format ${formatId}:`, error)
        // Fall back to default format
        if (formatId !== DEFAULT_FORMAT) {
          return this.getRulesEngine(DEFAULT_FORMAT)
        }
        throw error
      }
    }
    return this.rulesEngineCache.get(formatId)!
  }

  /**
   * Validate a single Pokemon
   */
  validatePokemon(pokemon: Pokemon, formatId: string = DEFAULT_FORMAT): ValidationResult {
    const engine = this.getRulesEngine(formatId)
    return engine.validatePokemon(pokemon)
  }

  /**
   * Validate and enrich a Pokemon with validation data
   */
  enrichPokemon(pokemon: Pokemon, formatId: string = DEFAULT_FORMAT): PokemonWithValidation {
    const validationResult = this.validatePokemon(pokemon, formatId)
    return {
      ...pokemon,
      isLegal: validationResult.isLegal,
      cost: validationResult.cost,
      validationResult
    }
  }

  /**
   * Validate a list of Pokemon
   */
  validatePokemonList(
    pokemonList: Pokemon[],
    formatId: string = DEFAULT_FORMAT
  ): PokemonWithValidation[] {
    return pokemonList.map(pokemon => this.enrichPokemon(pokemon, formatId))
  }

  /**
   * Filter legal Pokemon from a list
   */
  filterLegalPokemon(
    pokemonList: Pokemon[],
    formatId: string = DEFAULT_FORMAT
  ): Pokemon[] {
    const engine = this.getRulesEngine(formatId)
    return pokemonList.filter(pokemon => engine.isLegal(pokemon))
  }

  /**
   * Validate a team composition
   */
  validateTeam(
    team: Pokemon[],
    budget: number,
    formatId: string = DEFAULT_FORMAT
  ): {
    isValid: boolean
    errors: string[]
    totalCost: number
    budgetRemaining: number
    illegalPokemon: Pokemon[]
  } {
    const engine = this.getRulesEngine(formatId)
    const errors: string[] = []
    const illegalPokemon: Pokemon[] = []
    let totalCost = 0

    // Validate each Pokemon
    for (const pokemon of team) {
      const result = engine.validatePokemon(pokemon)

      if (!result.isLegal) {
        errors.push(result.reason || `${pokemon.name} is not legal in this format`)
        illegalPokemon.push(pokemon)
      } else {
        totalCost += result.cost
      }
    }

    // Check budget
    if (totalCost > budget) {
      errors.push(`Team cost (${totalCost}) exceeds budget (${budget})`)
    }

    // Check for duplicates (Species Clause)
    const speciesMap = new Map<string, number>()
    for (const pokemon of team) {
      const count = speciesMap.get(pokemon.id) || 0
      speciesMap.set(pokemon.id, count + 1)
    }

    for (const [pokemonId, count] of speciesMap.entries()) {
      if (count > 1) {
        const pokemon = team.find(p => p.id === pokemonId)
        errors.push(`Duplicate Pokemon: ${pokemon?.name} (Species Clause violation)`)
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      totalCost,
      budgetRemaining: Math.max(0, budget - totalCost),
      illegalPokemon
    }
  }

  /**
   * Check if a Pokemon can be afforded with remaining budget
   */
  canAfford(pokemon: Pokemon, budgetRemaining: number, formatId: string = DEFAULT_FORMAT): boolean {
    const engine = this.getRulesEngine(formatId)
    const result = engine.validatePokemon(pokemon)
    return result.isLegal && result.cost <= budgetRemaining
  }

  /**
   * Get Pokemon cost (returns 0 if illegal)
   */
  getPokemonCost(pokemon: Pokemon, formatId: string = DEFAULT_FORMAT): number {
    const engine = this.getRulesEngine(formatId)
    const result = engine.validatePokemon(pokemon)
    return result.isLegal ? result.cost : 0
  }

  /**
   * Batch validate picks before submitting to database
   */
  validatePick(
    pokemon: Pokemon,
    currentTeam: Pokemon[],
    budgetRemaining: number,
    formatId: string = DEFAULT_FORMAT
  ): {
    isValid: boolean
    reason?: string
    cost: number
  } {
    const engine = this.getRulesEngine(formatId)
    const result = engine.validatePokemon(pokemon)

    // Check legality
    if (!result.isLegal) {
      return {
        isValid: false,
        reason: result.reason || `${pokemon.name} is not legal in this format`,
        cost: 0
      }
    }

    // Check budget
    if (result.cost > budgetRemaining) {
      return {
        isValid: false,
        reason: `Insufficient budget: ${pokemon.name} costs ${result.cost}, but only ${budgetRemaining} remaining`,
        cost: result.cost
      }
    }

    // Check for duplicate
    const isDuplicate = currentTeam.some(p => p.id === pokemon.id)
    if (isDuplicate) {
      return {
        isValid: false,
        reason: `${pokemon.name} is already on your team (Species Clause)`,
        cost: result.cost
      }
    }

    return {
      isValid: true,
      cost: result.cost
    }
  }

  /**
   * Clear cache (useful when switching formats)
   */
  clearCache(): void {
    this.rulesEngineCache.clear()
  }

  /**
   * Pre-warm cache for a format
   */
  preloadFormat(formatId: string): void {
    try {
      this.getRulesEngine(formatId)
    } catch (error) {
      console.error(`Failed to preload format ${formatId}:`, error)
    }
  }
}

// Export singleton instance
export const pokemonValidationService = PokemonValidationService.getInstance()

// Convenience exports
export const {
  validatePokemon,
  enrichPokemon,
  validatePokemonList,
  filterLegalPokemon,
  validateTeam,
  canAfford,
  getPokemonCost,
  validatePick,
  clearCache,
  preloadFormat
} = pokemonValidationService

export type { PokemonWithValidation }
