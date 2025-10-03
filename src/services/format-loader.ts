/**
 * Format Loader Service
 *
 * Loads and caches compiled format packs from public/data/
 * Provides runtime access to format rules and legality data
 */

import type { CompiledFormat, PokemonIndex } from '@/../data/formats/format-schema'

interface FormatManifest {
  pokemonIndexHash: string
  formats: Array<{
    id: string
    label: string
    version: string
    hash: string
  }>
  builtAt: string
}

class FormatLoaderService {
  private manifestCache: FormatManifest | null = null
  private formatCache: Map<string, CompiledFormat> = new Map()
  private pokemonIndexCache: PokemonIndex | null = null

  /**
   * Load the format manifest
   */
  async loadManifest(): Promise<FormatManifest> {
    if (this.manifestCache) {
      return this.manifestCache
    }

    try {
      const response = await fetch('/data/format-manifest.json')
      if (!response.ok) {
        throw new Error(`Failed to load format manifest: ${response.statusText}`)
      }

      this.manifestCache = await response.json()
      return this.manifestCache!
    } catch (error) {
      console.error('Error loading format manifest:', error)
      throw new Error('Format data not available. Run `npm run build:formats` first.')
    }
  }

  /**
   * Load Pokemon index
   */
  async loadPokemonIndex(): Promise<PokemonIndex> {
    if (this.pokemonIndexCache) {
      return this.pokemonIndexCache
    }

    try {
      const manifest = await this.loadManifest()
      const response = await fetch(`/data/pokemon_index_${manifest.pokemonIndexHash}.json`)

      if (!response.ok) {
        throw new Error(`Failed to load Pokemon index: ${response.statusText}`)
      }

      this.pokemonIndexCache = await response.json()
      return this.pokemonIndexCache!
    } catch (error) {
      console.error('Error loading Pokemon index:', error)
      throw new Error('Pokemon index not available. Run `npm run build:formats` first.')
    }
  }

  /**
   * Load a compiled format by ID
   */
  async loadFormat(formatId: string): Promise<CompiledFormat> {
    // Check cache first
    if (this.formatCache.has(formatId)) {
      return this.formatCache.get(formatId)!
    }

    try {
      const manifest = await this.loadManifest()
      const formatInfo = manifest.formats.find(f => f.id === formatId)

      if (!formatInfo) {
        throw new Error(`Format '${formatId}' not found in manifest`)
      }

      // Construct URL using hash from manifest
      const url = `/data/format_${formatId}_${formatInfo.hash}.json`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to load format '${formatId}': ${response.statusText}`)
      }

      const compiled = await response.json()
      this.formatCache.set(formatId, compiled)
      return compiled
    } catch (error) {
      console.error(`Error loading format '${formatId}':`, error)
      throw new Error(`Format '${formatId}' not available. Run \`npm run build:formats\` first.`)
    }
  }

  /**
   * Get available formats
   */
  async getAvailableFormats(): Promise<Array<{ id: string; label: string; version: string }>> {
    const manifest = await this.loadManifest()
    return manifest.formats
  }

  /**
   * Check if a Pokemon is legal in a format
   */
  async isLegal(formatId: string, pokemonId: string): Promise<boolean> {
    const format = await this.loadFormat(formatId)
    return format.legalPokemon.includes(pokemonId)
  }

  /**
   * Get cost for a Pokemon in a format
   */
  async getCost(formatId: string, pokemonId: string): Promise<number> {
    const format = await this.loadFormat(formatId)
    return format.costs[pokemonId] || format.format.costConfig.defaultCost
  }

  /**
   * Get all legal Pokemon for a format
   */
  async getLegalPokemon(formatId: string): Promise<string[]> {
    const format = await this.loadFormat(formatId)
    return format.legalPokemon
  }

  /**
   * Validate a Pokemon pick
   */
  async validatePick(
    formatId: string,
    pokemonId: string
  ): Promise<{ isValid: boolean; reason?: string; cost: number }> {
    try {
      const format = await this.loadFormat(formatId)
      const isLegal = format.legalPokemon.includes(pokemonId)

      if (!isLegal) {
        return {
          isValid: false,
          reason: `${pokemonId} is not legal in ${format.format.label}`,
          cost: 0
        }
      }

      const cost = format.costs[pokemonId] || format.format.costConfig.defaultCost

      return {
        isValid: true,
        cost
      }
    } catch (error) {
      return {
        isValid: false,
        reason: 'Failed to validate Pokemon',
        cost: 0
      }
    }
  }

  /**
   * Clear all caches (useful for hot-reloading in dev)
   */
  clearCache(): void {
    this.manifestCache = null
    this.formatCache.clear()
    this.pokemonIndexCache = null
  }
}

// Singleton instance
export const formatLoader = new FormatLoaderService()

// Export for testing
export { FormatLoaderService }