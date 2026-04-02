/**
 * Draft Sound Manager
 *
 * Oscillator-based sound effects for draft events using Web Audio API.
 * No external audio files needed — all sounds are synthesized in real time.
 *
 * Replaces the older sound-service.ts with richer draft-specific sounds
 * and proper lazy AudioContext creation per browser autoplay policy.
 */
import { createLogger } from '@/lib/logger'

const log = createLogger('DraftSounds')

export type SoundName =
  | 'tick'
  | 'rapid-tick'
  | 'buzzer'
  | 'pick-confirm'
  | 'your-turn'
  | 'celebration'
  | 'bid-placed'
  | 'auction-sold'

const VOLUME_KEY = 'draft-sound-volume'
const MUTED_KEY = 'draft-sound-muted'

type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle'

export class DraftSoundManager {
  private audioCtx: AudioContext | null = null
  private volume = 0.5
  private muted = false
  private prefersReducedMotion = false

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadSettings()
      this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  play(sound: SoundName): void {
    if (this.muted) return
    const ctx = this.ensureContext()
    if (!ctx) return

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        log.warn('AudioContext resume failed')
      })
    }

    const effectiveVolume = this.prefersReducedMotion
      ? this.volume * 0.5
      : this.volume

    try {
      switch (sound) {
        case 'tick':
          this.playTick(ctx, effectiveVolume)
          break
        case 'rapid-tick':
          this.playRapidTick(ctx, effectiveVolume)
          break
        case 'buzzer':
          this.playBuzzer(ctx, effectiveVolume)
          break
        case 'pick-confirm':
          this.playPickConfirm(ctx, effectiveVolume)
          break
        case 'your-turn':
          this.playYourTurn(ctx, effectiveVolume)
          break
        case 'celebration':
          this.playCelebration(ctx, effectiveVolume)
          break
        case 'bid-placed':
          this.playBidPlaced(ctx, effectiveVolume)
          break
        case 'auction-sold':
          this.playAuctionSold(ctx, effectiveVolume)
          break
      }
    } catch (error) {
      log.warn('Failed to play sound:', error)
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    this.persist(VOLUME_KEY, String(this.volume))
  }

  getVolume(): number {
    return this.volume
  }

  setMuted(m: boolean): void {
    this.muted = m
    this.persist(MUTED_KEY, String(this.muted))
  }

  isMuted(): boolean {
    return this.muted
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** Lazily create AudioContext on first user interaction. */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.audioCtx) {
      try {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        this.audioCtx = new AudioCtxClass()
      } catch {
        log.warn('Web Audio API not available')
        return null
      }
    }
    return this.audioCtx
  }

  private loadSettings(): void {
    try {
      const vol = localStorage.getItem(VOLUME_KEY)
      const mut = localStorage.getItem(MUTED_KEY)
      if (vol !== null) this.volume = parseFloat(vol)
      if (mut !== null) this.muted = mut === 'true'
    } catch {
      // localStorage unavailable — use defaults
    }
  }

  private persist(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      // localStorage unavailable
    }
  }

  // ---------------------------------------------------------------------------
  // Oscillator helpers
  // ---------------------------------------------------------------------------

  private createOsc(
    ctx: AudioContext,
    type: OscillatorType,
    vol: number,
  ): { osc: OscillatorNode; gain: GainNode; now: number } {
    const gain = ctx.createGain()
    gain.gain.value = vol
    gain.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = type
    osc.connect(gain)

    return { osc, gain, now: ctx.currentTime }
  }

  // ---------------------------------------------------------------------------
  // Sound definitions
  // ---------------------------------------------------------------------------

  /** Short click — 800 Hz, 50 ms */
  private playTick(ctx: AudioContext, vol: number): void {
    const { osc, gain, now } = this.createOsc(ctx, 'sine', vol)
    osc.frequency.setValueAtTime(800, now)
    gain.gain.setValueAtTime(vol, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
    osc.start(now)
    osc.stop(now + 0.05)
  }

  /** Faster click — 1000 Hz, 30 ms */
  private playRapidTick(ctx: AudioContext, vol: number): void {
    const { osc, gain, now } = this.createOsc(ctx, 'sine', vol)
    osc.frequency.setValueAtTime(1000, now)
    gain.gain.setValueAtTime(vol, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)
    osc.start(now)
    osc.stop(now + 0.03)
  }

  /** Low buzz — 200 Hz, 500 ms */
  private playBuzzer(ctx: AudioContext, vol: number): void {
    const { osc, gain, now } = this.createOsc(ctx, 'sawtooth', vol * 0.7)
    osc.frequency.setValueAtTime(200, now)
    gain.gain.setValueAtTime(vol * 0.7, now)
    gain.gain.linearRampToValueAtTime(vol * 0.7, now + 0.35)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc.start(now)
    osc.stop(now + 0.5)
  }

  /** Ascending tone — 400->800 Hz, 200 ms */
  private playPickConfirm(ctx: AudioContext, vol: number): void {
    const { osc, gain, now } = this.createOsc(ctx, 'sine', vol)
    osc.frequency.setValueAtTime(400, now)
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15)
    gain.gain.setValueAtTime(vol, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
    osc.start(now)
    osc.stop(now + 0.2)
  }

  /** Attention chime — 600 Hz + 800 Hz chord, 300 ms */
  private playYourTurn(ctx: AudioContext, vol: number): void {
    const halfVol = vol * 0.6

    // First tone — 600 Hz
    const { osc: osc1, gain: gain1, now } = this.createOsc(ctx, 'triangle', halfVol)
    osc1.frequency.setValueAtTime(600, now)
    gain1.gain.setValueAtTime(halfVol, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    osc1.start(now)
    osc1.stop(now + 0.3)

    // Second tone — 800 Hz (chord)
    const { osc: osc2, gain: gain2 } = this.createOsc(ctx, 'triangle', halfVol)
    osc2.frequency.setValueAtTime(800, now)
    gain2.gain.setValueAtTime(halfVol, now)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    osc2.start(now)
    osc2.stop(now + 0.3)
  }

  /** Ascending arpeggio — 400->600->800->1000 Hz, 400 ms */
  private playCelebration(ctx: AudioContext, vol: number): void {
    const notes = [400, 600, 800, 1000]
    const step = 0.1

    notes.forEach((freq, i) => {
      const { osc, gain, now } = this.createOsc(ctx, 'sine', vol * 0.7)
      const start = now + i * step
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0.001, now)
      gain.gain.linearRampToValueAtTime(vol * 0.7, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + step * 1.5)
      osc.start(start)
      osc.stop(start + step * 1.5)
    })
  }

  /** Short blip — 500 Hz, 100 ms */
  private playBidPlaced(ctx: AudioContext, vol: number): void {
    const { osc, gain, now } = this.createOsc(ctx, 'square', vol * 0.4)
    osc.frequency.setValueAtTime(500, now)
    gain.gain.setValueAtTime(vol * 0.4, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    osc.start(now)
    osc.stop(now + 0.1)
  }

  /** Descending gavel — 800->400 Hz, 300 ms */
  private playAuctionSold(ctx: AudioContext, vol: number): void {
    const { osc, gain, now } = this.createOsc(ctx, 'sine', vol)
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.2)
    gain.gain.setValueAtTime(vol, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    osc.start(now)
    osc.stop(now + 0.3)
  }
}

/** Singleton instance for use across the app. */
export const draftSounds = new DraftSoundManager()
