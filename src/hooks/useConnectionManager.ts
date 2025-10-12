'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  connectionManager, 
  type ConnectionState, 
  type ConnectionStatus,
  type OfflineAction,
  type NetworkQuality 
} from '@/lib/connection-manager'
import { notificationService } from '@/lib/notification-service'

interface UseConnectionManagerReturn {
  connectionState: ConnectionState
  networkQuality: NetworkQuality | null
  
  // Connection status helpers
  isOnline: boolean
  isOffline: boolean
  isReconnecting: boolean
  isDegraded: boolean
  
  // Actions
  forceReconnect: () => Promise<boolean>
  queueOfflineAction: (action: Omit<OfflineAction, 'id' | 'retryCount'>) => string
  processOfflineQueue: () => Promise<void>
  clearOfflineQueue: () => void
  
  // Offline capabilities
  canReadOffline: boolean
  canWriteOffline: boolean
  offlineQueueLength: number
  
  // Network quality info
  isSlowConnection: boolean
  shouldOptimizeForBandwidth: boolean
}

export function useConnectionManager(): UseConnectionManagerReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    connectionManager.getState()
  )
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality | null>(
    connectionManager.getNetworkQuality()
  )
  
  const lastNotificationRef = useRef<string>('')

  // Subscribe to connection changes
  useEffect(() => {
    const unsubscribe = connectionManager.subscribe((state) => {
      setConnectionState(state)
      setNetworkQuality(connectionManager.getNetworkQuality())
      
      // Handle connection state notifications
      handleConnectionStateChange(state)
    })

    return unsubscribe
  }, [])

  // Handle connection state change notifications
  const handleConnectionStateChange = useCallback((state: ConnectionState) => {
    const currentStatus = state.status
    
    // Avoid duplicate notifications
    if (lastNotificationRef.current === currentStatus) return
    lastNotificationRef.current = currentStatus
    
    switch (currentStatus) {
      case 'offline':
        notificationService.notify({
          id: 'connection-offline',
          type: 'host_action',
          title: 'Connection Lost',
          message: 'You are now offline. Actions will be queued until connection is restored.',
          timestamp: new Date().toISOString(),
          urgent: true,
          sound: true,
          vibrate: true
        })
        break
        
      case 'online':
        if (state.retryCount > 0) { // Only show if recovering from offline
          notificationService.notify({
            id: 'connection-restored',
            type: 'host_action',
            title: 'Connection Restored',
            message: state.offlineCapabilities.hasCachedData 
              ? 'Back online! Processing queued actions...'
              : 'Back online!',
            timestamp: new Date().toISOString(),
            urgent: false,
            sound: true
          })
        }
        break
        
      case 'degraded':
        notificationService.notify({
          id: 'connection-degraded',
          type: 'host_action',
          title: 'Poor Connection',
          message: 'Connection quality is poor. Some features may be limited.',
          timestamp: new Date().toISOString(),
          urgent: false,
          sound: false
        })
        break
        
      case 'reconnecting':
        notificationService.notify({
          id: 'connection-reconnecting',
          type: 'host_action',
          title: 'Reconnecting...',
          message: `Attempting to reconnect (attempt ${state.retryCount})`,
          timestamp: new Date().toISOString(),
          urgent: false,
          sound: false
        })
        break
    }
  }, [])

  // Wrapped actions with error handling
  const forceReconnect = useCallback(async (): Promise<boolean> => {
    try {
      return await connectionManager.forceReconnect()
    } catch (error) {
      console.error('Force reconnect failed:', error)
      return false
    }
  }, [])

  const queueOfflineAction = useCallback((action: Omit<OfflineAction, 'id' | 'retryCount'>): string => {
    const actionId = connectionManager.queueOfflineAction(action)
    
    notificationService.notify({
      id: `offline-queued-${actionId}`,
      type: 'host_action',
      title: 'Action Queued',
      message: `${action.type} action saved for when connection is restored`,
      timestamp: new Date().toISOString(),
      urgent: false,
      sound: false
    })
    
    return actionId
  }, [])

  const processOfflineQueue = useCallback(async (): Promise<void> => {
    try {
      await connectionManager.processOfflineQueue()
    } catch (error) {
      console.error('Failed to process offline queue:', error)
      notificationService.notify({
        id: 'offline-queue-error',
        type: 'host_action',
        title: 'Sync Error',
        message: 'Some offline actions could not be processed',
        timestamp: new Date().toISOString(),
        urgent: true,
        sound: true
      })
    }
  }, [])

  const clearOfflineQueue = useCallback((): void => {
    connectionManager.clearOfflineQueue()
    
    notificationService.notify({
      id: 'offline-queue-cleared',
      type: 'host_action',
      title: 'Queue Cleared',
      message: 'All pending offline actions have been cleared',
      timestamp: new Date().toISOString(),
      urgent: false,
      sound: false
    })
  }, [])

  // Derived state
  const isOnline = connectionState.status === 'online'
  const isOffline = connectionState.status === 'offline'
  const isReconnecting = connectionState.status === 'reconnecting'
  const isDegraded = connectionState.status === 'degraded'
  
  const canReadOffline = connectionState.offlineCapabilities.canRead
  const canWriteOffline = connectionState.offlineCapabilities.canWrite
  const offlineQueueLength = connectionManager.getOfflineQueue().length
  
  const isSlowConnection = networkQuality?.effectiveType === '2g' || networkQuality?.effectiveType === 'slow-2g'
  const shouldOptimizeForBandwidth = isSlowConnection || networkQuality?.saveData || false

  return {
    connectionState,
    networkQuality,
    
    // Status helpers
    isOnline,
    isOffline,
    isReconnecting,
    isDegraded,
    
    // Actions
    forceReconnect,
    queueOfflineAction,
    processOfflineQueue,
    clearOfflineQueue,
    
    // Offline capabilities
    canReadOffline,
    canWriteOffline,
    offlineQueueLength,
    
    // Network quality
    isSlowConnection,
    shouldOptimizeForBandwidth
  }
}
