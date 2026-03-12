// Pokemon Draft Formats - Inspired by Pokemon Showdown's format system
// Each format defines the rules, legality, and cost structure for drafts

export interface PokemonFormat {
  id: string
  name: string
  shortName: string
  description: string
  generation: number
  gameType: 'singles' | 'doubles'
  category: 'vgc' | 'smogon' | 'custom'

  // Ruleset definition
  ruleset: FormatRuleset

  // Cost/tier configuration
  costConfig: CostConfiguration

  // Format metadata
  meta: FormatMeta
}

export interface FormatRuleset {
  // Basic rules
  speciesClause: boolean
  itemClause: boolean
  sleepClause?: boolean

  // Pokemon restrictions
  bannedPokemon: string[]           // Specific Pokemon banned by name/dex number
  allowedPokemon?: string[]         // If set, only these Pokemon allowed
  bannedTiers: string[]             // Tiers to ban (e.g., ['Uber', 'OU'])
  allowedTiers?: string[]           // If set, only these tiers allowed

  // Generation/region restrictions
  allowedGenerations: number[]      // Which generations are legal
  allowedRegions?: string[]         // Specific regional dex (e.g., ['paldea', 'galar'])

  // Special restrictions
  legendaryPolicy: 'banned' | 'allowed' | 'restricted'  // How to handle legendaries
  mythicalPolicy: 'banned' | 'allowed' | 'restricted'   // How to handle mythicals
  paradoxPolicy: 'banned' | 'allowed' | 'restricted'    // How to handle paradox forms

  // Format-specific bans
  bannedAbilities: string[]
  bannedItems: string[]
  bannedMoves: string[]

  // Restricted legendary rules (for VGC)
  restrictedCount?: number          // Max number of restricted legendaries (VGC Series)
}

export interface CostConfiguration {
  type: 'bst' | 'tier' | 'usage' | 'hybrid'

  // Base Stat Total based (current system)
  bstTiers?: {
    [threshold: number]: number     // BST threshold -> cost
  }

  // Competitive tier based
  tierCosts?: {
    [tier: string]: number          // Tier name -> cost
  }

  // Usage-based (Smogon style)
  usageMultipliers?: {
    [usagePercent: number]: number  // Usage % threshold -> multiplier
  }

  // Special Pokemon cost overrides
  costOverrides?: {
    [pokemonId: string]: number     // Pokemon ID/name -> exact cost
  }

  // Format modifiers
  costMultiplier: number            // Global cost multiplier for this format
  minCost: number                   // Minimum cost per Pokemon
  maxCost: number                   // Maximum cost per Pokemon
}

export interface FormatMeta {
  isOfficial: boolean               // Official tournament format
  lastUpdated: string               // When format was last updated
  season?: string                   // Tournament season (e.g., "2024 Series 1")
  banlistVersion?: string           // Version of banlist
  source: string                    // Where format rules come from
  popularity: number                // 1-5 rating for format popularity
  complexity: number                // 1-5 rating for format complexity
}

// Popular competitive formats
export const POKEMON_FORMATS: PokemonFormat[] = [
  // VGC Regulation A
  {
    id: 'vgc-reg-a',
    name: 'VGC 2023 Regulation A',
    shortName: 'Reg A',
    description: 'First VGC format for Scarlet/Violet - Paldea Pokédex #001-375, #388-392 only. No Paradox Pokémon, Treasures of Ruin, or Legendaries.',
    generation: 9,
    gameType: 'doubles',
    category: 'vgc',
    ruleset: {
      speciesClause: true,
      itemClause: true,
      bannedPokemon: [
        // Paradox Pokemon
        'great-tusk', 'scream-tail', 'brute-bonnet', 'flutter-mane', 'slither-wing',
        'sandy-shocks', 'iron-treads', 'iron-bundle', 'iron-hands', 'iron-jugulis',
        'iron-moth', 'iron-thorns', 'roaring-moon', 'iron-valiant',

        // Treasures of Ruin
        'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu',

        // Box Legendaries
        'koraidon', 'miraidon',

        // Non-Paldean regional variants
        'rattata-alola', 'raticate-alola', 'raichu-alola', 'sandshrew-alola', 'sandslash-alola',
        'vulpix-alola', 'ninetales-alola', 'diglett-alola', 'dugtrio-alola', 'meowth-alola',
        'persian-alola', 'geodude-alola', 'graveler-alola', 'golem-alola', 'grimer-alola',
        'muk-alola', 'exeggutor-alola', 'marowak-alola',

        // Unobtainable Pokemon
        'gimmighoul-roaming'
      ],
      bannedTiers: [],
      allowedGenerations: [9],
      allowedRegions: ['paldea'],
      legendaryPolicy: 'banned',
      mythicalPolicy: 'banned',
      paradoxPolicy: 'banned',
      bannedAbilities: [],
      bannedItems: [],
      bannedMoves: [],
    },
    costConfig: {
      type: 'bst',
      bstTiers: {
        600: 30, 550: 25, 500: 20, 450: 15, 400: 10, 350: 8, 300: 5, 0: 3
      },
      costMultiplier: 1.0,
      minCost: 3,
      maxCost: 30
    },
    meta: {
      isOfficial: true,
      lastUpdated: '2023-01-02',
      season: '2023 Regulation A',
      source: 'The Pokémon Company International - Victory Road',
      popularity: 3,
      complexity: 2
    }
  },

  // VGC Regulation H
  {
    id: 'vgc-reg-h',
    name: 'VGC 2024 Regulation H',
    shortName: 'Reg H',
    description: 'VGC 2024 Regulation H (Sep 2024–Jan 2025) - A return to basics. ALL Legendary, Mythical, and Paradox Pokémon banned. Paldea, Kitakami, and Blueberry Academy Pokédex only.',
    generation: 9,
    gameType: 'doubles',
    category: 'vgc',
    ruleset: {
      speciesClause: true,
      itemClause: true,
      bannedPokemon: [
        // ALL Paradox Pokemon (Ancient and Future forms)
        'great-tusk', 'scream-tail', 'brute-bonnet', 'flutter-mane', 'slither-wing',
        'sandy-shocks', 'iron-treads', 'iron-bundle', 'iron-hands', 'iron-jugulis',
        'iron-moth', 'iron-thorns', 'roaring-moon', 'iron-valiant', 'walking-wake',
        'iron-leaves', 'gouging-fire', 'raging-bolt', 'iron-boulder', 'iron-crown',

        // Box Legendaries
        'koraidon', 'miraidon',

        // Terapagos (Blueberry Legendary)
        'terapagos', 'terapagos-terastal', 'terapagos-stellar',

        // Treasures of Ruin (Paldea sub-legendaries — BANNED in Reg H)
        'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu',

        // Loyal Three (Kitakami sub-legendaries — BANNED in Reg H)
        'okidogi', 'munkidori', 'fezandipiti',

        // Ogerpon (Kitakami sub-legendary — BANNED in Reg H, all forms)
        'ogerpon', 'ogerpon-wellspring', 'ogerpon-hearthflame', 'ogerpon-cornerstone',

        // Mythical Pokemon
        'pecharunt',

        // ALL other Legendary Pokemon (from previous generations, HOME transfers)
        'mewtwo', 'mew', 'lugia', 'ho-oh', 'celebi', 'kyogre', 'groudon', 'rayquaza',
        'jirachi', 'deoxys', 'deoxys-attack', 'deoxys-defense', 'deoxys-speed',
        'dialga', 'palkia', 'heatran', 'regigigas', 'giratina', 'giratina-origin',
        'cresselia', 'phione', 'manaphy', 'darkrai', 'shaymin', 'shaymin-sky', 'arceus',
        'victini', 'cobalion', 'terrakion', 'virizion', 'tornadus', 'tornadus-therian',
        'thundurus', 'thundurus-therian', 'reshiram', 'zekrom', 'landorus', 'landorus-therian',
        'kyurem', 'kyurem-black', 'kyurem-white', 'keldeo', 'keldeo-resolute', 'meloetta',
        'meloetta-pirouette', 'genesect', 'xerneas', 'yveltal', 'zygarde', 'zygarde-10',
        'zygarde-complete', 'diancie', 'diancie-mega', 'hoopa', 'hoopa-unbound', 'volcanion',
        'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'necrozma', 'necrozma-dusk-mane',
        'necrozma-dawn-wings', 'necrozma-ultra', 'magearna', 'marshadow', 'zeraora',
        'meltan', 'melmetal', 'zacian', 'zacian-crowned', 'zamazenta', 'zamazenta-crowned',
        'eternatus', 'eternatus-eternamax', 'kubfu', 'urshifu', 'urshifu-rapid-strike',
        'regieleki', 'regidrago', 'glastrier', 'spectrier', 'calyrex', 'calyrex-ice',
        'calyrex-shadow',

        // Galarian Birds
        'articuno-galar', 'zapdos-galar', 'moltres-galar',

        // Additional Legendary forms
        'dialga-origin', 'palkia-origin'
      ],
      bannedTiers: [],
      allowedGenerations: [], // Allow all generations - regional dex is the filter
      allowedRegions: ['paldea', 'kitakami', 'blueberry'],
      legendaryPolicy: 'banned',
      mythicalPolicy: 'banned',
      paradoxPolicy: 'banned',
      bannedAbilities: [],
      bannedItems: [],
      bannedMoves: [],
    },
    costConfig: {
      type: 'bst',
      bstTiers: {
        600: 30, 550: 25, 500: 20, 450: 15, 400: 10, 350: 8, 300: 5, 0: 3
      },
      costMultiplier: 1.0,
      minCost: 3,
      maxCost: 30
    },
    meta: {
      isOfficial: true,
      lastUpdated: '2024-09-01',
      season: '2024 Series 1',
      source: 'The Pokémon Company International',
      popularity: 5,
      complexity: 3
    }
  },

  // VGC 2025 Regulation I (Current)
  {
    id: 'vgc-reg-i',
    name: 'VGC 2025 Regulation I',
    shortName: 'Reg I',
    description: 'VGC 2025 Regulation I (Jan 2025+) - Current format. Up to 2 restricted legendaries per team. All Paradox, sub-legendaries, and HOME transfers allowed. Only Mythicals fully banned.',
    generation: 9,
    gameType: 'doubles',
    category: 'vgc',
    ruleset: {
      speciesClause: true,
      itemClause: true,
      bannedPokemon: [
        // All Mythical Pokemon (only category fully banned)
        'mew', 'celebi', 'jirachi', 'deoxys', 'deoxys-attack', 'deoxys-defense', 'deoxys-speed',
        'phione', 'manaphy', 'darkrai', 'shaymin', 'shaymin-sky', 'arceus',
        'victini', 'keldeo', 'keldeo-resolute', 'meloetta', 'meloetta-pirouette', 'genesect',
        'diancie', 'diancie-mega', 'hoopa', 'hoopa-unbound', 'volcanion',
        'magearna', 'marshadow', 'zeraora', 'meltan', 'melmetal', 'zarude', 'pecharunt',
        'enamorus',
      ],
      bannedTiers: [],
      allowedGenerations: [],
      allowedRegions: ['paldea', 'kitakami', 'blueberry'],
      legendaryPolicy: 'restricted',
      mythicalPolicy: 'banned',
      paradoxPolicy: 'allowed',
      bannedAbilities: [],
      bannedItems: [],
      bannedMoves: [],
      restrictedCount: 2,
    },
    costConfig: {
      type: 'hybrid',
      bstTiers: {
        680: 50, 600: 35, 550: 30, 500: 25, 450: 20, 400: 15, 350: 10, 300: 7, 0: 4
      },
      costOverrides: {
        // Restricted legendaries (premium)
        'koraidon': 55, 'miraidon': 55, 'terapagos': 50,
        'calyrex-ice': 60, 'calyrex-shadow': 60,
        'kyogre': 55, 'groudon': 55, 'rayquaza': 60,
        'zacian-crowned': 60, 'zamazenta-crowned': 45,
        'mewtwo': 58, 'lugia': 45, 'ho-oh': 48,
        'dialga': 50, 'palkia': 50, 'giratina': 48,
        'reshiram': 50, 'zekrom': 50, 'kyurem-white': 52, 'kyurem-black': 50,
        'xerneas': 52, 'yveltal': 50, 'necrozma-dusk-mane': 55,
        'solgaleo': 48, 'lunala': 48,
        // Top-tier non-restricted
        'flutter-mane': 40, 'iron-hands': 35, 'chi-yu': 38, 'chien-pao': 36,
        'raging-bolt': 35, 'walking-wake': 32,
        'ogerpon-wellspring': 30, 'ogerpon-hearthflame': 28,
        'urshifu': 32, 'urshifu-rapid-strike': 32,
        'landorus-therian': 35, 'incineroar': 28,
      },
      costMultiplier: 1.0,
      minCost: 4,
      maxCost: 60
    },
    meta: {
      isOfficial: true,
      lastUpdated: '2025-01-01',
      season: '2025 Regulation I',
      source: 'The Pokémon Company International',
      popularity: 5,
      complexity: 5
    }
  },

  // VGC 2023 Regulation C
  {
    id: 'vgc-reg-c',
    name: 'VGC 2023 Regulation C',
    shortName: 'Reg C',
    description: 'VGC 2023 Regulation C (Jun–Aug 2023) - Paldea Pokédex only. Paradox Pokémon now ALLOWED. No legendaries, mythicals, or Treasures of Ruin.',
    generation: 9,
    gameType: 'doubles',
    category: 'vgc',
    ruleset: {
      speciesClause: true,
      itemClause: true,
      bannedPokemon: [
        // Treasures of Ruin
        'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu',

        // Box Legendaries
        'koraidon', 'miraidon',

        // Non-Paldean regional variants
        'rattata-alola', 'raticate-alola', 'raichu-alola', 'sandshrew-alola', 'sandslash-alola',
        'vulpix-alola', 'ninetales-alola', 'diglett-alola', 'dugtrio-alola', 'meowth-alola',
        'persian-alola', 'geodude-alola', 'graveler-alola', 'golem-alola', 'grimer-alola',
        'muk-alola', 'exeggutor-alola', 'marowak-alola',

        'gimmighoul-roaming',
      ],
      bannedTiers: [],
      allowedGenerations: [9],
      allowedRegions: ['paldea'],
      legendaryPolicy: 'banned',
      mythicalPolicy: 'banned',
      paradoxPolicy: 'allowed',
      bannedAbilities: [],
      bannedItems: [],
      bannedMoves: [],
    },
    costConfig: {
      type: 'hybrid',
      bstTiers: {
        600: 30, 550: 25, 500: 20, 450: 15, 400: 10, 350: 8, 300: 5, 0: 3
      },
      costOverrides: {
        'flutter-mane': 28, 'iron-hands': 26, 'iron-bundle': 25,
        'roaring-moon': 24, 'iron-valiant': 25,
        'great-tusk': 24, 'iron-moth': 20,
        'sandy-shocks': 18, 'iron-thorns': 18,
        'scream-tail': 16, 'brute-bonnet': 14, 'slither-wing': 15,
        'iron-treads': 20, 'iron-jugulis': 18,
      },
      costMultiplier: 1.0,
      minCost: 3,
      maxCost: 30
    },
    meta: {
      isOfficial: true,
      lastUpdated: '2023-06-01',
      season: '2023 Regulation C',
      source: 'The Pokémon Company International',
      popularity: 3,
      complexity: 3
    }
  },

  // VGC 2024 Regulation E
  {
    id: 'vgc-reg-e',
    name: 'VGC 2024 Regulation E',
    shortName: 'Reg E',
    description: 'VGC 2024 Regulation E (Jan 2024) - Full Paldea + Kitakami + Blueberry dex with HOME transfers. Paradox & sub-legendaries allowed. Restricted legendaries and Mythicals banned.',
    generation: 9,
    gameType: 'doubles',
    category: 'vgc',
    ruleset: {
      speciesClause: true,
      itemClause: true,
      bannedPokemon: [
        // Restricted Legendaries (banned, 0 restricted slots)
        'koraidon', 'miraidon', 'terapagos', 'terapagos-terastal', 'terapagos-stellar',
        'mewtwo', 'lugia', 'ho-oh', 'kyogre', 'groudon', 'rayquaza',
        'dialga', 'dialga-origin', 'palkia', 'palkia-origin',
        'giratina', 'giratina-origin',
        'reshiram', 'zekrom', 'kyurem', 'kyurem-black', 'kyurem-white',
        'xerneas', 'yveltal', 'zygarde', 'zygarde-10', 'zygarde-complete',
        'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'necrozma', 'necrozma-dusk-mane',
        'necrozma-dawn-wings', 'necrozma-ultra',
        'zacian', 'zacian-crowned', 'zamazenta', 'zamazenta-crowned',
        'eternatus', 'eternatus-eternamax',
        'calyrex', 'calyrex-ice', 'calyrex-shadow',
        // Mythicals
        'mew', 'celebi', 'jirachi', 'deoxys', 'phione', 'manaphy', 'darkrai',
        'shaymin', 'arceus', 'victini', 'keldeo', 'meloetta', 'genesect',
        'diancie', 'hoopa', 'volcanion', 'magearna', 'marshadow', 'zeraora',
        'meltan', 'melmetal', 'zarude', 'pecharunt', 'enamorus',
      ],
      bannedTiers: [],
      allowedGenerations: [],
      allowedRegions: ['paldea', 'kitakami', 'blueberry'],
      legendaryPolicy: 'restricted',
      mythicalPolicy: 'banned',
      paradoxPolicy: 'allowed',
      bannedAbilities: [],
      bannedItems: [],
      bannedMoves: [],
    },
    costConfig: {
      type: 'hybrid',
      bstTiers: {
        600: 30, 550: 25, 500: 20, 450: 15, 400: 10, 350: 8, 300: 5, 0: 3
      },
      costOverrides: {
        'flutter-mane': 28, 'iron-hands': 26, 'chi-yu': 25, 'chien-pao': 24,
        'roaring-moon': 23, 'iron-valiant': 25,
        'raging-bolt': 24, 'walking-wake': 23,
        'ogerpon-wellspring': 22, 'ogerpon-hearthflame': 21,
        'ogerpon-cornerstone': 20, 'ogerpon': 18,
        'okidogi': 15, 'munkidori': 16, 'fezandipiti': 15,
        'wo-chien': 17, 'ting-lu': 18,
        'urshifu': 24, 'urshifu-rapid-strike': 24,
        'landorus-therian': 26, 'incineroar': 22,
      },
      costMultiplier: 1.0,
      minCost: 3,
      maxCost: 30
    },
    meta: {
      isOfficial: true,
      lastUpdated: '2024-01-01',
      season: '2024 Regulation E',
      source: 'The Pokémon Company International',
      popularity: 4,
      complexity: 4
    }
  },

  // VGC Regulation F
  {
    id: 'vgc-reg-f',
    name: 'VGC 2024 Regulation F',
    shortName: 'Reg F',
    description: 'VGC 2024 Regulation F (Jan–Apr 2024) - Paldea, Kitakami, and Blueberry Pokédex. All Paradox Pokémon and sub-legendaries (Ogerpon, Loyal Three, Treasures of Ruin) allowed. Restricted legendaries and Mythicals banned.',
    generation: 9,
    gameType: 'doubles',
    category: 'vgc',
    ruleset: {
      speciesClause: true,
      itemClause: true,
      bannedPokemon: [
        // Restricted Legendaries (banned, 0 restricted slots)
        'koraidon', 'miraidon', 'terapagos', 'terapagos-terastal', 'terapagos-stellar',
        'mewtwo', 'lugia', 'ho-oh', 'kyogre', 'groudon', 'rayquaza',
        'dialga', 'dialga-origin', 'palkia', 'palkia-origin',
        'giratina', 'giratina-origin',
        'reshiram', 'zekrom', 'kyurem', 'kyurem-black', 'kyurem-white',
        'xerneas', 'yveltal', 'zygarde', 'zygarde-10', 'zygarde-complete',
        'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'necrozma', 'necrozma-dusk-mane',
        'necrozma-dawn-wings', 'necrozma-ultra',
        'zacian', 'zacian-crowned', 'zamazenta', 'zamazenta-crowned',
        'eternatus', 'eternatus-eternamax',
        'calyrex', 'calyrex-ice', 'calyrex-shadow',
        // Mythicals
        'mew', 'celebi', 'jirachi', 'deoxys', 'phione', 'manaphy', 'darkrai',
        'shaymin', 'arceus', 'victini', 'keldeo', 'meloetta', 'genesect',
        'diancie', 'hoopa', 'volcanion', 'magearna', 'marshadow', 'zeraora',
        'meltan', 'melmetal', 'zarude', 'pecharunt', 'calyrex',
        'enamorus'
      ],
      bannedTiers: [],
      allowedGenerations: [],
      allowedRegions: ['paldea', 'kitakami', 'blueberry'],
      legendaryPolicy: 'restricted', // Sub-legendaries (Ogerpon, Loyal Three, Treasures of Ruin, paradox) all legal
      mythicalPolicy: 'banned',
      paradoxPolicy: 'allowed',
      bannedAbilities: [],
      bannedItems: [],
      bannedMoves: [],
    },
    costConfig: {
      type: 'hybrid',
      bstTiers: {
        600: 30, 550: 25, 500: 20, 450: 15, 400: 10, 350: 8, 300: 5, 0: 3
      },
      costOverrides: {
        // Paradox Pokemon
        'flutter-mane': 28,
        'iron-hands': 26,
        'chi-yu': 25,
        'chien-pao': 24,
        'roaring-moon': 23,
        'iron-valiant': 25,
        'raging-bolt': 24,
        'walking-wake': 23,
        // Ogerpon forms
        'ogerpon-wellspring': 22,
        'ogerpon-hearthflame': 21,
        'ogerpon-cornerstone': 20,
        'ogerpon': 18,
        // Loyal Three
        'okidogi': 15,
        'munkidori': 16,
        'fezandipiti': 15,
        // Treasures of Ruin
        'wo-chien': 17,
        'ting-lu': 18,
      },
      costMultiplier: 1.0,
      minCost: 3,
      maxCost: 30
    },
    meta: {
      isOfficial: true,
      lastUpdated: '2024-01-04',
      season: '2024 Regulation F',
      source: 'The Pokémon Company International',
      popularity: 4,
      complexity: 4
    }
  },

  {
    id: 'vgc-reg-g',
    name: 'VGC 2024 Regulation G',
    shortName: 'Reg G',
    description: 'VGC 2024 Regulation G (May–Aug 2024) - Used at Worlds 2024. All sub-legendaries and paradox allowed. Up to 1 restricted legendary per team. Only Mythicals are fully banned.',
    generation: 9,
    gameType: 'doubles',
    category: 'vgc',
    ruleset: {
      speciesClause: true,
      itemClause: true,
      bannedPokemon: [
        // All Mythical Pokemon (the only category fully banned in Reg G)
        'mew', 'celebi', 'jirachi', 'deoxys', 'phione', 'manaphy', 'darkrai',
        'shaymin', 'arceus', 'victini', 'keldeo', 'meloetta', 'genesect',
        'diancie', 'hoopa', 'volcanion', 'magearna', 'marshadow', 'zeraora',
        'meltan', 'melmetal', 'zarude', 'pecharunt', 'enamorus',
        // Restricted legendaries also banned from draft pool (1-per-team limit not enforceable in draft format)
        'koraidon', 'miraidon', 'terapagos', 'terapagos-terastal', 'terapagos-stellar',
        'mewtwo', 'lugia', 'ho-oh', 'kyogre', 'groudon', 'rayquaza',
        'dialga', 'dialga-origin', 'palkia', 'palkia-origin',
        'giratina', 'giratina-origin',
        'reshiram', 'zekrom', 'kyurem', 'kyurem-black', 'kyurem-white',
        'xerneas', 'yveltal', 'zygarde', 'zygarde-10', 'zygarde-complete',
        'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'necrozma', 'necrozma-dusk-mane',
        'necrozma-dawn-wings', 'necrozma-ultra',
        'zacian', 'zacian-crowned', 'zamazenta', 'zamazenta-crowned',
        'eternatus', 'eternatus-eternamax',
        'calyrex', 'calyrex-ice', 'calyrex-shadow'
      ],
      bannedTiers: [],
      allowedGenerations: [], // All gens via Blueberry dex HOME transfers
      allowedRegions: ['paldea', 'kitakami', 'blueberry'],
      legendaryPolicy: 'restricted', // Sub-legendaries (Ogerpon, Loyal Three, Treasures of Ruin, paradox) all legal
      mythicalPolicy: 'banned',
      paradoxPolicy: 'allowed',
      bannedAbilities: [],
      bannedItems: [],
      bannedMoves: [],
      restrictedCount: 1
    },
    costConfig: {
      type: 'hybrid',
      bstTiers: {
        600: 35, 550: 30, 500: 25, 450: 20, 400: 15, 350: 10, 300: 7, 0: 4
      },
      costOverrides: {
        // Paradox Pokemon (legal in Reg G)
        'great-tusk': 40,
        'iron-valiant': 40,
        'flutter-mane': 45,
        // Treasures of Ruin (legal in Reg G)
        'chi-yu': 35,
        'chien-pao': 32,
        'ting-lu': 28,
        'wo-chien': 25,
        // Ogerpon forms (legal in Reg G)
        'ogerpon-wellspring': 30,
        'ogerpon-hearthflame': 28,
        'ogerpon-cornerstone': 26,
        'ogerpon': 24,
        // Loyal Three (legal in Reg G)
        'okidogi': 22,
        'munkidori': 22,
        'fezandipiti': 20,
      },
      costMultiplier: 1.2,
      minCost: 4,
      maxCost: 60
    },
    meta: {
      isOfficial: true,
      lastUpdated: '2024-06-01',
      season: '2024 LATAM IC',
      source: 'The Pokémon Company International',
      popularity: 4,
      complexity: 4
    }
  },

  // Smogon Singles Formats
  {
    id: 'gen9-ou',
    name: 'Gen 9 OverUsed',
    shortName: 'Gen 9 OU',
    description: 'Current generation Smogon OU tier - the standard singles format',
    generation: 9,
    gameType: 'singles',
    category: 'smogon',
    ruleset: {
      speciesClause: true,
      itemClause: false,
      sleepClause: true,
      bannedPokemon: [],
      bannedTiers: ['Uber', 'AG'],
      allowedGenerations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      legendaryPolicy: 'restricted',
      mythicalPolicy: 'restricted',
      paradoxPolicy: 'restricted',
      bannedAbilities: ['Moody', 'Shadow Tag'],
      bannedItems: ['Bright Powder', 'Lax Incense', 'Quick Claw'],
      bannedMoves: ['Baton Pass', 'Last Resort']
    },
    costConfig: {
      type: 'tier',
      tierCosts: {
        'OU': 25,
        'UUBL': 30,
        'UU': 20,
        'RUBL': 22,
        'RU': 15,
        'NUBL': 17,
        'NU': 12,
        'PUBL': 14,
        'PU': 8,
        'ZU': 5,
        'Untiered': 3
      },
      costMultiplier: 1.0,
      minCost: 3,
      maxCost: 35
    },
    meta: {
      isOfficial: false,
      lastUpdated: '2024-09-15',
      source: 'Smogon University',
      popularity: 5,
      complexity: 4
    }
  },

  {
    id: 'gen6-ou',
    name: 'Gen 6 OverUsed',
    shortName: 'Gen 6 OU',
    description: 'ORAS era OU - classic megas and competitive balance',
    generation: 6,
    gameType: 'singles',
    category: 'smogon',
    ruleset: {
      speciesClause: true,
      itemClause: false,
      sleepClause: true,
      bannedPokemon: [],
      bannedTiers: ['Uber', 'AG'],
      allowedGenerations: [1, 2, 3, 4, 5, 6],
      legendaryPolicy: 'restricted',
      mythicalPolicy: 'restricted',
      paradoxPolicy: 'banned',
      bannedAbilities: ['Moody', 'Shadow Tag'],
      bannedItems: ['Soul Dew', 'Gengarite', 'Sablenite'],
      bannedMoves: ['Baton Pass']
    },
    costConfig: {
      type: 'tier',
      tierCosts: {
        'OU': 22,
        'UUBL': 25,
        'UU': 18,
        'RUBL': 20,
        'RU': 14,
        'NUBL': 16,
        'NU': 10,
        'PUBL': 12,
        'PU': 7,
        'Untiered': 3
      },
      costOverrides: {
        'talonflame': 28,  // Priority Brave Bird was dominant
        'aegislash': 30,   // King's Shield was broken
        'greninja': 25     // Protean was very strong
      },
      costMultiplier: 1.0,
      minCost: 3,
      maxCost: 30
    },
    meta: {
      isOfficial: false,
      lastUpdated: '2024-01-01',
      source: 'Smogon University',
      popularity: 4,
      complexity: 4
    }
  },

  {
    id: 'gen6-ru',
    name: 'Gen 6 RarelyUsed',
    shortName: 'Gen 6 RU',
    description: 'ORAS RU tier - mid-tier competitive Pokemon showcase',
    generation: 6,
    gameType: 'singles',
    category: 'smogon',
    ruleset: {
      speciesClause: true,
      itemClause: false,
      sleepClause: true,
      bannedPokemon: [],
      bannedTiers: ['Uber', 'AG', 'OU', 'UUBL', 'UU'],
      allowedGenerations: [1, 2, 3, 4, 5, 6],
      legendaryPolicy: 'restricted',
      mythicalPolicy: 'restricted',
      paradoxPolicy: 'banned',
      bannedAbilities: ['Moody', 'Shadow Tag'],
      bannedItems: ['Soul Dew'],
      bannedMoves: ['Baton Pass']
    },
    costConfig: {
      type: 'tier',
      tierCosts: {
        'RU': 20,
        'NUBL': 22,
        'NU': 15,
        'PUBL': 17,
        'PU': 12,
        'Untiered': 8
      },
      costMultiplier: 0.8,  // Lower tier, lower costs
      minCost: 5,
      maxCost: 25
    },
    meta: {
      isOfficial: false,
      lastUpdated: '2024-01-01',
      source: 'Smogon University',
      popularity: 3,
      complexity: 3
    }
  },

  // Custom Draft Formats
  {
    id: 'budget-balanced',
    name: 'Budget Balanced',
    shortName: 'Budget',
    description: 'Balanced format emphasizing strategy over power with cost limits',
    generation: 9,
    gameType: 'doubles',
    category: 'custom',
    ruleset: {
      speciesClause: true,
      itemClause: true,
      bannedPokemon: [],
      bannedTiers: ['Uber', 'AG'],
      allowedGenerations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      legendaryPolicy: 'banned',
      mythicalPolicy: 'banned',
      paradoxPolicy: 'banned',
      bannedAbilities: [],
      bannedItems: [],
      bannedMoves: []
    },
    costConfig: {
      type: 'bst',
      bstTiers: {
        580: 25, 530: 20, 480: 15, 430: 12, 380: 10, 330: 8, 280: 6, 0: 4
      },
      costMultiplier: 0.7,  // Lower costs to encourage variety
      minCost: 4,
      maxCost: 25
    },
    meta: {
      isOfficial: false,
      lastUpdated: '2024-09-29',
      source: 'Community Draft Format',
      popularity: 3,
      complexity: 2
    }
  },

  {
    id: 'unrestricted',
    name: 'Unrestricted',
    shortName: 'No Limits',
    description: 'Everything goes - all Pokemon, items, and abilities allowed',
    generation: 9,
    gameType: 'doubles',
    category: 'custom',
    ruleset: {
      speciesClause: true,
      itemClause: false,
      bannedPokemon: [],
      bannedTiers: [],
      allowedGenerations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      legendaryPolicy: 'allowed',
      mythicalPolicy: 'allowed',
      paradoxPolicy: 'allowed',
      bannedAbilities: [],
      bannedItems: [],
      bannedMoves: []
    },
    costConfig: {
      type: 'bst',
      bstTiers: {
        700: 50, 650: 40, 600: 35, 550: 30, 500: 25, 450: 20, 400: 15, 350: 10, 300: 7, 0: 5
      },
      costOverrides: {
        'arceus': 80,
        'mewtwo': 70,
        'rayquaza': 75,
        'kyogre': 65,
        'groudon': 65
      },
      costMultiplier: 1.5,  // Higher costs for powerful Pokemon
      minCost: 5,
      maxCost: 80
    },
    meta: {
      isOfficial: false,
      lastUpdated: '2024-09-29',
      source: 'Community Draft Format',
      popularity: 2,
      complexity: 5
    }
  }
]

// Helper functions
export function getFormatById(id: string): PokemonFormat | undefined {
  return POKEMON_FORMATS.find(format => format.id === id)
}

export function getFormatsByCategory(category: PokemonFormat['category']): PokemonFormat[] {
  return POKEMON_FORMATS.filter(format => format.category === category)
}

export function getFormatsByGeneration(generation: number): PokemonFormat[] {
  return POKEMON_FORMATS.filter(format => format.generation === generation)
}

export function getFormatsByGameType(gameType: PokemonFormat['gameType']): PokemonFormat[] {
  return POKEMON_FORMATS.filter(format => format.gameType === gameType)
}

export function getOfficialFormats(): PokemonFormat[] {
  return POKEMON_FORMATS.filter(format => format.meta.isOfficial)
}

export function getPopularFormats(): PokemonFormat[] {
  return POKEMON_FORMATS.filter(format => format.meta.popularity >= 4)
    .sort((a, b) => b.meta.popularity - a.meta.popularity)
}

// Default format
export const DEFAULT_FORMAT = 'vgc-reg-i'

/**
 * Merge Showdown data with local formats
 * Showdown data takes precedence for banned Pokemon lists
 */
export function mergeWithShowdownData(
  localFormats: PokemonFormat[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  showdownData: Record<string, any>
): PokemonFormat[] {
  return localFormats.map(format => {
    // Try to find matching Showdown format
    const showdownFormat = Object.entries(showdownData).find(([key]) =>
      key.toLowerCase().includes(format.id.replace('-', ''))
    )

    if (!showdownFormat) {
      // No Showdown data found, return original
      return format
    }

    const [, showdownRules] = showdownFormat

    // Merge banned Pokemon from Showdown
    const showdownBanlist = showdownRules.banlist || []
    const mergedBannedPokemon = Array.from(new Set([
      ...format.ruleset.bannedPokemon,
      ...showdownBanlist
    ]))

    return {
      ...format,
      ruleset: {
        ...format.ruleset,
        bannedPokemon: mergedBannedPokemon
      },
      meta: {
        ...format.meta,
        lastUpdated: new Date().toISOString(),
        source: `${format.meta.source} + Pokémon Showdown`
      }
    }
  })
}