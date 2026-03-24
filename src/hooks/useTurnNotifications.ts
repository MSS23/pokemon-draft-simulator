import { useEffect, useRef, useState } from 'react'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'
import { notifyTurnToPick, notifyTimerWarning } from '@/lib/push-notifications'

const log = createLogger('UseTurnNotifications')

interface TurnNotificationOptions {
  isUserTurn: boolean
  pickTimeRemaining: number
  draftStatus: 'waiting' | 'drafting' | 'completed' | 'paused'
  enableBrowserNotifications?: boolean
  warningThreshold?: number // Seconds before auto-skip to show warning
  onAutoSkip?: () => void
  isConnected?: boolean // Only auto-skip if connected to prevent auto-skip during connection issues
  currentTurn?: number // Current turn number to detect draft start
  draftName?: string // Draft display name for push notifications
  roomCode?: string // Room code for push notifications
  timeLimit?: number // Total time limit per pick (seconds)
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
  onAutoSkip,
  isConnected = true,
  currentTurn,
  draftName = 'Pokemon Draft',
  roomCode = '',
  timeLimit
}: TurnNotificationOptions) {
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
    if (enableBrowserNotifications) {
      notifyTurnToPick({ draftName, roomCode, timeLimit })
    }
  }, [isUserTurn, draftStatus, enableBrowserNotifications, browserNotificationPermission, draftName, roomCode, timeLimit])

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
      if (enableBrowserNotifications) {
        notifyTimerWarning({ draftName, secondsLeft: warningThreshold })
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
    draftName
  ])

  // Handle auto-skip when time expires with grace period for disconnected users
  useEffect(() => {
    if (!isUserTurn || draftStatus !== 'drafting') return

    // CRITICAL: Never auto-skip turn 1 - always give players time to load
    // This prevents the race condition where the draft starts and immediately skips before anyone can act
    const isDraftStart = currentTurn === 1
    if (isDraftStart) {
      log.info('Turn 1 - auto-skip disabled to prevent race condition')
      return
    }

    // Timer has expired
    if (pickTimeRemaining === 0) {
      // If connected, skip immediately
      if (isConnected) {
        onAutoSkip?.()
        return
      }

      // If disconnected, we're at the start of grace period
      // Auto-skip will trigger when pickTimeRemaining <= -GRACE_PERIOD_SECONDS
      // This is handled below
    }

    // Handle grace period for disconnected users
    if (pickTimeRemaining < 0 && !isConnected) {
      const GRACE_PERIOD_SECONDS = 30 // 30-second grace period
      const gracePeriodExpired = pickTimeRemaining <= -GRACE_PERIOD_SECONDS

      if (gracePeriodExpired) {
        // Grace period has expired, auto-skip even though disconnected
        onAutoSkip?.()

        // Notify user that turn was skipped due to disconnect
        notify.warning(
          'Turn Skipped',
          'You were disconnected and the grace period expired',
          { duration: 6000 }
        )
      }
    }
  }, [isUserTurn, pickTimeRemaining, draftStatus, onAutoSkip, isConnected, currentTurn])

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
