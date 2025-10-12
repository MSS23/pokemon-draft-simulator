/**
 * Performance Tests for Pokemon Data System
 *
 * Verifies that optimization targets are met:
 * - Initial load: < 2 seconds
 * - Search: < 50ms
 * - Validation: < 1ms (cached)
 * - Format switching: < 500ms
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PokemonDataManager } from '@/lib/pokemon-data-manager'
import { PokemonCacheDB, type CachedPokemon } from '@/lib/pokemon-cache-db'
import { PokemonSearchIndex } from '@/lib/pokemon-search-index'
import { FormatValidator, type FormatRules } from '@/lib/format-validator'
import { ImagePreloader } from '@/lib/image-preloader'

// Mock format for testing
const TEST_FORMAT: FormatRules = {
  id: 'test-format',
  name: 'Test Format',
  generation: 9,
  gameType: 'doubles',
  allowedPokedexNumbers: Array.from({ length: 100 }, (_, i) => i + 1),
  bannedCategories: ['legendary', 'mythical'],
  costConfig: {
    type: 'bst',
    minCost: 1,
    maxCost: 20,
  },
}

// Generate mock Pokemon data
function generateMockPokemon(id: number): CachedPokemon {
  return {
    id: String(id),
    name: `pokemon-${id}`,
    types: [
      { type: { name: id % 2 === 0 ? 'fire' : 'water' } },
    ],
    stats: [
      { base_stat: 50 + (id % 50), stat: { name: 'hp' } },
      { base_stat: 50 + (id % 50), stat: { name: 'attack' } },
      { base_stat: 50 + (id % 50), stat: { name: 'defense' } },
      { base_stat: 50 + (id % 50), stat: { name: 'special-attack' } },
      { base_stat: 50 + (id % 50), stat: { name: 'special-defense' } },
      { base_stat: 50 + (id % 50), stat: { name: 'speed' } },
    ],
    abilities: [
      { ability: { name: `ability-${id}` }, is_hidden: false },
    ],
    sprites: {
      front_default: `https://example.com/${id}.png`,
      other: {
        'official-artwork': {
          front_default: `https://example.com/${id}-artwork.png`,
        },
      },
    },
    species: { name: `species-${id}`, url: `https://example.com/species/${id}` },
    height: 10 + (id % 10),
    weight: 100 + (id % 100),
    moves: [
      { move: { name: `move-${id}-1` } },
      { move: { name: `move-${id}-2` } },
    ],
    is_legendary: id > 900,
    is_mythical: id > 950,
    cachedAt: Date.now(),
  }
}

describe('Pokemon Data Performance Tests', () => {
  beforeAll(async () => {
    // Initialize systems
    await PokemonCacheDB.initialize()

    // Populate cache with test data
    const mockPokemon = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))
    await PokemonCacheDB.cachePokemonBatch(mockPokemon)
  })

  afterAll(async () => {
    // Clean up
    await PokemonCacheDB.clearAll()
  })

  describe('IndexedDB Cache Performance', () => {
    it('should read single Pokemon in < 5ms', async () => {
      const start = performance.now()
      const pokemon = await PokemonCacheDB.getPokemon('1')
      const duration = performance.now() - start

      expect(pokemon).toBeTruthy()
      expect(duration).toBeLessThan(5)
      console.log(`Single read: ${duration.toFixed(2)}ms`)
    })

    it('should read batch of 50 Pokemon in < 50ms', async () => {
      const ids = Array.from({ length: 50 }, (_, i) => String(i + 1))

      const start = performance.now()
      const pokemonMap = await PokemonCacheDB.getPokemonBatch(ids)
      const duration = performance.now() - start

      expect(pokemonMap.size).toBe(50)
      expect(duration).toBeLessThan(50)
      console.log(`Batch read (50): ${duration.toFixed(2)}ms`)
    })

    it('should read all Pokemon in < 200ms', async () => {
      const start = performance.now()
      const allPokemon = await PokemonCacheDB.getAllPokemon()
      const duration = performance.now() - start

      expect(allPokemon.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(200)
      console.log(`Read all (${allPokemon.length}): ${duration.toFixed(2)}ms`)
    })

    it('should write batch of 50 Pokemon in < 100ms', async () => {
      const mockPokemon = Array.from({ length: 50 }, (_, i) =>
        generateMockPokemon(i + 101)
      )

      const start = performance.now()
      await PokemonCacheDB.cachePokemonBatch(mockPokemon)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(100)
      console.log(`Batch write (50): ${duration.toFixed(2)}ms`)
    })
  })

  describe('Search Index Performance', () => {
    beforeAll(() => {
      const pokemon = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))
      PokemonSearchIndex.buildIndex(pokemon)
    })

    it('should build index for 100 Pokemon in < 100ms', () => {
      const pokemon = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))

      const start = performance.now()
      PokemonSearchIndex.buildIndex(pokemon)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(100)
      console.log(`Build index (100): ${duration.toFixed(2)}ms`)
    })

    it('should search by name in < 50ms', () => {
      const start = performance.now()
      const results = PokemonSearchIndex.search('pokemon-1')
      const duration = performance.now() - start

      expect(results.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(50)
      console.log(`Search by name: ${duration.toFixed(2)}ms`)
    })

    it('should filter by type in < 20ms', () => {
      const pokemon = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))

      const start = performance.now()
      const filtered = PokemonSearchIndex.filter(pokemon, { types: ['fire'] })
      const duration = performance.now() - start

      expect(filtered.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(20)
      console.log(`Filter by type: ${duration.toFixed(2)}ms`)
    })

    it('should filter with multiple criteria in < 30ms', () => {
      const pokemon = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))

      const start = performance.now()
      const filtered = PokemonSearchIndex.filter(pokemon, {
        types: ['fire'],
        minBST: 300,
        maxBST: 500,
      })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(30)
      console.log(`Filter multiple criteria: ${duration.toFixed(2)}ms`)
    })

    it('should lookup by ID in < 1ms', () => {
      const start = performance.now()
      const pokemon = PokemonSearchIndex.getPokemon('1')
      const duration = performance.now() - start

      expect(pokemon).toBeTruthy()
      expect(duration).toBeLessThan(1)
      console.log(`Lookup by ID: ${duration.toFixed(2)}ms`)
    })
  })

  describe('Format Validator Performance', () => {
    it('should validate single Pokemon in < 10ms (uncached)', () => {
      const pokemon = generateMockPokemon(1)

      const start = performance.now()
      const result = FormatValidator.validatePokemon(pokemon, TEST_FORMAT)
      const duration = performance.now() - start

      expect(result.isLegal).toBeDefined()
      expect(duration).toBeLessThan(10)
      console.log(`Validation (uncached): ${duration.toFixed(2)}ms`)
    })

    it('should validate single Pokemon in < 1ms (cached)', () => {
      const pokemon = generateMockPokemon(1)

      // First validation (cache it)
      FormatValidator.validatePokemon(pokemon, TEST_FORMAT)

      // Second validation (from cache)
      const start = performance.now()
      const result = FormatValidator.validatePokemon(pokemon, TEST_FORMAT)
      const duration = performance.now() - start

      expect(result.isLegal).toBeDefined()
      expect(duration).toBeLessThan(1)
      console.log(`Validation (cached): ${duration.toFixed(2)}ms`)
    })

    it('should validate batch of 100 Pokemon in < 200ms', () => {
      const pokemonList = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))

      const start = performance.now()
      const results = FormatValidator.validateBatch(pokemonList, TEST_FORMAT)
      const duration = performance.now() - start

      expect(results.size).toBe(100)
      expect(duration).toBeLessThan(200)
      console.log(`Batch validation (100): ${duration.toFixed(2)}ms`)
    })

    it('should calculate cost in < 1ms', () => {
      const pokemon = generateMockPokemon(1)

      const start = performance.now()
      const cost = FormatValidator.calculateCost(pokemon, TEST_FORMAT)
      const duration = performance.now() - start

      expect(cost).toBeGreaterThan(0)
      expect(duration).toBeLessThan(1)
      console.log(`Calculate cost: ${duration.toFixed(2)}ms`)
    })

    it('should preload format cache in < 500ms', () => {
      const pokemonList = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))

      FormatValidator.clearCache()

      const start = performance.now()
      FormatValidator.preloadFormat(pokemonList, TEST_FORMAT)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(500)
      console.log(`Preload format (100): ${duration.toFixed(2)}ms`)
    })
  })

  describe('Image Preloader Performance', () => {
    beforeAll(() => {
      ImagePreloader.clearCache()
    })

    it('should check cache in < 1ms', () => {
      const url = 'https://example.com/test.png'

      const start = performance.now()
      const isCached = ImagePreloader.isCached(url)
      const duration = performance.now() - start

      expect(isCached).toBe(false)
      expect(duration).toBeLessThan(1)
      console.log(`Check cache: ${duration.toFixed(2)}ms`)
    })

    it('should queue image preload in < 5ms', () => {
      const url = 'https://example.com/test.png'

      const start = performance.now()
      ImagePreloader.preloadSingle(url, { priority: 'high' })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(5)
      console.log(`Queue preload: ${duration.toFixed(2)}ms`)
    })
  })

  describe('Integrated Performance', () => {
    it('should handle search + filter + validation in < 100ms', () => {
      const pokemon = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))
      PokemonSearchIndex.buildIndex(pokemon)

      const start = performance.now()

      // Search
      const searchResults = PokemonSearchIndex.search('pokemon-1')

      // Filter
      const filtered = PokemonSearchIndex.filter(searchResults.map(r => r.pokemon), {
        types: ['fire'],
      })

      // Validate
      filtered.forEach(p => FormatValidator.validatePokemon(p, TEST_FORMAT))

      const duration = performance.now() - start

      expect(duration).toBeLessThan(100)
      console.log(`Integrated (search+filter+validate): ${duration.toFixed(2)}ms`)
    })
  })
})

describe('Memory Usage Tests', () => {
  it('should estimate cache size', async () => {
    const stats = await PokemonCacheDB.getStats()

    console.log('Cache stats:', {
      pokemonCount: stats.pokemonCount,
      formatCount: stats.formatCount,
      estimatedSize: `${(stats.totalSize / 1024 / 1024).toFixed(2)}MB`,
    })

    expect(stats.pokemonCount).toBeGreaterThan(0)
  })

  it('should track search index size', () => {
    const pokemon = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))
    PokemonSearchIndex.buildIndex(pokemon)

    const stats = PokemonSearchIndex.getStats()

    console.log('Search index stats:', stats)

    expect(stats.pokemonCount).toBe(100)
  })

  it('should track image cache size', () => {
    const stats = ImagePreloader.getStats()

    console.log('Image cache stats:', {
      cacheSize: stats.cacheSize,
      estimatedSize: `${(ImagePreloader.getEstimatedCacheSize() / 1024 / 1024).toFixed(2)}MB`,
      hitRate: `${stats.cacheHitRate.toFixed(2)}%`,
    })

    expect(stats).toBeDefined()
  })
})
