/**
 * Pokemon Status Badge Component
 *
 * Visual indicator for Pokemon health status in league matches:
 * - Alive (green heart)
 * - Fainted (yellow warning)
 * - Dead (red skull - Nuzlocke)
 */

import { Heart, AlertTriangle, Skull } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PokemonStatusBadgeProps {
  status: 'alive' | 'fainted' | 'dead'
  showIcon?: boolean
  showText?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function PokemonStatusBadge({
  status,
  showIcon = true,
  showText = true,
  size = 'md',
  className,
}: PokemonStatusBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  }

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  const config = {
    alive: {
      icon: Heart,
      label: 'Alive',
      className: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-800',
    },
    fainted: {
      icon: AlertTriangle,
      label: 'Fainted',
      className: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800',
    },
    dead: {
      icon: Skull,
      label: 'Dead',
      className: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
    },
  }

  const { icon: Icon, label, className: statusClassName } = config[status]

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1.5 font-medium',
        sizeClasses[size],
        statusClassName,
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {showText && <span>{label}</span>}
    </Badge>
  )
}
