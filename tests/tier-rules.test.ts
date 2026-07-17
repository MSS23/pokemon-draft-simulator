import { describe, expect, it } from 'vitest'
import { parseCustomPricingCSV } from '@/lib/csv-parser'
import {
  DEFAULT_TIER_CONFIG,
  fitTierConfigToRosterSize,
  getPokemonTier,
  getTierRosterSize,
  getTierUsage,
  isTierAtCapacity,
  tierInfoToDefinitions,
  validateTierConfig,
} from '@/lib/tier-utils'

describe('CSV draft-pool rules', () => {
  it('parses numeric two-column pricing with quoted names', () => {
    const result = parseCustomPricingCSV('pokemon,cost\r\n"Mr. Mime",10\r\n"Farfetch\'d",12')

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ mrmime: 10, farfetchd: 12 })
  })

  it('accepts letter tiers in the second column', () => {
    const result = parseCustomPricingCSV('Pokemon,Tier\nDragonite,S Tier\nArcanine,A\nBreloom,B')

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ dragonite: 60, arcanine: 50, breloom: 40 })
    expect(result.tiers).toEqual([
      { name: 'S Tier', cost: 60, count: 1 },
      { name: 'A Tier', cost: 50, count: 1 },
      { name: 'B Tier', cost: 40, count: 1 },
    ])
  })

  it('parses the multi-column league pool format', () => {
    const result = parseCustomPricingCSV(
      ',S Tier (60),,,,A Tier (50),,,,Banned,\n,,Dragonite,,,,Arcanine,,,,Mewtwo',
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ dragonite: 60, arcanine: 50 })
    expect(result.banned).toEqual(['Mewtwo'])
  })
})

describe('tier roster caps', () => {
  it('derives an exact roster size and validates the configuration', () => {
    const tiers = fitTierConfigToRosterSize(DEFAULT_TIER_CONFIG, 11)

    expect(getTierRosterSize(tiers)).toBe(11)
    expect(tiers[0].slotsPerTeam).toBe(1)
    expect(validateTierConfig(tiers)).toEqual({ valid: true, errors: [], rosterSize: 11 })
  })

  it('detects when a Pokemon tier is full', () => {
    const usage = getTierUsage(['S', 'A', 'A'])

    expect(isTierAtCapacity(20, DEFAULT_TIER_CONFIG, usage)).toBe(true)
    expect(isTierAtCapacity(10, DEFAULT_TIER_CONFIG, usage)).toBe(false)
  })

  it('converts imported tiers into threshold rules with an exact roster size', () => {
    const tiers = tierInfoToDefinitions([
      { name: 'S Tier', cost: 60 },
      { name: 'A Tier', cost: 50 },
      { name: 'B Tier', cost: 40 },
      { name: 'C Tier', cost: 30 },
    ], 8)

    expect(getTierRosterSize(tiers)).toBe(8)
    expect(getPokemonTier(50, tiers)?.name).toBe('A')
  })

  it('rejects duplicate tier names and impossible slot totals', () => {
    const invalid = [
      { ...DEFAULT_TIER_CONFIG[0], slotsPerTeam: 0 },
      { ...DEFAULT_TIER_CONFIG[1], name: 'S', slotsPerTeam: 0 },
    ]

    const result = validateTierConfig(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('duplicated')
    expect(result.errors.join(' ')).toContain('roster size')
  })
})
