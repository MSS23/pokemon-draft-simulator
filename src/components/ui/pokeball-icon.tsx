import { cn } from '@/lib/utils'

interface PokeballIconProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  color?: string
  className?: string
}

const sizes = {
  xs: 'w-3 h-3',
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
}

export function PokeballIcon({ size = 'md', color = '#dc2626', className }: PokeballIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn(sizes[size], className)}
      aria-hidden="true"
    >
      {/* Outer circle */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="4" className="text-foreground/80" />
      {/* Top half */}
      <path d="M 2 50 A 48 48 0 0 1 98 50" fill={color} />
      {/* Bottom half */}
      <path d="M 2 50 A 48 48 0 0 0 98 50" fill="white" className="dark:fill-gray-200" />
      {/* Center band */}
      <rect x="2" y="46" width="96" height="8" fill="currentColor" className="text-foreground/80" />
      {/* Center circle outer */}
      <circle cx="50" cy="50" r="16" fill="currentColor" className="text-foreground/80" />
      {/* Center circle inner */}
      <circle cx="50" cy="50" r="10" fill="white" className="dark:fill-gray-200" />
    </svg>
  )
}
