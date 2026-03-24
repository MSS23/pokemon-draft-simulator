'use client'

import { memo } from 'react'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, formatPokemonName } from '@/utils/pokemon'

interface ShareableRecapCardProps {
  teamName: string
  userName: string
  draftName: string
  pokemon: Array<{
    id: string
    name: string
    cost: number
  }>
  totalCost: number
  budgetRemaining?: number
}

export const ShareableRecapCard = memo<ShareableRecapCardProps>(({
  teamName,
  userName,
  draftName,
  pokemon,
  totalCost,
  budgetRemaining
}) => {
  return (
    <div
      className="w-full max-w-lg mx-auto rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-6 w-6 rounded-full overflow-hidden relative flex-shrink-0">
            <div className="absolute inset-0 top-0 h-1/2 bg-red-500" />
            <div className="absolute inset-0 top-1/2 h-1/2 bg-white" />
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gray-800 -translate-y-1/2" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full border border-gray-800 bg-white" />
          </div>
          <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Poke Draft</span>
        </div>
        <h2 className="text-white text-xl font-bold">{teamName}</h2>
        <p className="text-slate-400 text-sm">{userName} &middot; {draftName}</p>
      </div>

      {/* Pokemon Grid */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-3 gap-3">
          {pokemon.map((mon) => (
            <div
              key={mon.id}
              className="flex flex-col items-center gap-1 p-3 rounded-xl bg-white/5 border border-white/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPokemonAnimatedUrl(mon.id, mon.name)}
                alt={mon.name}
                className="w-14 h-14 drop-shadow-lg"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  if (!target.dataset.fallback) {
                    target.dataset.fallback = '1'
                    target.src = getPokemonAnimatedBackupUrl(mon.id)
                  }
                }}
              />
              <span className="text-white text-[11px] font-semibold text-center truncate w-full">
                {formatPokemonName(mon.name)}
              </span>
              <span className="text-slate-400 text-[10px]">{mon.cost} pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-5 flex items-center justify-between">
        <div className="flex gap-4">
          <div>
            <div className="text-white text-sm font-bold">{totalCost}</div>
            <div className="text-slate-500 text-[10px]">Points Spent</div>
          </div>
          {budgetRemaining !== undefined && (
            <div>
              <div className="text-white text-sm font-bold">{budgetRemaining}</div>
              <div className="text-slate-500 text-[10px]">Remaining</div>
            </div>
          )}
          <div>
            <div className="text-white text-sm font-bold">{pokemon.length}</div>
            <div className="text-slate-500 text-[10px]">Pokemon</div>
          </div>
        </div>
        <div className="text-slate-600 text-[10px]">pokemondraftleague.com</div>
      </div>
    </div>
  )
})
ShareableRecapCard.displayName = 'ShareableRecapCard'
