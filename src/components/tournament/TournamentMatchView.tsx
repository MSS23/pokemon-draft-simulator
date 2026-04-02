'use client'

/**
 * Tournament Match View — Professional OTS (Open Team Sheet) display
 *
 * Shows the opponent's team with animated GIFs, moves, items, abilities,
 * and tera types in a broadcast-quality layout. Includes result recording.
 */

import { useState, useCallback, useMemo, memo } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, toShowdownName } from '@/utils/pokemon'
import { notify } from '@/lib/notifications'
import { LeagueService } from '@/lib/league-service'
import { createLogger } from '@/lib/logger'
import {
  Swords, Trophy, X, Check, Loader2, Shield,
} from 'lucide-react'
import type { TeamSheet, TeamSheetPokemon } from '@/lib/teamsheet-service'
import type { Match, Team } from '@/types'

const log = createLogger('TournamentMatchView')

// Type color system — vibrant, saturated for the broadcast aesthetic
const TYPE_ACCENT: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  Normal:   { bg: 'bg-stone-400/20',   text: 'text-stone-300',   border: 'border-stone-400/40',   glow: 'shadow-stone-400/20' },
  Fire:     { bg: 'bg-orange-500/20',   text: 'text-orange-400',  border: 'border-orange-500/40',  glow: 'shadow-orange-500/20' },
  Water:    { bg: 'bg-blue-500/20',     text: 'text-blue-400',    border: 'border-blue-500/40',    glow: 'shadow-blue-500/20' },
  Electric: { bg: 'bg-yellow-400/20',   text: 'text-yellow-300',  border: 'border-yellow-400/40',  glow: 'shadow-yellow-400/20' },
  Grass:    { bg: 'bg-green-500/20',    text: 'text-green-400',   border: 'border-green-500/40',   glow: 'shadow-green-500/20' },
  Ice:      { bg: 'bg-cyan-400/20',     text: 'text-cyan-300',    border: 'border-cyan-400/40',    glow: 'shadow-cyan-400/20' },
  Fighting: { bg: 'bg-red-600/20',      text: 'text-red-400',     border: 'border-red-600/40',     glow: 'shadow-red-600/20' },
  Poison:   { bg: 'bg-purple-500/20',   text: 'text-purple-400',  border: 'border-purple-500/40',  glow: 'shadow-purple-500/20' },
  Ground:   { bg: 'bg-amber-600/20',    text: 'text-amber-400',   border: 'border-amber-600/40',   glow: 'shadow-amber-600/20' },
  Flying:   { bg: 'bg-indigo-400/20',   text: 'text-indigo-300',  border: 'border-indigo-400/40',  glow: 'shadow-indigo-400/20' },
  Psychic:  { bg: 'bg-pink-500/20',     text: 'text-pink-400',    border: 'border-pink-500/40',    glow: 'shadow-pink-500/20' },
  Bug:      { bg: 'bg-lime-500/20',     text: 'text-lime-400',    border: 'border-lime-500/40',    glow: 'shadow-lime-500/20' },
  Rock:     { bg: 'bg-amber-700/20',    text: 'text-amber-500',   border: 'border-amber-700/40',   glow: 'shadow-amber-700/20' },
  Ghost:    { bg: 'bg-violet-600/20',   text: 'text-violet-400',  border: 'border-violet-600/40',  glow: 'shadow-violet-600/20' },
  Dragon:   { bg: 'bg-indigo-600/20',   text: 'text-indigo-400',  border: 'border-indigo-600/40',  glow: 'shadow-indigo-600/20' },
  Dark:     { bg: 'bg-zinc-600/20',     text: 'text-zinc-400',    border: 'border-zinc-600/40',    glow: 'shadow-zinc-600/20' },
  Steel:    { bg: 'bg-slate-400/20',    text: 'text-slate-300',   border: 'border-slate-400/40',   glow: 'shadow-slate-400/20' },
  Fairy:    { bg: 'bg-pink-400/20',     text: 'text-pink-300',    border: 'border-pink-400/40',    glow: 'shadow-pink-400/20' },
  Stellar:  { bg: 'bg-fuchsia-500/20',  text: 'text-fuchsia-300', border: 'border-fuchsia-500/40', glow: 'shadow-fuchsia-500/20' },
}

const getTypeStyle = (teraType: string) => TYPE_ACCENT[teraType] || TYPE_ACCENT.Normal

// Tera gem SVG icon inline
function TeraGem({ type, className = '' }: { type: string; className?: string }) {
  const style = getTypeStyle(type)
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 ${style.text}`} fill="currentColor">
        <path d="M8 1L14.5 6L12 15H4L1.5 6L8 1Z" />
      </svg>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${style.text}`}>{type}</span>
    </span>
  )
}

/** Single Pokemon OTS card — broadcast style */
const OTSPokemonCard = memo(function OTSPokemonCard({
  mon,
  index,
}: {
  mon: TeamSheetPokemon
  index: number
}) {
  const teraStyle = mon.teraType ? getTypeStyle(mon.teraType) : null
  const showdownName = toShowdownName(mon.name)

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-sm transition-all duration-300 hover:border-white/[0.12] hover:from-white/[0.06] hover:to-white/[0.02]"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Subtle tera-colored top accent line */}
      {teraStyle && (
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${teraStyle.bg} opacity-60`} />
      )}

      <div className="flex items-stretch gap-0">
        {/* GIF Section */}
        <div className="relative w-[100px] sm:w-[120px] shrink-0 flex items-center justify-center py-3 px-2 bg-gradient-to-br from-white/[0.03] to-transparent">
          {/* Slot number */}
          <span className="absolute top-1.5 left-2 text-[10px] font-mono text-white/20 font-bold">
            {index + 1}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPokemonAnimatedUrl(String(0), mon.name)}
            alt={mon.name}
            className="w-[72px] h-[72px] sm:w-[80px] sm:h-[80px] object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.08)] transition-transform duration-300 group-hover:scale-110"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              if (!target.dataset.fallback) {
                target.dataset.fallback = '1'
                target.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${showdownName}.gif`
              } else if (target.dataset.fallback === '1') {
                target.dataset.fallback = '2'
                target.src = `https://play.pokemonshowdown.com/sprites/gen5ani/${showdownName}.gif`
              }
            }}
            loading="lazy"
          />
        </div>

        {/* Info Section */}
        <div className="flex-1 min-w-0 py-2.5 pr-3 pl-1 flex flex-col justify-center gap-1.5">
          {/* Name + Item row */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm sm:text-[15px] font-bold text-white/95 tracking-tight leading-none">
              {mon.name}
            </h3>
            {mon.item && (
              <span className="text-[10px] sm:text-[11px] text-amber-400/80 font-medium flex items-center gap-0.5">
                <span className="text-amber-400/50">@</span> {mon.item}
              </span>
            )}
          </div>

          {/* Ability + Tera row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-white/50 font-medium">
              <Shield className="w-2.5 h-2.5 inline mr-0.5 opacity-50" />
              {mon.ability}
            </span>
            {mon.teraType && <TeraGem type={mon.teraType} />}
          </div>

          {/* Moves — 2x2 grid */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-0.5">
            {mon.moves.filter(m => m.trim()).map((move, mi) => (
              <div
                key={mi}
                className="flex items-center gap-1 text-[11px] text-white/70 leading-tight"
              >
                <span className="w-1 h-1 rounded-full bg-white/25 shrink-0" />
                <span className="truncate">{move}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})

interface TournamentMatchViewProps {
  isOpen: boolean
  onClose: () => void
  match: Match & { homeTeam: Team; awayTeam: Team }
  opponentSheet: TeamSheet
  opponentName: string
  yourName: string
  yourSheet?: TeamSheet | null
  canRecordResult: boolean
  currentUserTeamId?: string | null
  onResultRecorded: () => void
}

export const TournamentMatchView = memo(function TournamentMatchView({
  isOpen,
  onClose,
  match,
  opponentSheet,
  opponentName,
  yourName,
  yourSheet,
  canRecordResult,
  currentUserTeamId,
  onResultRecorded,
}: TournamentMatchViewProps) {
  const [resultStep, setResultStep] = useState<'view' | 'record'>('view')
  const [games, setGames] = useState<{ game: number; winner: string | null }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const battleFormat = match.battleFormat || 'best_of_3'
  const maxGames = battleFormat === 'best_of_1' ? 1 : battleFormat === 'best_of_3' ? 3 : 5
  const winsNeeded = Math.ceil(maxGames / 2)

  // Count wins per team in current game recording
  const homeWins = useMemo(() => games.filter(g => g.winner === match.homeTeamId).length, [games, match.homeTeamId])
  const awayWins = useMemo(() => games.filter(g => g.winner === match.awayTeamId).length, [games, match.awayTeamId])
  const seriesOver = homeWins >= winsNeeded || awayWins >= winsNeeded

  const handleGameResult = useCallback((gameNum: number, winnerId: string) => {
    setGames(prev => {
      const updated = prev.filter(g => g.game !== gameNum)
      updated.push({ game: gameNum, winner: winnerId })
      return updated.sort((a, b) => a.game - b.game)
    })
  }, [])

  const handleSubmitResult = useCallback(async () => {
    if (!seriesOver || !currentUserTeamId) return

    setIsSubmitting(true)
    try {
      const finalHomeScore = homeWins
      const finalAwayScore = awayWins
      const winnerId = homeWins > awayWins ? match.homeTeamId : match.awayTeamId

      await LeagueService.submitMatchResult(
        match.id,
        currentUserTeamId,
        { homeScore: finalHomeScore, awayScore: finalAwayScore, winnerTeamId: winnerId }
      )
      notify.success('Result Submitted', 'Waiting for opponent confirmation')
      onResultRecorded()
      onClose()
    } catch (err) {
      log.error('Failed to submit result:', err)
      notify.error('Failed', err instanceof Error ? err.message : 'Could not submit result')
    } finally {
      setIsSubmitting(false)
    }
  }, [seriesOver, currentUserTeamId, homeWins, awayWins, match, onResultRecorded, onClose])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] p-0 gap-0 border-border bg-card overflow-hidden max-h-[95vh]">
        {/* ──── Header Bar ──── */}
        <div className="relative px-4 sm:px-5 py-3 border-b border-white/[0.06] bg-gradient-to-r from-white/[0.02] to-transparent">
          {/* Decorative line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <Swords className="w-4 h-4 text-red-400/80" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
                  Match
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-white/90 truncate">{yourName}</span>
                  <span className="text-white/30 text-xs font-mono">vs</span>
                  <span className="font-semibold text-white/90 truncate">{opponentName}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant="outline"
                className="text-[9px] font-mono border-white/10 text-white/40 uppercase"
              >
                {battleFormat.replace(/_/g, ' ')}
              </Badge>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ──── Scrollable Content ──── */}
        <div className="overflow-y-auto max-h-[calc(95vh-56px)]">
          {/* ──── Opponent's Team Sheet ──── */}
          <div className="px-4 sm:px-5 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-[2px] bg-red-500/50 rounded-full" />
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-white/50">
                {opponentName}&apos;s Team
              </h2>
              <div className="flex-1 h-[1px] bg-white/[0.04]" />
              <span className="text-[10px] text-white/25 font-mono">{opponentSheet.length} Pokemon</span>
            </div>

            <div className="grid gap-2">
              {opponentSheet.map((mon, i) => (
                <OTSPokemonCard key={`${mon.name}-${i}`} mon={mon} index={i} />
              ))}
            </div>
          </div>

          {/* ──── Your Team (collapsed) ──── */}
          {yourSheet && yourSheet.length > 0 && (
            <div className="px-4 sm:px-5 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-[2px] bg-blue-500/50 rounded-full" />
                <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-white/50">
                  Your Team
                </h2>
                <div className="flex-1 h-[1px] bg-white/[0.04]" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {yourSheet.map((mon, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getPokemonAnimatedUrl('0', mon.name)}
                      alt={mon.name}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        if (!target.dataset.fallback) {
                          target.dataset.fallback = '1'
                          target.src = getPokemonAnimatedBackupUrl('0')
                        }
                      }}
                      loading="lazy"
                    />
                    <span className="text-[11px] text-white/60 font-medium">{mon.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ──── Result Recording Section ──── */}
          {canRecordResult && match.status !== 'completed' && (
            <div className="border-t border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
              {resultStep === 'view' ? (
                /* Record Result CTA */
                <div className="px-4 sm:px-5 py-4">
                  <Button
                    onClick={() => setResultStep('record')}
                    className="w-full h-11 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold text-sm border-0 shadow-lg shadow-red-900/30 transition-all duration-200"
                  >
                    <Swords className="w-4 h-4 mr-2" />
                    Record Match Result
                  </Button>
                </div>
              ) : (
                /* Game-by-game recording */
                <div className="px-4 sm:px-5 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-white/50">
                      Record Games
                    </h3>
                    <button
                      onClick={() => { setResultStep('view'); setGames([]) }}
                      className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Score display */}
                  <div className="flex items-center justify-center gap-6 py-2">
                    <div className="text-center">
                      <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider mb-1">{match.homeTeam.name}</p>
                      <span className={`text-3xl font-black tabular-nums ${homeWins > awayWins && seriesOver ? 'text-green-400' : 'text-white/80'}`}>
                        {homeWins}
                      </span>
                    </div>
                    <span className="text-white/20 text-lg font-light">—</span>
                    <div className="text-center">
                      <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider mb-1">{match.awayTeam.name}</p>
                      <span className={`text-3xl font-black tabular-nums ${awayWins > homeWins && seriesOver ? 'text-green-400' : 'text-white/80'}`}>
                        {awayWins}
                      </span>
                    </div>
                  </div>

                  {/* Individual games */}
                  <div className="space-y-2">
                    {Array.from({ length: maxGames }, (_, i) => i + 1).map(gameNum => {
                      const gameResult = games.find(g => g.game === gameNum)
                      const previousGamesComplete = gameNum === 1 || games.some(g => g.game === gameNum - 1)
                      const seriesAlreadyWon = (() => {
                        const priorGames = games.filter(g => g.game < gameNum)
                        const priorHome = priorGames.filter(g => g.winner === match.homeTeamId).length
                        const priorAway = priorGames.filter(g => g.winner === match.awayTeamId).length
                        return priorHome >= winsNeeded || priorAway >= winsNeeded
                      })()
                      const isDisabled = !previousGamesComplete || seriesAlreadyWon

                      return (
                        <div
                          key={gameNum}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200 ${
                            isDisabled
                              ? 'border-white/[0.03] bg-white/[0.01] opacity-40'
                              : gameResult
                                ? 'border-white/[0.08] bg-white/[0.03]'
                                : 'border-white/[0.06] bg-white/[0.02]'
                          }`}
                        >
                          <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider w-14 shrink-0">
                            Game {gameNum}
                          </span>

                          <div className="flex-1 flex items-center justify-center gap-2">
                            <button
                              disabled={isDisabled}
                              onClick={() => handleGameResult(gameNum, match.homeTeamId)}
                              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
                                gameResult?.winner === match.homeTeamId
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                  : isDisabled
                                    ? 'text-white/20'
                                    : 'text-white/50 hover:bg-white/[0.06] hover:text-white/70 border border-transparent'
                              }`}
                            >
                              {match.homeTeam.name}
                              {gameResult?.winner === match.homeTeamId && (
                                <Check className="w-3 h-3 inline ml-1" />
                              )}
                            </button>

                            <button
                              disabled={isDisabled}
                              onClick={() => handleGameResult(gameNum, match.awayTeamId)}
                              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
                                gameResult?.winner === match.awayTeamId
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                  : isDisabled
                                    ? 'text-white/20'
                                    : 'text-white/50 hover:bg-white/[0.06] hover:text-white/70 border border-transparent'
                              }`}
                            >
                              {match.awayTeam.name}
                              {gameResult?.winner === match.awayTeamId && (
                                <Check className="w-3 h-3 inline ml-1" />
                              )}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Submit */}
                  {seriesOver && (
                    <Button
                      onClick={handleSubmitResult}
                      disabled={isSubmitting}
                      className="w-full h-11 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold text-sm border-0 shadow-lg shadow-green-900/30"
                    >
                      {isSubmitting ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                      ) : (
                        <>
                          <Trophy className="w-4 h-4 mr-2" />
                          Submit Result ({homeWins} - {awayWins})
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ──── Completed match result ──── */}
          {match.status === 'completed' && (
            <div className="border-t border-white/[0.06] px-4 sm:px-5 py-4">
              <div className="flex items-center justify-center gap-6 py-2">
                <div className="text-center">
                  <p className={`text-xs font-semibold ${match.winnerTeamId === match.homeTeamId ? 'text-green-400' : 'text-white/40'}`}>
                    {match.homeTeam.name}
                  </p>
                  <span className={`text-2xl font-black tabular-nums ${match.winnerTeamId === match.homeTeamId ? 'text-green-400' : 'text-white/30'}`}>
                    {match.homeScore}
                  </span>
                </div>
                <Trophy className={`w-5 h-5 ${match.winnerTeamId ? 'text-yellow-400' : 'text-white/20'}`} />
                <div className="text-center">
                  <p className={`text-xs font-semibold ${match.winnerTeamId === match.awayTeamId ? 'text-green-400' : 'text-white/40'}`}>
                    {match.awayTeam.name}
                  </p>
                  <span className={`text-2xl font-black tabular-nums ${match.winnerTeamId === match.awayTeamId ? 'text-green-400' : 'text-white/30'}`}>
                    {match.awayScore}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
})
