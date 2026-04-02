'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/lib/draft-animations'

/** Pokemon-type themed particle colours. */
const PARTICLE_COLORS = [
  '#ef4444', // fire / red
  '#3b82f6', // water / blue
  '#22c55e', // grass / green
  '#eab308', // electric / yellow
  '#a855f7', // psychic / purple
  '#f97316', // fighting / orange
  '#06b6d4', // ice / cyan
  '#ec4899', // fairy / pink
  '#84cc16', // bug / lime
  '#64748b', // steel / slate
]

const PARTICLE_COUNT = 40
const DURATION_MS = 3000

interface ConfettiCelebrationProps {
  show: boolean
  className?: string
}

/**
 * Pure-CSS confetti celebration.
 *
 * Renders 40 coloured particles that burst upward and fall with rotation.
 * Auto-dismisses after 3 seconds. Respects prefers-reduced-motion by
 * showing a simple text message instead of animated particles.
 */
export default function ConfettiCelebration({
  show,
  className,
}: ConfettiCelebrationProps) {
  const reducedMotion = useReducedMotion()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!show) {
      setVisible(false)
      return
    }

    setVisible(true)
    const timer = setTimeout(() => setVisible(false), DURATION_MS)
    return () => clearTimeout(timer)
  }, [show])

  if (!visible) return null

  // Reduced-motion fallback — simple text announcement
  if (reducedMotion) {
    return (
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center pointer-events-none',
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <span className="rounded-xl bg-black/80 px-8 py-4 text-2xl font-bold text-white">
          Draft Complete!
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 pointer-events-none overflow-hidden',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Celebration confetti"
    >
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
        const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length]
        const left = `${10 + Math.random() * 80}%`
        const delay = `${Math.random() * 0.4}s`
        const duration = `${2 + Math.random() * 1}s`
        const rotation = `${Math.random() * 360}deg`
        const size = `${6 + Math.random() * 6}px`
        const drift = `${(Math.random() - 0.5) * 200}px`

        return (
          <span
            key={i}
            className="confetti-particle"
            style={
              {
                '--confetti-color': color,
                '--confetti-left': left,
                '--confetti-delay': delay,
                '--confetti-duration': duration,
                '--confetti-rotation': rotation,
                '--confetti-size': size,
                '--confetti-drift': drift,
              } as React.CSSProperties
            }
          />
        )
      })}

      {/* Inline keyframes — scoped to this component */}
      <style jsx>{`
        .confetti-particle {
          position: absolute;
          top: -10px;
          left: var(--confetti-left);
          width: var(--confetti-size);
          height: var(--confetti-size);
          background: var(--confetti-color);
          border-radius: 2px;
          opacity: 0;
          animation: confetti-fall var(--confetti-duration) ease-out
            var(--confetti-delay) forwards;
        }

        @keyframes confetti-fall {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg) scale(1);
            opacity: 1;
          }
          20% {
            transform: translateY(-80px)
              translateX(calc(var(--confetti-drift) * 0.3))
              rotate(calc(var(--confetti-rotation) * 0.5)) scale(1.1);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) translateX(var(--confetti-drift))
              rotate(var(--confetti-rotation)) scale(0.6);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
