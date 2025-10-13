import { Pokemon, PokemonType, PokemonStats, Move } from '@/types'
import { getTypeColor } from '@/utils/pokemon'
import { PokemonFormat, getFormatById, DEFAULT_FORMAT } from '@/lib/formats'
import { createFormatRulesEngine } from '@/domain/rules'
import { supabase } from '@/lib/supabase'

const POKEAPI_BASE_URL = 'https://pokeapi.co/api/v2'

interface PokeAPIResponse {
  id: number
  name: string
  types: Array<{
    type: {
      name: string
    }
  }>
  stats: Array<{
    base_stat: number
    stat: {
      name: string
    }
  }>
  abilities: Array<{
    ability: {
      name: string
    }
    is_hidden: boolean
  }>
  sprites: {
    front_default: string
    other: {
      'official-artwork': {
        front_default: string
      }
    }
  }
  species: {
    url: string
  }
  moves: Array<{
    move: {
      name: string
      url: string
    }
    version_group_details: Array<{
      level_learned_at: number
      version_group: {
        name: string
        url: string
      }
      move_learn_method: {
        name: string
        url: string
      }
    }>
  }>
}

interface PokeAPISpeciesResponse {
  is_legendary: boolean
  is_mythical: boolean
  generation: {
    name: string
  }
}

interface PokeAPIMoveResponse {
  id: number
  name: string
  power: number | null
  accuracy: number | null
  pp: number
  priority: number
  type: {
    name: string
  }
  damage_class: {
    name: string
  }
  effect_entries: Array<{
    effect: string
    short_effect: string
    language: {
      name: string
    }
  }>
  flavor_text_entries: Array<{
    flavor_text: string
    language: {
      name: string
    }
    version_group: {
      name: string
    }
  }>
}

// Official Pokédex ranges for Regulation H
const REGULATION_H_POKEDEX_RANGES = {
  paldea: [
    { start: 1, end: 375 },    // Paldea Pokédex #001-375
    { start: 388, end: 392 }   // Paldea Pokédex #388-392
  ],
  kitakami: [
    { start: 1, end: 196 }     // Kitakami Pokédex #001-196 (maps to specific National Dex numbers)
  ],
  blueberry: [
    { start: 1, end: 235 }     // Blueberry Academy Pokédex #001-235 (maps to specific National Dex numbers)
  ]
}

// Paldea + DLC Pokédex - Accurate list of Pokemon available in Scarlet/Violet + DLC
// Based on official Paldea, Kitakami, and Blueberry Academy dex entries
const PALDEA_COMPLETE_DEX = new Set([
  // Paldea Pokédex (Gen 9 starters + Paldea natives + select returning species)
  906, 907, 908, // Sprigatito line
  909, 910, 911, // Fuecoco line
  912, 913, 914, // Quaxly line
  
  // Common early game Pokemon
  19, 20, // Rattata line
  21, 22, // Spearow line
  52, 53, // Meowth line (including Paldean)
  54, 55, // Psyduck line
  56, 57, // Mankey line
  77, 78, // Ponyta line
  79, 80, // Slowpoke line
  81, 82, // Magnemite line
  83, // Farfetch'd
  95, // Onix
  96, 97, // Drowzee line
  102, 103, // Exeggcute line
  104, 105, // Cubone line
  111, 112, // Rhyhorn line
  128, // Tauros
  129, 130, // Magikarp line
  133, // Eevee
  134, 135, 136, 196, 197, 470, 471, 700, // Eeveelutions
  
  // Select Kanto classics
  1, 2, 3, // Bulbasaur line
  4, 5, 6, // Charmander line
  7, 8, 9, // Squirtle line
  25, 26, // Pikachu line
  
  // More Paldea natives and DLC additions
  194, 195, // Wooper line (including Paldean)
  198, // Murkrow
  206, // Dunsparce
  215, // Sneasel
  220, 221, // Swinub line
  231, 232, // Phanpy line
  
  // Gen 3+ selections
  280, 281, 282, // Ralts line
  307, 308, // Meditite line
  325, 326, // Spoink line
  355, 356, // Duskull line
  361, 362, // Snorunt line
  
  // More modern additions (simplified for now - this would be the full 400+ Pokemon)
  // Note: This is a simplified list - the actual Paldea dex has ~400 Pokemon
  // For a production app, you'd want the complete official list
  
  // Gen 9 new Pokemon (Paldea natives)
  915, 916, 917, // Lechonk line  
  918, 919, // Tarountula line
  920, 921, // Nymble line
  922, 923, 924, // Pawmi line
  925, 926, // Tandemaus line
  927, 928, 929, // Fidough line
  930, 931, // Smoliv line
  932, 933, // Squawkabilly
  934, // Nacli
  935, 936, // Charcadet line
  937, 938, 939, // Tadbulb line
  940, 941, // Wattrel line
  942, 943, 944, // Maschiff line
  945, 946, // Shroodle line
  947, 948, 949, // Bramblin line
  950, // Toedscool
  951, // Toedscruel
  952, 953, 954, // Klawf
  955, 956, // Capsakid line
  957, 958, // Rellor line
  959, // Flittle
  960, // Espathra
  961, 962, // Tinkatink line
  963, // Wiglett
  964, // Wugtrio
  965, 966, // Bombirdier
  967, 968, // Finizen line
  969, 970, 971, // Varoom line
  972, 973, // Cyclizar
  974, 975, // Orthworm
  976, 977, 978, // Glimmet line
  979, 980, // Greavard line
  981, // Flamigo
  982, 983, // Cetoddle line
  984, 985, // Veluza
  986, 987, // Dondozo
  988, 989, // Tatsugiri
  990, 991, 992, // Annihilape line
  993, 994, // Clodsire
  995, 996, // Farigiraf
  997, 998, 999, // Dudunsparce
  1000, 1001, // Kingambit line
  1002, 1003, 1004, // Great Tusk (banned in Reg H but in dex)
  1005, 1006, 1007, 1008, 1009, 1010 // Other new Pokemon
])

// Cache for move details to avoid repeated API calls
const moveCache = new Map<string, Move>()

const fetchMoveDetails = async (moveUrl: string): Promise<PokeAPIMoveResponse> => {
  const response = await fetch(moveUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch move details: ${response.statusText}`)
  }
  return response.json()
}

const processMoveData = async (pokemonMoves: PokeAPIResponse['moves']): Promise<Move[]> => {
  // Limit to most recent version group and prioritize level-up moves
  const recentVersionGroups = ['scarlet-violet', 'sword-shield', 'ultra-sun-ultra-moon', 'sun-moon']
  const processedMoves = new Map<string, Move>()

  // Sort moves by relevance (level-up moves first, then by level learned)
  const sortedMoves = pokemonMoves.sort((a, b) => {
    const aLevelUp = a.version_group_details.find(vgd => vgd.move_learn_method.name === 'level-up')
    const bLevelUp = b.version_group_details.find(vgd => vgd.move_learn_method.name === 'level-up')

    if (aLevelUp && !bLevelUp) return -1
    if (!aLevelUp && bLevelUp) return 1
    if (aLevelUp && bLevelUp) return aLevelUp.level_learned_at - bLevelUp.level_learned_at
    return 0
  })

  // Limit to first 30 moves to avoid performance issues
  const movesToProcess = sortedMoves.slice(0, 30)

  for (const moveData of movesToProcess) {
    const moveName = moveData.move.name

    // Check cache first
    if (moveCache.has(moveName)) {
      const cachedMove = moveCache.get(moveName)!

      // Find the most relevant version group details for this Pokemon
      const relevantDetail = moveData.version_group_details.find(vgd =>
        recentVersionGroups.includes(vgd.version_group.name)
      ) || moveData.version_group_details[0]

      processedMoves.set(moveName, {
        ...cachedMove,
        learnMethod: relevantDetail.move_learn_method.name.replace('-', ' ') as Move['learnMethod'],
        levelLearnedAt: relevantDetail.level_learned_at || null
      })
      continue
    }

    try {
      const moveDetails = await fetchMoveDetails(moveData.move.url)

      // Get English description
      const englishDescription = moveDetails.flavor_text_entries.find(
        entry => entry.language.name === 'en'
      )?.flavor_text || moveDetails.effect_entries.find(
        entry => entry.language.name === 'en'
      )?.short_effect || 'No description available'

      // Find the most relevant version group details
      const relevantDetail = moveData.version_group_details.find(vgd =>
        recentVersionGroups.includes(vgd.version_group.name)
      ) || moveData.version_group_details[0]

      const move: Move = {
        id: moveDetails.id,
        name: moveDetails.name.split('-').map(part =>
          part.charAt(0).toUpperCase() + part.slice(1)
        ).join(' '),
        type: moveDetails.type.name,
        power: moveDetails.power,
        accuracy: moveDetails.accuracy,
        pp: moveDetails.pp,
        priority: moveDetails.priority,
        damageClass: moveDetails.damage_class.name as Move['damageClass'],
        learnMethod: relevantDetail.move_learn_method.name.replace('-', ' ') as Move['learnMethod'],
        levelLearnedAt: relevantDetail.level_learned_at || null,
        description: englishDescription.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      }

      // Cache the move
      moveCache.set(moveName, move)
      processedMoves.set(moveName, move)

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 50))

    } catch (error) {
      console.warn(`Failed to fetch details for move ${moveName}:`, error)
    }
  }

  return Array.from(processedMoves.values())
}

export const fetchPokemon = async (identifier: string | number, formatId?: string, includeMoves: boolean = false): Promise<Pokemon> => {
  const response = await fetch(`${POKEAPI_BASE_URL}/pokemon/${identifier}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch Pokemon: ${response.statusText}`)
  }

  const data: PokeAPIResponse = await response.json()

  // Fetch species data for legendary/mythical status
  const speciesResponse = await fetch(data.species.url)
  const speciesData: PokeAPISpeciesResponse = await speciesResponse.json()

  const types: PokemonType[] = data.types.map(typeInfo => ({
    name: typeInfo.type.name,
    color: getTypeColor(typeInfo.type.name)
  }))

  const stats: PokemonStats = {
    hp: data.stats.find(s => s.stat.name === 'hp')?.base_stat || 0,
    attack: data.stats.find(s => s.stat.name === 'attack')?.base_stat || 0,
    defense: data.stats.find(s => s.stat.name === 'defense')?.base_stat || 0,
    specialAttack: data.stats.find(s => s.stat.name === 'special-attack')?.base_stat || 0,
    specialDefense: data.stats.find(s => s.stat.name === 'special-defense')?.base_stat || 0,
    speed: data.stats.find(s => s.stat.name === 'speed')?.base_stat || 0,
    total: 0
  }

  stats.total = stats.hp + stats.attack + stats.defense +
                stats.specialAttack + stats.specialDefense + stats.speed

  const abilities = data.abilities.map(abilityInfo =>
    abilityInfo.ability.name.replace('-', ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )

  // Process moves if requested
  const moves = includeMoves ? await processMoveData(data.moves) : undefined


  // Extract generation number from generation name (e.g., "generation-i" -> 1)
  const generationMap: Record<string, number> = {
    'generation-i': 1,
    'generation-ii': 2,
    'generation-iii': 3,
    'generation-iv': 4,
    'generation-v': 5,
    'generation-vi': 6,
    'generation-vii': 7,
    'generation-viii': 8,
    'generation-ix': 9
  }
  const generation = generationMap[speciesData.generation.name] || undefined

  const pokemon: Pokemon = {
    id: data.id.toString(),
    name: data.name.split('-').map(part =>
      part.charAt(0).toUpperCase() + part.slice(1)
    ).join('-'),
    types,
    stats,
    abilities,
    sprite: data.sprites.front_default || '',
    cost: 0,
    isLegal: true, // Will be validated by format rules
    moves,
    isLegendary: speciesData.is_legendary,
    isMythical: speciesData.is_mythical,
    generation
  }

  // Apply format-specific validation and cost calculation using NEW rules engine
  try {
    const targetFormatId = formatId || DEFAULT_FORMAT
    const rulesEngine = createFormatRulesEngine(targetFormatId)
    const validation = rulesEngine.validatePokemon(pokemon)
    pokemon.isLegal = validation.isLegal
    pokemon.cost = validation.cost
  } catch (error) {
    console.warn(`Failed to validate Pokemon ${pokemon.id} with NEW rules engine:`, error)
    // Fallback: mark as illegal
    pokemon.isLegal = false
    pokemon.cost = 0
  }

  return pokemon
}

export const fetchPokemonList = async (limit: number = 400, formatId?: string): Promise<Pokemon[]> => {
  const pokemonList: Pokemon[] = []

  // Start with a smaller batch for faster loading
  const batchSize = 50
  const batches = Math.ceil(limit / batchSize)

  for (let batch = 0; batch < batches; batch++) {
    const start = batch * batchSize + 1
    const end = Math.min((batch + 1) * batchSize, limit)

    const promises = []
    for (let i = start; i <= end; i++) {
      promises.push(fetchPokemon(i, formatId).catch(() => null)) // Catch errors for missing Pokemon
    }

    try {
      const batchResults = await Promise.all(promises)
      const validPokemon = batchResults.filter((pokemon): pokemon is Pokemon =>
        pokemon !== null && pokemon.isLegal
      )

      pokemonList.push(...validPokemon)
    } catch (error) {
      console.warn(`Failed to fetch batch ${batch + 1}:`, error)
      // Continue with next batch instead of failing completely
    }
  }

  return pokemonList.sort((a, b) => parseInt(a.id) - parseInt(b.id))
}

export const searchPokemon = async (query: string, formatId?: string): Promise<Pokemon[]> => {
  if (query.length < 2) return []

  // First try to fetch by exact name
  try {
    const pokemon = await fetchPokemon(query.toLowerCase(), formatId)
    return [pokemon]
  } catch {
    // If exact match fails, try to search in our cached list
    // In a real app, you'd want to implement a proper search endpoint
    return []
  }
}

export const fetchPokemonByType = async (typeName: string, formatId?: string): Promise<Pokemon[]> => {
  const response = await fetch(`${POKEAPI_BASE_URL}/type/${typeName.toLowerCase()}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch Pokemon by type: ${response.statusText}`)
  }

  const data = await response.json()
  const pokemonPromises = data.pokemon
    .slice(0, 100) // Limit to first 100 to avoid overwhelming
    .map((p: any) => {
      const id = p.pokemon.url.split('/').slice(-2, -1)[0]
      return fetchPokemon(id, formatId).catch(() => null)
    })

  const pokemonList = await Promise.all(pokemonPromises)
  return pokemonList.filter((pokemon): pokemon is Pokemon =>
    pokemon !== null && pokemon.isLegal
  )
}

const isPaldeaPokemon = (id: number): boolean => {
  return PALDEA_COMPLETE_DEX.has(id)
}

// Regional dex checkers for formats
export const isInRegionalDex = (pokemonId: string | number, regions: string[]): boolean => {
  try {
    const id = typeof pokemonId === 'string' ? parseInt(pokemonId) : pokemonId
    
    // Check for invalid IDs
    if (isNaN(id) || id <= 0) {
      return false
    }
    
    if (regions.includes('paldea') || regions.includes('kitakami') || regions.includes('blueberry')) {
      // For Paldea formats, use our accurate dex
      return isPaldeaPokemon(id)
    }
    
    // For other regions, we'd need more regional dex data
    // For now, allow all Pokemon for non-Paldea formats
    return true
  } catch (error) {
    console.warn('Error checking regional dex for Pokemon:', pokemonId, error)
    return false
  }
}

// Helper function to get format-filtered Pokemon list
export const fetchPokemonForFormat = async (formatId: string, limit: number = 100): Promise<Pokemon[]> => {
  const format = getFormatById(formatId)
  if (!format) {
    throw new Error(`Format ${formatId} not found`)
  }

  // Try to load from pre-built format pack first (much faster!)
  try {
    const startTime = performance.now()
    const manifest = await fetch('/data/format-manifest.json').then(res => res.json())
    const formatEntry = manifest?.formats?.find((f: any) => f.id === formatId)

    if (formatEntry) {
      // Load both the format pack and the Pokemon index in parallel
      const [formatPack, pokemonIndex] = await Promise.all([
        fetch(`/data/format_${formatId}_${formatEntry.hash}.json`).then(res => res.json()),
        fetch(`/data/pokemon_index_${manifest.pokemonIndexHash}.json`).then(res => res.json())
      ])

      // Validate format pack structure (should have legalPokemon array and costs object)
      if (formatPack && Array.isArray(formatPack.legalPokemon) && formatPack.legalPokemon.length > 0 && formatPack.costs && pokemonIndex) {
        console.log(`✨ Loaded format pack with ${formatPack.legalPokemon.length} legal Pokemon for ${formatId} from pre-built files`)

        // Convert legal Pokemon names to full Pokemon objects using the index
        const pokemonList: Pokemon[] = []
        const legalPokemonSlice = formatPack.legalPokemon.slice(0, limit)

        for (const pokemonName of legalPokemonSlice) {
          const pokemonData = pokemonIndex[pokemonName]
          if (!pokemonData) {
            console.warn(`Pokemon ${pokemonName} not found in index`)
            continue
          }

          // Convert from index format to Pokemon type
          const types: PokemonType[] = pokemonData.types.map((typeName: string) => ({
            name: typeName,
            color: getTypeColor(typeName)
          }))

          const pokemon: Pokemon = {
            id: pokemonData.nationalDex.toString(),
            name: pokemonData.name.split('-').map((part: string) =>
              part.charAt(0).toUpperCase() + part.slice(1)
            ).join('-'),
            types,
            stats: pokemonData.stats,
            abilities: pokemonData.abilities.map((ability: string) =>
              ability.replace('-', ' ')
                .split(' ')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
            ),
            sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonData.nationalDex}.png`,
            cost: formatPack.costs[pokemonName] || 10,
            isLegal: true,
            isLegendary: pokemonData.flags.isLegendary,
            isMythical: pokemonData.flags.isMythical,
            generation: Math.ceil(pokemonData.nationalDex / 100) // Rough estimation
          }

          pokemonList.push(pokemon)
        }

        const loadTime = Math.round(performance.now() - startTime)
        console.log(`✅ Loaded ${pokemonList.length} Pokemon from format pack in ${loadTime}ms`)
        return pokemonList.sort((a, b) => parseInt(a.id) - parseInt(b.id))
      } else {
        console.warn('Format pack has invalid structure (missing legalPokemon or costs), falling back to API fetching')
      }
    }
  } catch (error) {
    console.warn('Could not load pre-built format pack, falling back to API fetching:', error)
  }

  // Fallback: Fetch from PokeAPI (slower)
  let pokemonRanges: { start: number, end: number }[] = []

  // Special handling for Regulation H format
  if (formatId === 'vgc-reg-h') {
    // Fetch all Gen 9 Pokemon (National Dex 906-1025) plus select returning Pokemon
    // The rules engine will handle the actual legality filtering
    pokemonRanges = [
      { start: 1, end: 1025 }  // Fetch all Pokemon up to current gen, rules engine filters
    ]
  } else {
    // Get allowed generations for other formats
    const allowedGenerations = format.ruleset.allowedGenerations
    let pokemonRange = { start: 1, end: 1010 }

    // Adjust range based on generation restrictions
    if (allowedGenerations.length > 0 && !allowedGenerations.includes(9)) {
      // For older generations, limit the range
      const maxGen = Math.max(...allowedGenerations)
      const genRanges: Record<number, { start: number, end: number }> = {
        1: { start: 1, end: 151 },
        2: { start: 1, end: 251 },
        3: { start: 1, end: 386 },
        4: { start: 1, end: 493 },
        5: { start: 1, end: 649 },
        6: { start: 1, end: 721 },
        7: { start: 1, end: 809 },
        8: { start: 1, end: 905 }
      }
      pokemonRange = genRanges[maxGen] || pokemonRange
    }
    pokemonRanges = [pokemonRange]
  }

  // Fetch Pokemon within the allowed ranges
  const pokemonList: Pokemon[] = []
  const batchSize = 50

  for (const range of pokemonRanges) {
    const rangeSize = range.end - range.start + 1
    const batches = Math.ceil(rangeSize / batchSize)

    for (let batch = 0; batch < batches; batch++) {
      const start = range.start + (batch * batchSize)
      const end = Math.min(start + batchSize - 1, range.end)

      const promises = []
      for (let i = start; i <= end; i++) {
        promises.push(fetchPokemon(i, formatId).catch(() => null))
      }

      try {
        const batchResults = await Promise.all(promises)
        const validPokemon = batchResults.filter((pokemon): pokemon is Pokemon =>
          pokemon !== null && pokemon.isLegal
        )

        pokemonList.push(...validPokemon)

        // Stop if we've collected enough legal Pokemon
        if (pokemonList.length >= limit) {
          break
        }
      } catch (error) {
        console.warn(`Failed to fetch batch ${batch + 1} for range ${range.start}-${range.end}:`, error)
      }
    }

    // Stop if we've collected enough legal Pokemon across ranges
    if (pokemonList.length >= limit) {
      break
    }
  }

  // Sort and trim to limit
  return pokemonList
    .sort((a, b) => parseInt(a.id) - parseInt(b.id))
    .slice(0, limit)
}

// React Query helpers
export const pokemonQueries = {
  all: () => ['pokemon'] as const,
  lists: () => [...pokemonQueries.all(), 'list'] as const,
  list: (filters: Record<string, any>) => [...pokemonQueries.lists(), filters] as const,
  listByFormat: (formatId: string) => [...pokemonQueries.lists(), 'format', formatId] as const,
  details: () => [...pokemonQueries.all(), 'detail'] as const,
  detail: (id: string) => [...pokemonQueries.details(), id] as const,
  detailByFormat: (id: string, formatId: string) => [...pokemonQueries.details(), id, formatId] as const,
}

// Legacy constant for backwards compatibility
export const REGULATION_H_POKEMON_IDS = [
  // Starter lines
  1, 2, 3, 4, 5, 6, 7, 8, 9, // Kanto starters
  25, 26, // Pikachu line
  // Add more commonly used Pokemon IDs here
  // This would be populated with the full Regulation H list
]

// Helper to validate a single Pokemon against a format
export const validatePokemonInFormat = (pokemon: Pokemon, formatId: string): { isLegal: boolean; cost: number; reason?: string } => {
  try {
    const rulesEngine = createFormatRulesEngine(formatId)
    const validation = rulesEngine.validatePokemon(pokemon)

    return {
      isLegal: validation.isLegal,
      cost: validation.cost,
      reason: validation.reason
    }
  } catch (error) {
    console.error(`Error validating Pokemon ${pokemon.id} in format ${formatId}:`, error)
    return { isLegal: false, cost: 0, reason: 'Validation error' }
  }
}

// Fetch Pokemon for custom formats from database
export const fetchPokemonForCustomFormat = async (customFormatId: string): Promise<Pokemon[]> => {
  if (!supabase) {
    throw new Error('Supabase not available')
  }

  try {
    // Fetch the custom format from database
    const { data: customFormat, error } = await (supabase
      .from('custom_formats') as any)
      .select('pokemon_pricing')
      .eq('id', customFormatId)
      .single()

    if (error || !customFormat) {
      console.error('Error fetching custom format:', error)
      throw new Error('Custom format not found')
    }

    const pokemonPricing: Record<string, number> = customFormat.pokemon_pricing || {}
    const pokemonList: Pokemon[] = []

    // Helper to normalize Pokemon names for matching
    const normalizeName = (name: string) =>
      name.toLowerCase().replace(/[.\s-]+/g, '').replace(/♀/g, 'f').replace(/♂/g, 'm')

    // Fetch Pokemon by normalized names from the pricing data
    const pokemonNames = Object.keys(pokemonPricing)

    for (const pokemonName of pokemonNames) {
      try {
        // Try to fetch by name (PokeAPI accepts normalized names)
        const normalizedName = normalizeName(pokemonName)
        const pokemon = await fetchPokemon(normalizedName)

        if (pokemon) {
          // Override the cost with custom pricing
          pokemon.cost = pokemonPricing[pokemonName]
          pokemon.isLegal = true
          pokemonList.push(pokemon)
        }
      } catch (error) {
        console.warn(`Failed to fetch Pokemon "${pokemonName}" for custom format:`, error)
        // Continue with other Pokemon
      }
    }

    return pokemonList.sort((a, b) => parseInt(a.id) - parseInt(b.id))
  } catch (error) {
    console.error('Error fetching Pokemon for custom format:', error)
    throw error
  }
}

// Dedicated function for fetching Pokemon with moves for the details modal
export const fetchPokemonWithMoves = async (identifier: string | number, formatId?: string): Promise<Pokemon> => {
  return fetchPokemon(identifier, formatId, true)
}