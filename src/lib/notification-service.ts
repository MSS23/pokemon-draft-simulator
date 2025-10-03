'use client'

import { toast } from 'sonner'

export type NotificationType =
  | 'turn_reminder'
  | 'draft_started'
  | 'draft_ended'
  | 'pokemon_picked'
  | 'auction_started'
  | 'auction_ending'
  | 'bid_placed'
  | 'auction_won'
  | 'auction_lost'
  | 'participant_joined'
  | 'participant_left'
  | 'chat_message'
  | 'host_action'

export interface NotificationPermission {
  granted: boolean
  supported: boolean
  requested: boolean
}

export interface DraftNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  data?: any
  timestamp: string
  urgent: boolean
  sound?: boolean
  vibrate?: boolean
}

class NotificationService {
  private static instance: NotificationService
  private permission: NotificationPermission = {
    granted: false,
    supported: false,
    requested: false
  }
  private queue: DraftNotification[] = []
  private isVisible = true
  private soundEnabled = true
  private vibrationEnabled = true

  constructor() {
    this.initializeService()
    this.setupVisibilityTracking()
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  private initializeService() {
    // Check if running in browser
    if (typeof window === 'undefined') return

    // Check notification support
    this.permission.supported = 'Notification' in window

    if (this.permission.supported) {
      this.permission.granted = Notification.permission === 'granted'
      this.permission.requested = Notification.permission !== 'default'
    }
  }

  private setupVisibilityTracking() {
    if (typeof document === 'undefined') return

    // Track page visibility for conditional notifications
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden
    })

    // Track focus for conditional notifications
    window.addEventListener('focus', () => {
      this.isVisible = true
    })

    window.addEventListener('blur', () => {
      this.isVisible = false
    })
  }

  async requestPermission(): Promise<boolean> {
    if (!this.permission.supported) {
      console.warn('Push notifications not supported')
      return false
    }

    if (this.permission.granted) {
      return true
    }

    try {
      const permission = await Notification.requestPermission()
      this.permission.granted = permission === 'granted'
      this.permission.requested = true

      if (this.permission.granted) {
        this.showToast('Notifications enabled!', 'You\'ll receive draft updates even when the tab is in the background')
      } else {
        this.showToast('Notifications disabled', 'You can enable them later in browser settings')
      }

      return this.permission.granted
    } catch (error) {
      console.error('Error requesting notification permission:', error)
      return false
    }
  }

  getPermissionStatus(): NotificationPermission {
    return { ...this.permission }
  }

  setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled
  }

  setVibrationEnabled(enabled: boolean) {
    this.vibrationEnabled = enabled
  }

  private showToast(title: string, message?: string, urgent = false) {
    if (urgent) {
      toast.error(title, { description: message })
    } else {
      toast.info(title, { description: message })
    }
  }

  private showNativeNotification(notification: DraftNotification) {
    if (!this.permission.granted || this.isVisible) return

    try {
      const nativeNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/pokemon-icon.png',
        badge: '/pokemon-badge.png',
        tag: `draft-${notification.type}`,
        requireInteraction: notification.urgent,
        data: notification.data
      })

      // Auto-close non-urgent notifications
      if (!notification.urgent) {
        setTimeout(() => {
          nativeNotification.close()
        }, 5000)
      }

      // Handle notification click
      nativeNotification.onclick = () => {
        window.focus()
        nativeNotification.close()

        // Handle specific notification actions
        this.handleNotificationClick(notification)
      }

    } catch (error) {
      console.error('Error showing native notification:', error)
    }
  }

  private handleNotificationClick(notification: DraftNotification) {
    switch (notification.type) {
      case 'turn_reminder':
        // Focus on Pokemon grid or selection area
        document.getElementById('pokemon-grid')?.scrollIntoView({ behavior: 'smooth' })
        break
      case 'auction_ending':
        // Focus on auction area
        document.getElementById('auction-area')?.scrollIntoView({ behavior: 'smooth' })
        break
      case 'chat_message':
        // Open/focus chat
        const chatToggle = document.querySelector('[data-chat-toggle]') as HTMLButtonElement
        chatToggle?.click()
        break
    }
  }

  private playNotificationSound(type: NotificationType, urgent: boolean) {
    if (!this.soundEnabled) return

    try {
      // Create audio context for notification sounds
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      if (urgent) {
        // Urgent sound (higher pitch, multiple beeps)
        this.playTone(audioContext, 800, 200)
        setTimeout(() => this.playTone(audioContext, 800, 200), 300)
      } else {
        // Normal notification sound
        this.playTone(audioContext, 600, 150)
      }
    } catch (error) {
      console.warn('Could not play notification sound:', error)
    }
  }

  private playTone(audioContext: AudioContext, frequency: number, duration: number) {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + duration / 1000)
  }

  private triggerVibration(pattern: number[]) {
    if (!this.vibrationEnabled || !navigator.vibrate) return

    try {
      navigator.vibrate(pattern)
    } catch (error) {
      console.warn('Vibration not supported:', error)
    }
  }

  notify(notification: DraftNotification) {
    // Add to queue for history
    this.queue.push(notification)

    // Keep only last 50 notifications
    if (this.queue.length > 50) {
      this.queue = this.queue.slice(-50)
    }

    // Always show toast notification
    this.showToast(notification.title, notification.message, notification.urgent)

    // Show native notification if page not visible
    if (!this.isVisible) {
      this.showNativeNotification(notification)
    }

    // Play sound if enabled
    if (notification.sound !== false) {
      this.playNotificationSound(notification.type, notification.urgent)
    }

    // Trigger vibration for urgent notifications
    if (notification.urgent && notification.vibrate !== false) {
      this.triggerVibration([200, 100, 200])
    }
  }

  // Convenience methods for common draft notifications
  notifyTurnReminder(playerName: string, timeRemaining: number) {
    this.notify({
      id: `turn-${Date.now()}`,
      type: 'turn_reminder',
      title: "It's Your Turn!",
      message: `Select a Pokémon to draft. ${timeRemaining}s remaining.`,
      timestamp: new Date().toISOString(),
      urgent: true,
      sound: true,
      vibrate: true
    })
  }

  notifyDraftStarted(draftName: string) {
    this.notify({
      id: `draft-start-${Date.now()}`,
      type: 'draft_started',
      title: 'Draft Started!',
      message: `${draftName} has begun. Good luck!`,
      timestamp: new Date().toISOString(),
      urgent: false,
      sound: true
    })
  }

  notifyPokemonPicked(playerName: string, pokemonName: string, isUserPick: boolean) {
    this.notify({
      id: `pick-${Date.now()}`,
      type: 'pokemon_picked',
      title: isUserPick ? 'Pick Confirmed!' : 'Pokémon Drafted',
      message: isUserPick
        ? `You successfully drafted ${pokemonName}!`
        : `${playerName} drafted ${pokemonName}`,
      timestamp: new Date().toISOString(),
      urgent: false,
      sound: !isUserPick
    })
  }

  notifyAuctionStarted(pokemonName: string, nominatedBy: string) {
    this.notify({
      id: `auction-start-${Date.now()}`,
      type: 'auction_started',
      title: 'New Auction!',
      message: `${nominatedBy} nominated ${pokemonName} for auction`,
      timestamp: new Date().toISOString(),
      urgent: false,
      sound: true
    })
  }

  notifyAuctionEnding(pokemonName: string, timeRemaining: number, currentBid: number) {
    this.notify({
      id: `auction-ending-${Date.now()}`,
      type: 'auction_ending',
      title: 'Auction Ending Soon!',
      message: `${pokemonName} auction ends in ${timeRemaining}s! Current bid: $${currentBid}`,
      timestamp: new Date().toISOString(),
      urgent: true,
      sound: true,
      vibrate: true
    })
  }

  notifyBidPlaced(pokemonName: string, bidAmount: number, bidderName: string, isUserBid: boolean) {
    this.notify({
      id: `bid-${Date.now()}`,
      type: 'bid_placed',
      title: isUserBid ? 'Bid Placed!' : 'New Bid',
      message: isUserBid
        ? `You bid $${bidAmount} on ${pokemonName}`
        : `${bidderName} bid $${bidAmount} on ${pokemonName}`,
      timestamp: new Date().toISOString(),
      urgent: false,
      sound: !isUserBid
    })
  }

  notifyAuctionResult(pokemonName: string, winnerName: string, finalBid: number, didUserWin: boolean) {
    this.notify({
      id: `auction-result-${Date.now()}`,
      type: didUserWin ? 'auction_won' : 'auction_lost',
      title: didUserWin ? 'Auction Won!' : 'Auction Ended',
      message: didUserWin
        ? `You won ${pokemonName} for $${finalBid}!`
        : `${winnerName} won ${pokemonName} for $${finalBid}`,
      timestamp: new Date().toISOString(),
      urgent: didUserWin,
      sound: true,
      vibrate: didUserWin
    })
  }

  notifyParticipantJoined(playerName: string) {
    this.notify({
      id: `join-${Date.now()}`,
      type: 'participant_joined',
      title: 'Player Joined',
      message: `${playerName} joined the draft`,
      timestamp: new Date().toISOString(),
      urgent: false,
      sound: false
    })
  }

  notifyNewChatMessage(senderName: string, message: string, isOwnMessage: boolean) {
    if (isOwnMessage) return // Don't notify for own messages

    this.notify({
      id: `chat-${Date.now()}`,
      type: 'chat_message',
      title: `${senderName}:`,
      message: message.length > 50 ? message.slice(0, 50) + '...' : message,
      timestamp: new Date().toISOString(),
      urgent: false,
      sound: false // Chat sounds can be overwhelming
    })
  }

  getNotificationHistory(): DraftNotification[] {
    return [...this.queue].reverse() // Most recent first
  }

  clearHistory() {
    this.queue = []
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance()

// Convenience exports
export const {
  requestPermission,
  getPermissionStatus,
  setSoundEnabled,
  setVibrationEnabled,
  notify,
  notifyTurnReminder,
  notifyDraftStarted,
  notifyPokemonPicked,
  notifyAuctionStarted,
  notifyAuctionEnding,
  notifyBidPlaced,
  notifyAuctionResult,
  notifyParticipantJoined,
  notifyNewChatMessage,
  getNotificationHistory,
  clearHistory
} = notificationService