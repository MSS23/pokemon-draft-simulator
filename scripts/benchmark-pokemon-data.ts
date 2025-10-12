/**
 * Benchmark Script for Pokemon Data System
 *
 * Measures real-world performance of the optimized data system.
 * Run with: npx tsx scripts/benchmark-pokemon-data.ts
 */

import { PokemonDataManager } from '../src/lib/pokemon-data-manager'
import { PokemonCacheDB } from '../src/lib/pokemon-cache-db'
import { FormatValidator, type FormatRules } from '../src/lib/format-validator'

// VGC 2024 Regulation H Format
const VGC_REG_H_FORMAT: FormatRules = {
  id: 'vgc-reg-h',
  name: 'VGC 2024 Regulation H',
  generation: 9,
  gameType: 'doubles',
  allowedPokedexNumbers: [
    // Paldea Dex: 1-400
    ...Array.from({ length: 400 }, (_, i) => i + 1),
  ],
  bannedCategories: ['legendary', 'mythical', 'paradox'],
  explicitBans: [
    // Treasures of Ruin
    1001, 1002, 1003, 1004,
    // Loyal Three
    1014, 1015, 1016,
    // Ogerpon forms
    1017, 1018, 1019, 1020,
  ],
  costConfig: {
    type: 'bst',
    minCost: 1,
    maxCost: 20,
  },
}

interface BenchmarkResult {
  name: string
  duration: number
  success: boolean
  details?: any
}

const results: BenchmarkResult[] = []

function benchmark(name: string, fn: () => Promise<any>): Promise<BenchmarkResult> {
  return new Promise(async (resolve) => {
    console.log(`\n[BENCHMARK] ${name}...`)

    const start = performance.now()

    try {
      const result = await fn()
      const duration = performance.now() - start

      console.log(`✓ ${name}: ${duration.toFixed(2)}ms`)

      resolve({
        name,
        duration,
        success: true,
        details: result,
      })
    } catch (error) {
      const duration = performance.now() - start

      console.error(`✗ ${name}: FAILED (${duration.toFixed(2)}ms)`)
      console.error(error)

      resolve({
        name,
        duration,
        success: false,
      })
    }
  })
}

async function runBenchmarks() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('Pokemon Data System Performance Benchmarks')
  console.log('═══════════════════════════════════════════════════════')

  // 1. Initialization
  results.push(
    await benchmark('Initialize System', async () => {
      await PokemonDataManager.initialize({
        enableCache: true,
        enablePrefetch: true,
        enableImagePreload: true,
      })
    })
  )

  // 2. Load Format (with cache)
  results.push(
    await benchmark('Load Format (cached)', async () => {
      return await PokemonDataManager.loadFormat({
        formatId: 'vgc-reg-h',
        formatRules: VGC_REG_H_FORMAT,
        onProgress: (progress) => {
          if (progress.percentage % 10 === 0) {
            console.log(
              `  Progress: ${progress.completed}/${progress.total} (${progress.percentage.toFixed(0)}%)`
            )
          }
        },
      })
    })
  )

  // 3. Get All Pokemon
  results.push(
    await benchmark('Get All Pokemon', async () => {
      const pokemon = PokemonDataManager.getAllPokemon(true)
      return { count: pokemon.length }
    })
  )

  // 4. Search by Name
  results.push(
    await benchmark('Search: "pikachu"', async () => {
      const results = PokemonDataManager.search('pikachu')
      return { resultCount: results.length }
    })
  )

  // 5. Search by Type
  results.push(
    await benchmark('Search: "fire type"', async () => {
      const results = PokemonDataManager.search('fire')
      return { resultCount: results.length }
    })
  )

  // 6. Filter by Multiple Criteria
  results.push(
    await benchmark('Filter: Fire type, BST 400-600', async () => {
      const filtered = PokemonDataManager.filter({
        types: ['fire'],
        minBST: 400,
        maxBST: 600,
      })
      return { resultCount: filtered.length }
    })
  )

  // 7. Get Pokemon by Type
  results.push(
    await benchmark('Get Pokemon by Type: water', async () => {
      const pokemon = PokemonDataManager.getPokemonByType('water')
      return { count: pokemon.length }
    })
  )

  // 8. Validate Single Pokemon (uncached)
  FormatValidator.clearCache()
  results.push(
    await benchmark('Validate Pokemon (uncached)', async () => {
      return PokemonDataManager.validatePokemon('1')
    })
  )

  // 9. Validate Single Pokemon (cached)
  results.push(
    await benchmark('Validate Pokemon (cached)', async () => {
      return PokemonDataManager.validatePokemon('1')
    })
  )

  // 10. Batch Validation
  results.push(
    await benchmark('Validate 50 Pokemon', async () => {
      const pokemonIds = Array.from({ length: 50 }, (_, i) => String(i + 1))
      const results = pokemonIds.map(id => PokemonDataManager.validatePokemon(id))
      return { validCount: results.filter(r => r.isLegal).length }
    })
  )

  // 11. Get Cache Stats
  results.push(
    await benchmark('Get System Stats', async () => {
      return await PokemonDataManager.getStats()
    })
  )

  // Print Summary
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('Performance Summary')
  console.log('═══════════════════════════════════════════════════════')

  const successCount = results.filter(r => r.success).length
  const totalCount = results.length

  console.log(`\nSuccess Rate: ${successCount}/${totalCount} (${((successCount / totalCount) * 100).toFixed(1)}%)`)

  console.log('\nTiming Breakdown:')
  results.forEach(result => {
    const status = result.success ? '✓' : '✗'
    const color = result.success ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'

    console.log(`  ${color}${status}${reset} ${result.name.padEnd(40)} ${result.duration.toFixed(2)}ms`)
  })

  // Check performance targets
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('Performance Targets')
  console.log('═══════════════════════════════════════════════════════')

  const checks = [
    {
      name: 'Initialization',
      target: 2000,
      actual: results.find(r => r.name === 'Initialize System')?.duration || 0,
    },
    {
      name: 'Search',
      target: 50,
      actual: results.find(r => r.name === 'Search: "pikachu"')?.duration || 0,
    },
    {
      name: 'Validation (cached)',
      target: 1,
      actual: results.find(r => r.name === 'Validate Pokemon (cached)')?.duration || 0,
    },
    {
      name: 'Filter',
      target: 100,
      actual: results.find(r => r.name === 'Filter: Fire type, BST 400-600')?.duration || 0,
    },
  ]

  checks.forEach(check => {
    const met = check.actual <= check.target
    const status = met ? '✓' : '✗'
    const color = met ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'

    console.log(
      `  ${color}${status}${reset} ${check.name.padEnd(30)} ${check.actual.toFixed(2)}ms / ${check.target}ms`
    )
  })

  // Get final stats
  const finalStats = await PokemonDataManager.getStats()

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('System Statistics')
  console.log('═══════════════════════════════════════════════════════')

  console.log('\nCache:')
  console.log(`  Pokemon: ${finalStats.cache.pokemonCount}`)
  console.log(`  Formats: ${finalStats.cache.formatCount}`)
  console.log(`  Total Size: ${(finalStats.cache.totalSize / 1024 / 1024).toFixed(2)}MB`)

  console.log('\nSearch Index:')
  console.log(`  Pokemon: ${finalStats.search.pokemonCount}`)
  console.log(`  Types: ${finalStats.search.typeCount}`)
  console.log(`  Abilities: ${finalStats.search.abilityCount}`)

  console.log('\nValidator Cache:')
  console.log(`  Entries: ${finalStats.validator.size}`)

  console.log('\nImage Cache:')
  console.log(`  Images: ${finalStats.images.cacheSize}`)
  console.log(`  Cache Hit Rate: ${finalStats.images.cacheHitRate.toFixed(2)}%`)
  console.log(`  Load Success Rate: ${finalStats.images.loadSuccessRate.toFixed(2)}%`)

  console.log('\nPokemon:')
  console.log(`  Total: ${finalStats.pokemon.total}`)
  console.log(`  Legal: ${finalStats.pokemon.legal}`)
  console.log(`  Illegal: ${finalStats.pokemon.illegal}`)

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('Benchmark Complete')
  console.log('═══════════════════════════════════════════════════════\n')

  // Cleanup
  PokemonDataManager.shutdown()
}

// Run benchmarks
runBenchmarks().catch(console.error)
