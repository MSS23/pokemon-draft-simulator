'use client'

/**
 * PickRevealOverlay — full-screen "WITH THE Nth PICK" announcement.
 *
 * Detects new picks by watching the team picks array length and surfaces
 * a 2.5-second broadcast-style reveal: pick number, team, Pokémon artwork,
 * team-color flood. Auto-dismisses; click to skip.
 *
 * Pure-presentational; no Zustand subscriptions.
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Pokemon } from '@/types'
import { getTeamColor } from '@/lib/team-colors'
import { getOfficialArtworkUrl, getPokemonSpriteUrl } from '@/utils/pokemon'
import { cn } from '@/lib/utils'

interface TeamShape {
  id: string
  name: string
  draftOrder: number
  picks: string[]
}

interface PickRevealOverlayProps {
  teams: TeamShape[]
  pokemon: Pokemon[]
  enabled: boolean
}

interface RevealEvent {
  key: string
  pickNumber: number
  teamId: string
  teamName: string
  teamDraftOrder: number
  pokemonId: string
  pokemonName: string
  cost?: number
}

const REVEAL_MS = 2600

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function PickRevealOverlay({ teams, pokemon, enabled }: PickRevealOverlayProps) {
  const [event, setEvent] = useState<RevealEvent | null>(null)
  const prevPickCountsRef = useRef<Map<string, number>>(new Map())
  const seenPicksRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)

  useEffect(() => {
    // First mount: capture baseline so we don't fire for every existing pick
    if (!initializedRef.current) {
      const baseline = new Map<string, number>()
      teams.forEach(t => {
        baseline.set(t.id, t.picks.length)
        t.picks.forEach((pid, idx) => seenPicksRef.current.add(`${t.id}:${idx}:${pid}`))
      })
      prevPickCountsRef.current = baseline
      initializedRef.current = true
      return
    }

    if (!enabled) return

    // Find the team whose pick count just increased
    let newest: RevealEvent | null = null
    let newestPickIndex = -1
    teams.forEach(team => {
      const prevCount = prevPickCountsRef.current.get(team.id) ?? 0
      if (team.picks.length > prevCount) {
        // Use the LAST new pick (multiple new picks possible after reconnect)
        const idx = team.picks.length - 1
        const pid = team.picks[idx]
        const key = `${team.id}:${idx}:${pid}`
        if (!seenPicksRef.current.has(key)) {
          seenPicksRef.current.add(key)
          // Total pick number = sum of all picks across teams up to here.
          // Use a stable estimate: total picks across all teams.
          const totalPicks = teams.reduce((s, t) => s + t.picks.length, 0)
          if (idx > newestPickIndex) {
            newestPickIndex = idx
            const p = pokemon.find(x => x.id === pid)
            newest = {
              key,
              pickNumber: totalPicks,
              teamId: team.id,
              teamName: team.name,
              teamDraftOrder: team.draftOrder,
              pokemonId: pid,
              pokemonName: p?.name ?? `#${pid}`,
              cost: p?.cost,
            }
          }
        }
      }
    })

    // Update baseline regardless
    teams.forEach(t => prevPickCountsRef.current.set(t.id, t.picks.length))

    if (newest) {
      setEvent(newest)
    }
  }, [teams, pokemon, enabled])

  // Auto-dismiss
  useEffect(() => {
    if (!event) return
    const t = setTimeout(() => setEvent(null), REVEAL_MS)
    return () => clearTimeout(t)
  }, [event])

  if (!event) return null

  const color = getTeamColor({ id: event.teamId, draftOrder: event.teamDraftOrder })
  const artwork = getOfficialArtworkUrl(event.pokemonId)
  const fallback = getPokemonSpriteUrl(event.pokemonId)

  return (
    <button
      type="button"
      aria-label="Dismiss pick announcement"
      onClick={() => setEvent(null)}
      className="fixed inset-0 z-[80] cursor-pointer animate-pickReveal"
      style={{
        background: `radial-gradient(ellipse at center, rgb(${color.rgb} / 0.55) 0%, rgba(2,6,23,0.92) 55%, rgba(2,6,23,0.98) 100%)`,
      }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pointer-events-none">
        {/* Eyebrow */}
        <div
          className="mb-3 sm:mb-4 px-4 py-1.5 rounded-full border-2 text-xs sm:text-sm font-black uppercase tracking-[0.28em] text-white animate-pickRevealStaggerIn"
          style={{
            borderColor: `rgb(${color.rgb})`,
            background: `rgb(${color.rgb} / 0.25)`,
            animationDelay: '0.05s',
          }}
        >
          With the {ordinal(event.pickNumber)} Pick
        </div>

        {/* Team name */}
        <div
          className="text-2xl sm:text-4xl font-black tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)] animate-pickRevealStaggerIn"
          style={{ animationDelay: '0.18s', color: color.accent }}
        >
          {event.teamName}
        </div>
        <div
          className="text-sm sm:text-lg uppercase tracking-[0.4em] text-white/80 mt-1 animate-pickRevealStaggerIn"
          style={{ animationDelay: '0.32s' }}
        >
          Selects
        </div>

        {/* Pokemon */}
        <div className="relative my-4 sm:my-6 animate-pickRevealStaggerIn" style={{ animationDelay: '0.5s' }}>
          <div
            className="absolute inset-0 -z-10 blur-3xl rounded-full"
            style={{ background: `rgb(${color.rgb} / 0.6)` }}
            aria-hidden="true"
          />
          <Image
            src={artwork}
            alt={event.pokemonName}
            width={280}
            height={280}
            unoptimized
            className="h-44 w-44 sm:h-72 sm:w-72 object-contain drop-shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement
              if (img.src !== fallback) img.src = fallback
            }}
            priority
          />
        </div>

        <div
          className="text-3xl sm:text-6xl font-black uppercase tracking-tight text-white text-center animate-pickRevealStaggerIn"
          style={{ animationDelay: '0.62s', textShadow: `0 0 40px rgb(${color.rgb} / 0.7)` }}
        >
          {event.pokemonName}
        </div>

        {typeof event.cost === 'number' && (
          <div
            className={cn(
              'mt-3 px-4 py-1.5 rounded-full text-sm sm:text-base font-bold border-2 text-white animate-pickRevealStaggerIn'
            )}
            style={{
              borderColor: color.base,
              background: `rgb(${color.rgb} / 0.3)`,
              animationDelay: '0.78s',
            }}
          >
            {event.cost} pts
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="absolute bottom-6 left-0 right-0 text-center text-xs text-white/40 uppercase tracking-[0.3em] animate-pickRevealStaggerIn" style={{ animationDelay: '1.2s' }}>
        Click to dismiss
      </div>
    </button>
  )
}

export default PickRevealOverlay
