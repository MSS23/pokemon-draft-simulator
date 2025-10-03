import { useMemo } from 'react'
import { WishlistItem, Pokemon } from '@/types'

interface BudgetValidationOptions {
  wishlist: WishlistItem[]
  currentBudget: number
  usedBudget?: number
}

interface BudgetValidationResult {
  isValid: boolean
  totalCost: number
  remainingBudget: number
  isOverBudget: boolean
  overageAmount: number
  affordableItems: WishlistItem[]
  unaffordableItems: WishlistItem[]
  canAffordNext: boolean
  budgetEfficiency: number
  warnings: BudgetWarning[]
  suggestions: BudgetSuggestion[]
}

interface BudgetWarning {
  type: 'overage' | 'tight' | 'inefficient' | 'unavailable'
  severity: 'low' | 'medium' | 'high'
  message: string
  itemId?: string
}

interface BudgetSuggestion {
  type: 'remove' | 'reorder' | 'optimize'
  message: string
  itemIds?: string[]
  savings?: number
}

export function useBudgetValidation({
  wishlist,
  currentBudget,
  usedBudget = 0
}: BudgetValidationOptions): BudgetValidationResult {
  return useMemo(() => {
    const availableItems = wishlist.filter(item => item.isAvailable)
    const totalCost = wishlist.reduce((sum, item) => sum + item.cost, 0)
    const remainingBudget = currentBudget - usedBudget
    const isOverBudget = totalCost > remainingBudget
    const overageAmount = Math.max(0, totalCost - remainingBudget)

    // Separate affordable and unaffordable items
    const affordableItems: WishlistItem[] = []
    const unaffordableItems: WishlistItem[] = []
    let runningCost = 0

    // Sort by priority to check affordability in order
    const sortedItems = [...availableItems].sort((a, b) => a.priority - b.priority)

    sortedItems.forEach(item => {
      if (runningCost + item.cost <= remainingBudget) {
        affordableItems.push(item)
        runningCost += item.cost
      } else {
        unaffordableItems.push(item)
      }
    })

    const canAffordNext = availableItems.length > 0 && affordableItems.length > 0
    const budgetEfficiency = remainingBudget > 0 ? (runningCost / remainingBudget) * 100 : 0

    // Generate warnings
    const warnings: BudgetWarning[] = []

    if (isOverBudget) {
      warnings.push({
        type: 'overage',
        severity: 'high',
        message: `Wishlist exceeds budget by ${overageAmount} points`
      })
    } else if (totalCost > remainingBudget * 0.9) {
      warnings.push({
        type: 'tight',
        severity: 'medium',
        message: 'Wishlist uses most of your remaining budget'
      })
    }

    if (budgetEfficiency < 60 && remainingBudget > 20) {
      warnings.push({
        type: 'inefficient',
        severity: 'low',
        message: 'Consider adding more Pokemon to use your budget efficiently'
      })
    }

    // Check for unavailable expensive items
    const unavailableExpensiveItems = wishlist.filter(
      item => !item.isAvailable && item.cost > remainingBudget * 0.3
    )

    if (unavailableExpensiveItems.length > 0) {
      warnings.push({
        type: 'unavailable',
        severity: 'medium',
        message: `${unavailableExpensiveItems.length} expensive Pokemon in your wishlist were already drafted`,
        itemId: unavailableExpensiveItems[0].id
      })
    }

    // Generate suggestions
    const suggestions: BudgetSuggestion[] = []

    if (isOverBudget) {
      // Suggest removing the most expensive unaffordable items
      const expensiveItems = unaffordableItems
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 3)

      if (expensiveItems.length > 0) {
        const savings = expensiveItems.reduce((sum, item) => sum + item.cost, 0)
        suggestions.push({
          type: 'remove',
          message: `Remove ${expensiveItems.length} expensive Pokemon to save ${Math.min(savings, overageAmount)} points`,
          itemIds: expensiveItems.map(item => item.id),
          savings: Math.min(savings, overageAmount)
        })
      }
    }

    if (unaffordableItems.length > 0 && affordableItems.length > 0) {
      suggestions.push({
        type: 'reorder',
        message: `Reorder your wishlist to prioritize ${affordableItems.length} affordable Pokemon`,
        itemIds: affordableItems.map(item => item.id)
      })
    }

    if (budgetEfficiency < 80 && !isOverBudget) {
      const remainingPoints = remainingBudget - runningCost
      suggestions.push({
        type: 'optimize',
        message: `You have ${remainingPoints} points remaining. Consider adding more Pokemon to your wishlist.`,
        savings: remainingPoints
      })
    }

    return {
      isValid: !isOverBudget && availableItems.length > 0,
      totalCost,
      remainingBudget,
      isOverBudget,
      overageAmount,
      affordableItems,
      unaffordableItems,
      canAffordNext,
      budgetEfficiency,
      warnings,
      suggestions
    }
  }, [wishlist, currentBudget, usedBudget])
}

// Helper hook for adding Pokemon with budget validation
export function useWishlistBudgetCheck(
  currentWishlist: WishlistItem[],
  currentBudget: number,
  usedBudget: number = 0
) {
  const validation = useBudgetValidation({
    wishlist: currentWishlist,
    currentBudget,
    usedBudget
  })

  const canAddPokemon = (pokemon: Pokemon): { canAdd: boolean; reason?: string } => {
    const newTotalCost = validation.totalCost + pokemon.cost
    const remainingBudget = currentBudget - usedBudget

    if (newTotalCost > remainingBudget) {
      const overage = newTotalCost - remainingBudget
      return {
        canAdd: false,
        reason: `Adding ${pokemon.name} (${pokemon.cost} pts) would exceed your budget by ${overage} points`
      }
    }

    // Check if adding this Pokemon would make the wishlist very expensive
    if (newTotalCost > remainingBudget * 0.95) {
      return {
        canAdd: true,
        reason: `Adding ${pokemon.name} will use most of your remaining budget`
      }
    }

    return { canAdd: true }
  }

  return {
    ...validation,
    canAddPokemon
  }
}