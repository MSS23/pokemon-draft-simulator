'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { draftSounds } from '@/lib/draft-sounds'
import { getTimerColor, useReducedMotion } from '@/lib/draft-animations'

interface AuctionTimerProps {
  auctionEndTime: string | null
  isActive: boolean
  onTimeExpired: () => void
  onExtendTime?: (seconds: number) => void
  isHost?: boolean
  className?: string
}

export default function AuctionTimer({
  auctionEndTime,
  isActive,
  onTimeExpired,
  onExtendTime,
  isHost = false,
  className,
}: AuctionTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [hasExpired, setHasExpired] = useState(false)
  const lastTickSound = useRef(0)
  const reducedMotion = useReducedMotion()

  // Calculate time remaining
  const updateTimeRemaining = useCallback(() => {
    if (!auctionEndTime || !isActive) {
      setTimeRemaining(0)
      return
    }

    const now = Date.now()
    const endTime = new Date(auctionEndTime).getTime()
    const remaining = Math.max(0, Math.floor((endTime - now) / 1000))

    setTimeRemaining(remaining)

    if (totalDuration === 0 && remaining > 0) {
      setTotalDuration(remaining)
    }

    // Play rapid-tick in last 5 seconds
    if (remaining > 0 && remaining <= 5 && remaining !== lastTickSound.current) {
      draftSounds.play('rapid-tick')
      lastTickSound.current = remaining
    }

    // Play sold sound + fire callback on expiry
    if (remaining === 0 && !hasExpired) {
      setHasExpired(true)
      draftSounds.play('auction-sold')
      onTimeExpired()
    }
  }, [auctionEndTime, isActive, onTimeExpired, hasExpired, totalDuration])

  // Update timer every second
  useEffect(() => {
    if (!isActive) return

    updateTimeRemaining()
    const interval = setInterval(updateTimeRemaining, 1000)

    return () => clearInterval(interval)
  }, [isActive, updateTimeRemaining])

  // Reset when new auction starts
  useEffect(() => {
    if (auctionEndTime && isActive) {
      setHasExpired(false)
      setTotalDuration(0)
      lastTickSound.current = 0
    }
  }, [auctionEndTime, isActive])

  const timerColor = getTimerColor(timeRemaining, totalDuration || 60)
  const pct = totalDuration > 0 ? (timeRemaining / totalDuration) * 100 : 100
  const isCritical = timeRemaining <= 10 && timeRemaining > 0
  const isFinal = timeRemaining <= 5 && timeRemaining > 0

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isActive) {
    return (
      <div className={cn('flex items-center justify-center py-3 text-gray-500', className)}>
        <Clock className="h-4 w-4 mr-2" />
        <span className="text-sm">No active auction</span>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {/* Circular-style timer display */}
      <div className="flex flex-col items-center gap-3">
        {/* Timer circle */}
        <div className="relative w-32 h-32 md:w-40 md:h-40">
          {/* Background ring */}
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-gray-800"
            />
            {/* Progress ring */}
            <motion.circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={timerColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44}`}
              animate={{
                strokeDashoffset: `${2 * Math.PI * 44 * (1 - pct / 100)}`,
              }}
              transition={{ duration: 1, ease: 'linear' }}
            />
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="text-3xl md:text-4xl font-mono font-black"
              style={{ color: timerColor }}
              animate={
                isCritical && !reducedMotion
                  ? { scale: [1, 1.08, 1] }
                  : { scale: 1 }
              }
              transition={
                isCritical ? { duration: 0.5, repeat: Infinity } : {}
              }
            >
              {formatTime(timeRemaining)}
            </motion.span>
            {!hasExpired && (
              <span className="text-xs text-gray-500 mt-0.5">remaining</span>
            )}
          </div>
        </div>

        {/* "Going once / Going twice" text */}
        <AnimatePresence mode="wait">
          {isFinal && (
            <motion.div
              key={timeRemaining <= 2 ? 'twice' : 'once'}
              className="text-center"
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-xl md:text-2xl font-black text-red-400">
                {timeRemaining <= 2 ? 'Going twice...' : 'Going once...'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expired state */}
        <AnimatePresence>
          {hasExpired && (
            <motion.div
              className="text-center"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <span className="text-2xl md:text-3xl font-black text-amber-400">
                SOLD!
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Host controls */}
        {isHost && onExtendTime && !hasExpired && (
          <div className="flex gap-1.5 pt-2">
            <span className="text-xs text-gray-500 self-center mr-1">Host:</span>
            {[15, 30, 60].map((sec) => (
              <Button
                key={sec}
                variant="outline"
                size="sm"
                onClick={() => onExtendTime(sec)}
                className="text-xs h-7 border-gray-700 bg-gray-900 text-gray-400 hover:text-white"
              >
                +{sec}s
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
