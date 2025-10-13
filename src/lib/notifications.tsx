'use client'

import { toast } from 'sonner'
import { CheckCircle, XCircle, AlertTriangle, Info, Trophy, Zap, Clock } from 'lucide-react'

/**
 * Enhanced notification system with draft-specific helpers
 * Built on top of Sonner toast library
 */

export interface NotificationOptions {
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

export const notify = {
  /**
   * Success notification (green)
   */
  success: (title: string, message?: string, options?: NotificationOptions) => {
    toast.success(title, {
      description: message,
      duration: options?.duration || 3000,
      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
      action: options?.action
    })
  },

  /**
   * Error notification (red)
   */
  error: (title: string, message?: string, options?: NotificationOptions) => {
    toast.error(title, {
      description: message,
      duration: options?.duration || 5000,
      icon: <XCircle className="h-4 w-4 text-red-500" />,
      action: options?.action
    })
  },

  /**
   * Warning notification (yellow)
   */
  warning: (title: string, message?: string, options?: NotificationOptions) => {
    toast.warning(title, {
      description: message,
      duration: options?.duration || 4000,
      icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
      action: options?.action
    })
  },

  /**
   * Info notification (blue)
   */
  info: (title: string, message?: string, options?: NotificationOptions) => {
    toast.info(title, {
      description: message,
      duration: options?.duration || 3000,
      icon: <Info className="h-4 w-4 text-blue-500" />,
      action: options?.action
    })
  },

  /**
   * Promise notification - shows loading, success, and error states
   */
  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((error: any) => string)
    }
  ) => {
    return toast.promise(promise, messages)
  },

  /**
   * Custom notification with specific icon
   */
  custom: (title: string, message?: string, icon?: React.ReactNode, options?: NotificationOptions) => {
    toast(title, {
      description: message,
      icon,
      duration: options?.duration || 3000,
      action: options?.action
    })
  },

  // ==========================================
  // DRAFT-SPECIFIC NOTIFICATIONS
  // ==========================================

  /**
   * Notify user it's their turn
   */
  yourTurn: (timeRemaining?: number) => {
    const message = timeRemaining
      ? `You have ${timeRemaining} seconds to make your pick`
      : 'Time to make your pick'

    toast('Your Turn!', {
      description: message,
      duration: 5000,
      icon: <Zap className="h-5 w-5 text-yellow-500 animate-pulse" />,
      className: 'border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
    })

    // Play sound
    if (typeof window !== 'undefined' && window.Audio) {
      try {
        const audio = new Audio('/sounds/your-turn.mp3')
        audio.volume = 0.3
        audio.play().catch(() => {
          // Silently fail if audio can't play
        })
      } catch (e) {
        // Ignore audio errors
      }
    }
  },

  /**
   * Notify when a Pokemon is picked
   */
  pickMade: (pokemonName: string, teamName: string, isUserPick: boolean) => {
    if (isUserPick) {
      toast.success('Pick Confirmed!', {
        description: `You successfully drafted ${pokemonName}`,
        duration: 3000,
        icon: <Trophy className="h-4 w-4 text-yellow-500" />
      })
    } else {
      toast(`${teamName} picked`, {
        description: pokemonName,
        duration: 2000,
        icon: <CheckCircle className="h-4 w-4 text-blue-500" />
      })
    }
  },

  /**
   * Warning when time is running out
   */
  timeWarning: (seconds: number) => {
    toast.warning(`${seconds}s Remaining!`, {
      description: 'Make your pick soon',
      duration: 3000,
      icon: <Clock className="h-4 w-4 text-orange-500 animate-pulse" />
    })
  },

  /**
   * Notify when draft starts
   */
  draftStarted: (draftName: string) => {
    toast.success('Draft Started!', {
      description: `${draftName} has begun. Good luck!`,
      duration: 4000,
      icon: <Trophy className="h-5 w-5 text-yellow-500" />
    })
  },

  /**
   * Notify when draft completes
   */
  draftCompleted: () => {
    toast.success('Draft Complete!', {
      description: 'All picks have been made. View results to see final teams.',
      duration: 5000,
      icon: <Trophy className="h-5 w-5 text-yellow-500" />
    })
  },

  /**
   * Notify when auction starts
   */
  auctionStarted: (pokemonName: string, nominatedBy: string) => {
    toast('New Auction!', {
      description: `${nominatedBy} nominated ${pokemonName}`,
      duration: 4000,
      icon: <Zap className="h-4 w-4 text-purple-500" />
    })
  },

  /**
   * Notify when auction is ending soon
   */
  auctionEnding: (pokemonName: string, timeRemaining: number, currentBid: number) => {
    toast.warning('Auction Ending Soon!', {
      description: `${pokemonName} ends in ${timeRemaining}s! Current bid: $${currentBid}`,
      duration: 3000,
      icon: <Clock className="h-4 w-4 text-orange-500 animate-pulse" />,
      className: 'border-2 border-orange-500'
    })
  },

  /**
   * Notify when bid is placed
   */
  bidPlaced: (pokemonName: string, bidAmount: number, bidderName: string, isUserBid: boolean) => {
    if (isUserBid) {
      toast.success('Bid Placed!', {
        description: `You bid $${bidAmount} on ${pokemonName}`,
        duration: 2000,
        icon: <CheckCircle className="h-4 w-4 text-green-500" />
      })
    } else {
      toast('New Bid', {
        description: `${bidderName} bid $${bidAmount} on ${pokemonName}`,
        duration: 2000,
        icon: <Info className="h-4 w-4 text-blue-500" />
      })
    }
  },

  /**
   * Notify auction result
   */
  auctionResult: (pokemonName: string, winnerName: string, finalBid: number, didUserWin: boolean) => {
    if (didUserWin) {
      toast.success('Auction Won!', {
        description: `You won ${pokemonName} for $${finalBid}!`,
        duration: 5000,
        icon: <Trophy className="h-5 w-5 text-yellow-500" />,
        className: 'border-2 border-yellow-500'
      })
    } else {
      toast('Auction Ended', {
        description: `${winnerName} won ${pokemonName} for $${finalBid}`,
        duration: 3000,
        icon: <Info className="h-4 w-4 text-blue-500" />
      })
    }
  },

  /**
   * Notify when participant joins
   */
  participantJoined: (playerName: string) => {
    toast('Player Joined', {
      description: `${playerName} joined the draft`,
      duration: 2000,
      icon: <Info className="h-4 w-4 text-blue-500" />
    })
  },

  /**
   * Notify when participant leaves
   */
  participantLeft: (playerName: string) => {
    toast('Player Left', {
      description: `${playerName} left the draft`,
      duration: 2000,
      icon: <Info className="h-4 w-4 text-slate-500" />
    })
  },

  /**
   * Notify insufficient budget
   */
  insufficientBudget: (required: number, available: number) => {
    toast.error('Insufficient Budget', {
      description: `This Pokemon costs $${required}, but you only have $${available} remaining`,
      duration: 4000,
      icon: <XCircle className="h-4 w-4 text-red-500" />
    })
  },

  /**
   * Notify Pokemon already picked
   */
  alreadyPicked: (pokemonName: string) => {
    toast.error('Already Picked', {
      description: `${pokemonName} has already been drafted`,
      duration: 3000,
      icon: <XCircle className="h-4 w-4 text-red-500" />
    })
  },

  /**
   * Notify Pokemon not legal
   */
  notLegal: (pokemonName: string, reason?: string) => {
    toast.error('Not Legal', {
      description: reason || `${pokemonName} is not legal in this format`,
      duration: 4000,
      icon: <XCircle className="h-4 w-4 text-red-500" />
    })
  },

  /**
   * Notify wishlist item added
   */
  wishlistAdded: (pokemonName: string) => {
    toast.success('Added to Wishlist', {
      description: pokemonName,
      duration: 2000,
      icon: <CheckCircle className="h-4 w-4 text-green-500" />
    })
  },

  /**
   * Notify wishlist item removed
   */
  wishlistRemoved: (pokemonName: string) => {
    toast('Removed from Wishlist', {
      description: pokemonName,
      duration: 2000,
      icon: <Info className="h-4 w-4 text-slate-500" />
    })
  },

  /**
   * Notify connection lost
   */
  connectionLost: () => {
    toast.error('Connection Lost', {
      description: 'Attempting to reconnect...',
      duration: Infinity, // Stay until dismissed or connection restored
      icon: <XCircle className="h-4 w-4 text-red-500" />
    })
  },

  /**
   * Notify connection restored
   */
  connectionRestored: () => {
    toast.success('Connection Restored', {
      description: 'You are back online',
      duration: 3000,
      icon: <CheckCircle className="h-4 w-4 text-green-500" />
    })
  },

  /**
   * Notify sync error
   */
  syncError: () => {
    toast.error('Sync Error', {
      description: 'Failed to sync with server. Please refresh the page.',
      duration: 5000,
      icon: <XCircle className="h-4 w-4 text-red-500" />,
      action: {
        label: 'Refresh',
        onClick: () => window.location.reload()
      }
    })
  }
}

// Default export for convenience
export default notify
