import { useEffect, useRef, useState } from 'react'
import { useNotify } from '@/components/providers/NotificationProvider'

interface TurnNotificationOptions {
  isUserTurn: boolean
  pickTimeRemaining: number
  draftStatus: 'waiting' | 'drafting' | 'completed' | 'paused'
  enableBrowserNotifications?: boolean
  warningThreshold?: number // Seconds before auto-skip to show warning
  onAutoSkip?: () => void
}

/**
 * Hook for managing turn notifications including browser notifications and AFK warnings
 */
export function useTurnNotifications({
  isUserTurn,
  pickTimeRemaining,
  draftStatus,
  enableBrowserNotifications = true,
  warningThreshold = 10,
  onAutoSkip
}: TurnNotificationOptions) {
  const notify = useNotify()
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermission>('default')
  const hasShownWarning = useRef(false)
  const hasShownTurnNotification = useRef(false)

  // Request browser notification permission
  useEffect(() => {
    if (!enableBrowserNotifications || typeof window === 'undefined') return

    if ('Notification' in window) {
      setBrowserNotificationPermission(Notification.permission)

      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setBrowserNotificationPermission(permission)
        })
      }
    }
  }, [enableBrowserNotifications])

  // Show browser notification when it's user's turn
  useEffect(() => {
    if (!isUserTurn || draftStatus !== 'drafting') {
      hasShownTurnNotification.current = false
      return
    }

    // Only show once per turn
    if (hasShownTurnNotification.current) return
    hasShownTurnNotification.current = true

    // Show browser notification if tab is not focused
    if (
      enableBrowserNotifications &&
      browserNotificationPermission === 'granted' &&
      document.hidden
    ) {
      const notification = new Notification("It's Your Turn!", {
        body: 'Select a Pokémon to draft',
        icon: '/favicon.ico',
        tag: 'draft-turn',
        requireInteraction: true, // Keeps notification visible until user interacts
      })

      // Focus window when notification is clicked
      notification.onclick = () => {
        window.focus()
        notification.close()
      }

      // Auto-close after 10 seconds
      setTimeout(() => notification.close(), 10000)
    }
  }, [isUserTurn, draftStatus, enableBrowserNotifications, browserNotificationPermission])

  // Show warning when time is running out
  useEffect(() => {
    if (!isUserTurn || draftStatus !== 'drafting') {
      hasShownWarning.current = false
      return
    }

    // Show warning at threshold
    if (pickTimeRemaining === warningThreshold && !hasShownWarning.current) {
      hasShownWarning.current = true

      notify.warning(
        'Time Running Out!',
        `${warningThreshold} seconds left to make your pick`,
        { duration: 5000 }
      )

      // Show browser notification as well
      if (
        enableBrowserNotifications &&
        browserNotificationPermission === 'granted' &&
        document.hidden
      ) {
        const notification = new Notification('Time Running Out!', {
          body: `${warningThreshold} seconds left to make your pick`,
          icon: '/favicon.ico',
          tag: 'draft-warning',
          requireInteraction: false,
        })

        notification.onclick = () => {
          window.focus()
          notification.close()
        }

        setTimeout(() => notification.close(), 5000)
      }
    }

    // Reset warning flag for next turn
    if (pickTimeRemaining > warningThreshold) {
      hasShownWarning.current = false
    }
  }, [
    isUserTurn,
    pickTimeRemaining,
    draftStatus,
    warningThreshold,
    enableBrowserNotifications,
    browserNotificationPermission,
    notify
  ])

  // Handle auto-skip when time expires
  useEffect(() => {
    if (!isUserTurn || draftStatus !== 'drafting') return

    if (pickTimeRemaining === 0) {
      // Call auto-skip callback
      onAutoSkip?.()
    }
  }, [isUserTurn, pickTimeRemaining, draftStatus, onAutoSkip])

  return {
    browserNotificationPermission,
    requestBrowserNotificationPermission: async () => {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission()
        setBrowserNotificationPermission(permission)
        return permission
      }
      return 'denied'
    }
  }
}
