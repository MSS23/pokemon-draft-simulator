'use client'

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { realtimeManager, type RealtimeManagerState } from '@/lib/realtime-manager'
import { requestDeduplicator } from '@/lib/request-deduplicator'

export interface UseRealtimeSubscriptionOptions {
  draftId: string
  onUpdate: (payload: any) => void
  enabled?: boolean
}

/**
 * Hook for subscribing to draft real-time updates
 *
 * Features:
 * - Automatic subscription cleanup
 * - Connection state monitoring
 * - Prevents duplicate subscriptions
 * - Handles reconnection automatically
 */
export function useRealtimeSubscription({
  draftId,
  onUpdate,
  enabled = true
}: UseRealtimeSubscriptionOptions) {
  const [connectionState, setConnectionState] = useState<RealtimeManagerState>(
    realtimeManager.getState()
  )

  const isMountedRef = useRef(true)
  const onUpdateRef = useRef(onUpdate)
  const unsubscribeRef = useRef<(() => void)[]>([])

  // Keep callback ref up to date
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribe = realtimeManager.subscribe((state) => {
      if (isMountedRef.current) {
        setConnectionState(state)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Subscribe to draft updates
  useEffect(() => {
    if (!enabled || !draftId) {
      return
    }

    // Track subscriptions immediately to prevent memory leaks
    const pendingUnsubscribes: (() => void)[] = []

    const setupSubscriptions = async () => {
      try {
        console.log(`[useRealtimeSubscription] Setting up subscriptions for draft ${draftId}`)

        // Subscribe to drafts table
        const unsubDrafts = await realtimeManager.subscribeToTable(
          `draft-${draftId}`,
          {
            event: '*',
            schema: 'public',
            table: 'drafts',
            filter: `id=eq.${draftId}`
          },
          (payload) => {
            if (isMountedRef.current) {
              console.log('[useRealtimeSubscription] Draft update:', payload.eventType)
              onUpdateRef.current(payload)
            }
          }
        )
        // Track immediately to prevent leak if component unmounts during setup
        pendingUnsubscribes.push(unsubDrafts)
        if (isMountedRef.current) unsubscribeRef.current.push(unsubDrafts)

        // Subscribe to teams table
        const unsubTeams = await realtimeManager.subscribeToTable(
          `teams-${draftId}`,
          {
            event: '*',
            schema: 'public',
            table: 'teams',
            filter: `draft_id=eq.${draftId}`
          },
          (payload) => {
            if (isMountedRef.current) {
              console.log('[useRealtimeSubscription] Teams update:', payload.eventType)
              onUpdateRef.current(payload)
            }
          }
        )
        pendingUnsubscribes.push(unsubTeams)
        if (isMountedRef.current) unsubscribeRef.current.push(unsubTeams)

        // Subscribe to picks table
        const unsubPicks = await realtimeManager.subscribeToTable(
          `picks-${draftId}`,
          {
            event: '*',
            schema: 'public',
            table: 'picks',
            filter: `draft_id=eq.${draftId}`
          },
          (payload) => {
            if (isMountedRef.current) {
              console.log('[useRealtimeSubscription] Picks update:', payload.eventType)
              onUpdateRef.current(payload)
            }
          }
        )
        pendingUnsubscribes.push(unsubPicks)
        if (isMountedRef.current) unsubscribeRef.current.push(unsubPicks)

        // Subscribe to participants table
        const unsubParticipants = await realtimeManager.subscribeToTable(
          `participants-${draftId}`,
          {
            event: '*',
            schema: 'public',
            table: 'participants',
            filter: `draft_id=eq.${draftId}`
          },
          (payload) => {
            if (isMountedRef.current) {
              console.log('[useRealtimeSubscription] Participants update:', payload.eventType)
              onUpdateRef.current(payload)
            }
          }
        )
        pendingUnsubscribes.push(unsubParticipants)
        if (isMountedRef.current) unsubscribeRef.current.push(unsubParticipants)

        // Subscribe to auctions table
        const unsubAuctions = await realtimeManager.subscribeToTable(
          `auctions-${draftId}`,
          {
            event: '*',
            schema: 'public',
            table: 'auctions',
            filter: `draft_id=eq.${draftId}`
          },
          (payload) => {
            if (isMountedRef.current) {
              console.log('[useRealtimeSubscription] Auctions update:', payload.eventType)
              onUpdateRef.current(payload)
            }
          }
        )
        pendingUnsubscribes.push(unsubAuctions)
        if (isMountedRef.current) unsubscribeRef.current.push(unsubAuctions)

        console.log(`[useRealtimeSubscription] Subscriptions set up successfully for draft ${draftId}`)

      } catch (error) {
        console.error('[useRealtimeSubscription] Error setting up subscriptions:', error)
        // Clean up any subscriptions that were created before the error
        pendingUnsubscribes.forEach(unsub => unsub())
      }
    }

    setupSubscriptions()

    return () => {
      isMountedRef.current = false

      // Clean up all subscriptions (both from ref and pending array)
      console.log(`[useRealtimeSubscription] Cleaning up subscriptions for draft ${draftId}`)

      // Clean up completed subscriptions
      if (unsubscribeRef.current.length > 0) {
        unsubscribeRef.current.forEach(unsub => unsub())
        unsubscribeRef.current = []
      }

      // Clean up any pending subscriptions that weren't added to ref yet
      pendingUnsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') unsub()
      })
    }
  }, [draftId, enabled])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const refetchData = useCallback(async () => {
    // Invalidate cache for this draft
    requestDeduplicator.invalidate(new RegExp(`draft-${draftId}`))

    // Trigger a manual refetch by calling the update callback
    onUpdateRef.current({ eventType: 'REFETCH' })
  }, [draftId])

  return {
    connectionState,
    isConnected: connectionState.status === 'connected',
    isReconnecting: connectionState.status === 'connecting',
    hasError: connectionState.status === 'error',
    refetchData
  }
}

/**
 * Hook for presence (who's online)
 */
export function usePresence(draftId: string, userId: string, metadata?: Record<string, any>) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const isMountedRef = useRef(true)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Stabilize metadata object to prevent infinite loops
  // Use a ref to track the serialized metadata and only update when it actually changes
  const metadataRef = useRef<string>('')
  const stableMetadata = useMemo(() => {
    const serialized = JSON.stringify(metadata)
    if (serialized !== metadataRef.current) {
      metadataRef.current = serialized
      return metadata
    }
    return metadata
  }, [metadata])

  useEffect(() => {
    if (!draftId || !userId) {
      return
    }

    const setupPresence = async () => {
      try {
        const { unsubscribe, getOnlineUsers } = await realtimeManager.subscribeToPresence(
          draftId,
          userId,
          stableMetadata
        )

        if (isMountedRef.current) {
          unsubscribeRef.current = unsubscribe

          // Update online users every second
          const interval = setInterval(() => {
            if (isMountedRef.current) {
              const users = getOnlineUsers()
              setOnlineUsers(users)
            }
          }, 1000)

          // Cleanup interval
          return () => {
            clearInterval(interval)
          }
        }

      } catch (error) {
        console.error('[usePresence] Error setting up presence:', error)
      }
    }

    setupPresence()

    return () => {
      isMountedRef.current = false

      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [draftId, userId, stableMetadata])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  return {
    onlineUsers,
    onlineCount: onlineUsers.length
  }
}
