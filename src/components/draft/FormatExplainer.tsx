'use client'

import { HelpCircle } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

interface FormatExplainerEntry {
  label: string
  description: string
}

const FORMAT_EXPLANATIONS: Record<string, FormatExplainerEntry> = {
  'regulation-h': {
    label: 'Regulation H',
    description:
      'VGC 2024 format. Bans all legendaries, mythicals, and paradox Pokemon. Only Pokemon from the Paldea, Kitakami, and Blueberry Pokedex are allowed.',
  },
  'snake-draft': {
    label: 'Snake Draft',
    description:
      'Teams take turns picking in alternating order. Round 1: 1\u21922\u21923\u21924, Round 2: 4\u21923\u21922\u21921. This keeps things fair by giving the last picker first choice in the next round.',
  },
  'auction-draft': {
    label: 'Auction Draft',
    description:
      'Teams bid on Pokemon using their budget. One team nominates a Pokemon, then all teams bid in real-time. The highest bidder wins that Pokemon.',
  },
  'points-budget': {
    label: 'Points / Budget',
    description:
      'Each Pokemon has a cost based on its competitive strength. Build the best team you can within your budget. Stronger Pokemon cost more points.',
  },
  tiered: {
    label: 'Tiered',
    description:
      'Pokemon are assigned tiers (S through E) based on strength. Each tier costs a set number of points. Pick one from each tier or mix and match within your budget.',
  },
}

interface FormatExplainerProps {
  formatKey: string
  className?: string
}

export function FormatExplainer({ formatKey, className }: FormatExplainerProps) {
  const entry = FORMAT_EXPLANATIONS[formatKey]
  if (!entry) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ${className ?? ''}`}
          aria-label={`Learn about ${entry.label}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 text-sm">
        <p className="font-semibold text-xs uppercase tracking-wide text-primary mb-1.5">
          {entry.label}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">{entry.description}</p>
      </PopoverContent>
    </Popover>
  )
}
