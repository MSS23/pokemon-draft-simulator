'use client'

import { useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Pokemon } from '@/types'
import PokemonCard from './PokemonCard'
import { cn } from '@/lib/utils'

interface VirtualizedPokemonGridProps {
  pokemon: Pokemon[]
  onViewDetails?: (pokemon: Pokemon) => void
  onQuickDraft?: (pokemon: Pokemon) => void
  onAddToWishlist?: (pokemon: Pokemon) => void
  onRemoveFromWishlist?: (pokemon: Pokemon) => void
  draftedPokemonIds?: string[]
  wishlistPokemonIds?: string[]
  className?: string
  cardSize?: 'sm' | 'md' | 'lg'
  showCost?: boolean
  showStats?: boolean
  showWishlistButton?: boolean
  showQuickDraft?: boolean
  budgetRemaining?: number
  maxAffordableCost?: number
  draftedByTeamMap?: Record<string, string>
  remainingTierSlots?: Record<string, number>
  isTiered?: boolean
  tierConfig?: { tiers: import('@/types').TierDefinition[] }
}

/**
 * Calculate grid columns based on screen size and card size
 * Optimized: Called once on mount and debounced on resize
 */
const calculateColumnCount = (width: number, cardSize: 'sm' | 'md' | 'lg'): number => {
  if (cardSize === 'sm') {
    if (width >= 1536) return 8 // 2xl
    if (width >= 1280) return 7 // xl
    if (width >= 1024) return 6 // lg
    if (width >= 768) return 5 // md
    if (width >= 640) return 4 // sm
    return 3 // default
  }

  if (cardSize === 'md') {
    if (width >= 1536) return 7 // 2xl
    if (width >= 1280) return 6 // xl
    if (width >= 1024) return 5 // lg
    if (width >= 768) return 4 // md
    if (width >= 640) return 3 // sm
    return 2 // default
  }

  // lg
  if (width >= 1536) return 6 // 2xl
  if (width >= 1280) return 5 // xl
  if (width >= 1024) return 4 // lg
  if (width >= 768) return 3 // md
  if (width >= 640) return 2 // sm
  return 1 // default
}

// Debounce utility for resize events
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

const getEstimatedCardHeight = (cardSize: 'sm' | 'md' | 'lg'): number => {
  // Must match CARD_HEIGHTS in PokemonCard: sm=200px, md=260px, lg=340px
  switch (cardSize) {
    case 'sm': return 200
    case 'md': return 260
    case 'lg': return 340
    default: return 260
  }
}

/**
 * VirtualizedPokemonGrid - Optimized with debounced resize handling
 *
 * Performance optimizations:
 * 1. Debounced resize events (250ms delay)
 * 2. Column count calculated once and updated only on resize
 * 3. Prevents unnecessary recalculations on every render
 *
 * Expected improvement: Eliminates jank during window resize
 */
export default function VirtualizedPokemonGrid({
  pokemon,
  onViewDetails,
  onQuickDraft,
  onAddToWishlist,
  onRemoveFromWishlist,
  draftedPokemonIds = [],
  wishlistPokemonIds = [],
  className,
  cardSize = 'md',
  showCost = true,
  showStats = true,
  showWishlistButton = true,
  showQuickDraft = false,
  budgetRemaining,
  maxAffordableCost,
  draftedByTeamMap = {},
  remainingTierSlots,
  isTiered,
  tierConfig,
}: VirtualizedPokemonGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // State-based column count instead of recalculating on every render
  const [columnCount, setColumnCount] = useState(() =>
    typeof window !== 'undefined'
      ? calculateColumnCount(window.innerWidth, cardSize)
      : 6 // SSR default
  )

  const estimatedCardHeight = getEstimatedCardHeight(cardSize)

  // Debounced resize handler
  useEffect(() => {
    const handleResize = debounce(() => {
      const newColumnCount = calculateColumnCount(window.innerWidth, cardSize)
      setColumnCount(newColumnCount)
    }, 250) // 250ms debounce

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [cardSize])

  // Calculate row data - group Pokemon into rows
  const rows: Pokemon[][] = []
  for (let i = 0; i < pokemon.length; i += columnCount) {
    rows.push(pokemon.slice(i, i + columnCount))
  }

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedCardHeight + 12, // Card height + gap
    overscan: 3, // Render 3 extra rows above and below viewport
  })

  const gridCols = {
    sm: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8',
    md: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
    lg: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
  }

  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto', className)}
      style={{ height: '800px' }} // Fixed height for virtualization
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowPokemon = rows[virtualRow.index]

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className={cn(
                'grid gap-3',
                gridCols[cardSize]
              )}>
                {rowPokemon.map((p) => (
                  <PokemonCard
                    key={p.id}
                    pokemon={p}
                    onViewDetails={onViewDetails}
                    onQuickDraft={onQuickDraft}
                    onAddToWishlist={onAddToWishlist}
                    onRemoveFromWishlist={onRemoveFromWishlist}
                    isDrafted={draftedPokemonIds.includes(p.id)}
                    isInWishlist={wishlistPokemonIds.includes(p.id)}
                    isUnaffordable={
                      isTiered && tierConfig && remainingTierSlots
                        ? (() => {
                            const tier = tierConfig.tiers
                              .slice()
                              .sort((a: { minCost: number }, b: { minCost: number }) => b.minCost - a.minCost)
                              .find((t: { minCost: number }) => p.cost >= t.minCost)
                            return !tier || (remainingTierSlots[tier.name] ?? 0) <= 0
                          })()
                        : budgetRemaining !== undefined && p.cost > budgetRemaining
                    }
                    isUnsafe={
                      !isTiered &&
                      maxAffordableCost !== undefined &&
                      p.cost > maxAffordableCost &&
                      (budgetRemaining === undefined || p.cost <= budgetRemaining)
                    }
                    showCost={showCost}
                    showStats={showStats}
                    showWishlistButton={showWishlistButton}
                    showQuickDraft={showQuickDraft}
                    size={cardSize}
                    draftedByTeamName={draftedByTeamMap[p.id]}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
