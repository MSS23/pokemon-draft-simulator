'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import type { DraftState } from '@/lib/draft-service'
import { useDraftStateWithRealtime } from '@/hooks/useDraftRealtime'
import { getTeamColor, type TeamColorSet } from '@/utils/team-colors'
import { getBestPokemonImageUrl, formatPokemonName } from '@/utils/pokemon'
import { getTimerColor } from '@/lib/draft-animations'
import { cn } from '@/lib/utils'
import { createLogger } from '@/lib/logger'
import type { DraftEvent } from '@/lib/draft-realtime'

const _log = createLogger('BroadcastView')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHexParam(value: string | null): string | null {
  if (!value) return null
  const cleaned = value.replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `#${cleaned}`
  return null
}

/** Derive current team from snake draft turn order */
function getCurrentTeamFromTurn(
  currentTurn: number,
  teamCount: number,
  teams: DraftState['teams']
): DraftState['teams'][number] | null {
  if (!teams.length || teamCount === 0) return null
  const turn0 = currentTurn - 1
  const round = Math.floor(turn0 / teamCount)
  const isEvenRound = round % 2 === 0
  const posInRound = turn0 % teamCount
  const teamIndex = isEvenRound ? posInRound : teamCount - 1 - posInRound
  const order = teamIndex + 1
  return teams.find((t) => t.draft_order === order) ?? teams[teamIndex] ?? null
}

/** Build a 2D grid: columns = teams (sorted by draft_order), rows = pick slots */
function buildDraftGrid(
  draftState: DraftState,
  maxRounds: number
): { teamId: string; pokemonId: string | null }[][] {
  const sorted = [...draftState.teams].sort(
    (a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0)
  )

  const grid: { teamId: string; pokemonId: string | null }[][] = []

  for (let row = 0; row < maxRounds; row++) {
    const rowCells: { teamId: string; pokemonId: string | null }[] = []
    for (const team of sorted) {
      const teamPicks = draftState.picks
        .filter((p) => p.team_id === team.id)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      const pick = teamPicks[row]
      rowCells.push({
        teamId: team.id,
        pokemonId: pick ? pick.pokemon_id : null,
      })
    }
    grid.push(rowCells)
  }
  return grid
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PokemonSprite({
  pokemonId,
  pokemonName,
  size = 64,
}: {
  pokemonId: string
  pokemonName?: string
  size?: number
}) {
  const [errored, setErrored] = useState(false)
  const imgUrl = getBestPokemonImageUrl(pokemonId, pokemonName)

  if (errored) {
    return (
      <div
        className="rounded-full bg-white/10 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-white/40">?</span>
      </div>
    )
  }

  return (
    <img
      src={imgUrl}
      alt={pokemonName ?? `Pokemon #${pokemonId}`}
      width={size}
      height={size}
      className="object-contain drop-shadow-lg"
      style={{ imageRendering: 'pixelated' }}
      onError={() => setErrored(true)}
    />
  )
}

function PickCell({
  pokemonId,
  isCurrentPick,
  teamColor,
  accentColor,
}: {
  pokemonId: string | null
  isCurrentPick: boolean
  teamColor: TeamColorSet
  accentColor: string | null
}) {
  if (!pokemonId) {
    return (
      <div
        className={cn(
          'flex items-center justify-center h-full min-h-[88px]',
          'border border-dashed rounded-lg',
          isCurrentPick ? 'border-white/40' : 'border-white/10'
        )}
        style={
          isCurrentPick
            ? {
                borderColor: accentColor ?? teamColor.hex,
                boxShadow: `0 0 12px 2px ${accentColor ?? teamColor.hex}44`,
              }
            : undefined
        }
      >
        {isCurrentPick && (
          <motion.div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: accentColor ?? teamColor.hex }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="flex flex-col items-center justify-center gap-1 min-h-[88px]"
    >
      <PokemonSprite pokemonId={pokemonId} size={64} />
      <span
        className="text-[11px] font-semibold leading-tight text-center truncate max-w-[80px]"
        style={{
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          color: '#fff',
        }}
      >
        {formatPokemonName(pokemonId)}
      </span>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main Broadcast Page
// ---------------------------------------------------------------------------

export default function BroadcastPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const roomCode = (params.id as string)?.toLowerCase()

  // Query param customization
  const bgColor = parseHexParam(searchParams.get('bg')) ?? '#0f0f1a'
  const accentColor = parseHexParam(searchParams.get('accent'))
  const useTeamColors = searchParams.get('teamColors') !== 'false'
  const theme = searchParams.get('theme') ?? 'dark'

  const isDark = theme === 'dark'

  // Spectator ID for presence
  const spectatorId = useMemo(() => {
    if (typeof window === 'undefined') return null
    let id = sessionStorage.getItem('broadcast-spectator-id')
    if (!id) {
      id = `broadcast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      sessionStorage.setItem('broadcast-spectator-id', id)
    }
    return id
  }, [])

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Track recently picked cell for highlight
  const [_recentPickKey, setRecentPickKey] = useState<string | null>(null)

  const isValidRoomCode =
    roomCode && roomCode.length === 6 && !/[^a-z0-9]/.test(roomCode)

  const handlePickEvent = useCallback((event: DraftEvent) => {
    const data = event.data
    const teamId = data.team_id as string
    const pickNum = data.pick_number as number | undefined
    if (teamId) {
      setRecentPickKey(`${teamId}-${pickNum ?? Date.now()}`)
      setTimeout(() => setRecentPickKey(null), 2000)
    }
  }, [])

  const {
    draftState,
    isLoading,
    loadError,
    connectionStatus: _connectionStatus,
  } = useDraftStateWithRealtime(isValidRoomCode ? roomCode : null, spectatorId, {
    enabled: !!isValidRoomCode,
    onPickEvent: handlePickEvent,
  })

  // Timer countdown based on turn_started_at
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)

    if (!draftState?.draft || draftState.draft.status !== 'active') {
      setTimerSeconds(0)
      return
    }

    const timeLimit = (draftState.draft.settings as { timeLimit?: number })?.timeLimit ?? 0
    if (timeLimit <= 0) {
      setTimerSeconds(0)
      return
    }

    const turnStartedAt = draftState.draft.turn_started_at
    if (!turnStartedAt) {
      setTimerSeconds(timeLimit)
      return
    }

    const calcRemaining = () => {
      const elapsed = (Date.now() - new Date(turnStartedAt).getTime()) / 1000
      return Math.max(0, Math.round(timeLimit - elapsed))
    }

    setTimerSeconds(calcRemaining())
    timerRef.current = setInterval(() => {
      setTimerSeconds(calcRemaining())
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- we intentionally depend on specific draft fields, not the whole object
  }, [draftState?.draft?.turn_started_at, draftState?.draft?.status, draftState?.draft?.settings])

  // -----------------------------------------------------------------------
  // Render states
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ backgroundColor: bgColor }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-white/20 border-t-white/80 rounded-full"
        />
      </div>
    )
  }

  if (loadError || !draftState) {
    return (
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ backgroundColor: bgColor }}
      >
        <p
          className="text-lg font-semibold"
          style={{
            color: isDark ? '#fff' : '#111',
            textShadow: isDark ? '0 1px 4px rgba(0,0,0,0.6)' : 'none',
          }}
        >
          {loadError?.message ?? 'Draft not found'}
        </p>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Draft data
  // -----------------------------------------------------------------------

  const sortedTeams = [...draftState.teams].sort(
    (a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0)
  )

  const maxRounds =
    (draftState.draft.settings as { maxPokemonPerTeam?: number })
      ?.maxPokemonPerTeam ?? 6

  const timeLimit =
    (draftState.draft.settings as { timeLimit?: number })?.timeLimit ?? 0

  const currentTurn = draftState.draft.current_turn ?? 1
  const currentTeam = getCurrentTeamFromTurn(
    currentTurn,
    draftState.teams.length,
    draftState.teams
  )

  const isActive = draftState.draft.status === 'active'
  const isCompleted = draftState.draft.status === 'completed'

  const grid = buildDraftGrid(draftState, maxRounds)

  const participantMap = new Map(
    draftState.participants.map((p) => [p.team_id, p.display_name])
  )

  // Timer display
  const timerMinutes = Math.floor(timerSeconds / 60)
  const timerSecs = timerSeconds % 60
  const timerDisplay = `${timerMinutes}:${timerSecs.toString().padStart(2, '0')}`
  const timerColor =
    timeLimit > 0 ? getTimerColor(timerSeconds, timeLimit) : '#22c55e'

  // Team color map
  const teamColorMap = new Map<string, TeamColorSet>()
  sortedTeams.forEach((team, idx) => {
    teamColorMap.set(team.id, getTeamColor(idx))
  })

  // Current pick tracking: which row/col is the "on the clock" cell
  let currentPickRow = -1
  let currentPickCol = -1
  if (isActive && currentTeam) {
    const colIdx = sortedTeams.findIndex((t) => t.id === currentTeam.id)
    const teamPicks = draftState.picks.filter(
      (p) => p.team_id === currentTeam.id
    )
    currentPickRow = teamPicks.length
    currentPickCol = colIdx
  }

  const textColor = isDark ? '#ffffff' : '#111111'
  const subtextColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'

  return (
    <div
      className="w-screen h-screen flex flex-col overflow-hidden select-none"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        fontFamily: 'var(--font-sora), system-ui, sans-serif',
      }}
    >
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 shrink-0"
        style={{
          height: 60,
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          background: isDark
            ? 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, transparent 100%)',
        }}
      >
        {/* Left: Draft title */}
        <div className="flex items-center gap-3 min-w-0">
          <h1
            className="text-lg font-bold truncate"
            style={{ textShadow: isDark ? '0 1px 3px rgba(0,0,0,0.5)' : 'none' }}
          >
            {draftState.draft.name || roomCode.toUpperCase()}
          </h1>
          {isCompleted && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'rgba(34,197,94,0.2)',
                color: '#22c55e',
              }}
            >
              COMPLETED
            </span>
          )}
          {draftState.draft.status === 'setup' && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'rgba(234,179,8,0.2)',
                color: '#eab308',
              }}
            >
              SETUP
            </span>
          )}
        </div>

        {/* Center: On the Clock */}
        {isActive && currentTeam && (
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium uppercase tracking-wider"
              style={{ color: subtextColor }}
            >
              On the Clock
            </span>
            <span
              className="text-base font-bold"
              style={{
                color: useTeamColors
                  ? teamColorMap.get(currentTeam.id)?.hex ?? textColor
                  : accentColor ?? textColor,
                textShadow: isDark ? '0 0 8px rgba(255,255,255,0.15)' : 'none',
              }}
            >
              {currentTeam.name}
            </span>
          </div>
        )}

        {/* Right: Timer */}
        {isActive && timeLimit > 0 && (
          <div className="flex items-center gap-2">
            <motion.span
              className="text-2xl font-bold tabular-nums"
              style={{ color: timerColor, textShadow: `0 0 10px ${timerColor}44` }}
              animate={
                timerSeconds <= 10 && timerSeconds > 0
                  ? { scale: [1, 1.05, 1] }
                  : {}
              }
              transition={
                timerSeconds <= 10 && timerSeconds > 0
                  ? { duration: 0.6, repeat: Infinity }
                  : {}
              }
            >
              {timerDisplay}
            </motion.span>
          </div>
        )}

        {/* Right fallback: no timer */}
        {(!isActive || timeLimit <= 0) && (
          <div className="w-20" />
        )}
      </div>

      {/* ── Draft Board ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 px-3 py-2">
        {/* Team Headers */}
        <div
          className="grid gap-2 shrink-0 mb-2"
          style={{
            gridTemplateColumns: `repeat(${sortedTeams.length}, minmax(0, 1fr))`,
          }}
        >
          {sortedTeams.map((team) => {
            const color = teamColorMap.get(team.id)!
            const isCurrent = isActive && currentTeam?.id === team.id
            const participant = participantMap.get(team.id)

            return (
              <motion.div
                key={team.id}
                className="rounded-lg px-3 py-2 text-center relative overflow-hidden"
                style={{
                  backgroundColor: useTeamColors
                    ? `${color.hex}18`
                    : isDark
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(0,0,0,0.03)',
                  borderBottom: `3px solid ${useTeamColors ? color.hex : (accentColor ?? 'rgba(255,255,255,0.1)')}`,
                  outlineColor: isCurrent ? (accentColor ?? color.hex) : 'transparent',
                  outlineWidth: isCurrent ? 2 : 0,
                  outlineStyle: isCurrent ? 'solid' : 'none',
                }}
                animate={
                  isCurrent
                    ? {
                        boxShadow: [
                          `0 0 0 0 ${color.hex}00`,
                          `0 0 16px 4px ${color.hex}40`,
                          `0 0 0 0 ${color.hex}00`,
                        ],
                      }
                    : {}
                }
                transition={
                  isCurrent
                    ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                    : {}
                }
              >
                <div
                  className="text-sm font-bold truncate"
                  style={{
                    color: useTeamColors ? color.hex : textColor,
                    textShadow: isDark ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                  }}
                >
                  {team.name}
                </div>
                <div
                  className="text-[10px] truncate mt-0.5"
                  style={{ color: subtextColor }}
                >
                  {participant ?? 'Unknown'} &middot; {team.budget_remaining}pts
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Grid Rows */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div
            className="grid gap-2 h-full auto-rows-fr"
            style={{
              gridTemplateColumns: `repeat(${sortedTeams.length}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${maxRounds}, minmax(0, 1fr))`,
            }}
          >
            <AnimatePresence mode="popLayout">
              {grid.map((row, rowIdx) =>
                row.map((cell, colIdx) => {
                  const isCurrentCell =
                    rowIdx === currentPickRow && colIdx === currentPickCol
                  const teamColor = teamColorMap.get(cell.teamId)!

                  return (
                    <div
                      key={`${rowIdx}-${colIdx}`}
                      className="relative"
                    >
                      <PickCell
                        pokemonId={cell.pokemonId}
                        isCurrentPick={isCurrentCell}
                        teamColor={teamColor}
                        accentColor={accentColor}
                      />
                    </div>
                  )
                })
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Hidden scrollbar style ────────────────────────────────── */}
      <style jsx global>{`
        html, body {
          overflow: hidden !important;
          margin: 0;
          padding: 0;
        }
        ::-webkit-scrollbar {
          display: none;
        }
        * {
          scrollbar-width: none;
        }
      `}</style>
    </div>
  )
}
