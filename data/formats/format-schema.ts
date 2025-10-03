/**
 * Format Pack Schema
 * Versioned format definition for Pokemon draft legality and cost rules
 */

export interface FormatPack {
  /** Unique format identifier */
  id: string

  /** Semantic version (e.g., "1.0.0") */
  version: string

  /** Human-readable format name */
  label: string

  /** Game abbreviation (e.g., "SV", "SWSH") */
  game: string

  /** Pokemon generation number */
  generation: number

  /** ISO date of last update */
  lastUpdated: string

  /** Official source URL or description */
  source: string

  /** Core format rules */
  rules: FormatRules

  /** Strategy for determining legality */
  allowStrategy: 'allowlist' | 'banlist'

  /** Categories of Pokemon to ban */
  bannedCategories: BannedCategories

  /** Explicit Pokemon IDs/slugs to ban (always respected) */
  explicitBans: string[]

  /** Explicit Pokemon IDs/slugs to allow (overrides categories) */
  explicitAllows: string[]

  /** Regional dex memberships required */
  regionalDex: RegionalDexRequirement

  /** Cost calculation configuration */
  costConfig: CostConfig

  /** Individual Pokemon cost overrides */
  pointOverrides: Record<string, number>

  /** Additional metadata */
  metadata: FormatMetadata
}

export interface FormatRules {
  /** Level cap (e.g., 50 for VGC, 100 for Smogon) */
  levelCap: number

  /** Allow duplicate species */
  duplicates: boolean

  /** Terastallization allowed */
  teraAllowed: boolean

  /** Item clause (no duplicate items) */
  itemClause: boolean

  /** Species clause (no duplicate species) */
  speciesClause: boolean
}

export interface BannedCategories {
  /** Ban all legendary Pokemon */
  legendary: boolean

  /** Ban all mythical Pokemon */
  mythical: boolean

  /** Ban paradox Pokemon (Gen 9) */
  paradox: boolean

  /** Ban Treasures of Ruin (Gen 9) */
  treasuresOfRuin: boolean

  /** Ban Ultra Beasts (Gen 7+) */
  ultraBeast: boolean

  /** Ban sub-legendaries (birds, beasts, etc.) */
  subLegendary: boolean
}

export interface RegionalDexRequirement {
  /** Pokemon must be in Paldea Dex */
  paldea?: boolean

  /** Pokemon must be in Kitakami Dex */
  kitakami?: boolean

  /** Pokemon must be in Blueberry Academy Dex */
  blueberry?: boolean

  /** Pokemon must be in Galar Dex */
  galar?: boolean

  /** Pokemon must be in Alola Dex */
  alola?: boolean

  /** Pokemon must be in Kalos Dex */
  kalos?: boolean

  /** Any other regional dex by name */
  [key: string]: boolean | undefined
}

export interface CostConfig {
  /** Default cost for Pokemon not in overrides */
  defaultCost: number

  /** Minimum allowed cost */
  minCost: number

  /** Maximum allowed cost */
  maxCost: number

  /** How costs are calculated */
  calculationMethod: 'tier-based' | 'bst-based' | 'usage-based' | 'flat'
}

export interface FormatMetadata {
  /** Human-readable description */
  description: string

  /** Estimated number of legal Pokemon */
  estimatedLegalCount: number

  /** Tags for categorization */
  tags: string[]

  /** Complexity rating (1-5, 1 = simple, 5 = complex) */
  complexityRating: number
}

/**
 * Compiled format index - output of build-format script
 */
export interface CompiledFormat {
  /** Format pack metadata */
  format: Omit<FormatPack, 'pointOverrides'>

  /** Compiled list of legal Pokemon IDs */
  legalPokemon: string[]

  /** Cost lookup map */
  costs: Record<string, number>

  /** Cache-busting hash */
  hash: string

  /** Compilation timestamp */
  compiledAt: string
}

/**
 * Pokemon index - master list of all Pokemon with metadata
 */
export interface PokemonIndex {
  [pokemonId: string]: PokemonData
}

export interface PokemonData {
  id: string
  name: string
  nationalDex: number

  /** Pokemon types */
  types: string[]

  /** Base stats */
  stats: {
    hp: number
    attack: number
    defense: number
    specialAttack: number
    specialDefense: number
    speed: number
    total: number
  }

  /** Available abilities */
  abilities: string[]

  /** Classification flags */
  flags: PokemonFlags

  /** Regional dex memberships */
  regionalDex: string[]

  /** Form information (if applicable) */
  form?: string

  /** Base species (for forms) */
  baseSpecies?: string
}

export interface PokemonFlags {
  isLegendary: boolean
  isMythical: boolean
  isParadox: boolean
  isTreasureOfRuin: boolean
  isUltraBeast: boolean
  isSubLegendary: boolean
  isMega: boolean
  isGmax: boolean
  isFusion: boolean
  isRegionalForm: boolean
}