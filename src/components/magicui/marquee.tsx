import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface MarqueeProps {
  className?: string
  reverse?: boolean
  pauseOnHover?: boolean
  vertical?: boolean
  repeat?: number
  gap?: string
  speed?: string
  children: ReactNode
}

export function Marquee({
  className,
  reverse = false,
  pauseOnHover = true,
  vertical = false,
  repeat = 3,
  gap = '1rem',
  speed = '30s',
  children,
}: MarqueeProps) {
  return (
    <div
      style={{ '--gap': gap, '--duration': speed } as React.CSSProperties}
      className={cn(
        'group flex overflow-hidden [--duration:30s] [--gap:1rem]',
        vertical ? 'flex-col' : 'flex-row',
        className
      )}
    >
      {Array.from({ length: repeat }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex shrink-0 justify-around gap-[--gap]',
            vertical
              ? 'animate-[marquee-vertical_var(--duration)_linear_infinite] flex-col'
              : 'animate-[marquee_var(--duration)_linear_infinite] flex-row',
            reverse && '[animation-direction:reverse]',
            pauseOnHover && 'group-hover:[animation-play-state:paused]'
          )}
        >
          {children}
        </div>
      ))}
    </div>
  )
}
