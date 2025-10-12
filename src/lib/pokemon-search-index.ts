/**
 * Pokemon Search Index with Fuse.js
 *
 * Provides instant fuzzy search across Pokemon data with advanced filtering.
 * Performance: < 50ms for any search query
 */

import Fuse from 'fuse.js'
import type { CachedPokemon } from './pokemon-cache-db'

export interface SearchFilters {
  types?: string[]
  minCost?: number
  maxCost?: number
  minBST?: number
  maxBST?: number
  abilities?: string[]
  legendary?: boolean
  mythical?: boolean
}

export interface SearchResult {
  pokemon: CachedPokemon
  score: number
  matches: Array<{
    key: string
    value: string
    indices: [number, number][]
  }>
}

export class PokemonSearchIndex {
  private static fuse: Fuse<CachedPokemon> | null = null
  private static pokemonMap = new Map<string, CachedPokemon>()
  private static typeIndex = new Map<string, Set<string>>()
  private static abilityIndex = new Map<string, Set<string>>()
  private static bstCache = new Map<string, number>()
  private static costMap = new Map<string, number>()

  /**
   * Build search index from Pokemon data
   */
  static buildIndex(pokemon: CachedPokemon[], costs?: Record<string, number>): void {
    const startTime = performance.now()

    // Build Fuse.js search index
    this.fuse = new Fuse(pokemon, {
      keys: [
        { name: 'name', weight: 3 },
        { name: 'types.type.name', weight: 2 },
        { name: 'abilities.ability.name', weight: 1.5 },
        { name: 'moves.move.name', weight: 0.5 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 2,
      shouldSort: true,
    })

    // Build supplementary indexes
    this.pokemonMap.clear()
    this.typeIndex.clear()
    this.abilityIndex.clear()
    this.bstCache.clear()

    pokemon.forEach(p => {
      this.pokemonMap.set(p.id, p)

      // Type index
      p.types.forEach(t => {
        const typeName = t.type.name.toLowerCase()
        if (!this.typeIndex.has(typeName)) {
          this.typeIndex.set(typeName, new Set())
        }
        this.typeIndex.get(typeName)!.add(p.id)
      })

      // Ability index
      p.abilities.forEach(a => {
        const abilityName = a.ability.name.toLowerCase()
        if (!this.abilityIndex.has(abilityName)) {
          this.abilityIndex.set(abilityName, new Set())
        }
        this.abilityIndex.get(abilityName)!.add(p.id)
      })

      // BST cache
      const bst = p.stats.reduce((sum, s) => sum + s.base_stat, 0)
      this.bstCache.set(p.id, bst)
    })

    // Cost map
    if (costs) {
      this.costMap = new Map(Object.entries(costs))
    }

    const duration = performance.now() - startTime
    console.log(`[PokemonSearchIndex] Built index for ${pokemon.length} Pokemon in ${duration.toFixed(2)}ms`)
  }

  /**
   * Search Pokemon by query string
   */
  static search(query: string, limit: number = 50): SearchResult[] {
    if (!this.fuse) {
      console.warn('[PokemonSearchIndex] Index not built')
      return []
    }

    if (!query.trim()) {
      return []
    }

    const startTime = performance.now()

    const results = this.fuse.search(query, { limit })

    const searchResults: SearchResult[] = results.map(result => ({
      pokemon: result.item,
      score: result.score || 1,
      matches: (result.matches || []).map(match => ({
        key: match.key || '',
        value: match.value || '',
        indices: match.indices || [],
      })),
    }))

    const duration = performance.now() - startTime
    console.log(`[PokemonSearchIndex] Search "${query}" returned ${searchResults.length} results in ${duration.toFixed(2)}ms`)

    return searchResults
  }

  /**
   * Filter Pokemon by criteria (optimized with indexes)
   */
  static filter(pokemon: CachedPokemon[], filters: SearchFilters): CachedPokemon[] {
    const startTime = performance.now()

    let filtered = pokemon

    // Type filter (use index for efficiency)
    if (filters.types && filters.types.length > 0) {
      const typeMatches = new Set<string>()

      filters.types.forEach(type => {
        const typeLower = type.toLowerCase()
        const pokemonIds = this.typeIndex.get(typeLower)
        if (pokemonIds) {
          pokemonIds.forEach(id => typeMatches.add(id))
        }
      })

      filtered = filtered.filter(p => typeMatches.has(p.id))
    }

    // Ability filter (use index)
    if (filters.abilities && filters.abilities.length > 0) {
      const abilityMatches = new Set<string>()

      filters.abilities.forEach(ability => {
        const abilityLower = ability.toLowerCase()
        const pokemonIds = this.abilityIndex.get(abilityLower)
        if (pokemonIds) {
          pokemonIds.forEach(id => abilityMatches.add(id))
        }
      })

      filtered = filtered.filter(p => abilityMatches.has(p.id))
    }

    // BST filter (use cache)
    if (filters.minBST !== undefined || filters.maxBST !== undefined) {
      filtered = filtered.filter(p => {
        const bst = this.bstCache.get(p.id) || 0

        if (filters.minBST !== undefined && bst < filters.minBST) return false
        if (filters.maxBST !== undefined && bst > filters.maxBST) return false

        return true
      })
    }

    // Cost filter
    if (filters.minCost !== undefined || filters.maxCost !== undefined) {
      filtered = filtered.filter(p => {
        const cost = this.costMap.get(p.id) || 0

        if (filters.minCost !== undefined && cost < filters.minCost) return false
        if (filters.maxCost !== undefined && cost > filters.maxCost) return false

        return true
      })
    }

    // Legendary/Mythical filter
    if (filters.legendary !== undefined) {
      filtered = filtered.filter(p => p.is_legendary === filters.legendary)
    }

    if (filters.mythical !== undefined) {
      filtered = filtered.filter(p => p.is_mythical === filters.mythical)
    }

    const duration = performance.now() - startTime
    console.log(`[PokemonSearchIndex] Filtered ${pokemon.length} to ${filtered.length} Pokemon in ${duration.toFixed(2)}ms`)

    return filtered
  }

  /**
   * Get Pokemon by ID (fast lookup)
   */
  static getPokemon(id: string): CachedPokemon | undefined {
    return this.pokemonMap.get(id)
  }

  /**
   * Get Pokemon by type (fast index lookup)
   */
  static getPokemonByType(type: string): CachedPokemon[] {
    const typeLower = type.toLowerCase()
    const pokemonIds = this.typeIndex.get(typeLower)

    if (!pokemonIds) return []

    return Array.from(pokemonIds)
      .map(id => this.pokemonMap.get(id))
      .filter((p): p is CachedPokemon => p !== undefined)
  }

  /**
   * Get Pokemon by ability (fast index lookup)
   */
  static getPokemonByAbility(ability: string): CachedPokemon[] {
    const abilityLower = ability.toLowerCase()
    const pokemonIds = this.abilityIndex.get(abilityLower)

    if (!pokemonIds) return []

    return Array.from(pokemonIds)
      .map(id => this.pokemonMap.get(id))
      .filter((p): p is CachedPokemon => p !== undefined)
  }

  /**
   * Get all unique types
   */
  static getAllTypes(): string[] {
    return Array.from(this.typeIndex.keys())
  }

  /**
   * Get all unique abilities
   */
  static getAllAbilities(): string[] {
    return Array.from(this.abilityIndex.keys())
  }

  /**
   * Get BST for Pokemon (cached)
   */
  static getBST(pokemonId: string): number {
    return this.bstCache.get(pokemonId) || 0
  }

  /**
   * Get cost for Pokemon
   */
  static getCost(pokemonId: string): number {
    return this.costMap.get(pokemonId) || 0
  }

  /**
   * Update costs (for format changes)
   */
  static updateCosts(costs: Record<string, number>): void {
    this.costMap = new Map(Object.entries(costs))
  }

  /**
   * Get index statistics
   */
  static getStats(): {
    pokemonCount: number
    typeCount: number
    abilityCount: number
    indexSize: number
  } {
    return {
      pokemonCount: this.pokemonMap.size,
      typeCount: this.typeIndex.size,
      abilityCount: this.abilityIndex.size,
      indexSize: this.bstCache.size,
    }
  }

  /**
   * Clear index
   */
  static clear(): void {
    this.fuse = null
    this.pokemonMap.clear()
    this.typeIndex.clear()
    this.abilityIndex.clear()
    this.bstCache.clear()
    this.costMap.clear()
  }
}
