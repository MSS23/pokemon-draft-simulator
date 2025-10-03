'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Clock, Play, Pause, RotateCcw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  className
}: AuctionTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [hasExpired, setHasExpired] = useState(false)

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

    // Set total duration on first calculation
    if (totalDuration === 0 && remaining > 0) {
      setTotalDuration(remaining)
    }

    // Check if time has expired
    if (remaining === 0 && !hasExpired) {
      setHasExpired(true)
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

  // Reset expired state when new auction starts
  useEffect(() => {
    if (auctionEndTime && isActive) {
      setHasExpired(false)
      setTotalDuration(0) // Reset to recalculate
    }
  }, [auctionEndTime, isActive])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getProgressPercentage = () => {
    if (totalDuration === 0) return 0
    return ((totalDuration - timeRemaining) / totalDuration) * 100
  }

  const getTimerColor = () => {
    if (timeRemaining <= 5) return 'text-red-600'
    if (timeRemaining <= 15) return 'text-orange-600'
    if (timeRemaining <= 30) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getProgressColor = () => {
    if (timeRemaining <= 5) return 'bg-red-500'
    if (timeRemaining <= 15) return 'bg-orange-500'
    if (timeRemaining <= 30) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const handleExtendTime = (seconds: number) => {
    if (onExtendTime) {
      onExtendTime(seconds)
    }
  }

  if (!isActive) {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2 text-gray-500">
            <Clock className="h-4 w-4" />
            <span className="text-sm">No active auction</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      'w-full border-2 transition-all duration-300',
      timeRemaining <= 10 ? 'border-red-400 animate-pulse' : 'border-gray-200',
      className
    )}>
      <CardContent className="py-4 space-y-4">
        {/* Timer display */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className={cn('h-5 w-5', getTimerColor())} />
            <Badge variant={timeRemaining <= 10 ? 'destructive' : 'default'}>
              {hasExpired ? 'EXPIRED' : 'LIVE AUCTION'}
            </Badge>
          </div>

          <div className={cn(
            'text-4xl font-mono font-bold transition-colors duration-300',
            getTimerColor(),
            timeRemaining <= 5 && 'animate-pulse'
          )}>
            {formatTime(timeRemaining)}
          </div>

          {timeRemaining > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              Time remaining
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <Progress
            value={getProgressPercentage()}
            className="h-2"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Start</span>
            <span className={getTimerColor()}>
              {Math.round(getProgressPercentage())}% elapsed
            </span>
            <span>End</span>
          </div>
        </div>

        {/* Warning messages */}
        {timeRemaining <= 15 && timeRemaining > 0 && (
          <div className={cn(
            'flex items-center justify-center gap-2 p-2 rounded text-center text-sm font-medium',
            timeRemaining <= 5
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-orange-50 text-orange-700 border border-orange-200'
          )}>
            <AlertTriangle className="h-4 w-4" />
            {timeRemaining <= 5
              ? 'Final seconds! Last chance to bid!'
              : 'Auction ending soon!'}
          </div>
        )}

        {/* Host controls */}
        {isHost && onExtendTime && (
          <div className="flex flex-wrap gap-1 justify-center pt-2 border-t border-gray-200">
            <span className="text-xs text-gray-500 w-full text-center mb-1">Host Controls</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExtendTime(15)}
              className="text-xs"
            >
              +15s
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExtendTime(30)}
              className="text-xs"
            >
              +30s
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExtendTime(60)}
              className="text-xs"
            >
              +1min
            </Button>
          </div>
        )}

        {/* Expired state */}
        {hasExpired && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-center">
            <div className="text-red-700 font-semibold text-sm">
              🔨 Auction Ended
            </div>
            <div className="text-red-600 text-xs mt-1">
              Resolving final bid...
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}