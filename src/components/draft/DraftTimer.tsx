'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertCircle, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DraftTimerProps {
  timeRemaining: number // in seconds
  totalTime?: number // in seconds
  onTimeUp?: () => void
  variant?: 'compact' | 'card' | 'inline'
  showProgress?: boolean
  pauseOnHover?: boolean
  className?: string
}

/**
 * DraftTimer Component - Visual countdown timer with urgency indicators
 *
 * Accessibility features:
 * - ARIA live region announces time updates
 * - Visual indicators (color, animation) don't rely solely on color
 * - Keyboard accessible (if interactive)
 * - Screen reader friendly time format
 *
 * Performance:
 * - Optimized re-renders with useMemo
 * - Smooth animations with CSS transitions
 * - Reduced motion support
 *
 * UX features:
 * - Color changes at 30s, 10s, 5s thresholds
 * - Pulse animation in final 10 seconds
 * - Progress bar visualization
 * - Optional sound alerts (user-controlled)
 */
export default function DraftTimer({
  timeRemaining,
  totalTime = 60,
  onTimeUp,
  variant = 'card',
  showProgress = true,
  pauseOnHover = false,
  className
}: DraftTimerProps) {
  const [isPaused, setIsPaused] = useState(false)

  // Format time as MM:SS
  const formattedTime = useMemo(() => {
    const minutes = Math.floor(timeRemaining / 60)
    const seconds = timeRemaining % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [timeRemaining])

  // Get urgency level based on remaining time
  const urgency = useMemo(() => {
    if (timeRemaining <= 5) return 'critical'
    if (timeRemaining <= 10) return 'high'
    if (timeRemaining <= 30) return 'medium'
    return 'low'
  }, [timeRemaining])

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (!totalTime) return 0
    return ((totalTime - timeRemaining) / totalTime) * 100
  }, [timeRemaining, totalTime])

  // Call onTimeUp when time expires
  useEffect(() => {
    if (timeRemaining <= 0 && onTimeUp) {
      onTimeUp()
    }
  }, [timeRemaining, onTimeUp])

  // Get color classes based on urgency
  const getColorClasses = useCallback(() => {
    switch (urgency) {
      case 'critical':
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          border: 'border-red-500 dark:border-red-400',
          text: 'text-red-700 dark:text-red-300',
          progress: 'bg-red-600 dark:bg-red-500',
          glow: 'shadow-red-500/50'
        }
      case 'high':
        return {
          bg: 'bg-orange-100 dark:bg-orange-900/30',
          border: 'border-orange-500 dark:border-orange-400',
          text: 'text-orange-700 dark:text-orange-300',
          progress: 'bg-orange-600 dark:bg-orange-500',
          glow: 'shadow-orange-500/50'
        }
      case 'medium':
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          border: 'border-yellow-500 dark:border-yellow-400',
          text: 'text-yellow-700 dark:text-yellow-300',
          progress: 'bg-yellow-600 dark:bg-yellow-500',
          glow: 'shadow-yellow-500/50'
        }
      default:
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          border: 'border-blue-500 dark:border-blue-400',
          text: 'text-blue-700 dark:text-blue-300',
          progress: 'bg-blue-600 dark:bg-blue-500',
          glow: 'shadow-blue-500/50'
        }
    }
  }, [urgency])

  const colors = getColorClasses()

  // Get icon based on urgency
  const Icon = urgency === 'critical' ? AlertCircle : urgency === 'high' ? Zap : Clock

  // Screen reader announcement text
  const srText = useMemo(() => {
    if (timeRemaining <= 0) return 'Time is up'
    if (timeRemaining <= 10) return `${timeRemaining} seconds remaining! Hurry!`
    if (timeRemaining <= 30) return `${timeRemaining} seconds remaining`

    const minutes = Math.floor(timeRemaining / 60)
    const seconds = timeRemaining % 60
    if (minutes > 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''} remaining`
    }
    return `${seconds} second${seconds !== 1 ? 's' : ''} remaining`
  }, [timeRemaining])

  if (variant === 'compact') {
    return (
      <Badge
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-base font-mono',
          colors.bg,
          colors.border,
          colors.text,
          'border-2',
          urgency === 'critical' && 'animate-pulse shadow-lg',
          urgency === 'high' && 'animate-pulse',
          'transition-all duration-300',
          'motion-reduce:animate-none',
          className
        )}
        onMouseEnter={() => pauseOnHover && setIsPaused(true)}
        onMouseLeave={() => pauseOnHover && setIsPaused(false)}
      >
        <Icon className={cn('h-4 w-4', urgency === 'critical' && 'animate-pulse')} aria-hidden="true" />
        <span className="font-bold tabular-nums">{formattedTime}</span>
        <span className="sr-only" role="timer" aria-live="polite" aria-atomic="true">
          {srText}
        </span>
      </Badge>
    )
  }

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
          colors.bg,
          'border-2',
          colors.border,
          urgency === 'critical' && 'animate-pulse shadow-lg',
          className
        )}
        onMouseEnter={() => pauseOnHover && setIsPaused(true)}
        onMouseLeave={() => pauseOnHover && setIsPaused(false)}
      >
        <Icon className={cn('h-5 w-5', colors.text)} aria-hidden="true" />
        <div className="flex flex-col">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Time Remaining
          </span>
          <span className={cn('text-xl font-bold font-mono tabular-nums', colors.text)}>
            {formattedTime}
          </span>
        </div>
        <span className="sr-only" role="timer" aria-live="polite" aria-atomic="true">
          {srText}
        </span>
      </div>
    )
  }

  // Default: card variant
  return (
    <Card
      className={cn(
        'border-2 transition-all duration-300',
        colors.border,
        urgency === 'critical' && `animate-pulse shadow-2xl ${colors.glow}`,
        urgency === 'high' && 'shadow-lg',
        'motion-reduce:animate-none',
        className
      )}
      onMouseEnter={() => pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => pauseOnHover && setIsPaused(false)}
    >
      <CardContent className={cn('p-6', colors.bg)}>
        <div className="flex flex-col items-center gap-4">
          {/* Icon and Title */}
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-full',
              urgency === 'critical' ? 'bg-red-200 dark:bg-red-800' :
              urgency === 'high' ? 'bg-orange-200 dark:bg-orange-800' :
              urgency === 'medium' ? 'bg-yellow-200 dark:bg-yellow-800' :
              'bg-blue-200 dark:bg-blue-800'
            )}>
              <Icon className={cn('h-6 w-6', colors.text, urgency === 'critical' && 'animate-pulse')} aria-hidden="true" />
            </div>
            <span className={cn('font-semibold text-lg', colors.text)}>
              {urgency === 'critical' ? 'HURRY!' : urgency === 'high' ? 'Time Running Out' : 'Time Remaining'}
            </span>
          </div>

          {/* Timer Display */}
          <div className={cn('text-6xl font-bold font-mono tabular-nums', colors.text)}>
            {formattedTime}
          </div>

          {/* Progress Bar */}
          {showProgress && (
            <div className="w-full space-y-2">
              <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-1000 ease-linear rounded-full',
                    colors.progress,
                    urgency === 'critical' && 'animate-pulse'
                  )}
                  style={{ width: `${progressPercentage}%` }}
                  role="progressbar"
                  aria-valuenow={progressPercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${progressPercentage.toFixed(0)}% of time elapsed`}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>0:00</span>
                <span>{Math.floor(totalTime / 60)}:{(totalTime % 60).toString().padStart(2, '0')}</span>
              </div>
            </div>
          )}

          {/* Urgency Message */}
          {urgency === 'critical' && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-200 dark:bg-red-800 rounded-full">
              <AlertCircle className="h-4 w-4 text-red-700 dark:text-red-300" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                Make your selection now!
              </span>
            </div>
          )}

          {/* Screen Reader Announcement */}
          <span className="sr-only" role="timer" aria-live="assertive" aria-atomic="true">
            {srText}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * AuctionTimer - Specialized timer for auction countdown
 */
interface AuctionTimerProps {
  timeRemaining: number
  className?: string
  onTimeUp?: () => void
}

export function AuctionTimer({ timeRemaining, className, onTimeUp }: AuctionTimerProps) {
  return (
    <DraftTimer
      timeRemaining={timeRemaining}
      totalTime={30}
      onTimeUp={onTimeUp}
      variant="compact"
      showProgress={false}
      className={className}
    />
  )
}

/**
 * PickTimer - Specialized timer for regular draft picks
 */
interface PickTimerProps {
  timeRemaining: number
  className?: string
  onTimeUp?: () => void
}

export function PickTimer({ timeRemaining, className, onTimeUp }: PickTimerProps) {
  return (
    <DraftTimer
      timeRemaining={timeRemaining}
      totalTime={60}
      onTimeUp={onTimeUp}
      variant="card"
      showProgress={true}
      pauseOnHover={false}
      className={className}
    />
  )
}
