/**
 * Celebration Service
 *
 * Handles confetti, animations, and celebration effects for draft picks
 */

import confetti from 'canvas-confetti'

export class CelebrationService {
  private static instance: CelebrationService

  static getInstance(): CelebrationService {
    if (!CelebrationService.instance) {
      CelebrationService.instance = new CelebrationService()
    }
    return CelebrationService.instance
  }

  /**
   * Fire confetti for a successful pick
   */
  celebratePick(options?: {
    duration?: number
    particleCount?: number
    spread?: number
  }) {
    const duration = options?.duration || 3000
    const particleCount = options?.particleCount || 50
    const spread = options?.spread || 70

    const animationEnd = Date.now() + duration
    const defaults = { startVelocity: 30, spread, ticks: 60, zIndex: 9999 }

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min
    }

    const interval: NodeJS.Timeout = setInterval(() => {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        return clearInterval(interval)
      }

      const particleCount = 50 * (timeLeft / duration)

      // Fire from left
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      })

      // Fire from right
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      })
    }, 250)
  }

  /**
   * Massive celebration for draft completion
   */
  celebrateDraftComplete() {
    const duration = 5000
    const animationEnd = Date.now() + duration

    const interval: NodeJS.Timeout = setInterval(() => {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        return clearInterval(interval)
      }

      const particleCount = 100

      confetti({
        particleCount,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981']
      })

      confetti({
        particleCount,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981']
      })
    }, 200)
  }

  /**
   * Fireworks celebration
   */
  celebrateWithFireworks() {
    const duration = 3000
    const animationEnd = Date.now() + duration

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min
    }

    const interval: NodeJS.Timeout = setInterval(() => {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        return clearInterval(interval)
      }

      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#FFD700', '#FFA500', '#FF6347']
      })

      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#4169E1', '#9370DB', '#00CED1']
      })
    }, 100)
  }

  /**
   * Quick burst for your turn
   */
  celebrateYourTurn() {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#3b82f6', '#8b5cf6', '#06b6d4']
    })
  }

  /**
   * Auction win celebration
   */
  celebrateAuctionWin() {
    const count = 200
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999
    }

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio)
      })
    }

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      colors: ['#FFD700', '#FFA500']
    })

    fire(0.2, {
      spread: 60,
      colors: ['#9370DB', '#4169E1']
    })

    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      colors: ['#00CED1', '#32CD32']
    })

    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      colors: ['#FF6347', '#FF69B4']
    })

    fire(0.1, {
      spread: 120,
      startVelocity: 45,
      colors: ['#FFD700', '#FFA500', '#FF6347']
    })
  }

  /**
   * Snow/stars effect
   */
  celebrateWithStars() {
    const duration = 3000
    const animationEnd = Date.now() + duration

    const interval: NodeJS.Timeout = setInterval(() => {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        return clearInterval(interval)
      }

      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0 },
        colors: ['#FFD700', '#FFA500'],
        shapes: ['star'],
        scalar: 2
      })

      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0 },
        colors: ['#FFD700', '#FFA500'],
        shapes: ['star'],
        scalar: 2
      })
    }, 100)
  }
}

// Export singleton instance
export const celebrationService = CelebrationService.getInstance()

// Convenience exports
export const {
  celebratePick,
  celebrateDraftComplete,
  celebrateWithFireworks,
  celebrateYourTurn,
  celebrateAuctionWin,
  celebrateWithStars
} = celebrationService
