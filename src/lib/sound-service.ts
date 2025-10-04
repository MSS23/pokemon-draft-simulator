/**
 * Sound Service
 *
 * Handles sound effects and audio feedback for draft events
 */

export type SoundEffect =
  | 'pick'
  | 'your-turn'
  | 'timer-warning'
  | 'auction-bid'
  | 'auction-won'
  | 'draft-start'
  | 'draft-complete'
  | 'notification'
  | 'error'
  | 'success'

export class SoundService {
  private static instance: SoundService
  private sounds: Map<SoundEffect, HTMLAudioElement> = new Map()
  private enabled: boolean = true
  private volume: number = 0.5

  // Web Audio API oscillator for beeps (no external files needed)
  private audioContext: AudioContext | null = null

  static getInstance(): SoundService {
    if (!SoundService.instance) {
      SoundService.instance = new SoundService()
    }
    return SoundService.instance
  }

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      this.loadSettings()
    }
  }

  /**
   * Load sound settings from localStorage
   */
  private loadSettings() {
    try {
      const enabled = localStorage.getItem('soundEnabled')
      const volume = localStorage.getItem('soundVolume')

      if (enabled !== null) {
        this.enabled = enabled === 'true'
      }
      if (volume !== null) {
        this.volume = parseFloat(volume)
      }
    } catch (error) {
      console.warn('Failed to load sound settings:', error)
    }
  }

  /**
   * Save sound settings to localStorage
   */
  private saveSettings() {
    try {
      localStorage.setItem('soundEnabled', String(this.enabled))
      localStorage.setItem('soundVolume', String(this.volume))
    } catch (error) {
      console.warn('Failed to save sound settings:', error)
    }
  }

  /**
   * Enable/disable sounds
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled
    this.saveSettings()
  }

  /**
   * Get current enabled state
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume))
    this.saveSettings()
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.volume
  }

  /**
   * Play a sound effect using Web Audio API
   */
  play(effect: SoundEffect) {
    if (!this.enabled || !this.audioContext) return

    try {
      const gainNode = this.audioContext.createGain()
      gainNode.gain.value = this.volume
      gainNode.connect(this.audioContext.destination)

      const oscillator = this.audioContext.createOscillator()
      oscillator.connect(gainNode)

      // Define sound characteristics
      switch (effect) {
        case 'pick':
          this.playPickSound(oscillator, gainNode)
          break
        case 'your-turn':
          this.playYourTurnSound(oscillator, gainNode)
          break
        case 'timer-warning':
          this.playTimerWarningSound(oscillator, gainNode)
          break
        case 'auction-bid':
          this.playAuctionBidSound(oscillator, gainNode)
          break
        case 'auction-won':
          this.playAuctionWonSound(oscillator, gainNode)
          break
        case 'draft-start':
          this.playDraftStartSound(oscillator, gainNode)
          break
        case 'draft-complete':
          this.playDraftCompleteSound(oscillator, gainNode)
          break
        case 'notification':
          this.playNotificationSound(oscillator, gainNode)
          break
        case 'success':
          this.playSuccessSound(oscillator, gainNode)
          break
        case 'error':
          this.playErrorSound(oscillator, gainNode)
          break
        default:
          this.playNotificationSound(oscillator, gainNode)
      }
    } catch (error) {
      console.warn('Failed to play sound:', error)
    }
  }

  private playPickSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523, now) // C5
    osc.frequency.exponentialRampToValueAtTime(783, now + 0.1) // G5
    gain.gain.setValueAtTime(this.volume, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
    osc.start(now)
    osc.stop(now + 0.15)
  }

  private playYourTurnSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(392, now) // G4
    osc.frequency.setValueAtTime(523, now + 0.1) // C5
    osc.frequency.setValueAtTime(659, now + 0.2) // E5
    gain.gain.setValueAtTime(this.volume, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
    osc.start(now)
    osc.stop(now + 0.3)
  }

  private playTimerWarningSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, now)
    gain.gain.setValueAtTime(this.volume * 0.8, now)
    gain.gain.setValueAtTime(0, now + 0.05)
    gain.gain.setValueAtTime(this.volume * 0.8, now + 0.1)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
    osc.start(now)
    osc.stop(now + 0.2)
  }

  private playAuctionBidSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.1)
    gain.gain.setValueAtTime(this.volume * 0.6, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
    osc.start(now)
    osc.stop(now + 0.15)
  }

  private playAuctionWonSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523, now) // C5
    osc.frequency.setValueAtTime(659, now + 0.1) // E5
    osc.frequency.setValueAtTime(783, now + 0.2) // G5
    osc.frequency.setValueAtTime(1046, now + 0.3) // C6
    gain.gain.setValueAtTime(this.volume, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5)
    osc.start(now)
    osc.stop(now + 0.5)
  }

  private playDraftStartSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(261, now) // C4
    osc.frequency.setValueAtTime(329, now + 0.15) // E4
    osc.frequency.setValueAtTime(392, now + 0.3) // G4
    osc.frequency.setValueAtTime(523, now + 0.45) // C5
    gain.gain.setValueAtTime(this.volume, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6)
    osc.start(now)
    osc.stop(now + 0.6)
  }

  private playDraftCompleteSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'sine'

    // Victory fanfare
    const notes = [523, 659, 783, 1046] // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      osc.frequency.setValueAtTime(freq, now + index * 0.15)
    })

    gain.gain.setValueAtTime(this.volume, now)
    gain.gain.setValueAtTime(this.volume, now + 0.45)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7)
    osc.start(now)
    osc.stop(now + 0.7)
  }

  private playNotificationSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, now)
    gain.gain.setValueAtTime(this.volume * 0.5, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
    osc.start(now)
    osc.stop(now + 0.1)
  }

  private playSuccessSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(659, now) // E5
    osc.frequency.setValueAtTime(783, now + 0.1) // G5
    gain.gain.setValueAtTime(this.volume * 0.7, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
    osc.start(now)
    osc.stop(now + 0.2)
  }

  private playErrorSound(osc: OscillatorNode, gain: GainNode) {
    const now = this.audioContext!.currentTime
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(200, now)
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.2)
    gain.gain.setValueAtTime(this.volume * 0.6, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
    osc.start(now)
    osc.stop(now + 0.25)
  }

  /**
   * Play haptic feedback (vibration on mobile)
   */
  vibrate(pattern: number | number[] = 50) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  }
}

// Export singleton instance
export const soundService = SoundService.getInstance()

// Convenience exports
export const {
  play: playSound,
  setEnabled: setSoundEnabled,
  isEnabled: isSoundEnabled,
  setVolume: setSoundVolume,
  getVolume: getSoundVolume,
  vibrate
} = soundService
