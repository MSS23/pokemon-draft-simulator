import { TierDefinition } from '@/types'

export const DEFAULT_TIER_CONFIG: TierDefinition[] = [
  { name: 'S', label: 'S Tier', slotsPerTeam: 1, minCost: 14, color: '#ef4444' },
  { name: 'A', label: 'A Tier', slotsPerTeam: 2, minCost: 11, color: '#f97316' },
  { name: 'B', label: 'B Tier', slotsPerTeam: 3, minCost: 8,  color: '#eab308' },
  { name: 'C', label: 'C Tier', slotsPerTeam: 2, minCost: 5,  color: '#22c55e' },
  { name: 'D', label: 'D Tier', slotsPerTeam: 2, minCost: 0,  color: '#6366f1' },
]

export const TIER_PRESET_LABELS: Record<string, string> = {
  'S': 'Best Pokémon in the format',
  'A': 'Strong, versatile picks',
  'B': 'Solid mid-tier options',
  'C': 'Situational but useful',
  'D': 'Lower-tier fillers',
}

/** Given a pokemon cost and the tier config, return which tier it belongs to */
export function getPokemonTier(cost: number, tiers: TierDefinition[]): TierDefinition | null {
  const sorted = [...tiers].sort((a, b) => b.minCost - a.minCost)
  return sorted.find(t => cost >= t.minCost) ?? null
}

/** Given existing picks (with costs) and tier config, return remaining slots per tier name */
export function getRemainingTierSlots(
  tiers: TierDefinition[],
  pickCosts: number[],
): Record<string, number> {
  const remaining: Record<string, number> = {}
  for (const tier of tiers) {
    remaining[tier.name] = tier.slotsPerTeam
  }
  for (const cost of pickCosts) {
    const tier = getPokemonTier(cost, tiers)
    if (tier && remaining[tier.name] !== undefined) {
      remaining[tier.name] = Math.max(0, remaining[tier.name] - 1)
    }
  }
  return remaining
}

/** Total number of pokemon slots from a tier config */
export function totalSlotsFromConfig(tiers: TierDefinition[]): number {
  return tiers.reduce((sum, t) => sum + t.slotsPerTeam, 0)
}

/** Whether any tier slots remain for a pokemon of the given cost */
export function canAffordTier(cost: number, tiers: TierDefinition[], remaining: Record<string, number>): boolean {
  const tier = getPokemonTier(cost, tiers)
  if (!tier) return false
  return (remaining[tier.name] ?? 0) > 0
}

/** Human-readable label for remaining slots */
export function tierSlotsLabel(tiers: TierDefinition[], remaining: Record<string, number>): string {
  return tiers
    .map(t => `${t.name}: ${remaining[t.name] ?? t.slotsPerTeam}/${t.slotsPerTeam}`)
    .join(' · ')
}
