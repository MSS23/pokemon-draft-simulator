'use client'

/**
 * OnTheClockHero — broadcast-style "ON THE CLOCK" panel.
 *
 * Visual hierarchy:
 *  - Eyebrow: ROUND N · PICK M / TOTAL
 *  - Marquee: team-color-flooded panel with team name + "ON THE CLOCK"
 *  - Big numeric clock (MM:SS) in tabular-nums, color-shifted by urgency
 *  - On-deck strip: next 3 teams in pick order
 *
 * Pure presentational; receives all timing from props (server-derived).
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getTeamColor } from '@/lib/team-colors'
import { Clock, ChevronRight, Pause } from 'lucide-react'

interface TeamShape {
  id: string
  name: string
  userName?: string
  draftOrder: number
  picks: string[]
}

interface OnTheClockHeroProps {
  teams: TeamShape[]
  currentTeamId: string
  userTeamId?: string | null
  currentTurn: number
  maxRounds: number
  timeRemaining: number
  timeLimit: number
  draftStatus: 'waiting' | 'drafting' | 'completed' | 'paused'
}

function formatClock(s: number): string {
  if (s <= 0) return '00:00'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

function computeSnakeOrder(totalTeams: number, maxRounds: number): number[] {
  const order: number[] = []
  for (let r = 0; r < maxRounds; r++) {
    if (r % 2 === 0) {
      for (let i = 1; i <= totalTeams; i++) order.push(i)
    } else {
      for (let i = totalTeams; i >= 1; i--) order.push(i)
    }
  }
  return order
}

export function OnTheClockHero({
  teams,
  currentTeamId,
  userTeamId,
  currentTurn,
  maxRounds,
  timeRemaining,
  timeLimit,
  draftStatus,
}: OnTheClockHeroProps) {
  const totalTeams = teams.length
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.draftOrder - b.draftOrder),
    [teams]
  )

  const draftOrderArr = useMemo(
    () => computeSnakeOrder(totalTeams, Math.max(maxRounds, 1)),
    [totalTeams, maxRounds]
  )

  const currentTeam = useMemo(
    () => teams.find(t => t.id === currentTeamId) ?? null,
    [teams, currentTeamId]
  )

  const onDeck = useMemo(() => {
    if (totalTeams === 0) return []
    const out: { team: TeamShape; pick: number }[] = []
    for (let i = 1; i <= 3; i++) {
      const turn = currentTurn + i
      if (turn > draftOrderArr.length) break
      const order = draftOrderArr[turn - 1]
      const t = sortedTeams.find(x => x.draftOrder === order)
      if (t) out.push({ team: t, pick: turn })
    }
    return out
  }, [currentTurn, draftOrderArr, sortedTeams, totalTeams])

  const totalPicks = draftOrderArr.length
  const round = totalTeams > 0 ? Math.floor((currentTurn - 1) / totalTeams) + 1 : 1
  const pickInRound = totalTeams > 0 ? ((currentTurn - 1) % totalTeams) + 1 : 1

  const teamColor = currentTeam ? getTeamColor(currentTeam) : getTeamColor({ draftOrder: 1 })
  const isUserTurn = !!userTeamId && currentTeamId === userTeamId
  const isPaused = draftStatus === 'paused'
  const isUntimed = timeLimit <= 0

  // urgency for clock color
  const pct = timeLimit > 0 ? timeRemaining / timeLimit : 1
  const clockTone =
    isUntimed
      ? 'text-white'
      : timeRemaining <= 5
      ? 'text-red-400'
      : timeRemaining <= 10
      ? 'text-orange-300'
      : timeRemaining <= 30 || pct < 0.4
      ? 'text-amber-300'
      : 'text-white'

  if (draftStatus !== 'drafting' && draftStatus !== 'paused') return null

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border-2 shadow-2xl"
      style={{
        borderColor: `rgb(${teamColor.rgb} / 0.7)`,
        background: `linear-gradient(115deg, ${teamColor.gradient} 0%, #0b1220 55%, #050816 100%)`,
      }}
      role="status"
      aria-live="polite"
      aria-label={`${currentTeam?.name ?? 'Team'} is on the clock${isPaused ? ' — paused' : ''}`}
    >
      {/* shimmer / scanline accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background:
            'repeating-linear-gradient(135deg, transparent 0 12px, rgba(255,255,255,0.04) 12px 13px)',
        }}
      />

      {/* paused overlay */}
      {isPaused && (
        <div className="pointer-events-none absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 text-white border border-white/20 text-sm font-bold tracking-wide uppercase">
            <Pause className="h-4 w-4" /> Draft Paused
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-col gap-3 px-5 py-4 sm:px-7 sm:py-5">
        {/* Eyebrow */}
        <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-white/70 font-semibold">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-2 w-2 rounded-full animate-pulse"
              style={{ background: teamColor.accent }}
            />
            <span>Round {round}</span>
            <span className="text-white/30">/</span>
            <span>Pick {pickInRound} of {totalTeams}</span>
            <span className="text-white/30 hidden sm:inline">·</span>
            <span className="hidden sm:inline">Overall {currentTurn} / {totalPicks}</span>
          </div>
          <div className="text-white/50 hidden sm:block">
            {isUserTurn ? 'You are on the clock' : 'Live Broadcast'}
          </div>
        </div>

        {/* Main row: team brand + clock */}
        <div className="flex items-center justify-between gap-4 sm:gap-6">
          <div className="min-w-0 flex items-center gap-3 sm:gap-4">
            <div
              className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-xl text-2xl sm:text-3xl font-black shadow-lg"
              style={{
                background: teamColor.base,
                color: teamColor.fg,
                boxShadow: `0 0 30px rgb(${teamColor.rgb} / 0.45)`,
              }}
              aria-hidden="true"
            >
              {currentTeam?.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-white/70 font-bold">
                {isUserTurn ? 'You — On the Clock' : 'On the Clock'}
              </div>
              <div className="text-2xl sm:text-4xl font-black tracking-tight text-white truncate">
                {currentTeam?.name ?? '—'}
              </div>
              {currentTeam?.userName && (
                <div className="text-xs sm:text-sm text-white/60 truncate">
                  {currentTeam.userName}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0">
            <div className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-white/70 font-bold flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Clock</span>
            </div>
            <div
              className={cn(
                'font-mono tabular-nums font-black leading-none transition-colors',
                isUntimed ? 'text-2xl sm:text-4xl' : 'text-4xl sm:text-6xl',
                clockTone,
                !isUntimed && timeRemaining > 0 && timeRemaining <= 10 && !isPaused && 'animate-pulse'
              )}
              style={{
                textShadow: `0 0 24px rgb(${teamColor.rgb} / 0.55)`,
              }}
            >
              {isUntimed ? 'NO LIMIT' : formatClock(timeRemaining)}
            </div>
          </div>
        </div>

        {/* On-deck strip */}
        {onDeck.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-white/10 -mx-1 px-1 scrollbar-thin">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-bold shrink-0 pl-1">
              On Deck
            </span>
            {onDeck.map(({ team, pick }, idx) => {
              const c = getTeamColor(team)
              const isUser = !!userTeamId && team.id === userTeamId
              return (
                <div key={team.id} className="flex items-center shrink-0">
                  {idx > 0 && <ChevronRight className="h-3 w-3 text-white/30 mx-1" />}
                  <div
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold border',
                      isUser ? 'ring-2 ring-white/40' : ''
                    )}
                    style={{
                      background: `rgb(${c.rgb} / 0.18)`,
                      borderColor: `rgb(${c.rgb} / 0.5)`,
                      color: '#fff',
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: c.base }}
                      aria-hidden="true"
                    />
                    <span className="truncate max-w-[120px]">{team.name}</span>
                    <span className="font-mono text-white/60">#{pick}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default OnTheClockHero
