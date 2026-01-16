/**
 * useDraftRealtime Hook
 *
 * React hook for managing draft real-time subscriptions.
 * Provides connection status, online users, and draft event handling.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  DraftRealtimeManager,
  createDraftRealtimeManager,
  ConnectionStatus,
  DraftEvent,
  PresenceState
} from '@/lib/draft-realtime'
import { DraftService } from '@/lib/draft-service'

// Simple debounce implementation
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

// ============================================
// Types
// ============================================

export interface DraftRealtimeState {
  connectionStatus: ConnectionStatus
  onlineUsers: Set<string>
  lastEvent: DraftEvent | null
  error: Error | null
}

export interface UseDraftRealtimeOptions {
  /** Enable/disable the subscription */
  enabled?: boolean
  /** Debounce time for state refresh (ms) */
  refreshDebounce?: number
  /** Callback when draft state should be refreshed */
  onRefreshNeeded?: () => void
  /** Callback when a pick event is received */
  onPickEvent?: (event: DraftEvent) => void
  /** Callback when a turn change is detected */
  onTurnChange?: (newTurn: number) => void
  /** Callback when draft status changes */
  onStatusChange?: (newStatus: string) => void
  /** Callback when draft is deleted */
  onDraftDeleted?: () => void
  /** Callback for any error */
  onError?: (error: Error) => void
}

export interface UseDraftRealtimeReturn extends DraftRealtimeState {
  /** Force refresh of draft state */
  refresh: () => Promise<void>
  /** Manually reconnect */
  reconnect: () => Promise<void>
  /** Check if a user is online */
  isUserOnline: (userId: string) => boolean
}

// ============================================
// Hook Implementation
// ============================================

export function useDraftRealtime(
  draftId: string | null,
  userId: string | null,
  options: UseDraftRealtimeOptions = {}
): UseDraftRealtimeReturn {
  const {
    enabled = true,
    refreshDebounce = 300,
    onRefreshNeeded,
    onPickEvent,
    onTurnChange,
    onStatusChange,
    onDraftDeleted,
    onError
  } = options

  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'disconnected'
  })
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [lastEvent, setLastEvent] = useState<DraftEvent | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Refs
  const managerRef = useRef<DraftRealtimeManager | null>(null)
  const lastTurnRef = useRef<number | null>(null)
  const lastStatusRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  // Debounced refresh callback
  const debouncedRefresh = useMemo(
    () =>
      debounce(() => {
        if (isMountedRef.current) {
          onRefreshNeeded?.()
        }
      }, refreshDebounce),
    [onRefreshNeeded, refreshDebounce]
  )

  // Handle draft events
  const handleDraftEvent = useCallback(
    (event: DraftEvent) => {
      if (!isMountedRef.current) return

      setLastEvent(event)

      // Handle draft deletion
      if (event.table === 'drafts' && event.eventType === 'DELETE') {
        onDraftDeleted?.()
        return
      }

      // Handle pick events - notify immediately
      if (event.table === 'picks' && event.eventType === 'INSERT') {
        onPickEvent?.(event)
      }

      // Handle turn changes - process immediately
      if (event.table === 'drafts' && event.eventType === 'UPDATE') {
        const newTurn = event.data.current_turn as number | undefined
        const newStatus = event.data.status as string | undefined

        // Detect turn change
        if (newTurn !== undefined && newTurn !== lastTurnRef.current) {
          lastTurnRef.current = newTurn
          onTurnChange?.(newTurn)
        }

        // Detect status change
        if (newStatus !== undefined && newStatus !== lastStatusRef.current) {
          lastStatusRef.current = newStatus
          onStatusChange?.(newStatus)
        }
      }

      // Request a debounced refresh for all events
      debouncedRefresh()
    },
    [onPickEvent, onTurnChange, onStatusChange, onDraftDeleted, debouncedRefresh]
  )

  // Handle connection status changes
  const handleConnectionChange = useCallback((status: ConnectionStatus) => {
    if (!isMountedRef.current) return
    setConnectionStatus(status)
  }, [])

  // Handle presence changes
  const handlePresenceChange = useCallback((presence: PresenceState) => {
    if (!isMountedRef.current) return
    setOnlineUsers(new Set(presence.onlineUsers))
  }, [])

  // Handle errors
  const handleError = useCallback(
    (err: Error) => {
      if (!isMountedRef.current) return
      setError(err)
      onError?.(err)
    },
    [onError]
  )

  // Setup subscription
  useEffect(() => {
    isMountedRef.current = true

    if (!enabled || !draftId || !userId) {
      setConnectionStatus({ status: 'disconnected' })
      return
    }

    // Clean up any existing manager
    if (managerRef.current) {
      managerRef.current.cleanup()
      managerRef.current = null
    }

    // Create new manager
    const manager = createDraftRealtimeManager(draftId, userId, {
      onDraftEvent: handleDraftEvent,
      onConnectionChange: handleConnectionChange,
      onPresenceChange: handlePresenceChange,
      onError: handleError
    })

    managerRef.current = manager

    // Start subscription
    manager.subscribe().catch((err) => {
      console.error('[useDraftRealtime] Subscription error:', err)
      handleError(err instanceof Error ? err : new Error(String(err)))
    })

    // Cleanup on unmount or dependency change
    return () => {
      isMountedRef.current = false
      if (managerRef.current) {
        managerRef.current.cleanup()
        managerRef.current = null
      }
    }
  }, [
    draftId,
    userId,
    enabled,
    handleDraftEvent,
    handleConnectionChange,
    handlePresenceChange,
    handleError
  ])

  // Manual refresh function
  const refresh = useCallback(async () => {
    onRefreshNeeded?.()
  }, [onRefreshNeeded])

  // Manual reconnect function
  const reconnect = useCallback(async () => {
    if (!managerRef.current || !draftId || !userId) return

    await managerRef.current.cleanup()

    const manager = createDraftRealtimeManager(draftId, userId, {
      onDraftEvent: handleDraftEvent,
      onConnectionChange: handleConnectionChange,
      onPresenceChange: handlePresenceChange,
      onError: handleError
    })

    managerRef.current = manager
    await manager.subscribe()
  }, [
    draftId,
    userId,
    handleDraftEvent,
    handleConnectionChange,
    handlePresenceChange,
    handleError
  ])

  // Check if user is online
  const isUserOnline = useCallback(
    (checkUserId: string) => {
      return onlineUsers.has(checkUserId)
    },
    [onlineUsers]
  )

  return {
    connectionStatus,
    onlineUsers,
    lastEvent,
    error,
    refresh,
    reconnect,
    isUserOnline
  }
}

// ============================================
// Additional Utility Hook
// ============================================

/**
 * Hook to get draft state with real-time updates
 */
export function useDraftStateWithRealtime(
  roomCode: string | null,
  userId: string | null,
  options?: UseDraftRealtimeOptions
) {
  const [draftState, setDraftState] = useState<Awaited<
    ReturnType<typeof DraftService.getDraftState>
  > | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<Error | null>(null)

  // Fetch draft state
  const fetchDraftState = useCallback(async () => {
    if (!roomCode) return

    try {
      const state = await DraftService.getDraftState(roomCode)
      setDraftState(state)
      setLoadError(null)
    } catch (err) {
      console.error('[useDraftStateWithRealtime] Error fetching state:', err)
      setLoadError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [roomCode])

  // Initial fetch
  useEffect(() => {
    fetchDraftState()
  }, [fetchDraftState])

  // Setup real-time with refresh callback
  const realtime = useDraftRealtime(draftState?.draft?.id || null, userId, {
    ...options,
    onRefreshNeeded: fetchDraftState
  })

  return {
    draftState,
    isLoading,
    loadError,
    refetchDraftState: fetchDraftState,
    ...realtime
  }
}
