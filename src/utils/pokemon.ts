import { Pokemon, PokemonType } from '@/types'

// Pokemon type colors based on official colors
export const TYPE_COLORS: Record<string, string> = {
  normal: '#A8A878',
  fire: '#F08030',
  water: '#6890F0',
  electric: '#F8D030',
  grass: '#78C850',
  ice: '#98D8D8',
  fighting: '#C03028',
  poison: '#A040A0',
  ground: '#E0C068',
  flying: '#A890F0',
  psychic: '#F85888',
  bug: '#A8B820',
  rock: '#B8A038',
  ghost: '#705898',
  dragon: '#7038F8',
  dark: '#705848',
  steel: '#B8B8D0',
  fairy: '#EE99AC',
}

export const getTypeColor = (typeName: string): string => {
  return TYPE_COLORS[typeName.toLowerCase()] || '#68A090'
}

export const formatPokemonName = (name: string): string => {
  // Handle special cases like Nidoran♂/♀
  return name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

export const calculateStatTotal = (stats: Pokemon['stats']): number => {
  return stats.hp + stats.attack + stats.defense +
         stats.specialAttack + stats.specialDefense + stats.speed
}

export const getStatColor = (stat: number): string => {
  if (stat >= 130) return '#FF6B6B' // Red for very high
  if (stat >= 100) return '#4ECDC4' // Teal for high
  if (stat >= 80) return '#45B7D1'  // Blue for good
  if (stat >= 60) return '#96CEB4'  // Green for average
  if (stat >= 40) return '#FFEAA7'  // Yellow for below average
  return '#DDD'                     // Gray for low
}

// Pokemon GIF and sprite URL functions with fallback chain
export const getPokemonAnimatedUrl = (pokemonId: string, pokemonName?: string): string => {
  const id = parseInt(pokemonId)
  const formattedName = pokemonName?.toLowerCase().replace(/[^a-z0-9]/g, '') || id.toString()

  // Primary: Pokemon Showdown animated sprites (best quality GIFs)
  return `https://play.pokemonshowdown.com/sprites/ani/${formattedName}.gif`
}

export const getPokemonAnimatedBackupUrl = (pokemonId: string): string => {
  const id = parseInt(pokemonId)

  // Backup: PokeAPI animated sprites
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${id}.gif`
}

export const getPokemonSpriteUrl = (pokemonId: string): string => {
  const id = parseInt(pokemonId)
  // Fallback: Static PNG sprite
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
}

export const getOfficialArtworkUrl = (pokemonId: string): string => {
  const id = parseInt(pokemonId)
  // High quality official artwork
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
}

// Get the best available Pokemon image with fallback chain
export const getBestPokemonImageUrl = (pokemonId: string, pokemonName?: string, preferStatic: boolean = false): string => {
  if (preferStatic) {
    return getOfficialArtworkUrl(pokemonId)
  }
  return getPokemonAnimatedUrl(pokemonId, pokemonName)
}

// Utility to check if image URL is valid
export const checkImageUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

export const filterPokemonByType = (pokemon: Pokemon[], type: string): Pokemon[] => {
  return pokemon.filter(p =>
    p.types.some(t => t.name.toLowerCase() === type.toLowerCase())
  )
}

export const filterPokemonByStats = (
  pokemon: Pokemon[],
  minStat: number,
  statType: keyof Pokemon['stats']
): Pokemon[] => {
  return pokemon.filter(p => p.stats[statType] >= minStat)
}

export const sortPokemonByName = (pokemon: Pokemon[]): Pokemon[] => {
  return [...pokemon].sort((a, b) => a.name.localeCompare(b.name))
}

export const sortPokemonByCost = (pokemon: Pokemon[]): Pokemon[] => {
  return [...pokemon].sort((a, b) => b.cost - a.cost)
}

export const sortPokemonByStatTotal = (pokemon: Pokemon[]): Pokemon[] => {
  return [...pokemon].sort((a, b) => b.stats.total - a.stats.total)
}

// Legacy support for Regulation H (now handled by format system)
// This comprehensive list includes ALL Pokemon banned in VGC 2024 Regulation H
export const REGULATION_H_BANNED_POKEMON = [
  // ALL Paradox Pokemon (Ancient and Future forms)
  'great-tusk', 'scream-tail', 'brute-bonnet', 'flutter-mane', 'slither-wing',
  'sandy-shocks', 'iron-treads', 'iron-bundle', 'iron-hands', 'iron-jugulis',
  'iron-moth', 'iron-thorns', 'roaring-moon', 'iron-valiant', 'walking-wake',
  'iron-leaves', 'gouging-fire', 'raging-bolt', 'iron-boulder', 'iron-crown',

  // Generation 9 Legendary Pokemon
  'koraidon', 'miraidon', 'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu',
  'okidogi', 'munkidori', 'fezandipiti', 'ogerpon', 'ogerpon-wellspring',
  'ogerpon-hearthflame', 'ogerpon-cornerstone', 'terapagos', 'terapagos-terastal', 'terapagos-stellar',

  // Generation 9 Mythical Pokemon
  'pecharunt',

  // ALL Legendary Pokemon from previous generations (transferable via HOME)
  'mewtwo', 'mew', 'lugia', 'ho-oh', 'celebi', 'kyogre', 'groudon', 'rayquaza',
  'jirachi', 'deoxys', 'deoxys-attack', 'deoxys-defense', 'deoxys-speed',
  'dialga', 'dialga-origin', 'palkia', 'palkia-origin', 'heatran', 'regigigas',
  'giratina', 'giratina-origin', 'cresselia', 'phione', 'manaphy', 'darkrai',
  'shaymin', 'shaymin-sky', 'arceus', 'victini', 'cobalion', 'terrakion', 'virizion',
  'tornadus', 'tornadus-therian', 'thundurus', 'thundurus-therian', 'reshiram', 'zekrom',
  'landorus', 'landorus-therian', 'kyurem', 'kyurem-black', 'kyurem-white',
  'keldeo', 'keldeo-resolute', 'meloetta', 'meloetta-pirouette', 'genesect',
  'xerneas', 'yveltal', 'zygarde', 'zygarde-10', 'zygarde-complete',
  'diancie', 'diancie-mega', 'hoopa', 'hoopa-unbound', 'volcanion',
  'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'necrozma', 'necrozma-dusk-mane',
  'necrozma-dawn-wings', 'necrozma-ultra', 'magearna', 'marshadow', 'zeraora',
  'meltan', 'melmetal', 'zacian', 'zacian-crowned', 'zamazenta', 'zamazenta-crowned',
  'eternatus', 'eternatus-eternamax', 'kubfu', 'urshifu', 'urshifu-rapid-strike',
  'regieleki', 'regidrago', 'glastrier', 'spectrier', 'calyrex', 'calyrex-ice', 'calyrex-shadow',

  // Galarian Birds (Legendary forms)
  'articuno-galar', 'zapdos-galar', 'moltres-galar'
]

// @deprecated Use format system instead
export const isRegulationHLegal = (pokemonName: string): boolean => {
  const name = pokemonName.toLowerCase().replace(/[^a-z-]/g, '')
  return !REGULATION_H_BANNED_POKEMON.includes(name)
}

// @deprecated Use format-specific cost calculation instead
export const getDefaultPokemonTier = (pokemon: Pokemon): number => {
  const total = pokemon.stats.total

  // Tier system based on base stat total
  if (total >= 600) return 30    // Pseudo-legendaries
  if (total >= 550) return 25    // Very strong
  if (total >= 500) return 20    // Strong
  if (total >= 450) return 15    // Above average
  if (total >= 400) return 10    // Average
  if (total >= 350) return 8     // Below average
  if (total >= 300) return 5     // Weak
  return 3                       // Very weak
}

// Get CSS class for Pokemon type-based card styling
export const getPokemonCardClass = (pokemon: Pokemon): string => {
  const primaryType = pokemon.types[0]?.name?.toLowerCase()
  return `pokemon-card-${primaryType}`
}

// Get rarity class based on Pokemon cost/tier
export const getPokemonRarityClass = (cost: number): string => {
  if (cost >= 25) return 'holographic'
  if (cost >= 20) return 'shimmer'
  return ''
}

// Check if Pokemon is "shiny" (rare/special)
export const isPokemonShiny = (pokemon: Pokemon): boolean => {
  return pokemon.cost >= 25 || pokemon.stats.total >= 600
}