/**
 * Unit Tests for Format Validator
 *
 * Tests format validation, cost calculation, and caching
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { FormatValidator, type FormatRules } from '@/lib/format-validator'
import type { CachedPokemon } from '@/lib/pokemon-cache-db'

// Test format
const TEST_FORMAT: FormatRules = {
  id: 'test-format',
  name: 'Test Format',
  generation: 9,
  gameType: 'doubles',
  allowedPokedexNumbers: Array.from({ length: 200 }, (_, i) => i + 1), // Include 150, 151 for category tests
  bannedCategories: ['mythical', 'legendary'], // Mythical first so Mew (151) is caught as mythical
  costConfig: {
    type: 'bst',
    minCost: 1,
    maxCost: 20,
  },
}

// Restrictive format
const RESTRICTIVE_FORMAT: FormatRules = {
  id: 'restrictive-format',
  name: 'Restrictive Format',
  generation: 9,
  gameType: 'doubles',
  allowedPokedexNumbers: [1, 4, 7, 25, 133, 984], // Include 984 (Great Tusk) for paradox test
  explicitBans: [25], // Pikachu banned
  bannedCategories: ['legendary', 'mythical', 'paradox'],
  costConfig: {
    type: 'bst',
    minCost: 2,
    maxCost: 15,
    tierOverrides: {
      '1': 10,
      '133': 15,
    },
  },
}

// Generate mock Pokemon
function generateMockPokemon(id: number, options: Partial<CachedPokemon> = {}): CachedPokemon {
  return {
    id: String(id),
    name: `pokemon-${id}`,
    types: [{ type: { name: 'normal' } }],
    stats: [
      { base_stat: 45, stat: { name: 'hp' } },
      { base_stat: 49, stat: { name: 'attack' } },
      { base_stat: 49, stat: { name: 'defense' } },
      { base_stat: 65, stat: { name: 'special-attack' } },
      { base_stat: 65, stat: { name: 'special-defense' } },
      { base_stat: 45, stat: { name: 'speed' } },
    ],
    abilities: [{ ability: { name: 'ability' }, is_hidden: false }],
    sprites: {
      front_default: 'https://example.com/sprite.png',
    },
    species: { name: 'species', url: 'https://example.com/species' },
    height: 10,
    weight: 100,
    moves: [],
    is_legendary: false,
    is_mythical: false,
    cachedAt: Date.now(),
    ...options,
  }
}

describe('FormatValidator', () => {
  beforeEach(() => {
    // Clear cache before each test
    FormatValidator.clearCache()
  })

  describe('Validation', () => {
    it('should validate legal Pokemon', () => {
      const pokemon = generateMockPokemon(1)

      const result = FormatValidator.validatePokemon(pokemon, TEST_FORMAT)

      expect(result.isLegal).toBe(true)
      expect(result.cost).toBeGreaterThan(0)
    })

    it('should reject Pokemon not in allowed Pokedex', () => {
      const pokemon = generateMockPokemon(999)

      const result = FormatValidator.validatePokemon(pokemon, TEST_FORMAT)

      expect(result.isLegal).toBe(false)
      expect(result.reason).toContain('not in the allowed Pokedex')
    })

    it('should reject explicitly banned Pokemon', () => {
      const pokemon = generateMockPokemon(25) // Pikachu

      const result = FormatValidator.validatePokemon(pokemon, RESTRICTIVE_FORMAT)

      expect(result.isLegal).toBe(false)
      expect(result.reason).toContain('explicitly banned')
    })

    it('should reject legendary Pokemon when banned', () => {
      const pokemon = generateMockPokemon(150, { is_legendary: true })

      const result = FormatValidator.validatePokemon(pokemon, TEST_FORMAT)

      expect(result.isLegal).toBe(false)
      expect(result.reason).toContain('legendary')
    })

    it('should reject mythical Pokemon when banned', () => {
      const pokemon = generateMockPokemon(151, { is_mythical: true })

      const result = FormatValidator.validatePokemon(pokemon, TEST_FORMAT)

      expect(result.isLegal).toBe(false)
      expect(result.reason).toContain('mythical')
    })

    it('should reject paradox Pokemon', () => {
      const pokemon = generateMockPokemon(984) // Great Tusk

      const result = FormatValidator.validatePokemon(pokemon, RESTRICTIVE_FORMAT)

      expect(result.isLegal).toBe(false)
      expect(result.reason).toContain('paradox')
    })

    it('should validate in < 10ms (uncached)', () => {
      const pokemon = generateMockPokemon(1)

      const start = performance.now()
      FormatValidator.validatePokemon(pokemon, TEST_FORMAT)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(10)
      console.log(`Validation (uncached): ${duration.toFixed(3)}ms`)
    })

    it('should validate in < 1ms (cached)', () => {
      const pokemon = generateMockPokemon(1)

      // First validation (cache it)
      FormatValidator.validatePokemon(pokemon, TEST_FORMAT)

      // Second validation (from cache)
      const start = performance.now()
      FormatValidator.validatePokemon(pokemon, TEST_FORMAT)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(1)
      console.log(`Validation (cached): ${duration.toFixed(3)}ms`)
    })
  })

  describe('Batch Validation', () => {
    it('should validate batch of Pokemon', () => {
      const pokemonList = Array.from({ length: 50 }, (_, i) => generateMockPokemon(i + 1))

      const results = FormatValidator.validateBatch(pokemonList, TEST_FORMAT)

      expect(results.size).toBe(50)
      results.forEach(result => {
        expect(result).toHaveProperty('isLegal')
      })
    })

    it('should validate batch in < 200ms', () => {
      const pokemonList = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))

      const start = performance.now()
      FormatValidator.validateBatch(pokemonList, TEST_FORMAT)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(200)
      console.log(`Batch validation (100): ${duration.toFixed(2)}ms`)
    })

    it('should get legal Pokemon', () => {
      const pokemonList = [
        generateMockPokemon(1),
        generateMockPokemon(999), // Out of range
        generateMockPokemon(25), // Legal in TEST_FORMAT
      ]

      const legal = FormatValidator.getLegalPokemon(pokemonList, TEST_FORMAT)

      expect(legal.length).toBe(2)
      expect(legal.every(p => [1, 25].includes(parseInt(p.id)))).toBe(true)
    })

    it('should get illegal Pokemon', () => {
      const pokemonList = [
        generateMockPokemon(1),
        generateMockPokemon(999), // Out of range
        generateMockPokemon(25),
      ]

      const illegal = FormatValidator.getIllegalPokemon(pokemonList, TEST_FORMAT)

      expect(illegal.length).toBe(1)
      expect(illegal[0].id).toBe('999')
    })
  })

  describe('Cost Calculation', () => {
    it('should calculate cost from BST', () => {
      const pokemon = generateMockPokemon(1, {
        stats: [
          { base_stat: 50, stat: { name: 'hp' } },
          { base_stat: 50, stat: { name: 'attack' } },
          { base_stat: 50, stat: { name: 'defense' } },
          { base_stat: 50, stat: { name: 'special-attack' } },
          { base_stat: 50, stat: { name: 'special-defense' } },
          { base_stat: 50, stat: { name: 'speed' } },
        ],
      })

      const cost = FormatValidator.calculateCost(pokemon, TEST_FORMAT)

      // BST = 300, cost = Math.floor(300 / 100) = 3
      expect(cost).toBe(3)
    })

    it('should apply min cost', () => {
      const pokemon = generateMockPokemon(1, {
        stats: Array(6).fill({ base_stat: 1, stat: { name: 'stat' } }),
      })

      const cost = FormatValidator.calculateCost(pokemon, TEST_FORMAT)

      expect(cost).toBe(TEST_FORMAT.costConfig!.minCost)
    })

    it('should apply max cost', () => {
      const pokemon = generateMockPokemon(1, {
        stats: Array(6).fill({ base_stat: 350, stat: { name: 'stat' } }), // BST = 2100, cost = 21, clamped to maxCost 20
      })

      const cost = FormatValidator.calculateCost(pokemon, TEST_FORMAT)

      expect(cost).toBe(TEST_FORMAT.costConfig!.maxCost)
    })

    it('should apply tier overrides', () => {
      const pokemon = generateMockPokemon(1)

      const cost = FormatValidator.calculateCost(pokemon, RESTRICTIVE_FORMAT)

      expect(cost).toBe(10) // Override from RESTRICTIVE_FORMAT
    })

    it('should calculate cost in < 1ms', () => {
      const pokemon = generateMockPokemon(1)

      const start = performance.now()
      FormatValidator.calculateCost(pokemon, TEST_FORMAT)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(1)
      console.log(`Calculate cost: ${duration.toFixed(3)}ms`)
    })
  })

  describe('Category Detection', () => {
    it('should detect legendary Pokemon', () => {
      expect(FormatValidator.isLegendary(150)).toBe(true) // Mewtwo
      expect(FormatValidator.isLegendary(1007)).toBe(true) // Koraidon
      expect(FormatValidator.isLegendary(25)).toBe(false) // Pikachu
    })

    it('should detect mythical Pokemon', () => {
      expect(FormatValidator.isMythical(151)).toBe(true) // Mew
      expect(FormatValidator.isMythical(1013)).toBe(true) // Pecharunt
      expect(FormatValidator.isMythical(25)).toBe(false) // Pikachu
    })

    it('should detect paradox Pokemon', () => {
      expect(FormatValidator.isParadox(984)).toBe(true) // Great Tusk
      expect(FormatValidator.isParadox(992)).toBe(true) // Iron Valiant
      expect(FormatValidator.isParadox(25)).toBe(false) // Pikachu
    })

    it('should detect sub-legendary Pokemon', () => {
      expect(FormatValidator.isSubLegendary(785)).toBe(true) // Tapu Koko
      expect(FormatValidator.isSubLegendary(1001)).toBe(true) // Wo-Chien
      expect(FormatValidator.isSubLegendary(25)).toBe(false) // Pikachu
    })
  })

  describe('Cache Management', () => {
    it('should cache validation results', () => {
      const pokemon = generateMockPokemon(1)

      // First call
      FormatValidator.validatePokemon(pokemon, TEST_FORMAT)

      const stats = FormatValidator.getCacheStats()
      expect(stats.size).toBeGreaterThan(0)
    })

    it('should clear cache', () => {
      const pokemon = generateMockPokemon(1)

      FormatValidator.validatePokemon(pokemon, TEST_FORMAT)
      FormatValidator.clearCache()

      const stats = FormatValidator.getCacheStats()
      expect(stats.size).toBe(0)
    })

    it('should clear format-specific cache', () => {
      const pokemon = generateMockPokemon(1)

      FormatValidator.validatePokemon(pokemon, TEST_FORMAT)
      FormatValidator.validatePokemon(pokemon, RESTRICTIVE_FORMAT)

      FormatValidator.clearFormatCache(TEST_FORMAT.id)

      // Should still have RESTRICTIVE_FORMAT cache
      const stats = FormatValidator.getCacheStats()
      expect(stats.size).toBeGreaterThan(0)
    })

    it('should preload format cache', () => {
      const pokemonList = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))

      const start = performance.now()
      FormatValidator.preloadFormat(pokemonList, TEST_FORMAT)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(500)
      console.log(`Preload format (100): ${duration.toFixed(2)}ms`)

      const stats = FormatValidator.getCacheStats()
      expect(stats.size).toBe(100)
    })
  })
})
