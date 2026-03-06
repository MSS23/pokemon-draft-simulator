'use client'

import { cn } from '@/lib/utils'
import { useMemo } from 'react'

interface MeteorsProps {
  number?: number
  className?: string
}

export function Meteors({ number = 12, className }: MeteorsProps) {
  const meteors = useMemo(
    () =>
      Array.from({ length: number }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 3}s`,
        duration: `${Math.random() * 4 + 3}s`,
        size: Math.random() * 1 + 0.5,
      })),
    [number]
  )

  return (
    <div className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}>
      {meteors.map((m) => (
        <span
          key={m.id}
          className="absolute top-0 left-1/2 h-px w-px rotate-[215deg]"
          style={{
            top: m.top,
            left: m.left,
            animationDelay: m.delay,
            animationDuration: m.duration,
          }}
        >
          <span
            className="absolute top-0 left-0 animate-[meteor-fall_linear_infinite]"
            style={{ animationDelay: m.delay, animationDuration: m.duration }}
          >
            <div
              className="rounded-full"
              style={{
                width: `${m.size}px`,
                height: `${m.size}px`,
                background:
                  'linear-gradient(to right, hsl(var(--primary) / 0.8), transparent)',
                boxShadow: `0 0 ${m.size * 6}px ${m.size}px hsl(var(--primary) / 0.3)`,
              }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 opacity-50"
              style={{
                right: '100%',
                width: `${m.size * 80}px`,
                height: `${m.size * 0.5}px`,
                background:
                  'linear-gradient(to left, hsl(var(--primary) / 0.6), transparent)',
              }}
            />
          </span>
        </span>
      ))}
    </div>
  )
}
