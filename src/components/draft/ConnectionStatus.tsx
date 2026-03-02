'use client'

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react'
import type { ConnectionStatus as DraftConnectionStatus } from '@/lib/draft-realtime'
import { cn } from '@/lib/utils'

// ============================================
// Draft-specific Connection Status
// ============================================

interface DraftConnectionStatusProps {
  status: DraftConnectionStatus
  className?: string
  showLabel?: boolean
  onReconnect?: () => void
}

/**
 * Connection status indicator for draft real-time connection.
 * Shows live/reconnecting/disconnected state with appropriate styling.
 * Works with the new DraftRealtimeManager.
 */
export const DraftConnectionStatusBadge = memo<DraftConnectionStatusProps>(
  function DraftConnectionStatusBadge({ status, className, showLabel = true, onReconnect }) {
    if (status.status === 'connected') {
      return (
        <Badge
          variant="outline"
          className={cn(
            'gap-1.5 bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400',
            className
          )}
        >
          <Wifi className="h-3 w-3" />
          {showLabel && 'Live'}
        </Badge>
      )
    }

    if (status.status === 'connecting') {
      return (
        <Badge
          variant="outline"
          className={cn(
            'gap-1.5 bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400',
            className
          )}
        >
          <RefreshCw className="h-3 w-3 animate-spin" />
          {showLabel && 'Connecting...'}
        </Badge>
      )
    }

    if (status.status === 'reconnecting') {
      return (
        <Badge
          variant="outline"
          className={cn(
            'gap-1.5 bg-yellow-500/10 text-yellow-600 border-yellow-500/30 dark:text-yellow-400',
            className
          )}
        >
          <RefreshCw className="h-3 w-3 animate-spin" />
          {showLabel && `Reconnecting (${status.attempt})`}
        </Badge>
      )
    }

    if (status.status === 'failed') {
      return (
        <Badge
          variant="outline"
          className={cn(
            'gap-1.5 bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400 cursor-pointer',
            className
          )}
          onClick={onReconnect}
          title="Click to reconnect"
        >
          <AlertCircle className="h-3 w-3" />
          {showLabel && 'Connection Failed'}
        </Badge>
      )
    }

    // disconnected
    return (
      <Badge
        variant="outline"
        className={cn(
          'gap-1.5 bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400',
          className
        )}
      >
        <WifiOff className="h-3 w-3" />
        {showLabel && 'Offline'}
      </Badge>
    )
  }
)

/**
 * Compact connection indicator (just a colored dot)
 */
export const ConnectionIndicator = memo<{ status: DraftConnectionStatus; className?: string }>(
  function ConnectionIndicator({ status, className }) {
    if (status.status === 'connected') {
      return (
        <div
          className={cn('h-2 w-2 rounded-full bg-green-500', className)}
          title="Connected"
        />
      )
    }

    if (status.status === 'connecting' || status.status === 'reconnecting') {
      return (
        <div
          className={cn('h-2 w-2 rounded-full bg-yellow-500 animate-pulse', className)}
          title={status.status === 'reconnecting' ? `Reconnecting (attempt ${status.attempt})` : 'Connecting...'}
        />
      )
    }

    if (status.status === 'failed') {
      return (
        <div
          className={cn('h-2 w-2 rounded-full bg-red-500', className)}
          title="Connection failed"
        />
      )
    }

    return (
      <div
        className={cn('h-2 w-2 rounded-full bg-gray-400', className)}
        title="Disconnected"
      />
    )
  }
)

