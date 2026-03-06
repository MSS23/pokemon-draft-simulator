import { cn } from '@/lib/utils'

interface DotPatternProps {
  className?: string
  size?: number
  spacing?: number
  opacity?: number
}

export function DotPattern({
  className,
  size = 1,
  spacing = 20,
  opacity = 0.15,
}: DotPatternProps) {
  const id = `dot-pattern-${Math.random().toString(36).slice(2)}`
  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    >
      <defs>
        <pattern id={id} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <circle cx={size} cy={size} r={size} fill="currentColor" opacity={opacity} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}
