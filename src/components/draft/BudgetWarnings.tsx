'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Lightbulb,
  X,
  ChevronDown,
  ChevronUp,
  Target
} from 'lucide-react'

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

interface BudgetWarningsProps {
  warnings: BudgetWarning[]
  suggestions: BudgetSuggestion[]
  totalCost: number
  remainingBudget: number
  budgetEfficiency: number
  className?: string
  onApplySuggestion?: (suggestion: BudgetSuggestion) => void
}

export default function BudgetWarnings({
  warnings,
  suggestions,
  totalCost,
  remainingBudget,
  budgetEfficiency,
  className,
  onApplySuggestion
}: BudgetWarningsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set())

  const visibleWarnings = warnings.filter(warning =>
    !dismissedWarnings.has(`${warning.type}-${warning.message}`)
  )

  const getWarningIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'low':
        return <TrendingUp className="h-4 w-4 text-blue-500" />
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />
    }
  }

  const getWarningColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
      case 'medium':
        return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
      case 'low':
        return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
      default:
        return 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
    }
  }

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'remove':
        return <X className="h-4 w-4 text-red-500" />
      case 'reorder':
        return <Target className="h-4 w-4 text-blue-500" />
      case 'optimize':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      default:
        return <Lightbulb className="h-4 w-4 text-yellow-500" />
    }
  }

  const dismissWarning = (warning: BudgetWarning) => {
    setDismissedWarnings(prev => new Set([...prev, `${warning.type}-${warning.message}`]))
  }

  const getEfficiencyColor = () => {
    if (budgetEfficiency >= 80) return 'text-green-600 dark:text-green-400'
    if (budgetEfficiency >= 60) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getEfficiencyLabel = () => {
    if (budgetEfficiency >= 90) return 'Excellent'
    if (budgetEfficiency >= 80) return 'Good'
    if (budgetEfficiency >= 60) return 'Fair'
    return 'Poor'
  }

  if (visibleWarnings.length === 0 && suggestions.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Budget Overview */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Budget Status</span>
          </div>
          {(visibleWarnings.length > 0 || suggestions.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 px-2 text-xs"
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {isExpanded ? 'Hide' : 'Show'} Details
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="text-center">
            <div className="font-bold text-slate-800 dark:text-slate-200">{totalCost}</div>
            <div className="text-slate-600 dark:text-slate-400">Wishlist Cost</div>
          </div>
          <div className="text-center">
            <div className={cn("font-bold", remainingBudget >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
              {remainingBudget}
            </div>
            <div className="text-slate-600 dark:text-slate-400">Remaining</div>
          </div>
          <div className="text-center">
            <div className={cn("font-bold", getEfficiencyColor())}>
              {Math.round(budgetEfficiency)}%
            </div>
            <div className="text-slate-600 dark:text-slate-400">{getEfficiencyLabel()}</div>
          </div>
        </div>
      </div>

      {/* Detailed Warnings and Suggestions */}
      {isExpanded && (
        <div className="space-y-2">
          {/* Warnings */}
          {visibleWarnings.map((warning, index) => (
            <Alert
              key={`warning-${index}`}
              className={cn(
                "relative pr-8",
                getWarningColor(warning.severity)
              )}
            >
              <div className="flex items-start gap-2">
                {getWarningIcon(warning.severity)}
                <AlertDescription className="text-sm flex-1">
                  {warning.message}
                </AlertDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissWarning(warning)}
                className="absolute top-2 right-2 h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </Button>
            </Alert>
          ))}

          {/* Suggestions */}
          {suggestions.map((suggestion, index) => (
            <Alert
              key={`suggestion-${index}`}
              className="border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20"
            >
              <div className="flex items-start gap-2">
                {getSuggestionIcon(suggestion.type)}
                <div className="flex-1">
                  <AlertDescription className="text-sm mb-2">
                    {suggestion.message}
                  </AlertDescription>
                  {suggestion.savings && (
                    <Badge variant="outline" className="text-xs mr-2">
                      Save {suggestion.savings} pts
                    </Badge>
                  )}
                  {onApplySuggestion && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onApplySuggestion(suggestion)}
                      className="text-xs h-6"
                    >
                      Apply
                    </Button>
                  )}
                </div>
              </div>
            </Alert>
          ))}
        </div>
      )}
    </div>
  )
}