import { TierDefinition } from '@/types'

export const DEFAULT_TIER_CONFIG: TierDefinition[] = [
  { name: 'S', label: 'S Tier', cost: 20, minCost: 14, color: '#ef4444' },
  { name: 'A', label: 'A Tier', cost: 15, minCost: 11, color: '#f97316' },
  { name: 'B', label: 'B Tier', cost: 10, minCost: 8,  color: '#eab308' },
  { name: 'C', label: 'C Tier', cost: 7,  minCost: 5,  color: '#22c55e' },
  { name: 'D', label: 'D Tier', cost: 4,  minCost: 3,  color: '#6366f1' },
  { name: 'E', label: 'E Tier', cost: 2,  minCost: 0,  color: '#94a3b8' },
]

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
