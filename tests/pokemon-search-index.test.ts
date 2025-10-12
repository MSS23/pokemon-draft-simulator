/**
 * Unit Tests for Pokemon Search Index
 *
 * Tests search, filter, and lookup functionality without browser dependencies
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { PokemonSearchIndex } from '@/lib/pokemon-search-index'
import type { CachedPokemon } from '@/lib/pokemon-cache-db'

// Generate mock Pokemon data
function generateMockPokemon(id: number): CachedPokemon {
  const types = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']

  return {
    id: String(id),
    name: `pokemon-${id}`,
    types: [
      { type: { name: types[id % types.length] } },
    ],
    stats: [
      { base_stat: 45 + (id % 50), stat: { name: 'hp' } },
      { base_stat: 49 + (id % 50), stat: { name: 'attack' } },
      { base_stat: 49 + (id % 50), stat: { name: 'defense' } },
      { base_stat: 65 + (id % 50), stat: { name: 'special-attack' } },
      { base_stat: 65 + (id % 50), stat: { name: 'special-defense' } },
      { base_stat: 45 + (id % 50), stat: { name: 'speed' } },
    ],
    abilities: [
      { ability: { name: `ability-${id}` }, is_hidden: false },
    ],
    sprites: {
      front_default: `https://example.com/${id}.png`,
    },
    species: { name: `species-${id}`, url: `https://example.com/species/${id}` },
    height: 10 + (id % 10),
    weight: 100 + (id % 100),
    moves: [
      { move: { name: `move-${id}-1` } },
      { move: { name: `move-${id}-2` } },
    ],
    is_legendary: id > 90,
    is_mythical: id > 95,
    cachedAt: Date.now(),
  }
}

describe('PokemonSearchIndex', () => {
  const mockPokemon: CachedPokemon[] = []
  const costs: Record<string, number> = {}

  beforeAll(() => {
    // Generate 100 mock Pokemon
    for (let i = 1; i <= 100; i++) {
      mockPokemon.push(generateMockPokemon(i))
      costs[String(i)] = Math.floor((i % 20) + 1)
    }

    // Build index
    PokemonSearchIndex.buildIndex(mockPokemon, costs)
  })

  describe('Index Building', () => {
    it('should build index successfully', () => {
      const stats = PokemonSearchIndex.getStats()

      expect(stats.pokemonCount).toBe(100)
      expect(stats.typeCount).toBeGreaterThan(0)
      expect(stats.abilityCount).toBe(100)
    })

    it('should build index in < 100ms', () => {
      const pokemon = Array.from({ length: 100 }, (_, i) => generateMockPokemon(i + 1))

      const start = performance.now()
      PokemonSearchIndex.buildIndex(pokemon)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(100)
      console.log(`Build index (100): ${duration.toFixed(2)}ms`)
    })
  })

  describe('Search', () => {
    it('should search by name', () => {
      const results = PokemonSearchIndex.search('pokemon-1')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].pokemon.name).toContain('pokemon-1')
    })

    it('should search by partial name', () => {
      const results = PokemonSearchIndex.search('pokemon-2')

      expect(results.length).toBeGreaterThan(0)
      expect(results.some(r => r.pokemon.name === 'pokemon-2')).toBe(true)
    })

    it('should return empty array for no matches', () => {
      const results = PokemonSearchIndex.search('zzzzzzzzz')

      expect(results).toEqual([])
    })

    it('should search in < 50ms', () => {
      const start = performance.now()
      PokemonSearchIndex.search('pokemon-1')
      const duration = performance.now() - start

      expect(duration).toBeLessThan(50)
      console.log(`Search: ${duration.toFixed(2)}ms`)
    })

    it('should limit results', () => {
      const results = PokemonSearchIndex.search('pokemon', 10)

      expect(results.length).toBeLessThanOrEqual(10)
    })
  })

  describe('Filter', () => {
    it('should filter by type', () => {
      const filtered = PokemonSearchIndex.filter(mockPokemon, {
        types: ['fire'],
      })

      expect(filtered.length).toBeGreaterThan(0)
      expect(filtered.every(p => p.types.some(t => t.type.name === 'fire'))).toBe(true)
    })

    it('should filter by multiple types', () => {
      const filtered = PokemonSearchIndex.filter(mockPokemon, {
        types: ['fire', 'water'],
      })

      expect(filtered.length).toBeGreaterThan(0)
      expect(
        filtered.every(p =>
          p.types.some(t => t.type.name === 'fire' || t.type.name === 'water')
        )
      ).toBe(true)
    })

    it('should filter by BST range', () => {
      const filtered = PokemonSearchIndex.filter(mockPokemon, {
        minBST: 300,
        maxBST: 400,
      })

      filtered.forEach(p => {
        const bst = p.stats.reduce((sum, s) => sum + s.base_stat, 0)
        expect(bst).toBeGreaterThanOrEqual(300)
        expect(bst).toBeLessThanOrEqual(400)
      })
    })

    it('should filter by cost range', () => {
      const filtered = PokemonSearchIndex.filter(mockPokemon, {
        minCost: 5,
        maxCost: 10,
      })

      expect(filtered.length).toBeGreaterThan(0)
    })

    it('should filter by legendary flag', () => {
      const filtered = PokemonSearchIndex.filter(mockPokemon, {
        legendary: true,
      })

      expect(filtered.every(p => p.is_legendary)).toBe(true)
    })

    it('should filter by mythical flag', () => {
      const filtered = PokemonSearchIndex.filter(mockPokemon, {
        mythical: true,
      })

      expect(filtered.every(p => p.is_mythical)).toBe(true)
    })

    it('should filter with multiple criteria', () => {
      const filtered = PokemonSearchIndex.filter(mockPokemon, {
        types: ['fire'],
        minBST: 300,
        maxBST: 500,
        minCost: 3,
        maxCost: 15,
      })

      expect(filtered.length).toBeGreaterThan(0)
      expect(filtered.every(p => p.types.some(t => t.type.name === 'fire'))).toBe(true)
    })

    it('should filter in < 20ms', () => {
      const start = performance.now()
      PokemonSearchIndex.filter(mockPokemon, { types: ['fire'] })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(20)
      console.log(`Filter by type: ${duration.toFixed(2)}ms`)
    })
  })

  describe('Lookups', () => {
    it('should get Pokemon by ID', () => {
      const pokemon = PokemonSearchIndex.getPokemon('1')

      expect(pokemon).toBeDefined()
      expect(pokemon?.id).toBe('1')
    })

    it('should lookup by ID in < 1ms', () => {
      const start = performance.now()
      PokemonSearchIndex.getPokemon('1')
      const duration = performance.now() - start

      expect(duration).toBeLessThan(1)
      console.log(`Lookup by ID: ${duration.toFixed(3)}ms`)
    })

    it('should return undefined for non-existent ID', () => {
      const pokemon = PokemonSearchIndex.getPokemon('9999')

      expect(pokemon).toBeUndefined()
    })

    it('should get Pokemon by type', () => {
      const pokemon = PokemonSearchIndex.getPokemonByType('fire')

      expect(pokemon.length).toBeGreaterThan(0)
      expect(pokemon.every(p => p.types.some(t => t.type.name === 'fire'))).toBe(true)
    })

    it('should get Pokemon by ability', () => {
      const pokemon = PokemonSearchIndex.getPokemonByAbility('ability-1')

      expect(pokemon.length).toBeGreaterThan(0)
      expect(pokemon.some(p => p.abilities.some(a => a.ability.name === 'ability-1'))).toBe(true)
    })

    it('should get all types', () => {
      const types = PokemonSearchIndex.getAllTypes()

      expect(types.length).toBeGreaterThan(0)
      expect(types).toContain('fire')
    })

    it('should get all abilities', () => {
      const abilities = PokemonSearchIndex.getAllAbilities()

      expect(abilities.length).toBe(100)
    })
  })

  describe('Cost and Stats', () => {
    it('should get BST for Pokemon', () => {
      const bst = PokemonSearchIndex.getBST('1')

      expect(bst).toBeGreaterThan(0)
    })

    it('should get cost for Pokemon', () => {
      const cost = PokemonSearchIndex.getCost('1')

      expect(cost).toBeGreaterThan(0)
    })

    it('should update costs', () => {
      const newCosts = { '1': 99, '2': 88 }

      PokemonSearchIndex.updateCosts(newCosts)

      expect(PokemonSearchIndex.getCost('1')).toBe(99)
      expect(PokemonSearchIndex.getCost('2')).toBe(88)
    })
  })

  describe('Clear', () => {
    it('should clear index', () => {
      PokemonSearchIndex.clear()

      const stats = PokemonSearchIndex.getStats()

      expect(stats.pokemonCount).toBe(0)
      expect(stats.typeCount).toBe(0)

      // Rebuild for other tests
      PokemonSearchIndex.buildIndex(mockPokemon, costs)
    })
  })
})
