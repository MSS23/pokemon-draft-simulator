'use client'

import { useState, useCallback, memo, useRef } from 'react'
import { Pokemon } from '@/types'
import { cn } from '@/lib/utils'
import { getTypeColor, getOfficialArtworkUrl, getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Pastel tint for card backgrounds — mixes the type color toward white/cream.
 * Matches the screenshot's warm, soft card aesthetic.
 */
const TYPE_PASTEL: Record<string, string> = {
  normal:   '#e8e6df',
  fire:     '#fbe4d0',
  water:    '#d4e4f7',
  electric: '#fdf3cd',
  grass:    '#d6edce',
  ice:      '#d5f0ef',
  fighting: '#f0d3d1',
  poison:   '#e6d3e6',
  ground:   '#f2e6cd',
  flying:   '#e0d8f5',
  psychic:  '#fcd6e2',
  bug:      '#e2e8c4',
  rock:     '#e6ddc0',
  ghost:    '#dad0e6',
  dragon:   '#d6ccf8',
  dark:     '#d8d2cc',
  steel:    '#dddde6',
  fairy:    '#f7dce4',
}

const TYPE_PASTEL_DARK: Record<string, string> = {
  normal:   '#2a2924',
  fire:     '#33221a',
  water:    '#1a2233',
  electric: '#33301a',
  grass:    '#1e2e1a',
  ice:      '#1a2e2d',
  fighting: '#2e1a19',
  poison:   '#281a28',
  ground:   '#2e261a',
  flying:   '#221e33',
  psychic:  '#301a24',
  bug:      '#262a1a',
  rock:     '#2a2619',
  ghost:    '#231e2a',
  dragon:   '#221c33',
  dark:     '#231f1a',
  steel:    '#232328',
  fairy:    '#2e1e24',
}

function getPastelBg(typeName: string, isDark: boolean) {
  const key = typeName.toLowerCase()
  return isDark ? (TYPE_PASTEL_DARK[key] ?? '#222') : (TYPE_PASTEL[key] ?? '#eee')
}

interface RosterCardStackProps {
  pokemon: Pokemon[]
  className?: string
}

/**
 * A flickable card-fan showing the user's drafted Pokemon as physical trading cards.
 * Inspired by the screenshot reference — soft pastel type bg, centered artwork, clean name.
 */
const RosterCardStack = memo(function RosterCardStack({ pokemon, className }: RosterCardStackProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isDark, setIsDark] = useState(false)

  // Detect dark mode from the DOM
  const checkDarkMode = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setIsDark(document.documentElement.classList.contains('dark'))
    }
  }, [])

  const goNext = useCallback(() => {
    setActiveIndex(i => (i + 1) % pokemon.length)
  }, [pokemon.length])

  const goPrev = useCallback(() => {
    setActiveIndex(i => (i - 1 + pokemon.length) % pokemon.length)
  }, [pokemon.length])

  // Touch/swipe support
  const touchStartX = useRef(0)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) {
      if (dx < 0) goNext()
      else goPrev()
    }
  }, [goNext, goPrev])

  if (pokemon.length === 0) return null

  const total = pokemon.length
  // Show up to 5 cards in the fan (the active + neighbors)
  const visibleRange = Math.min(total, 5)

  return (
    <div ref={checkDarkMode} className={cn('relative select-none', className)}>
      {/* Card fan area */}
      <div
        className="relative h-[220px] sm:h-[260px] flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {pokemon.map((mon, i) => {
          // Calculate offset from active
          let offset = i - activeIndex
          if (offset > total / 2) offset -= total
          if (offset < -total / 2) offset += total

          // Only render cards within visible range
          if (Math.abs(offset) > Math.floor(visibleRange / 2)) return null

          const isActive = offset === 0
          const rotation = offset * 8 // degrees per card
          const translateX = offset * 48 // px per card
          const translateY = Math.abs(offset) * 8
          const scale = isActive ? 1 : 0.92 - Math.abs(offset) * 0.03
          const zIndex = visibleRange - Math.abs(offset)
          const opacity = isActive ? 1 : Math.max(0.4, 1 - Math.abs(offset) * 0.25)

          const primaryType = mon.types[0]?.name?.toLowerCase() ?? 'normal'
          const typeColor = getTypeColor(primaryType)
          const pastelBg = getPastelBg(primaryType, isDark)

          return (
            <div
              key={mon.id}
              className={cn(
                'absolute w-[150px] sm:w-[170px] h-[200px] sm:h-[230px] rounded-2xl overflow-hidden',
                'transition-all duration-300 ease-out cursor-pointer',
                'shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]',
                'dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)]',
                isActive && 'shadow-[0_8px_30px_-4px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.6)]',
              )}
              style={{
                transform: `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotation}deg) scale(${scale})`,
                zIndex,
                opacity,
              }}
              onClick={() => {
                if (isActive) goNext()
                else setActiveIndex(i)
              }}
            >
              {/* Card body */}
              <div
                className="w-full h-full flex flex-col relative"
                style={{ backgroundColor: pastelBg }}
              >
                {/* Subtle inner border */}
                <div className="absolute inset-[6px] sm:inset-[8px] rounded-xl border border-black/[0.05] dark:border-white/[0.06] pointer-events-none" />

                {/* Cost badge top-right */}
                <div className="absolute top-2 right-2 z-10">
                  <span
                    className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-[10px] font-bold text-white px-1.5 shadow-sm"
                    style={{ backgroundColor: typeColor }}
                  >
                    {mon.cost}
                  </span>
                </div>

                {/* Pokemon artwork — large, centered */}
                <div className="flex-1 flex items-center justify-center pt-4 pb-1 px-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getPokemonAnimatedUrl(mon.id, mon.name)}
                    alt={mon.name}
                    className="w-[90px] h-[90px] sm:w-[110px] sm:h-[110px] object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.12)]"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      if (!target.dataset.fb2) {
                        if (!target.dataset.fb1) {
                          target.dataset.fb1 = '1'
                          target.src = getPokemonAnimatedBackupUrl(mon.id)
                        } else {
                          target.dataset.fb2 = '1'
                          target.src = getOfficialArtworkUrl(mon.id)
                        }
                      }
                    }}
                  />
                </div>

                {/* Bottom section — name + type */}
                <div className="px-3 pb-3 space-y-1">
                  <p className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-100 truncate leading-tight tracking-tight">
                    {mon.name}
                  </p>
                  <div className="flex gap-1">
                    {mon.types.map(t => (
                      <span
                        key={t.name}
                        className="text-[8px] sm:text-[9px] font-semibold text-white px-1.5 py-[1px] rounded-full uppercase tracking-wide"
                        style={{ backgroundColor: t.color }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Navigation arrows */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-3 mt-1">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Previous Pokemon"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1">
            {pokemon.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-all duration-200',
                  i === activeIndex
                    ? 'bg-foreground w-4'
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                )}
                aria-label={`Go to card ${i + 1}`}
              />
            ))}
          </div>
          <button
            onClick={goNext}
            className="p-1.5 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Next Pokemon"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
})

export default RosterCardStack
