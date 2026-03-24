/**
 * Usage-based pricing templates for competitive Pokemon formats.
 * Costs are derived from Smogon/VGC usage statistics.
 * Higher usage rate = higher draft cost.
 *
 * Template tiers:
 *   S-Tier (50+ pts): >30% usage rate — meta-defining
 *   A-Tier (35 pts): 15-30% usage — top picks
 *   B-Tier (25 pts): 8-15% usage — strong options
 *   C-Tier (15 pts): 3-8% usage — solid role players
 *   D-Tier (8 pts): 1-3% usage — niche picks
 *   F-Tier (3 pts): <1% usage — deep cuts
 */

export interface UsagePricingTemplate {
  id: string
  name: string
  description: string
  formatId: string
  lastUpdated: string
  tiers: {
    name: string
    cost: number
    pokemon: string[]
  }[]
}

export const USAGE_PRICING_TEMPLATES: UsagePricingTemplate[] = [
  {
    id: 'vgc-reg-i-usage',
    name: 'VGC 2025 Reg I — Usage-Based',
    description: 'Costs based on VGC Reg I tournament usage rates. Meta-dominant Pokemon cost more.',
    formatId: 'vgc-reg-i',
    lastUpdated: '2025-03',
    tiers: [
      {
        name: 'S-Tier',
        cost: 50,
        pokemon: [
          'flutter-mane', 'incineroar', 'raging-bolt', 'calyrex-shadow',
          'calyrex-ice', 'urshifu-rapid-strike', 'kyogre'
        ]
      },
      {
        name: 'A-Tier',
        cost: 35,
        pokemon: [
          'tornadus', 'ogerpon-wellspring', 'iron-hands', 'chi-yu',
          'chien-pao', 'landorus-therian', 'rillaboom', 'amoonguss',
          'iron-crown', 'walking-wake', 'koraidon', 'miraidon',
          'whimsicott', 'pelipper', 'grimmsnarl'
        ]
      },
      {
        name: 'B-Tier',
        cost: 25,
        pokemon: [
          'iron-boulder', 'gouging-fire', 'archaludon', 'kingambit',
          'gholdengo', 'iron-valiant', 'ting-lu', 'ogerpon-hearthflame',
          'entei', 'tsareena', 'farigiraf', 'porygon2', 'dondozo',
          'tatsugiri', 'arcanine', 'volcanion', 'indeedee-f',
          'hatterene', 'torkoal', 'ninetales-alola'
        ]
      },
      {
        name: 'C-Tier',
        cost: 15,
        pokemon: [
          'great-tusk', 'iron-moth', 'roaring-moon', 'annihilape',
          'dragonite', 'garchomp', 'tyranitar', 'excadrill',
          'palafin', 'talonflame', 'araquanid', 'meowscarada',
          'sylveon', 'clefairy', 'gothitelle', 'sableye',
          'sinistcha', 'basculegion', 'ogerpon-cornerstone',
          'electabuzz', 'magmar', 'comfey'
        ]
      },
      {
        name: 'D-Tier',
        cost: 8,
        pokemon: [
          'hydreigon', 'volcarona', 'scizor', 'breloom',
          'arboliva', 'murkrow', 'drifblim', 'bronzong',
          'gastrodon', 'amoonguss', 'maushold', 'flamigo',
          'kilowattrel', 'tinkaton', 'cetitan', 'dondozo',
          'wo-chien', 'iron-bundle', 'iron-treads'
        ]
      },
      {
        name: 'F-Tier',
        cost: 3,
        pokemon: [] // Everything else defaults to F-Tier
      }
    ]
  },
  {
    id: 'vgc-reg-h-usage',
    name: 'VGC 2024 Reg H — Usage-Based',
    description: 'Costs based on VGC Reg H usage. No legendaries or paradox Pokemon in this format.',
    formatId: 'vgc-reg-h',
    lastUpdated: '2024-12',
    tiers: [
      {
        name: 'S-Tier',
        cost: 50,
        pokemon: [
          'incineroar', 'rillaboom', 'amoonguss', 'farigiraf'
        ]
      },
      {
        name: 'A-Tier',
        cost: 35,
        pokemon: [
          'archaludon', 'kingambit', 'gholdengo', 'primarina',
          'arcanine', 'whimsicott', 'torkoal', 'pelipper',
          'indeedee-f', 'grimmsnarl', 'palafin'
        ]
      },
      {
        name: 'B-Tier',
        cost: 25,
        pokemon: [
          'araquanid', 'talonflame', 'annihilape', 'garchomp',
          'dragonite', 'meowscarada', 'sinistcha', 'hatterene',
          'tsareena', 'porygon2', 'dondozo', 'tatsugiri',
          'sylveon', 'clefairy', 'gothitelle', 'ninetales-alola'
        ]
      },
      {
        name: 'C-Tier',
        cost: 15,
        pokemon: [
          'tinkaton', 'cetitan', 'arboliva', 'sableye',
          'drifblim', 'bronzong', 'gastrodon', 'murkrow',
          'maushold', 'flamigo', 'kilowattrel', 'comfey',
          'toxapex', 'slowking-galar', 'mimikyu', 'hydreigon'
        ]
      },
      {
        name: 'D-Tier',
        cost: 8,
        pokemon: [
          'bellibolt', 'brambleghast', 'pawmot', 'espathra',
          'baxcalibur', 'glimmora', 'orthworm', 'garganacl',
          'revavroom', 'dachsbun', 'grafaiai', 'rabsca'
        ]
      },
      {
        name: 'F-Tier',
        cost: 3,
        pokemon: []
      }
    ]
  },
  {
    id: 'smogon-ou-usage',
    name: 'Smogon OU — Usage-Based',
    description: 'Costs based on Smogon OU ladder usage rates. Singles meta pricing.',
    formatId: 'smogon-ou',
    lastUpdated: '2025-03',
    tiers: [
      {
        name: 'S-Tier',
        cost: 50,
        pokemon: [
          'great-tusk', 'kingambit', 'gholdengo', 'dragapult',
          'iron-valiant', 'darkrai', 'landorus-therian'
        ]
      },
      {
        name: 'A-Tier',
        cost: 35,
        pokemon: [
          'heatran', 'toxapex', 'corviknight', 'iron-moth',
          'roaring-moon', 'walking-wake', 'raging-bolt',
          'clefable', 'slowking-galar', 'gliscor', 'volcarona',
          'samurott-hisui', 'skeledirge', 'garganacl'
        ]
      },
      {
        name: 'B-Tier',
        cost: 25,
        pokemon: [
          'iron-treads', 'dragonite', 'garchomp', 'breloom',
          'scizor', 'weavile', 'hydreigon', 'magnezone',
          'ferrothorn', 'zapdos', 'tornadus-therian', 'pelipper'
        ]
      },
      {
        name: 'C-Tier',
        cost: 15,
        pokemon: [
          'cinderace', 'lokix', 'tinkaton', 'quaquaval',
          'iron-boulder', 'meowscarada', 'annihilape',
          'tyranitar', 'excadrill', 'gastrodon', 'ditto'
        ]
      },
      {
        name: 'D-Tier',
        cost: 8,
        pokemon: []
      },
      {
        name: 'F-Tier',
        cost: 3,
        pokemon: []
      }
    ]
  }
]

/**
 * Get a usage pricing template by ID
 */
export function getUsagePricingTemplate(id: string): UsagePricingTemplate | undefined {
  return USAGE_PRICING_TEMPLATES.find(t => t.id === id)
}

/**
 * Get all templates for a specific format
 */
export function getTemplatesForFormat(formatId: string): UsagePricingTemplate[] {
  return USAGE_PRICING_TEMPLATES.filter(t => t.formatId === formatId)
}

/**
 * Convert a usage pricing template to a cost overrides map
 * for use with the format rules engine
 */
export function templateToCostOverrides(template: UsagePricingTemplate): Record<string, number> {
  const overrides: Record<string, number> = {}
  for (const tier of template.tiers) {
    for (const pokemon of tier.pokemon) {
      overrides[pokemon] = tier.cost
    }
  }
  return overrides
}

/**
 * Get the default tier cost (F-Tier) for Pokemon not explicitly listed
 */
export function getDefaultTierCost(template: UsagePricingTemplate): number {
  const fTier = template.tiers.find(t => t.name === 'F-Tier')
  return fTier?.cost ?? 3
}
