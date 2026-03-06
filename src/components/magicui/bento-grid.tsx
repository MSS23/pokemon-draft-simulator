import { cn } from '@/lib/utils'
import { ReactNode } from 'react'
import { MagicCard } from './magic-card'

interface BentoGridProps {
  children: ReactNode
  className?: string
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div
      className={cn(
        'grid auto-rows-[14rem] grid-cols-3 gap-4',
        className
      )}
    >
      {children}
    </div>
  )
}

interface BentoCardProps {
  name: string
  description: string
  icon: ReactNode
  className?: string
  background?: ReactNode
  cta?: string
  href?: string
}

export function BentoCard({
  name,
  description,
  icon,
  className,
  background,
}: BentoCardProps) {
  return (
    <MagicCard
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden p-6 transition-shadow duration-300 hover:shadow-lg',
        className
      )}
    >
      {background && (
        <div className="absolute inset-0 transition-all duration-500 group-hover:scale-105">
          {background}
        </div>
      )}
      <div className="relative z-10">
        <div className="mb-3 w-fit rounded-lg bg-primary/10 p-2 text-primary">
          {icon}
        </div>
        <h3 className="font-semibold text-base">{name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </MagicCard>
  )
}
