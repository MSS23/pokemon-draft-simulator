#!/usr/bin/env tsx

/**
 * Format Pack Compiler
 *
 * Compiles format packs from JSON definitions and Pokemon data sources
 * into optimized, cache-busted artifacts for runtime use.
 *
 * Usage:
 *   npm run build:formats
 *   tsx scripts/build-format.ts
 *
 * Inputs:
 *   - data/formats/*.json (format pack definitions)
 *   - PokeAPI (Pokemon species data)
 *   - Showdown data (optional, for tier info)
 *
 * Outputs:
 *   - public/data/pokemon_index_[hash].json
 *   - public/data/format_[id]_[hash].json
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { FormatPack, CompiledFormat, PokemonIndex, PokemonData } from '../data/formats/format-schema'

const DATA_DIR = path.join(process.cwd(), 'data', 'formats')
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'data')
const POKEAPI_BASE = 'https://pokeapi.co/api/v2'

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

/**
 * Fetch Pokemon data from PokeAPI
 */
async function fetchPokemonFromAPI(id: number): Promise<any> {
  const response = await fetch(`${POKEAPI_BASE}/pokemon/${id}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch Pokemon ${id}: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Fetch Pokemon species data from PokeAPI
 */
async function fetchSpeciesFromAPI(id: number): Promise<any> {
  const response = await fetch(`${POKEAPI_BASE}/pokemon-species/${id}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch species ${id}: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Check if Pokemon belongs to a category
 */
function checkPokemonFlags(species: any, pokemon: any): {
  isLegendary: boolean
  isMythical: boolean
  isParadox: boolean
  isTreasureOfRuin: boolean
  isUltraBeast: boolean
  isSubLegendary: boolean
  isMega: boolean
  isGmax: boolean
} {
  const name = pokemon.name.toLowerCase()
  const formName = pokemon.forms?.[0]?.name?.toLowerCase() || ''

  // Paradox Pokemon (Gen 9)
  const paradoxNames = [
    'great-tusk', 'scream-tail', 'brute-bonnet', 'flutter-mane',
    'slither-wing', 'sandy-shocks', 'iron-treads', 'iron-bundle',
    'iron-hands', 'iron-jugulis', 'iron-moth', 'iron-thorns',
    'roaring-moon', 'iron-valiant', 'walking-wake', 'iron-leaves',
    'gouging-fire', 'raging-bolt', 'iron-boulder', 'iron-crown'
  ]

  // Treasures of Ruin (Gen 9)
  const ruinNames = ['wo-chien', 'chien-pao', 'ting-lu', 'chi-yu']

  // Ultra Beasts (Gen 7)
  const ultraBeastNames = [
    'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela',
    'kartana', 'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon'
  ]

  // Sub-legendaries (birds, beasts, etc.)
  const subLegendaries = [
    'articuno', 'zapdos', 'moltres', 'raikou', 'entei', 'suicune',
    'regirock', 'regice', 'registeel', 'latias', 'latios',
    'uxie', 'mesprit', 'azelf', 'heatran', 'regigigas', 'cresselia',
    'cobalion', 'terrakion', 'virizion', 'tornadus', 'thundurus', 'landorus',
    'type-null', 'silvally', 'tapu-koko', 'tapu-lele', 'tapu-bulu', 'tapu-fini',
    'kubfu', 'urshifu', 'regieleki', 'regidrago', 'glastrier', 'spectrier',
    'enamorus', 'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu',
    'okidogi', 'munkidori', 'fezandipiti', 'ogerpon'
  ]

  return {
    isLegendary: species.is_legendary || false,
    isMythical: species.is_mythical || false,
    isParadox: paradoxNames.includes(name),
    isTreasureOfRuin: ruinNames.includes(name),
    isUltraBeast: ultraBeastNames.includes(name),
    isSubLegendary: subLegendaries.includes(name),
    isMega: formName.includes('mega') || name.includes('mega'),
    isGmax: pokemon.is_default === false && formName.includes('gmax')
  }
}

/**
 * Build Pokemon index from PokeAPI
 */
async function buildPokemonIndex(minId: number = 1, maxId: number = 1025): Promise<PokemonIndex> {
  console.log(`Building Pokemon index (${minId}-${maxId})...`)
  const index: PokemonIndex = {}

  const batchSize = 50
  for (let i = minId; i <= maxId; i += batchSize) {
    const batch = []
    const end = Math.min(i + batchSize - 1, maxId)

    console.log(`Fetching Pokemon ${i}-${end}...`)

    for (let id = i; id <= end; id++) {
      batch.push(
        Promise.all([fetchPokemonFromAPI(id), fetchSpeciesFromAPI(id)])
          .then(([pokemon, species]) => {
            const flags = checkPokemonFlags(species, pokemon)

            // Determine regional dex membership
            const regionalDex: string[] = []
            if (species.pokedex_numbers) {
              for (const dex of species.pokedex_numbers) {
                regionalDex.push(dex.pokedex.name)
              }
            }

            const data: PokemonData = {
              id: pokemon.name,
              name: pokemon.name,
              nationalDex: pokemon.id,
              types: pokemon.types.map((t: any) => t.type.name),
              stats: {
                hp: pokemon.stats[0].base_stat,
                attack: pokemon.stats[1].base_stat,
                defense: pokemon.stats[2].base_stat,
                specialAttack: pokemon.stats[3].base_stat,
                specialDefense: pokemon.stats[4].base_stat,
                speed: pokemon.stats[5].base_stat,
                total: pokemon.stats.reduce((sum: number, s: any) => sum + s.base_stat, 0)
              },
              abilities: pokemon.abilities.map((a: any) => a.ability.name),
              flags: {
                ...flags,
                isRegionalForm: pokemon.name.includes('-alola') ||
                                pokemon.name.includes('-galar') ||
                                pokemon.name.includes('-hisui') ||
                                pokemon.name.includes('-paldea'),
                isFusion: pokemon.name.includes('necrozma') && pokemon.name !== 'necrozma'
              },
              regionalDex
            }

            index[pokemon.name] = data
            return data
          })
          .catch((err) => {
            console.warn(`Failed to fetch Pokemon ${id}:`, err.message)
            return null
          })
      )
    }

    await Promise.all(batch)

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const count = Object.keys(index).length
  console.log(`✓ Built Pokemon index with ${count} entries`)

  return index
}

/**
 * Compile a format pack into a runtime-ready format
 */
function compileFormat(formatPack: FormatPack, pokemonIndex: PokemonIndex): CompiledFormat {
  console.log(`Compiling format: ${formatPack.label}...`)

  const legalPokemon: string[] = []
  const costs: Record<string, number> = {}

  // Determine legality for each Pokemon
  for (const [pokemonId, data] of Object.entries(pokemonIndex)) {
    let isLegal = true

    // Check if in explicit ban list
    if (formatPack.explicitBans.includes(pokemonId) || formatPack.explicitBans.includes(data.name)) {
      isLegal = false
    }

    // Check category bans (unless explicitly allowed)
    if (isLegal && !formatPack.explicitAllows.includes(pokemonId)) {
      const flags = data.flags

      if (formatPack.bannedCategories.legendary && flags.isLegendary) isLegal = false
      if (formatPack.bannedCategories.mythical && flags.isMythical) isLegal = false
      if (formatPack.bannedCategories.paradox && flags.isParadox) isLegal = false
      if (formatPack.bannedCategories.treasuresOfRuin && flags.isTreasureOfRuin) isLegal = false
      if (formatPack.bannedCategories.ultraBeast && flags.isUltraBeast) isLegal = false
      if (formatPack.bannedCategories.subLegendary && flags.isSubLegendary) isLegal = false

      // Megas and Gmaxes usually banned unless format specifies
      if (flags.isMega || flags.isGmax) isLegal = false
    }

    // Check regional dex requirements
    if (isLegal) {
      const requiredDexes = Object.entries(formatPack.regionalDex)
        .filter(([_, required]) => required)
        .map(([dex]) => dex)

      if (requiredDexes.length > 0) {
        const hasRequiredDex = requiredDexes.some(dex =>
          data.regionalDex.some(d => d.includes(dex))
        )
        if (!hasRequiredDex) isLegal = false
      }
    }

    // Explicit allows override everything
    if (formatPack.explicitAllows.includes(pokemonId)) {
      isLegal = true
    }

    if (isLegal) {
      legalPokemon.push(pokemonId)

      // Determine cost
      let cost = formatPack.costConfig.defaultCost

      // Apply overrides
      if (formatPack.pointOverrides[pokemonId]) {
        cost = formatPack.pointOverrides[pokemonId]
      } else if (formatPack.pointOverrides[data.name]) {
        cost = formatPack.pointOverrides[data.name]
      } else {
        // Calculate based on method
        switch (formatPack.costConfig.calculationMethod) {
          case 'bst-based':
            // Simple BST-based calculation
            const bst = data.stats.total
            if (bst >= 600) cost = 25
            else if (bst >= 550) cost = 20
            else if (bst >= 500) cost = 15
            else if (bst >= 450) cost = 12
            else if (bst >= 400) cost = 10
            else cost = 8
            break

          case 'flat':
            cost = formatPack.costConfig.defaultCost
            break

          // tier-based and usage-based would require additional data sources
          default:
            cost = formatPack.costConfig.defaultCost
        }
      }

      // Clamp to min/max
      cost = Math.max(formatPack.costConfig.minCost, Math.min(formatPack.costConfig.maxCost, cost))
      costs[pokemonId] = cost
    }
  }

  console.log(`✓ Compiled ${formatPack.label}: ${legalPokemon.length} legal Pokemon`)

  // Create hash for cache-busting
  const content = JSON.stringify({ legalPokemon, costs })
  const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 8)

  // Destructure to remove pointOverrides from format
  const { pointOverrides, ...formatWithoutOverrides } = formatPack

  return {
    format: formatWithoutOverrides,
    legalPokemon,
    costs,
    hash,
    compiledAt: new Date().toISOString()
  }
}

/**
 * Main build function
 */
async function main() {
  console.log('🔨 Building format packs...\n')

  try {
    // Step 1: Build Pokemon index
    console.log('Step 1: Building Pokemon index from PokeAPI...')
    const pokemonIndex = await buildPokemonIndex(1, 1025)

    // Save Pokemon index
    const indexHash = crypto.createHash('md5')
      .update(JSON.stringify(pokemonIndex))
      .digest('hex')
      .substring(0, 8)

    const indexPath = path.join(OUTPUT_DIR, `pokemon_index_${indexHash}.json`)
    fs.writeFileSync(indexPath, JSON.stringify(pokemonIndex, null, 2))
    console.log(`✓ Saved Pokemon index: pokemon_index_${indexHash}.json\n`)

    // Step 2: Compile format packs
    console.log('Step 2: Compiling format packs...')
    const formatFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))

    for (const file of formatFiles) {
      const formatPath = path.join(DATA_DIR, file)
      const formatPack: FormatPack = JSON.parse(fs.readFileSync(formatPath, 'utf-8'))

      const compiled = compileFormat(formatPack, pokemonIndex)

      const outputPath = path.join(OUTPUT_DIR, `format_${formatPack.id}_${compiled.hash}.json`)
      fs.writeFileSync(outputPath, JSON.stringify(compiled, null, 2))
      console.log(`✓ Saved compiled format: format_${formatPack.id}_${compiled.hash}.json`)
    }

    // Step 3: Create manifest
    console.log('\nStep 3: Creating manifest...')

    // Compile formats again to get hashes (or store them from previous step)
    const formatsWithHashes = []
    for (const file of formatFiles) {
      const formatPath = path.join(DATA_DIR, file)
      const formatPack: FormatPack = JSON.parse(fs.readFileSync(formatPath, 'utf-8'))
      const compiled = compileFormat(formatPack, pokemonIndex)

      formatsWithHashes.push({
        id: formatPack.id,
        label: formatPack.label,
        version: formatPack.version,
        hash: compiled.hash
      })
    }

    const manifest = {
      pokemonIndexHash: indexHash,
      formats: formatsWithHashes,
      builtAt: new Date().toISOString()
    }

    const manifestPath = path.join(OUTPUT_DIR, 'format-manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    console.log('✓ Saved manifest: format-manifest.json')

    console.log('\n✅ Build complete!')
  } catch (error) {
    console.error('\n❌ Build failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

export { buildPokemonIndex, compileFormat }