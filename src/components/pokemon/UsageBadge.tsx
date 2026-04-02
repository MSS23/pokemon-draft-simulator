'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'

interface UsageBadgeProps {
  usagePercent: number | null
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Compact badge showing a Pokemon's competitive usage percentage.
 * Color-coded for quick visual identification:
 *   - Red:    >25% (meta staple)
 *   - Yellow: 10-25% (popular pick)
 *   - Green:  <10% (uncommon / sleeper pick)
 *   - Gray:   N/A (no data)
 */
export const UsageBadge = memo<UsageBadgeProps>(function UsageBadge({
  usagePercent,
  size = 'sm',
  className,
}) {
  const hasData = usagePercent !== null && usagePercent !== undefined

  const colorClass = !hasData
    ? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    : usagePercent > 25
      ? 'bg-red-500/20 text-red-400 border-red-500/30'
      : usagePercent > 10
        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'

  const sizeClass = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-xs px-2 py-0.5'

  const label = hasData
    ? `${usagePercent.toFixed(1)}%`
    : 'N/A'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold leading-none tabular-nums',
        colorClass,
        sizeClass,
        className
      )}
      title={
        hasData
          ? `${usagePercent.toFixed(2)}% usage in competitive play`
          : 'No competitive usage data available'
      }
    >
      {label}
    </span>
  )
})
