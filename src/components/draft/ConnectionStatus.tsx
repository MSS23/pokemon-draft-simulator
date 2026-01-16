'use client'

import { useEffect, useState, memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wifi, WifiOff, RefreshCw, Activity, AlertCircle } from 'lucide-react'
import { realtimeManager, type RealtimeManagerState } from '@/lib/realtime-manager'
import type { ConnectionStatus as DraftConnectionStatus } from '@/lib/draft-realtime'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from '@/lib/utils'

interface ConnectionStatusProps {
  showDetails?: boolean
  compact?: boolean
}

// ============================================
// New Draft-specific Connection Status
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

// ============================================
// Original Connection Status (uses realtimeManager)
// ============================================

/**
 * Connection Status Component
 *
 * Displays real-time connection status with:
 * - Visual indicators (connected/connecting/error)
 * - Latency information
 * - Reconnection status
 * - Manual reconnect button
 * - Subscription count
 */
export function ConnectionStatus({ showDetails = true, compact = false }: ConnectionStatusProps) {
  const [state, setState] = useState<RealtimeManagerState>(realtimeManager.getState())

  useEffect(() => {
    // Subscribe to connection state changes
    const unsubscribe = realtimeManager.subscribe((newState) => {
      setState(newState)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleReconnect = async () => {
    try {
      await realtimeManager.forceReconnect()
    } catch (error) {
      console.error('Manual reconnect failed:', error)
    }
  }

  const getStatusColor = () => {
    switch (state.status) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
        return 'bg-yellow-500'
      case 'disconnected':
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = () => {
    switch (state.status) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'disconnected':
        return 'Disconnected'
      case 'error':
        return 'Connection Error'
      default:
        return 'Unknown'
    }
  }

  const getStatusIcon = () => {
    switch (state.status) {
      case 'connected':
        return <Wifi className="h-3 w-3 sm:h-4 sm:w-4" />
      case 'connecting':
        return <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
      case 'disconnected':
      case 'error':
        return <WifiOff className="h-3 w-3 sm:h-4 sm:w-4" />
      default:
        return <Activity className="h-3 w-3 sm:h-4 sm:w-4" />
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className={`h-2 w-2 rounded-full ${getStatusColor()} ${state.status === 'connected' ? 'animate-pulse' : ''}`} />
        {state.latency !== null && state.status === 'connected' && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {state.latency}ms
          </span>
        )}
      </div>
    )
  }

  if (!showDetails) {
    return (
      <Badge
        variant={state.status === 'connected' ? 'default' : state.status === 'connecting' ? 'secondary' : 'destructive'}
        className="gap-1.5 sm:gap-2 text-xs"
      >
        <div className={`h-2 w-2 rounded-full ${getStatusColor()} ${state.status === 'connected' ? 'animate-pulse' : ''}`} />
        <span className="hidden sm:inline">{getStatusText()}</span>
      </Badge>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={state.status === 'connected' ? 'outline' : 'destructive'}
          size="sm"
          className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
        >
          {getStatusIcon()}
          <span className="hidden sm:inline">{getStatusText()}</span>
          {state.latency !== null && state.status === 'connected' && (
            <span className="text-xs text-muted-foreground hidden md:inline">
              ({state.latency}ms)
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 sm:w-80 p-3 sm:p-4" align="end">
        <div className="space-y-3 sm:space-y-4">
          <div>
            <h4 className="font-semibold text-sm sm:text-base mb-2">Connection Details</h4>
            <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status:</span>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
                  <span className="font-medium">{getStatusText()}</span>
                </div>
              </div>

              {state.latency !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Latency:</span>
                  <span className="font-medium">{state.latency}ms</span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Active Subscriptions:</span>
                <span className="font-medium">{state.subscriptionCount}</span>
              </div>

              {state.reconnectAttempts > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Reconnect Attempts:</span>
                  <span className="font-medium">{state.reconnectAttempts}</span>
                </div>
              )}

              {state.lastError && (
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                  <p className="text-xs text-red-900 dark:text-red-100 font-medium mb-1">Last Error:</p>
                  <p className="text-xs text-red-700 dark:text-red-300">{state.lastError.message}</p>
                </div>
              )}
            </div>
          </div>

          {(state.status === 'disconnected' || state.status === 'error') && (
            <Button
              onClick={handleReconnect}
              className="w-full text-xs sm:text-sm"
              size="sm"
            >
              <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
              Reconnect
            </Button>
          )}

          <div className="pt-2 border-t text-xs text-muted-foreground">
            <p>Real-time updates are monitored continuously.</p>
            {state.status === 'connected' && (
              <p className="mt-1">Connection is healthy and stable.</p>
            )}
            {state.status === 'connecting' && (
              <p className="mt-1">Attempting to establish connection...</p>
            )}
            {(state.status === 'disconnected' || state.status === 'error') && (
              <p className="mt-1 text-red-600 dark:text-red-400">
                Connection lost. Automatic reconnection in progress.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
