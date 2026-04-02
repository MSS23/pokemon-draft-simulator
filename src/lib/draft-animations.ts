/**
 * Draft Animation Variants
 *
 * Reusable Framer Motion variant objects and animation helpers
 * for the draft experience. All variants respect prefers-reduced-motion
 * via the REDUCED_MOTION_VARIANTS fallback and useReducedMotion hook.
 */
import { useEffect, useState } from 'react'
import type { Variants } from 'framer-motion'

// ---------------------------------------------------------------------------
// Reduced-motion hook
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the user has enabled "prefers-reduced-motion: reduce".
 * Re-evaluates on media-query change.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)

    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return reduced
}

// ---------------------------------------------------------------------------
// Reduced-motion fallback — static, no movement
// ---------------------------------------------------------------------------

export const REDUCED_MOTION_VARIANTS: Variants = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

// ---------------------------------------------------------------------------
// Pick confirmed — scale up + flash
// ---------------------------------------------------------------------------

export const pickConfirmVariants: Variants = {
  initial: { scale: 1, opacity: 1 },
  animate: {
    scale: [1, 1.15, 1],
    opacity: [1, 0.8, 1],
    transition: { duration: 0.35, ease: 'easeOut' },
  },
  exit: { scale: 0.9, opacity: 0, transition: { duration: 0.2 } },
}

// ---------------------------------------------------------------------------
// Fly to roster — position transition
// ---------------------------------------------------------------------------

export const flyToRosterVariants: Variants = {
  initial: { x: 0, y: 0, scale: 1, opacity: 1 },
  animate: {
    x: [0, -20, 0],
    y: [0, -40, 0],
    scale: [1, 0.6, 1],
    opacity: [1, 0.6, 1],
    transition: { duration: 0.5, ease: 'easeInOut' },
  },
}

// ---------------------------------------------------------------------------
// Pulse — attention pulse
// ---------------------------------------------------------------------------

export const pulseVariants: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.05, 1],
    transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
  },
}

// ---------------------------------------------------------------------------
// On the clock — glow + pulse for the current drafter
// ---------------------------------------------------------------------------

export const onTheClockVariants: Variants = {
  initial: { scale: 1, boxShadow: '0 0 0 0 rgba(59,130,246,0)' },
  animate: {
    scale: [1, 1.02, 1],
    boxShadow: [
      '0 0 0 0 rgba(59,130,246,0)',
      '0 0 20px 4px rgba(59,130,246,0.4)',
      '0 0 0 0 rgba(59,130,246,0)',
    ],
    transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
  },
}

// ---------------------------------------------------------------------------
// Timer urgency — drives color shift (use with style binding)
// ---------------------------------------------------------------------------

export const timerUrgencyVariants: Variants = {
  initial: { scale: 1, color: '#22c55e' },
  animate: {
    scale: [1, 1.04, 1],
    transition: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' },
  },
}

// ---------------------------------------------------------------------------
// Celebration — confetti-like burst
// ---------------------------------------------------------------------------

export const celebrationVariants: Variants = {
  initial: { scale: 0, opacity: 0, rotate: 0 },
  animate: {
    scale: [0, 1.3, 1],
    opacity: [0, 1, 1],
    rotate: [0, 10, -5, 0],
    transition: { duration: 0.6, ease: 'easeOut' },
  },
  exit: {
    scale: 0.8,
    opacity: 0,
    transition: { duration: 0.3 },
  },
}

// ---------------------------------------------------------------------------
// Fade in + slide up — standard entrance
// ---------------------------------------------------------------------------

export const fadeInUpVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.2 },
  },
}

// ---------------------------------------------------------------------------
// Slide in from a configurable direction
// ---------------------------------------------------------------------------

export const slideInVariants: Variants = {
  initial: { x: 60, opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    x: 60,
    opacity: 0,
    transition: { duration: 0.2 },
  },
}

// ---------------------------------------------------------------------------
// Timer color helper
// ---------------------------------------------------------------------------

/**
 * Returns a CSS colour string based on how much time remains.
 *
 * - > 50 % remaining  -> green  (#22c55e)
 * - 25-50 % remaining -> yellow (#eab308)
 * - < 25 % remaining  -> red    (#ef4444)
 */
export function getTimerColor(
  secondsRemaining: number,
  totalSeconds: number,
): string {
  if (totalSeconds <= 0) return '#22c55e'
  const pct = secondsRemaining / totalSeconds
  if (pct > 0.5) return '#22c55e'
  if (pct > 0.25) return '#eab308'
  return '#ef4444'
}
