import { cn } from '@/lib/utils'

interface GridPatternProps {
  className?: string
  squares?: [number, number][]
  width?: number
  height?: number
  x?: number
  y?: number
  strokeDasharray?: string
}

export function GridPattern({
  className,
  squares,
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  strokeDasharray = '0',
}: GridPatternProps) {
  const id = `grid-${Math.random().toString(36).slice(2)}`
  return (
    <svg
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full fill-none',
        className
      )}
    >
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path
            d={`M.5 ${height}V.5H${width}`}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      {squares?.map(([col, row]) => (
        <rect
          key={`${col}-${row}`}
          width={width - 1}
          height={height - 1}
          x={col * width + 1}
          y={row * height + 1}
          fill="currentColor"
          fillOpacity={0.05}
        />
      ))}
    </svg>
  )
}
