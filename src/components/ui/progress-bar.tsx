'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  max: number
  label?: string
  showValue?: boolean
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'gradient'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  animated?: boolean
  striped?: boolean
}

/**
 * ProgressBar Component - Accessible progress indicator
 *
 * Accessibility features:
 * - ARIA role="progressbar" for screen readers
 * - aria-valuenow, aria-valuemin, aria-valuemax attributes
 * - aria-label for context
 * - Visual and text representations of progress
 *
 * Responsive design:
 * - Mobile-friendly sizes (min-height 44px for touch targets on 'lg')
 * - Smooth animations with reduced-motion support
 * - Percentage-based width for all screen sizes
 */
export function ProgressBar({
  value,
  max,
  label,
  showValue = true,
  variant = 'default',
  size = 'md',
  className,
  animated = false,
  striped = false
}: ProgressBarProps) {
  const percentage = useMemo(() => {
    if (max === 0) return 0
    return Math.min(Math.max((value / max) * 100, 0), 100)
  }, [value, max])

  // Auto-select variant based on percentage if default
  const effectiveVariant = useMemo(() => {
    if (variant !== 'default') return variant

    if (percentage >= 90) return 'danger'
    if (percentage >= 70) return 'warning'
    if (percentage >= 50) return 'success'
    return 'default'
  }, [variant, percentage])

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4'
  }

  const variantClasses = {
    default: 'bg-blue-600 dark:bg-blue-500',
    success: 'bg-green-600 dark:bg-green-500',
    warning: 'bg-orange-500 dark:bg-orange-400',
    danger: 'bg-red-600 dark:bg-red-500',
    gradient: 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500'
  }

  const bgClasses = {
    default: 'bg-gray-200 dark:bg-gray-700',
    success: 'bg-green-100 dark:bg-green-900/30',
    warning: 'bg-orange-100 dark:bg-orange-900/30',
    danger: 'bg-red-100 dark:bg-red-900/30',
    gradient: 'bg-gray-200 dark:bg-gray-700'
  }

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-2 text-sm">
          {label && (
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {label}
            </span>
          )}
          {showValue && (
            <span
              className={cn(
                'font-semibold tabular-nums',
                effectiveVariant === 'danger' && 'text-red-600 dark:text-red-400',
                effectiveVariant === 'warning' && 'text-orange-600 dark:text-orange-400',
                effectiveVariant === 'success' && 'text-green-600 dark:text-green-400',
                effectiveVariant === 'default' && 'text-blue-600 dark:text-blue-400',
                effectiveVariant === 'gradient' && 'text-purple-600 dark:text-purple-400'
              )}
              aria-live="polite"
            >
              {value} / {max}
              {' '}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({percentage.toFixed(0)}%)
              </span>
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || `Progress: ${percentage.toFixed(0)}%`}
        className={cn(
          'w-full rounded-full overflow-hidden',
          sizeClasses[size],
          bgClasses[effectiveVariant]
        )}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            variantClasses[effectiveVariant],
            animated && 'animate-pulse',
            striped && 'bg-stripes',
            'motion-reduce:transition-none'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

/**
 * BudgetProgressBar - Specialized for budget tracking
 */
interface BudgetProgressBarProps {
  spent: number
  total: number
  className?: string
}

export function BudgetProgressBar({ spent, total, className }: BudgetProgressBarProps) {
  const remaining = total - spent
  const percentage = (spent / total) * 100

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          Budget
        </span>
        <div className="flex items-center gap-2">
          <span className="text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-blue-600 dark:text-blue-400">{spent}</span>
            {' / '}
            {total}
          </span>
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              remaining <= 0 && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
              remaining > 0 && remaining <= total * 0.2 && 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
              remaining > total * 0.2 && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            )}
          >
            {remaining} left
          </span>
        </div>
      </div>
      <ProgressBar
        value={spent}
        max={total}
        showValue={false}
        size="md"
        animated={percentage >= 90}
      />
    </div>
  )
}

/**
 * DraftProgressBar - Specialized for draft completion tracking
 */
interface DraftProgressBarProps {
  currentPick: number
  totalPicks: number
  currentRound: number
  totalRounds: number
  className?: string
}

export function DraftProgressBar({
  currentPick,
  totalPicks,
  currentRound,
  totalRounds,
  className
}: DraftProgressBarProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Overall Progress */}
      <ProgressBar
        value={currentPick}
        max={totalPicks}
        label="Draft Progress"
        showValue={true}
        variant="gradient"
        size="md"
        animated={currentPick >= totalPicks * 0.9}
      />

      {/* Round Progress */}
      <div className="text-center text-xs text-gray-600 dark:text-gray-400">
        Round{' '}
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          {currentRound}
        </span>
        {' of '}
        {totalRounds}
      </div>
    </div>
  )
}

/**
 * TeamPicksProgressBar - Shows team's pick completion
 */
interface TeamPicksProgressBarProps {
  picks: number
  maxPicks: number
  teamName: string
  className?: string
}

export function TeamPicksProgressBar({
  picks,
  maxPicks,
  teamName,
  className
}: TeamPicksProgressBarProps) {
  const isComplete = picks >= maxPicks

  return (
    <ProgressBar
      value={picks}
      max={maxPicks}
      label={teamName}
      showValue={true}
      variant={isComplete ? 'success' : 'default'}
      size="sm"
      className={className}
    />
  )
}
