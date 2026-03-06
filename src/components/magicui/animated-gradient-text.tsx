import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface AnimatedGradientTextProps {
  children: ReactNode
  className?: string
}

export function AnimatedGradientText({ children, className }: AnimatedGradientTextProps) {
  return (
    <span
      className={cn(
        'inline-flex bg-clip-text text-transparent',
        'bg-[length:200%_auto] animate-[gradient-x_3s_linear_infinite]',
        className
      )}
      style={{
        backgroundImage:
          'linear-gradient(to right, hsl(var(--brand-from)), hsl(var(--brand-via)), hsl(var(--brand-to)), hsl(var(--brand-from)))',
      }}
    >
      {children}
    </span>
  )
}
