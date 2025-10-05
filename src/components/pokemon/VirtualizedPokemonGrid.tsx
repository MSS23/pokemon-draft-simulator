'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Pokemon } from '@/types'
import PokemonCard from './PokemonCard'
import { cn } from '@/lib/utils'

interface VirtualizedPokemonGridProps {
  pokemon: Pokemon[]
  onViewDetails?: (pokemon: Pokemon) => void
  onAddToWishlist?: (pokemon: Pokemon) => void
  onRemoveFromWishlist?: (pokemon: Pokemon) => void
  draftedPokemonIds?: string[]
  wishlistPokemonIds?: string[]
  className?: string
  cardSize?: 'sm' | 'md' | 'lg'
  showCost?: boolean
  showStats?: boolean
  showWishlistButton?: boolean
}

// Calculate grid columns based on screen size and card size
const getColumnCount = (cardSize: 'sm' | 'md' | 'lg'): number => {
  if (typeof window === 'undefined') return 6 // Default for SSR

  const width = window.innerWidth

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

const getEstimatedCardHeight = (cardSize: 'sm' | 'md' | 'lg'): number => {
  switch (cardSize) {
    case 'sm': return 220
    case 'md': return 300
    case 'lg': return 380
    default: return 300
  }
}

export default function VirtualizedPokemonGrid({
  pokemon,
  onViewDetails,
  onAddToWishlist,
  onRemoveFromWishlist,
  draftedPokemonIds = [],
  wishlistPokemonIds = [],
  className,
  cardSize = 'md',
  showCost = true,
  showStats = true,
  showWishlistButton = true,
}: VirtualizedPokemonGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const columnCount = getColumnCount(cardSize)
  const estimatedCardHeight = getEstimatedCardHeight(cardSize)

  // Calculate row data - group Pokemon into rows
  const rows: Pokemon[][] = []
  for (let i = 0; i < pokemon.length; i += columnCount) {
    rows.push(pokemon.slice(i, i + columnCount))
  }

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedCardHeight + 24, // Card height + gap
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
                'grid gap-4 sm:gap-4 md:gap-5 lg:gap-6',
                'auto-rows-fr',
                'items-stretch',
                gridCols[cardSize]
              )}>
                {rowPokemon.map((p) => (
                  <PokemonCard
                    key={p.id}
                    pokemon={p}
                    onViewDetails={onViewDetails}
                    onAddToWishlist={onAddToWishlist}
                    onRemoveFromWishlist={onRemoveFromWishlist}
                    isDrafted={draftedPokemonIds.includes(p.id)}
                    isInWishlist={wishlistPokemonIds.includes(p.id)}
                    showCost={showCost}
                    showStats={showStats}
                    showWishlistButton={showWishlistButton}
                    size={cardSize}
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
