import { useEffect, useState, useCallback, useRef } from 'react'
import { useNotify } from '@/components/providers/NotificationProvider'

interface ReconnectionOptions {
  onReconnect?: () => void | Promise<void>
  onConnectionLost?: () => void
  maxRetries?: number
  initialRetryDelay?: number // milliseconds
  maxRetryDelay?: number // milliseconds
  enabled?: boolean
}

interface ConnectionState {
  isConnected: boolean
  isReconnecting: boolean
  retryCount: number
  nextRetryIn: number | null
}

/**
 * Hook for managing connection state and automatic reconnection with exponential backoff
 */
export function useReconnection({
  onReconnect,
  onConnectionLost,
  maxRetries = 5,
  initialRetryDelay = 1000,
  maxRetryDelay = 30000,
  enabled = true
}: ReconnectionOptions = {}) {
  const notify = useNotify()
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: true,
    isReconnecting: false,
    retryCount: 0,
    nextRetryIn: null
  })

  const retryTimeoutRef = useRef<NodeJS.Timeout>()
  const countdownIntervalRef = useRef<NodeJS.Timeout>()
  const hasShownDisconnectNotification = useRef(false)

  // Calculate exponential backoff delay
  const getRetryDelay = useCallback((retryCount: number): number => {
    const delay = initialRetryDelay * Math.pow(2, retryCount)
    return Math.min(delay, maxRetryDelay)
  }, [initialRetryDelay, maxRetryDelay])

  // Attempt to reconnect
  const attemptReconnection = useCallback(async () => {
    if (!enabled || connectionState.isConnected) return

    const currentRetry = connectionState.retryCount

    if (currentRetry >= maxRetries) {
      setConnectionState(prev => ({
        ...prev,
        isReconnecting: false
      }))
      notify.error(
        'Connection Failed',
        'Unable to reconnect. Please refresh the page.',
        { duration: 0 } // Persistent notification
      )
      return
    }

    setConnectionState(prev => ({
      ...prev,
      isReconnecting: true,
      retryCount: currentRetry + 1
    }))

    try {
      // Call reconnection callback
      await onReconnect?.()

      // Success - reset state
      setConnectionState({
        isConnected: true,
        isReconnecting: false,
        retryCount: 0,
        nextRetryIn: null
      })

      hasShownDisconnectNotification.current = false

      notify.success(
        'Reconnected!',
        'Connection has been restored',
        { duration: 3000 }
      )
    } catch (error) {
      console.error('Reconnection attempt failed:', error)

      // Schedule next retry with exponential backoff
      const delay = getRetryDelay(currentRetry + 1)
      setConnectionState(prev => ({
        ...prev,
        isReconnecting: false,
        nextRetryIn: delay
      }))

      // Start countdown
      let remaining = delay
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1000
        setConnectionState(prev => ({
          ...prev,
          nextRetryIn: Math.max(0, remaining)
        }))
      }, 1000)

      // Schedule next attempt
      retryTimeoutRef.current = setTimeout(() => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
        }
        attemptReconnection()
      }, delay)
    }
  }, [
    enabled,
    connectionState.isConnected,
    connectionState.retryCount,
    maxRetries,
    getRetryDelay,
    onReconnect,
    notify
  ])

  // Manually trigger connection loss
  const markAsDisconnected = useCallback(() => {
    if (!connectionState.isConnected) return

    setConnectionState({
      isConnected: false,
      isReconnecting: false,
      retryCount: 0,
      nextRetryIn: null
    })

    onConnectionLost?.()

    if (!hasShownDisconnectNotification.current) {
      hasShownDisconnectNotification.current = true
      notify.warning(
        'Connection Lost',
        'Attempting to reconnect...',
        { duration: 5000 }
      )
    }

    // Start reconnection attempts
    const initialDelay = getRetryDelay(0)
    setConnectionState(prev => ({
      ...prev,
      nextRetryIn: initialDelay
    }))

    retryTimeoutRef.current = setTimeout(() => {
      attemptReconnection()
    }, initialDelay)
  }, [connectionState.isConnected, onConnectionLost, notify, getRetryDelay, attemptReconnection])

  // Manually trigger successful connection
  const markAsConnected = useCallback(() => {
    setConnectionState({
      isConnected: true,
      isReconnecting: false,
      retryCount: 0,
      nextRetryIn: null
    })

    // Clear any pending retry attempts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }

    hasShownDisconnectNotification.current = false
  }, [])

  // Monitor online/offline events
  useEffect(() => {
    if (!enabled) return

    const handleOnline = () => {
      if (!connectionState.isConnected) {
        notify.info('Network Back Online', 'Reconnecting...', { duration: 2000 })
        attemptReconnection()
      }
    }

    const handleOffline = () => {
      markAsDisconnected()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [enabled, connectionState.isConnected, attemptReconnection, markAsDisconnected, notify])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
    }
  }, [])

  return {
    ...connectionState,
    markAsDisconnected,
    markAsConnected,
    retryNow: attemptReconnection
  }
}
