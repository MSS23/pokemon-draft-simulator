import { TierDefinition } from '@/types'

export const DEFAULT_TIER_CONFIG: TierDefinition[] = [
  { name: 'S', label: 'S Tier', cost: 20, minCost: 14, color: '#dc2626', slotsPerTeam: 1 },
  { name: 'A', label: 'A Tier', cost: 15, minCost: 11, color: '#ea580c', slotsPerTeam: 1 },
  { name: 'B', label: 'B Tier', cost: 10, minCost: 8,  color: '#ca8a04', slotsPerTeam: 1 },
  { name: 'C', label: 'C Tier', cost: 7,  minCost: 5,  color: '#16a34a', slotsPerTeam: 1 },
  { name: 'D', label: 'D Tier', cost: 4,  minCost: 3,  color: '#4f46e5', slotsPerTeam: 1 },
  { name: 'E', label: 'E Tier', cost: 2,  minCost: 0,  color: '#64748b', slotsPerTeam: 1 },
]

const TIER_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#4f46e5', '#64748b', '#7c3aed', '#0891b2']

export const TIER_PRESET_LABELS: Record<string, string> = {
  'S': 'Best Pokémon in the format',
  'A': 'Strong, versatile picks',
  'B': 'Solid mid-tier options',
  'C': 'Situational but useful',
  'D': 'Lower-tier options',
  'E': 'Budget / filler picks',
}

/** Given a pokemon's format cost and the tier config, return which tier it belongs to */
export function getPokemonTier(cost: number, tiers: TierDefinition[]): TierDefinition | null {
  const sorted = [...tiers].sort((a, b) => b.minCost - a.minCost)
  return sorted.find(t => cost >= t.minCost) ?? null
}

/** Total roster size implied by exact per-tier caps. */
export function getTierRosterSize(tiers: TierDefinition[]): number {
  return tiers.reduce((total, tier) => total + Math.max(0, tier.slotsPerTeam || 0), 0)
}

/** Count drafted slots by persisted tier name. */
export function getTierUsage(tierNames: Array<string | null | undefined>): Record<string, number> {
  return tierNames.reduce<Record<string, number>>((usage, tierName) => {
    if (!tierName) return usage
    const key = tierName.trim().toUpperCase()
    usage[key] = (usage[key] || 0) + 1
    return usage
  }, {})
}

export function isTierAtCapacity(
  pokemonCost: number,
  tiers: TierDefinition[],
  usage: Record<string, number>,
): boolean {
  const tier = getPokemonTier(pokemonCost, tiers)
  if (!tier) return true
  return (usage[tier.name.toUpperCase()] || 0) >= tier.slotsPerTeam
}

export interface TierConfigValidation {
  valid: boolean
  errors: string[]
  rosterSize: number
}

/** Validate the rules that are persisted and enforced by the pick RPC. */
export function validateTierConfig(tiers: TierDefinition[]): TierConfigValidation {
  const errors: string[] = []
  const names = new Set<string>()

  if (tiers.length < 1 || tiers.length > 12) {
    errors.push('Use between 1 and 12 tiers.')
  }

  tiers.forEach((tier, index) => {
    const name = tier.name.trim().toUpperCase()
    if (!/^[A-Z0-9+_-]{1,8}$/.test(name)) {
      errors.push(`Tier ${index + 1} needs a short name such as S, A, or B+.`)
    } else if (names.has(name)) {
      errors.push(`Tier name ${name} is duplicated.`)
    }
    names.add(name)

    if (!Number.isInteger(tier.minCost) || tier.minCost < 0 || tier.minCost > 5000) {
      errors.push(`${tier.label || name} must have a classification value from 0 to 5000.`)
    }
    if (!Number.isInteger(tier.cost) || tier.cost < 0 || tier.cost > 5000) {
      errors.push(`${tier.label || name} must have a point value from 0 to 5000.`)
    }
    if (!Number.isInteger(tier.slotsPerTeam) || tier.slotsPerTeam < 0 || tier.slotsPerTeam > 30) {
      errors.push(`${tier.label || name} must allow between 0 and 30 slots per team.`)
    }
  })

  const thresholds = tiers.map(tier => tier.minCost)
  if (new Set(thresholds).size !== thresholds.length) {
    errors.push('Each tier needs a different classification value.')
  }

  const rosterSize = getTierRosterSize(tiers)
  if (rosterSize < 1 || rosterSize > 30) {
    errors.push('Tier slot limits must add up to a roster size between 1 and 30.')
  }

  return { valid: errors.length === 0, errors, rosterSize }
}

/**
 * Resize a preset to an exact roster size. Higher tiers keep one slot; extra
 * slots are distributed from A downward so an S tier never grows by surprise.
 */
export function fitTierConfigToRosterSize(tiers: TierDefinition[], rosterSize: number): TierDefinition[] {
  const next = tiers.map(tier => ({ ...tier, slotsPerTeam: 0 }))
  if (next.length === 0 || rosterSize <= 0) return next

  for (let i = 0; i < Math.min(rosterSize, next.length); i++) {
    next[i].slotsPerTeam = 1
  }

  let remaining = rosterSize - Math.min(rosterSize, next.length)
  let index = next.length > 1 ? 1 : 0
  while (remaining > 0) {
    next[index].slotsPerTeam += 1
    remaining -= 1
    index += 1
    if (index >= next.length) index = next.length > 1 ? 1 : 0
  }
  return next
}

export function tierInfoToDefinitions(
  tiers: Array<{ name: string; cost: number }>,
  rosterSize: number,
): TierDefinition[] {
  const definitions = tiers
    .slice()
    .sort((a, b) => b.cost - a.cost)
    .map((tier, index) => {
      const name = tier.name.replace(/\s*tier\s*/i, '').trim().toUpperCase()
      return {
        name,
        label: `${name} Tier`,
        cost: tier.cost,
        minCost: tier.cost,
        color: TIER_COLORS[index % TIER_COLORS.length],
        slotsPerTeam: 0,
      }
    })
  return fitTierConfigToRosterSize(definitions, rosterSize)
}

/**
 * Whether a team can pick a pokemon based on budget.
 * For tiered drafts the deducted cost is tier.cost, not the raw format cost.
 */
export function canAffordTierPick(
  pokemonFormatCost: number,
  tiers: TierDefinition[],
  budgetRemaining: number,
): boolean {
  const tier = getPokemonTier(pokemonFormatCost, tiers)
  if (!tier) return false
  return budgetRemaining >= tier.cost
}

/**
 * Returns the budget cost that will be deducted for picking a pokemon in a tiered draft.
 * Returns null if the pokemon doesn't fit any tier.
 */
export function getTierPickCost(pokemonFormatCost: number, tiers: TierDefinition[]): number | null {
  const tier = getPokemonTier(pokemonFormatCost, tiers)
  return tier ? tier.cost : null
}

/** Human-readable label showing budget cost per tier */
export function tierCostLabel(tiers: TierDefinition[]): string {
  return [...tiers]
    .sort((a, b) => b.minCost - a.minCost)
    .map(t => `${t.name}: ${t.cost}pts`)
    .join(' · ')
}
