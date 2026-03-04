/**
 * Budget feasibility guard — prevents picks that would make it impossible
 * to fill remaining team slots with the cheapest available Pokemon.
 */

interface CostItem {
  cost: number
}

export interface BudgetStatus {
  maxAffordableCost: number
  isTight: boolean
  isVeryTight: boolean
  reservedBudget: number
  availableForPick: number
}

/**
 * Returns the maximum cost a player can spend on their NEXT pick
 * while still being able to fill all remaining slots with the
 * cheapest available Pokemon.
 *
 * @param budgetRemaining - Player's current remaining budget
 * @param remainingSlots - Slots left to fill INCLUDING this pick
 * @param availableCosts - Sorted ascending array of costs of undrafted Pokemon
 * @returns max cost the player can spend on this pick, or 0 if stuck
 */
export function getMaxAffordableCost(
  budgetRemaining: number,
  remainingSlots: number,
  availableCosts: number[],
): number {
  if (remainingSlots <= 0) return 0
  if (remainingSlots === 1) return budgetRemaining
  if (availableCosts.length < remainingSlots) return 0

  // Reserve budget for the cheapest (remainingSlots - 1) Pokemon
  // to fill the other slots after this pick
  let reservedCost = 0
  for (let i = 0; i < remainingSlots - 1; i++) {
    reservedCost += availableCosts[i]
  }

  return Math.max(0, budgetRemaining - reservedCost)
}

/**
 * Checks whether picking a Pokemon at the given cost is safe —
 * meaning the player can still fill all remaining slots afterward.
 */
export function isPickSafe(
  cost: number,
  budgetRemaining: number,
  remainingSlots: number,
  availableCosts: number[],
): boolean {
  const max = getMaxAffordableCost(budgetRemaining, remainingSlots, availableCosts)
  return cost <= max
}

/**
 * Returns budget status with warnings for tight budgets.
 *
 * @param budgetRemaining - Player's current remaining budget
 * @param remainingSlots - Slots left to fill INCLUDING current pick
 * @param availableCosts - Sorted ascending array of costs of undrafted Pokemon
 */
export function getBudgetStatus(
  budgetRemaining: number,
  remainingSlots: number,
  availableCosts: number[],
): BudgetStatus {
  if (remainingSlots <= 0 || availableCosts.length === 0) {
    return {
      maxAffordableCost: 0,
      isTight: false,
      isVeryTight: false,
      reservedBudget: 0,
      availableForPick: 0,
    }
  }

  const maxAffordable = getMaxAffordableCost(budgetRemaining, remainingSlots, availableCosts)

  // Reserved = sum of cheapest (remainingSlots - 1) costs
  let reservedBudget = 0
  for (let i = 0; i < Math.min(remainingSlots - 1, availableCosts.length); i++) {
    reservedBudget += availableCosts[i]
  }

  // Compute median cost of available Pokemon for "tight" threshold
  const medianCost = availableCosts[Math.floor(availableCosts.length / 2)] || 0
  const minCost = availableCosts[0] || 0

  return {
    maxAffordableCost: maxAffordable,
    isTight: maxAffordable < medianCost && maxAffordable > 0,
    isVeryTight: maxAffordable <= minCost * 2 && maxAffordable > 0,
    reservedBudget,
    availableForPick: maxAffordable,
  }
}

/**
 * Helper to get sorted costs from available (undrafted) Pokemon.
 * Call once per render and pass the result to the above functions.
 */
export function getSortedAvailableCosts(
  allPokemon: CostItem[],
  draftedIds: Set<string>,
  pokemonIds: string[],
): number[] {
  const costs: number[] = []
  for (let i = 0; i < allPokemon.length; i++) {
    if (!draftedIds.has(pokemonIds[i])) {
      costs.push(allPokemon[i].cost)
    }
  }
  return costs.sort((a, b) => a - b)
}
