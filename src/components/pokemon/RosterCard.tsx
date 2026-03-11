'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, getOfficialArtworkUrl } from '@/utils/pokemon'

/**
 * Physical trading-card style Pokemon card for league rosters.
 * Dual-type gradient support: fire/water = red→blue, grass/poison = green→purple, etc.
 */

// Hex colors for each type — used to build CSS gradients for any type combo
const TYPE_HEX: Record<string, string> = {
  normal:   '#A8A878',
  fire:     '#EF5330',
  water:    '#4F8FE0',
  electric: '#F0C830',
  grass:    '#48A848',
  ice:      '#7BD4D4',
  fighting: '#C03028',
  poison:   '#9040A0',
  ground:   '#D4A848',
  flying:   '#9086E0',
  psychic:  '#E85888',
  bug:      '#88A020',
  rock:     '#B8A040',
  ghost:    '#6858A0',
  dragon:   '#6038F0',
  dark:     '#604838',
  steel:    '#A8A8C0',
  fairy:    '#E890A8',
}

function getTypeGradient(primary?: string, secondary?: string): string {
  const p = primary?.toLowerCase() ?? 'normal'
  const s = secondary?.toLowerCase()
  const c1 = TYPE_HEX[p] ?? TYPE_HEX.normal
  if (!s || s === p) return `linear-gradient(135deg, ${c1}, ${c1}dd)`
  const c2 = TYPE_HEX[s] ?? TYPE_HEX.normal
  return `linear-gradient(135deg, ${c1} 0%, ${c1}cc 40%, ${c2}cc 60%, ${c2} 100%)`
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
  const displayName = formatName(pokemonName)
  const typeKey = primaryType?.toLowerCase() ?? 'normal'
  const typeColor = TYPE_HEX[typeKey] ?? TYPE_HEX.normal

  const hasStats = (matchesPlayed ?? 0) > 0
  const kd = hasStats ? ((kills ?? 0) / Math.max(deaths ?? 1, 1)) : null

  return (
    <div
      className={cn(
        'group relative rounded-2xl overflow-hidden shadow-md',
        'transition-all duration-250 ease-out',
        'hover:-translate-y-1.5 hover:shadow-[0_12px_32px_-6px_rgba(0,0,0,0.2)]',
        'dark:hover:shadow-[0_12px_32px_-6px_rgba(0,0,0,0.5)]',
        className,
      )}
      style={{ background: getTypeGradient(primaryType, secondaryType) }}
    >
      {/* Glass overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/10 pointer-events-none" />

      {/* Decorative blurred circle — uses secondary type if dual */}
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ backgroundColor: TYPE_HEX[(secondaryType ?? primaryType)?.toLowerCase() ?? 'normal'] ?? TYPE_HEX.normal }}
      />

      {/* Subtle pokéball watermark */}
      <div className="absolute bottom-4 left-3 w-14 h-14 opacity-[0.06] pointer-events-none">
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
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-white shadow-sm"
                style={{ backgroundColor: `${typeColor}cc` }}
              >
                {primaryType}
              </span>
            )}
            {secondaryType && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-white shadow-sm"
                style={{ backgroundColor: `${TYPE_HEX[secondaryType.toLowerCase()] ?? TYPE_HEX.normal}cc` }}
              >
                {secondaryType}
              </span>
            )}
          </div>
          {showCost && cost !== undefined && (
            <span className="rounded-full bg-black/25 text-white font-bold backdrop-blur-sm tabular-nums px-2 py-0.5 text-[10px] shadow-sm">
              {cost}pts
            </span>
          )}
        </div>

        {/* Pokemon artwork — large, centered */}
        <div className="flex-1 flex items-center justify-center py-2 min-h-[80px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPokemonAnimatedUrl(pokemonId, pokemonName)}
            alt={displayName}
            className="w-[76px] h-[76px] drop-shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-transform duration-300 group-hover:scale-110"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              if (!target.dataset.fb2) {
                if (!target.dataset.fb1) {
                  target.dataset.fb1 = '1'
                  target.src = getPokemonAnimatedBackupUrl(pokemonId)
                } else {
                  target.dataset.fb2 = '1'
                  target.src = getOfficialArtworkUrl(pokemonId)
                }
              }
            }}
          />
        </div>

        {/* Bottom: glass footer with name + stats */}
        <div className="rounded-xl bg-black/20 backdrop-blur-sm px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-white text-sm truncate tracking-tight">
              {displayName}
            </span>
            {hasStats && kd !== null && (
              <span className={cn(
                'font-bold tabular-nums text-xs shrink-0',
                kd >= 2 ? 'text-emerald-300' : kd >= 1 ? 'text-yellow-200' : 'text-red-300',
              )}>
                {kd.toFixed(1)}
              </span>
            )}
          </div>
          {(subtitle || hasStats) && (
            <p className="text-white/50 text-[10px] mt-0.5 truncate font-medium">
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
