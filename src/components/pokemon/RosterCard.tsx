'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'

/**
 * Modern Pokemon card for league rosters.
 * Type-colored gradient background, glass footer, large centered sprite.
 */

const TYPE_GRADIENTS: Record<string, string> = {
  normal:   'from-stone-400 to-stone-500',
  fire:     'from-orange-500 to-red-600',
  water:    'from-blue-500 to-indigo-600',
  electric: 'from-yellow-400 to-amber-500',
  grass:    'from-emerald-500 to-green-700',
  ice:      'from-cyan-400 to-sky-500',
  fighting: 'from-red-600 to-rose-800',
  poison:   'from-purple-500 to-violet-700',
  ground:   'from-amber-600 to-yellow-800',
  flying:   'from-indigo-400 to-sky-500',
  psychic:  'from-pink-500 to-fuchsia-600',
  bug:      'from-lime-500 to-green-600',
  rock:     'from-stone-500 to-amber-700',
  ghost:    'from-violet-600 to-purple-900',
  dragon:   'from-indigo-600 to-violet-800',
  dark:     'from-zinc-700 to-zinc-900',
  steel:    'from-slate-400 to-zinc-600',
  fairy:    'from-pink-400 to-rose-500',
}

const TYPE_ACCENTS: Record<string, string> = {
  normal:   'bg-stone-300/30',
  fire:     'bg-orange-300/30',
  water:    'bg-blue-300/30',
  electric: 'bg-yellow-200/30',
  grass:    'bg-emerald-300/30',
  ice:      'bg-cyan-200/30',
  fighting: 'bg-red-300/30',
  poison:   'bg-purple-300/30',
  ground:   'bg-amber-300/30',
  flying:   'bg-indigo-200/30',
  psychic:  'bg-pink-300/30',
  bug:      'bg-lime-200/30',
  rock:     'bg-stone-300/30',
  ghost:    'bg-violet-300/30',
  dragon:   'bg-indigo-300/30',
  dark:     'bg-zinc-400/30',
  steel:    'bg-slate-200/30',
  fairy:    'bg-pink-200/30',
}

function formatName(name: string) {
  return name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

interface RosterCardProps {
  pokemonId: string
  pokemonName: string
  primaryType?: string
  secondaryType?: string
  cost?: number
  showCost?: boolean
  kills?: number
  deaths?: number
  matchesPlayed?: number
  subtitle?: string
  className?: string
}

function RosterCardInner({
  pokemonId,
  pokemonName,
  primaryType,
  secondaryType,
  cost,
  showCost = true,
  kills,
  deaths,
  matchesPlayed,
  subtitle,
  className,
}: RosterCardProps) {
  const typeKey = primaryType?.toLowerCase() ?? 'normal'
  const gradient = TYPE_GRADIENTS[typeKey] ?? TYPE_GRADIENTS.normal
  const accent = TYPE_ACCENTS[typeKey] ?? TYPE_ACCENTS.normal
  const displayName = formatName(pokemonName)

  const hasStats = (matchesPlayed ?? 0) > 0
  const kd = hasStats ? ((kills ?? 0) / Math.max(deaths ?? 1, 1)) : null

  return (
    <div
      className={cn(
        'group relative rounded-xl overflow-hidden bg-gradient-to-br shadow-md',
        'transition-all duration-200 hover:-translate-y-1 hover:shadow-xl',
        gradient,
        className,
      )}
    >
      {/* Glass overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/15 pointer-events-none" />

      {/* Decorative blurred circle */}
      <div className={cn('absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl pointer-events-none', accent)} />

      {/* Subtle pokéball watermark */}
      <div className="absolute bottom-4 left-4 w-16 h-16 opacity-[0.06] pointer-events-none">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="46" stroke="white" strokeWidth="3" />
          <line x1="4" y1="50" x2="96" y2="50" stroke="white" strokeWidth="3" />
          <circle cx="50" cy="50" r="12" stroke="white" strokeWidth="3" />
        </svg>
      </div>

      {/* Card content */}
      <div className="relative z-10 flex flex-col h-full p-3">
        {/* Top: type pills + cost */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex gap-1">
            {primaryType && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-black/20 text-white/90 backdrop-blur-sm">
                {primaryType}
              </span>
            )}
            {secondaryType && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-black/15 text-white/70 backdrop-blur-sm">
                {secondaryType}
              </span>
            )}
          </div>
          {showCost && cost !== undefined && (
            <span className="rounded-md bg-black/25 text-white font-bold backdrop-blur-sm tabular-nums px-1.5 py-0.5 text-[10px]">
              {cost}pts
            </span>
          )}
        </div>

        {/* Pokemon sprite — large, centered */}
        <div className="flex-1 flex items-center justify-center py-2 min-h-[80px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPokemonAnimatedUrl(pokemonId, pokemonName)}
            alt={displayName}
            className="w-[72px] h-[72px] drop-shadow-lg transition-transform duration-300 group-hover:scale-110"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              if (!target.dataset.fallback) {
                target.dataset.fallback = '1'
                target.src = getPokemonAnimatedBackupUrl(pokemonId)
              }
            }}
          />
        </div>

        {/* Bottom: glass footer with name + stats */}
        <div className="rounded-lg bg-black/25 backdrop-blur-sm px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-white text-sm truncate">
              {displayName}
            </span>
            {hasStats && kd !== null && (
              <span className={cn(
                'font-semibold tabular-nums text-xs shrink-0',
                kd >= 2 ? 'text-emerald-300' : kd >= 1 ? 'text-yellow-300' : 'text-red-300',
              )}>
                {kd.toFixed(1)}
              </span>
            )}
          </div>
          {(subtitle || hasStats) && (
            <p className="text-white/55 text-[10px] mt-0.5 truncate">
              {hasStats
                ? `${kills ?? 0} KOs · ${deaths ?? 0} deaths · ${matchesPlayed} games`
                : subtitle
              }
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const RosterCard = React.memo(RosterCardInner, (prev, next) =>
  prev.pokemonId === next.pokemonId &&
  prev.kills === next.kills &&
  prev.deaths === next.deaths &&
  prev.showCost === next.showCost
)
RosterCard.displayName = 'RosterCard'

export { RosterCard }
export type { RosterCardProps }
