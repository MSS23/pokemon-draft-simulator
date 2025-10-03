/**
 * Format Rules Engine
 *
 * Single source of truth for Pokemon legality and cost calculation
 * Uses in-memory format definitions for immediate availability
 */

import { getFormatById, type PokemonFormat } from '@/lib/formats'
import type { Pokemon } from '@/types'

export interface ValidationResult {
  isLegal: boolean
  cost: number
  reason?: string
}

export interface TeamValidationResult {
  isValid: boolean
  errors: string[]
  totalCost: number
  budgetRemaining: number
}

export class FormatRulesEngine {
  private format: PokemonFormat

  constructor(formatId: string) {
    const format = getFormatById(formatId)
    if (!format) {
      throw new Error(`Format '${formatId}' not found`)
    }
    this.format = format
  }

  /**
   * Initialize the engine (synchronous, no-op for compatibility)
   */
  initialize(): void {
    // No-op: format is already loaded in constructor
  }

  /**
   * Check if a Pokemon is legal in this format
   */
  isLegal(pokemon: Pokemon): boolean {
    const pokemonId = pokemon.id.toLowerCase()
    const pokemonName = pokemon.name.toLowerCase()

    // Check if explicitly banned
    if (this.format.ruleset.bannedPokemon.some(banned =>
      pokemonId === banned.toLowerCase() || pokemonName === banned.toLowerCase()
    )) {
      return false
    }

    // Check legendary/mythical policy (if properties exist)
    const isLegendary = (pokemon as any).isLegendary
    const isMythical = (pokemon as any).isMythical

    if (isLegendary && this.format.ruleset.legendaryPolicy === 'banned') {
      return false
    }

    if (isMythical && this.format.ruleset.mythicalPolicy === 'banned') {
      return false
    }

    // Check generation restrictions (if property exists)
    const generation = (pokemon as any).generation
    if (generation && !this.format.ruleset.allowedGenerations.includes(generation)) {
      return false
    }

    // If allowedPokemon is set, only those are legal
    if (this.format.ruleset.allowedPokemon && this.format.ruleset.allowedPokemon.length > 0) {
      return this.format.ruleset.allowedPokemon.some(allowed =>
        pokemonId === allowed.toLowerCase() || pokemonName === allowed.toLowerCase()
      )
    }

    // Default: Pokemon is legal
    return true
  }

  /**
   * Get the cost for a Pokemon in this format
   */
  getCost(pokemon: Pokemon): number {
    const pokemonId = pokemon.id.toLowerCase()

    // Check cost overrides first
    if (this.format.costConfig.costOverrides?.[pokemonId]) {
      return this.format.costConfig.costOverrides[pokemonId]
    }

    // BST-based costing
    if (this.format.costConfig.type === 'bst' || this.format.costConfig.type === 'hybrid') {
      const bst = pokemon.stats?.total || 0
      const bstTiers = this.format.costConfig.bstTiers || {}

      // Find the appropriate tier
      const thresholds = Object.keys(bstTiers).map(Number).sort((a, b) => b - a)
      for (const threshold of thresholds) {
        if (bst >= threshold) {
          const baseCost = bstTiers[threshold]
          return Math.min(
            Math.max(
              Math.round(baseCost * this.format.costConfig.costMultiplier),
              this.format.costConfig.minCost
            ),
            this.format.costConfig.maxCost
          )
        }
      }
    }

    // Tier-based costing
    if (this.format.costConfig.type === 'tier' && pokemon.tier) {
      const tierCosts = this.format.costConfig.tierCosts || {}
      if (tierCosts[pokemon.tier]) {
        return Math.min(
          Math.max(
            Math.round(tierCosts[pokemon.tier] * this.format.costConfig.costMultiplier),
            this.format.costConfig.minCost
          ),
          this.format.costConfig.maxCost
        )
      }
    }

    // Default to minimum cost
    return this.format.costConfig.minCost
  }

  /**
   * Validate a Pokemon pick
   */
  validatePokemon(pokemon: Pokemon): ValidationResult {
    const isLegal = this.isLegal(pokemon)

    if (!isLegal) {
      return {
        isLegal: false,
        cost: 0,
        reason: `${pokemon.name} is not legal in ${this.format.name}`
      }
    }

    const cost = this.getCost(pokemon)

    return {
      isLegal: true,
      cost
    }
  }

  /**
   * Validate an entire team
   */
  validateTeam(
    teamPokemon: Pokemon[],
    budget: number
  ): TeamValidationResult {
    const errors: string[] = []
    let totalCost = 0

    // Check for duplicates (if format doesn't allow)
    if (this.format.ruleset.speciesClause) {
      const ids = teamPokemon.map(p => p.id.toLowerCase())
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)

      if (duplicates.length > 0) {
        errors.push('Team contains duplicate Pokemon (species clause)')
      }
    }

    // Validate each Pokemon
    for (const pokemon of teamPokemon) {
      const validation = this.validatePokemon(pokemon)

      if (!validation.isLegal) {
        errors.push(validation.reason || `${pokemon.name} is not legal`)
      } else {
        totalCost += validation.cost
      }
    }

    // Check budget
    if (totalCost > budget) {
      errors.push(`Team cost (${totalCost}) exceeds budget (${budget})`)
    }

    return {
      isValid: errors.length === 0,
      errors,
      totalCost,
      budgetRemaining: budget - totalCost
    }
  }

  /**
   * Get format metadata
   */
  getFormatInfo() {
    return {
      id: this.format.id,
      name: this.format.name,
      shortName: this.format.shortName,
      description: this.format.description,
      generation: this.format.generation,
      gameType: this.format.gameType,
      category: this.format.category
    }
  }
}

/**
 * Factory function to create a rules engine for a format
 */
export function createFormatRulesEngine(formatId: string): FormatRulesEngine {
  return new FormatRulesEngine(formatId)
}

/**
 * Quick validation without creating an engine instance
 */
export function quickValidate(
  formatId: string,
  pokemon: Pokemon
): ValidationResult {
  const engine = createFormatRulesEngine(formatId)
  return engine.validatePokemon(pokemon)
}
