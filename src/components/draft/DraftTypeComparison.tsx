'use client'

import { Trophy, Gavel, Coins } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface DraftTypeCard {
  id: string
  icon: typeof Trophy
  title: string
  description: string
  pros: string[]
  cons: string[]
  bestFor: string
  recommended?: boolean
}

const DRAFT_TYPE_CARDS: DraftTypeCard[] = [
  {
    id: 'tiered',
    icon: Trophy,
    title: 'Tiered Draft',
    description:
      'Pokemon are split into tiers by strength. Each tier costs a set amount of points. Pick from each tier to build a balanced roster.',
    pros: ['Balanced teams', 'Easy to understand', 'Fast picks'],
    cons: ['Less flexibility', 'Tier assignments can be debated'],
    bestFor: 'Competitive leagues',
    recommended: true,
  },
  {
    id: 'points',
    icon: Coins,
    title: 'Snake / Points',
    description:
      'Teams take turns in snake order. Every Pokemon has a point cost. Spend your budget across all your picks strategically.',
    pros: ['High strategy depth', 'Flexible team building', 'Classic draft feel'],
    cons: ['Pick order matters a lot', 'Can be slow with large groups'],
    bestFor: 'Strategy-focused groups',
  },
  {
    id: 'auction',
    icon: Gavel,
    title: 'Auction',
    description:
      'Teams bid on Pokemon in real-time. One team nominates, everyone bids. Highest bidder wins. Budget management is key.',
    pros: ['Most interactive', 'Every player engaged', 'No pick order advantage'],
    cons: ['Takes longer', 'Can be chaotic for newcomers'],
    bestFor: 'Experienced groups',
  },
]

interface DraftTypeComparisonProps {
  className?: string
}

export function DraftTypeComparison({ className }: DraftTypeComparisonProps) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-3 gap-3', className)}>
      {DRAFT_TYPE_CARDS.map((card) => (
        <div
          key={card.id}
          className="relative p-4 rounded-xl border border-border/60 bg-card hover:border-border hover:shadow-md transition-all duration-200 space-y-3"
        >
          {card.recommended && (
            <Badge
              variant="default"
              className="absolute -top-2.5 left-3 text-[10px] px-2 py-0.5"
            >
              Recommended for beginners
            </Badge>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <card.icon className="h-4.5 w-4.5 text-primary" />
            </div>
            <h3 className="font-bold text-sm">{card.title}</h3>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {card.description}
          </p>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
              Pros
            </p>
            <ul className="space-y-0.5">
              {card.pros.map((pro) => (
                <li key={pro} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-green-500 mt-0.5 leading-none">+</span>
                  {pro}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
              Cons
            </p>
            <ul className="space-y-0.5">
              {card.cons.map((con) => (
                <li key={con} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-red-500 mt-0.5 leading-none">-</span>
                  {con}
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2 border-t border-border/40">
            <p className="text-[11px] text-primary font-medium">{card.bestFor}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
