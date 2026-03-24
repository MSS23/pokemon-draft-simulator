'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, formatPokemonName } from '@/utils/pokemon'
import { TEAM_COLORS, buildTeamColorMap } from '@/utils/team-colors'

interface RecapPick {
  id: string
  team_id: string
  team_name: string
  user_name: string
  pokemon_id: string
  pokemon_name: string
  cost: number
  pick_order: number
  round: number
}

interface DraftRecapAnimationProps {
  picks: RecapPick[]
  teams: Array<{ id: string; name: string; draftOrder: number }>
  draftName: string
  onClose: () => void
}

export function DraftRecapAnimation({ picks, teams, draftName, onClose }: DraftRecapAnimationProps) {
  const [phase, setPhase] = useState<'intro' | 'picks' | 'outro'>('intro')
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [showPick, setShowPick] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sortedPicks = [...picks].sort((a, b) => a.pick_order - b.pick_order)
  const teamColorMap = buildTeamColorMap(
    teams.sort((a, b) => a.draftOrder - b.draftOrder).map(t => t.id)
  )

  const currentPick = currentIdx >= 0 && currentIdx < sortedPicks.length
    ? sortedPicks[currentIdx]
    : null

  // Animation sequence - intro phase
  useEffect(() => {
    if (phase === 'intro') {
      timerRef.current = setTimeout(() => {
        setPhase('picks')
        setCurrentIdx(0)
      }, 2000)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase])

  // Animation sequence - picks phase
  useEffect(() => {
    if (phase !== 'picks' || currentIdx < 0) return

    if (currentIdx >= sortedPicks.length) {
      setPhase('outro')
      return
    }

    // Show pick with animation
    setShowPick(false)
    timerRef.current = setTimeout(() => {
      setShowPick(true)
      // Move to next after delay
      timerRef.current = setTimeout(() => {
        setCurrentIdx(prev => prev + 1)
      }, 1800)
    }, 200)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase, currentIdx, sortedPicks.length])

  // Handle escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const colors = currentPick ? teamColorMap.get(currentPick.team_id) : null

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center overflow-hidden">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 text-white/60 hover:text-white transition-colors"
        aria-label="Close recap animation"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Background pulse */}
      {currentPick && (
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-500',
            showPick ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            background: `radial-gradient(circle at center, ${colors?.hex || '#dc2855'}15 0%, transparent 70%)`
          }}
        />
      )}

      {/* Intro */}
      {phase === 'intro' && (
        <div className="text-center animate-in fade-in zoom-in duration-700">
          <div className="text-white/40 text-sm uppercase tracking-[0.3em] mb-4">Draft Recap</div>
          <h1 className="text-white text-4xl sm:text-6xl font-bold">{draftName}</h1>
          <div className="text-white/50 text-sm mt-4">
            {sortedPicks.length} picks &middot; {teams.length} teams
          </div>
        </div>
      )}

      {/* Pick reveal */}
      {phase === 'picks' && currentPick && (
        <div className="text-center relative">
          {/* Pick number */}
          <div className={cn(
            'text-white/30 text-sm uppercase tracking-wider mb-6 transition-all duration-300',
            showPick ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            Pick #{currentPick.pick_order} &middot; Round {currentPick.round}
          </div>

          {/* Pokemon image */}
          <div className={cn(
            'transition-all duration-500 ease-out',
            showPick ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
          )}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getPokemonAnimatedUrl(currentPick.pokemon_id, currentPick.pokemon_name)}
              alt={currentPick.pokemon_name}
              className="w-40 h-40 sm:w-56 sm:h-56 mx-auto drop-shadow-[0_0_40px_rgba(255,255,255,0.15)]"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                if (!target.dataset.fallback) {
                  target.dataset.fallback = '1'
                  target.src = getPokemonAnimatedBackupUrl(currentPick.pokemon_id)
                }
              }}
            />
          </div>

          {/* Pokemon name */}
          <div className={cn(
            'mt-6 transition-all duration-500 delay-200',
            showPick ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          )}>
            <h2 className="text-white text-3xl sm:text-5xl font-bold">
              {formatPokemonName(currentPick.pokemon_name)}
            </h2>
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="text-lg" style={{ color: colors?.hex || '#dc2855' }}>
                {currentPick.team_name}
              </span>
              <Badge className="text-sm px-3 py-0.5">{currentPick.cost} pts</Badge>
            </div>
            <div className="text-white/40 text-sm mt-1">
              {currentPick.user_name}
            </div>
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-[-60px] left-1/2 -translate-x-1/2 w-48">
            <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/40 rounded-full transition-all duration-300"
                style={{ width: `${((currentIdx + 1) / sortedPicks.length) * 100}%` }}
              />
            </div>
            <div className="text-white/30 text-[10px] mt-1 text-center">
              {currentIdx + 1} / {sortedPicks.length}
            </div>
          </div>
        </div>
      )}

      {/* Outro */}
      {phase === 'outro' && (
        <div className="text-center animate-in fade-in zoom-in duration-700">
          <div className="text-white/40 text-sm uppercase tracking-[0.3em] mb-4">Draft Complete</div>
          <h1 className="text-white text-3xl sm:text-5xl font-bold mb-8">{draftName}</h1>
          <div className="flex flex-wrap justify-center gap-4 mb-8 max-w-xl">
            {teams.sort((a, b) => a.draftOrder - b.draftOrder).map(team => {
              const teamPicks = sortedPicks.filter(p => p.team_id === team.id)
              const c = teamColorMap.get(team.id) || TEAM_COLORS[0]
              return (
                <div key={team.id} className="text-center">
                  <div className="text-sm font-semibold" style={{ color: c.hex }}>
                    {team.name}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {teamPicks.map(p => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.id}
                        src={getPokemonAnimatedUrl(p.pokemon_id, p.pokemon_name)}
                        alt={p.pokemon_name}
                        className="w-8 h-8"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          if (!target.dataset.fallback) {
                            target.dataset.fallback = '1'
                            target.src = getPokemonAnimatedBackupUrl(p.pokemon_id)
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <Button onClick={onClose} variant="outline" className="text-white border-white/20 hover:bg-white/10">
            Close
          </Button>
        </div>
      )}
    </div>
  )
}
