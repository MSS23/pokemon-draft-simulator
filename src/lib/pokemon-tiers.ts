// Pokemon Tier Classifications - Generation-specific tier data
// Based on competitive usage and Smogon tier lists

export interface PokemonTierData {
  id: string              // Pokemon ID (dex number as string)
  name: string            // Pokemon name
  formName?: string       // Form name if applicable (e.g., "Alolan", "Mega")

  // Tier data by generation
  tiers: {
    [generation: number]: PokemonTierInfo
  }

  // Classification flags
  isLegendary: boolean
  isMythical: boolean
  isParadox: boolean
  isUltraBeast: boolean
  isRestricted: boolean   // VGC restricted legendary

  // Generation availability
  availableGenerations: number[]
  nationalDex: number

  // Regional dex memberships
  regionalDex: {
    paldea?: boolean
    galar?: boolean
    alola?: boolean
    kalos?: boolean
    unova?: boolean
    sinnoh?: boolean
    hoenn?: boolean
    johto?: boolean
    kanto?: boolean
  }
}

export interface PokemonTierInfo {
  tier: string            // Main tier (OU, UU, RU, etc.)
  doublesTier?: string    // Doubles tier if different
  usage?: number          // Usage percentage (0-100)
  viability?: number      // Viability rank (1-5)
  lastUpdated: string     // When tier was last updated
}

// Common tier definitions
export const SMOGON_TIERS = {
  // Main tiers
  AG: 'Anything Goes',
  UBER: 'Uber',
  OU: 'OverUsed',
  UUBL: 'UnderUsed Banlist',
  UU: 'UnderUsed',
  RUBL: 'RarelyUsed Banlist',
  RU: 'RarelyUsed',
  NUBL: 'NeverUsed Banlist',
  NU: 'NeverUsed',
  PUBL: 'PartiallyUsed Banlist',
  PU: 'PartiallyUsed',
  ZU: 'ZeroUsed',
  UNTIERED: 'Untiered',

  // Special tiers
  LC: 'Little Cup',
  NFE: 'Not Fully Evolved',
  CAP: 'Create-A-Pokemon'
} as const

export const VGC_TIERS = {
  RESTRICTED: 'Restricted',
  ALLOWED: 'Allowed',
  BANNED: 'Banned'
} as const

// Pokemon tier database - Key competitive Pokemon from different generations
export const POKEMON_TIER_DATABASE: PokemonTierData[] = [
  // Kanto Classics
  {
    id: '150',
    name: 'mewtwo',
    isLegendary: true,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: true,
    availableGenerations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    nationalDex: 150,
    regionalDex: {
      kanto: true,
      johto: true,
      kalos: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'Uber', usage: 95, viability: 5, lastUpdated: '2024-01-01' },
      9: { tier: 'Uber', usage: 90, viability: 5, lastUpdated: '2024-09-01' }
    }
  },

  {
    id: '144',
    name: 'articuno',
    isLegendary: true,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    nationalDex: 144,
    regionalDex: {
      kanto: true,
      galar: true
    },
    tiers: {
      6: { tier: 'PU', usage: 3, viability: 2, lastUpdated: '2024-01-01' },
      9: { tier: 'NU', usage: 5, viability: 2, lastUpdated: '2024-09-01' }
    }
  },

  // Gen 6 Meta Defines
  {
    id: '663',
    name: 'talonflame',
    isLegendary: false,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [6, 7, 8, 9],
    nationalDex: 663,
    regionalDex: {
      kalos: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'OU', usage: 85, viability: 5, lastUpdated: '2024-01-01' },
      7: { tier: 'RU', usage: 25, viability: 3, lastUpdated: '2024-01-01' },
      9: { tier: 'UU', usage: 35, viability: 3, lastUpdated: '2024-09-01' }
    }
  },

  {
    id: '681',
    name: 'aegislash',
    isLegendary: false,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [6, 7, 8, 9],
    nationalDex: 681,
    regionalDex: {
      kalos: true,
      galar: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'UUBL', usage: 45, viability: 4, lastUpdated: '2024-01-01' },
      7: { tier: 'UU', usage: 55, viability: 4, lastUpdated: '2024-01-01' },
      9: { tier: 'UU', usage: 40, viability: 4, lastUpdated: '2024-09-01' }
    }
  },

  {
    id: '658',
    name: 'greninja',
    isLegendary: false,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [6, 7, 9],
    nationalDex: 658,
    regionalDex: {
      kalos: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'OU', usage: 78, viability: 5, lastUpdated: '2024-01-01' },
      7: { tier: 'UUBL', usage: 42, viability: 4, lastUpdated: '2024-01-01' },
      9: { tier: 'OU', usage: 65, viability: 4, lastUpdated: '2024-09-01' }
    }
  },

  // Gen 9 VGC Stars
  {
    id: '984',
    name: 'great-tusk',
    isLegendary: false,
    isMythical: false,
    isParadox: true,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [9],
    nationalDex: 984,
    regionalDex: {
      paldea: true
    },
    tiers: {
      9: {
        tier: 'OU',
        doublesTier: 'DOU',
        usage: 75,
        viability: 5,
        lastUpdated: '2024-09-01'
      }
    }
  },

  {
    id: '987',
    name: 'flutter-mane',
    isLegendary: false,
    isMythical: false,
    isParadox: true,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [9],
    nationalDex: 987,
    regionalDex: {
      paldea: true
    },
    tiers: {
      9: {
        tier: 'Uber',
        doublesTier: 'DUber',
        usage: 95,
        viability: 5,
        lastUpdated: '2024-09-01'
      }
    }
  },

  {
    id: '1007',
    name: 'koraidon',
    isLegendary: true,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: true,
    availableGenerations: [9],
    nationalDex: 1007,
    regionalDex: {
      paldea: true
    },
    tiers: {
      9: {
        tier: 'Uber',
        doublesTier: 'DUber',
        usage: 98,
        viability: 5,
        lastUpdated: '2024-09-01'
      }
    }
  },

  {
    id: '1008',
    name: 'miraidon',
    isLegendary: true,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: true,
    availableGenerations: [9],
    nationalDex: 1008,
    regionalDex: {
      paldea: true
    },
    tiers: {
      9: {
        tier: 'Uber',
        doublesTier: 'DUber',
        usage: 97,
        viability: 5,
        lastUpdated: '2024-09-01'
      }
    }
  },

  // Popular VGC Pokemon
  {
    id: '445',
    name: 'garchomp',
    isLegendary: false,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [4, 5, 6, 7, 8, 9],
    nationalDex: 445,
    regionalDex: {
      sinnoh: true,
      kalos: true,
      alola: true,
      galar: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'OU', usage: 55, viability: 4, lastUpdated: '2024-01-01' },
      9: {
        tier: 'OU',
        doublesTier: 'DOU',
        usage: 45,
        viability: 4,
        lastUpdated: '2024-09-01'
      }
    }
  },

  {
    id: '248',
    name: 'tyranitar',
    isLegendary: false,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [2, 3, 4, 5, 6, 7, 8, 9],
    nationalDex: 248,
    regionalDex: {
      johto: true,
      hoenn: true,
      sinnoh: true,
      kalos: true,
      alola: true,
      galar: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'OU', usage: 42, viability: 4, lastUpdated: '2024-01-01' },
      9: {
        tier: 'UU',
        doublesTier: 'DUU',
        usage: 32,
        viability: 3,
        lastUpdated: '2024-09-01'
      }
    }
  },

  {
    id: '149',
    name: 'dragonite',
    isLegendary: false,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    nationalDex: 149,
    regionalDex: {
      kanto: true,
      johto: true,
      hoenn: true,
      sinnoh: true,
      kalos: true,
      alola: true,
      galar: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'OU', usage: 38, viability: 3, lastUpdated: '2024-01-01' },
      9: {
        tier: 'UU',
        doublesTier: 'DOU',
        usage: 28,
        viability: 3,
        lastUpdated: '2024-09-01'
      }
    }
  },

  // Versatile Pokemon across formats
  {
    id: '038',
    name: 'ninetales',
    isLegendary: false,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    nationalDex: 38,
    regionalDex: {
      kanto: true,
      johto: true,
      hoenn: true,
      sinnoh: true,
      kalos: true,
      alola: true,
      galar: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'RU', usage: 15, viability: 3, lastUpdated: '2024-01-01' },
      9: {
        tier: 'RU',
        doublesTier: 'DUU',
        usage: 22,
        viability: 3,
        lastUpdated: '2024-09-01'
      }
    }
  },

  // Gen 6 RU staples
  {
    id: '344',
    name: 'claydol',
    isLegendary: false,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [3, 4, 5, 6, 7, 8, 9],
    nationalDex: 344,
    regionalDex: {
      hoenn: true,
      sinnoh: true,
      kalos: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'RU', usage: 25, viability: 3, lastUpdated: '2024-01-01' },
      9: { tier: 'NU', usage: 8, viability: 2, lastUpdated: '2024-09-01' }
    }
  },

  {
    id: '429',
    name: 'mismagius',
    isLegendary: false,
    isMythical: false,
    isParadox: false,
    isUltraBeast: false,
    isRestricted: false,
    availableGenerations: [4, 5, 6, 7, 8, 9],
    nationalDex: 429,
    regionalDex: {
      sinnoh: true,
      kalos: true,
      paldea: true
    },
    tiers: {
      6: { tier: 'RU', usage: 18, viability: 3, lastUpdated: '2024-01-01' },
      9: { tier: 'NU', usage: 12, viability: 2, lastUpdated: '2024-09-01' }
    }
  }
]

// Helper functions for tier data
export function getPokemonTierData(pokemonId: string): PokemonTierData | undefined {
  return POKEMON_TIER_DATABASE.find(data =>
    data.id === pokemonId ||
    data.name.toLowerCase() === pokemonId.toLowerCase()
  )
}

export function getPokemonTierForGeneration(pokemonId: string, generation: number): PokemonTierInfo | undefined {
  const tierData = getPokemonTierData(pokemonId)
  return tierData?.tiers[generation]
}

export function getPokemonsByTier(tier: string, generation: number): PokemonTierData[] {
  return POKEMON_TIER_DATABASE.filter(data =>
    data.tiers[generation]?.tier === tier
  )
}

export function getPokemonsByGeneration(generation: number): PokemonTierData[] {
  return POKEMON_TIER_DATABASE.filter(data =>
    data.availableGenerations.includes(generation)
  )
}

export function getPokemonsByRegion(region: keyof PokemonTierData['regionalDex']): PokemonTierData[] {
  return POKEMON_TIER_DATABASE.filter(data =>
    data.regionalDex[region] === true
  )
}

export function isLegendaryOrMythical(pokemonId: string): boolean {
  const tierData = getPokemonTierData(pokemonId)
  return tierData?.isLegendary === true || tierData?.isMythical === true
}

export function isRestrictedPokemon(pokemonId: string): boolean {
  const tierData = getPokemonTierData(pokemonId)
  return tierData?.isRestricted === true
}

export function isParadoxPokemon(pokemonId: string): boolean {
  const tierData = getPokemonTierData(pokemonId)
  return tierData?.isParadox === true
}

// Default tier for unknown Pokemon
export function getDefaultTier(generation: number): string {
  switch (generation) {
    case 6:
    case 7:
    case 8:
    case 9:
      return 'Untiered'
    default:
      return 'NU'
  }
}

// Cost calculation based on tier
export function getTierBaseCost(tier: string): number {
  const tierCosts: Record<string, number> = {
    'Uber': 35,
    'AG': 40,
    'OU': 25,
    'UUBL': 27,
    'UU': 20,
    'RUBL': 22,
    'RU': 15,
    'NUBL': 17,
    'NU': 12,
    'PUBL': 14,
    'PU': 8,
    'ZU': 5,
    'Untiered': 3,
    'NFE': 5,
    'LC': 4
  }

  return tierCosts[tier] || 10
}