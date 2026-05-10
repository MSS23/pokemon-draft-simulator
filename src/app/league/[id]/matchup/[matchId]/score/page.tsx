'use client'

/**
 * Interactive match scoring — log KO events as they happen.
 *
 * Flow:
 *  1. User taps a Pokémon they own → that Pokémon is "the scorer".
 *  2. User taps an opponent Pokémon → KO event recorded (scorer → victim).
 *  3. Live tally updates from match_pokemon_kos (Supabase realtime).
 *  4. Either team owner clicks "Submit Final Score" → tallied counts are
 *     written via LeagueService.submitMatchResult (dual-confirmation flow).
 *
 * No raw score entry. The KO log is the source of truth.
 */

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Crosshair, Undo2, Check, Trophy, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LeagueService } from '@/lib/league-service'
import { MatchKOService } from '@/lib/match-ko-service'
import { UserSessionService } from '@/lib/user-session'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingScreen } from '@/components/ui/loading-states'
import { notify } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { getPokemonSpriteUrl } from '@/utils/pokemon'
import { getTeamColor } from '@/lib/team-colors'
import type { League, Match, Team, Pick } from '@/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('MatchScorePage')

interface KOEvent {
  id: string
  scorerPickId: string | null
  scorerTeamId: string | null
  victimPickId: string
  victimTeamId: string | null
  victimPokemonId: string
  victimPokemonName: string | null
  turnNumber: number | null
  recordedBy: string | null
  createdAt: string
}

export default function MatchScorePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const leagueId = params.id as string
  const matchId = params.matchId as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [match, setMatch] = useState<(Match & { homeTeam: Team; awayTeam: Team }) | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [events, setEvents] = useState<KOEvent[]>([])
  const [activeScorerPickId, setActiveScorerPickId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isCommissioner, setIsCommissioner] = useState(false)

  // Load
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        let userId = user?.id
        if (!userId) {
          try {
            const session = await UserSessionService.getOrCreateSession()
            userId = session.userId
          } catch { /* guest */ }
        }
        if (mounted) setCurrentUserId(userId ?? null)

        if (userId) {
          LeagueService.isLeagueCommissioner(leagueId, userId)
            .then(v => mounted && setIsCommissioner(v))
            .catch(() => {})
        }

        const leagueData = await LeagueService.getLeague(leagueId)
        if (!leagueData) { router.push('/dashboard'); return }
        if (mounted) setLeague(leagueData)

        if (!supabase) throw new Error('Supabase not available')

        const { data: m, error: mErr } = await supabase
          .from('matches')
          .select('*')
          .eq('id', matchId)
          .single()
        if (mErr || !m) { router.push(`/league/${leagueId}`); return }

        const home = leagueData.teams.find(t => t.id === m.home_team_id)
        const away = leagueData.teams.find(t => t.id === m.away_team_id)
        if (!home || !away) { router.push(`/league/${leagueId}`); return }

        if (mounted) {
          setMatch({
            id: m.id,
            leagueId: m.league_id,
            weekNumber: m.week_number,
            matchNumber: m.match_number || 1,
            homeTeamId: m.home_team_id,
            awayTeamId: m.away_team_id,
            scheduledDate: m.scheduled_date,
            status: m.status as Match['status'],
            homeScore: m.home_score || 0,
            awayScore: m.away_score || 0,
            winnerTeamId: m.winner_team_id,
            battleFormat: m.battle_format || 'best_of_3',
            notes: m.notes,
            createdAt: m.created_at,
            updatedAt: m.updated_at,
            completedAt: m.completed_at,
            homeTeam: home,
            awayTeam: away,
          })
        }

        const { data: pickRows } = await supabase
          .from('picks')
          .select('*')
          .in('team_id', [home.id, away.id])
          .order('pick_order', { ascending: true })

        const allPicks: Pick[] = (pickRows ?? []).map(p => ({
          id: p.id,
          draftId: p.draft_id,
          teamId: p.team_id,
          pokemonId: p.pokemon_id,
          pokemonName: p.pokemon_name,
          cost: p.cost || 0,
          pickOrder: p.pick_order || 0,
          round: p.round || 1,
          createdAt: p.created_at,
        }))
        if (mounted) setPicks(allPicks)

        const ev = await MatchKOService.listMatchKOEvents(matchId)
        if (mounted) setEvents(ev)
      } catch (e) {
        log.error('Load failed:', e)
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load match')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [leagueId, matchId, router, user?.id])

  // Realtime subscription to KO events for this match
  useEffect(() => {
    if (!supabase || !matchId) return
    const channel = supabase
      // private: true — gated by realtime.messages RLS (migration 029):
      // league team owners + commissioner only.
      .channel(`match-kos:${matchId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_pokemon_kos', filter: `match_id=eq.${matchId}` },
        async () => {
          try {
            const ev = await MatchKOService.listMatchKOEvents(matchId)
            setEvents(ev)
          } catch (e) { log.warn('Refresh failed:', e) }
        }
      )
      .subscribe()
    return () => { void supabase!.removeChannel(channel) }
  }, [matchId])

  const homePicks = useMemo(
    () => match ? picks.filter(p => p.teamId === match.homeTeamId) : [],
    [picks, match]
  )
  const awayPicks = useMemo(
    () => match ? picks.filter(p => p.teamId === match.awayTeamId) : [],
    [picks, match]
  )

  const score = useMemo(() => {
    if (!match) return { home: 0, away: 0 }
    let home = 0, away = 0
    for (const ev of events) {
      if (ev.scorerTeamId === match.homeTeamId) home++
      else if (ev.scorerTeamId === match.awayTeamId) away++
    }
    return { home, away }
  }, [events, match])

  const userTeamId = useMemo(() => {
    if (!currentUserId || !match) return null
    if (match.homeTeam.ownerId === currentUserId) return match.homeTeamId
    if (match.awayTeam.ownerId === currentUserId) return match.awayTeamId
    return null
  }, [currentUserId, match])

  const canEdit = !!userTeamId || isCommissioner

  // KO logging: pick-then-pick. The scorer's team must be the user's team
  // (or commissioner — they can log either side).
  async function handlePickClick(pick: Pick) {
    if (!match || !canEdit) return
    if (match.status === 'completed') {
      notify.warning('Match completed', 'Reopen via commissioner override to edit')
      return
    }

    // No active scorer yet → set this pick as scorer (must be on user's team)
    if (!activeScorerPickId) {
      const isMyTeam = pick.teamId === userTeamId
      if (!isMyTeam && !isCommissioner) {
        notify.warning('Pick a Pokémon on your team first', 'Tap one of your Pokémon to set the scorer')
        return
      }
      setActiveScorerPickId(pick.id)
      return
    }

    // Tapping the same scorer cancels selection
    if (activeScorerPickId === pick.id) {
      setActiveScorerPickId(null)
      return
    }

    const scorer = picks.find(p => p.id === activeScorerPickId)
    if (!scorer) { setActiveScorerPickId(null); return }

    // Victim must be opposite team
    if (scorer.teamId === pick.teamId) {
      notify.warning('Same team', 'Tap an opponent Pokémon as the victim')
      return
    }

    try {
      await MatchKOService.recordScoredKO({
        matchId,
        scorerPickId: scorer.id,
        scorerTeamId: scorer.teamId,
        victimPickId: pick.id,
        victimTeamId: pick.teamId,
        recordedBy: currentUserId,
      })
      // Optimistically refresh — realtime will reconcile too
      const ev = await MatchKOService.listMatchKOEvents(matchId)
      setEvents(ev)
      setActiveScorerPickId(null)
    } catch (e) {
      log.error('Record KO failed:', e)
      notify.error('Failed to record KO', e instanceof Error ? e.message : 'Try again')
    }
  }

  async function handleUndo(eventId: string) {
    try {
      await MatchKOService.deleteScoredKO(eventId)
      const ev = await MatchKOService.listMatchKOEvents(matchId)
      setEvents(ev)
    } catch (e) {
      notify.error('Undo failed', e instanceof Error ? e.message : 'Try again')
    }
  }

  async function handleSubmitFinal() {
    if (!match || !userTeamId) return
    setSubmitting(true)
    try {
      const winnerId =
        score.home > score.away ? match.homeTeamId :
        score.away > score.home ? match.awayTeamId :
        null

      const res = await LeagueService.submitMatchResult(matchId, userTeamId, {
        homeScore: score.home,
        awayScore: score.away,
        winnerTeamId: winnerId,
      })

      if (res.status === 'confirmed') {
        notify.success('Match confirmed!', 'Both teams agree — standings updated')
        router.push(`/league/${leagueId}/matchup/${matchId}`)
      } else if (res.status === 'pending') {
        notify.success('Submitted', 'Waiting for opponent to confirm the score')
      } else {
        notify.warning('Disputed', 'Scores conflict — commissioner will resolve')
      }
    } catch (e) {
      notify.error('Submit failed', e instanceof Error ? e.message : 'Try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return <LoadingScreen title="Loading match..." description="Preparing the scoring board" />
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <h2 className="font-semibold">Couldn&apos;t load match</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => router.push(`/league/${leagueId}`)}>Back to league</Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (!match || !league) return null

  const homeColor = getTeamColor({ id: match.homeTeamId })
  const awayColor = getTeamColor({ id: match.awayTeamId })
  const myKOs = events.filter(e => e.scorerTeamId === userTeamId).length
  const oppKOs = events.length - myKOs - events.filter(e => e.scorerTeamId === null).length

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => router.push(`/league/${leagueId}/matchup/${matchId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold truncate">Live Score · Week {match.weekNumber}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {league.name} · Tap a Pokémon on your team, then the opponent it KO&apos;d
            </p>
          </div>
        </div>

        {/* Live score banner */}
        <Card
          className="mb-4 overflow-hidden border-2"
          style={{ borderColor: `rgb(${homeColor.rgb} / 0.4)` }}
        >
          <CardContent className="p-4 sm:p-5">
            <div className="grid grid-cols-3 items-center gap-3">
              <div className="text-center min-w-0">
                <div
                  className="inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider"
                  style={{ background: `rgb(${homeColor.rgb} / 0.15)`, color: homeColor.base }}
                >
                  Home
                </div>
                <div className="font-bold text-sm sm:text-base mt-1 truncate">{match.homeTeam.name}</div>
                <div
                  className="font-mono font-black text-4xl sm:text-6xl tabular-nums"
                  style={{ color: homeColor.base }}
                >
                  {score.home}
                </div>
              </div>
              <div className="text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">
                <div>KOs</div>
                <Trophy className="h-5 w-5 mx-auto my-1 opacity-60" />
                <div className="text-[10px]">Live</div>
              </div>
              <div className="text-center min-w-0">
                <div
                  className="inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider"
                  style={{ background: `rgb(${awayColor.rgb} / 0.15)`, color: awayColor.base }}
                >
                  Away
                </div>
                <div className="font-bold text-sm sm:text-base mt-1 truncate">{match.awayTeam.name}</div>
                <div
                  className="font-mono font-black text-4xl sm:text-6xl tabular-nums"
                  style={{ color: awayColor.base }}
                >
                  {score.away}
                </div>
              </div>
            </div>

            {match.status === 'completed' ? (
              <div className="mt-3 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Match Completed
              </div>
            ) : canEdit ? (
              <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-end">
                {activeScorerPickId && (
                  <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md border bg-muted/40">
                    <Crosshair className="h-3.5 w-3.5 text-primary animate-pulse" />
                    <span className="truncate">
                      Now tap the opponent Pokémon they KO&apos;d
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setActiveScorerPickId(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={handleSubmitFinal}
                  disabled={submitting || events.length === 0}
                  className="font-bold"
                >
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Submit Final Score
                </Button>
              </div>
            ) : (
              <div className="mt-3 text-center text-xs text-muted-foreground">
                Spectator view — scores update live
              </div>
            )}
          </CardContent>
        </Card>

        {/* Roster columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <RosterColumn
            label="Home"
            team={match.homeTeam}
            picks={homePicks}
            color={homeColor}
            events={events}
            activeScorerPickId={activeScorerPickId}
            onPickClick={handlePickClick}
            disabled={!canEdit || match.status === 'completed'}
          />
          <RosterColumn
            label="Away"
            team={match.awayTeam}
            picks={awayPicks}
            color={awayColor}
            events={events}
            activeScorerPickId={activeScorerPickId}
            onPickClick={handlePickClick}
            disabled={!canEdit || match.status === 'completed'}
          />
        </div>

        {/* KO log */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-foreground/80">KO Log</h3>
              <span className="text-xs text-muted-foreground">
                {events.length} {events.length === 1 ? 'event' : 'events'}
                {canEdit && userTeamId && (
                  <> · You: {myKOs} · Opponent: {oppKOs}</>
                )}
              </span>
            </div>
            {events.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No KOs yet. Tap a Pokémon on your team to start.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {events.map((ev, idx) => {
                  const scorer = picks.find(p => p.id === ev.scorerPickId)
                  const victim = picks.find(p => p.id === ev.victimPickId)
                  const scorerColor = ev.scorerTeamId
                    ? getTeamColor({ id: ev.scorerTeamId })
                    : getTeamColor({ id: 'unknown' })
                  const canUndo = canEdit && (ev.recordedBy === currentUserId || isCommissioner)
                  return (
                    <li
                      key={ev.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border/60 bg-background hover:bg-muted/30"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground w-6 shrink-0">
                        {idx + 1}.
                      </span>
                      {scorer && (
                        <Image
                          src={getPokemonSpriteUrl(scorer.pokemonId)}
                          alt={scorer.pokemonName}
                          width={28}
                          height={28}
                          unoptimized
                          className="h-7 w-7 object-contain shrink-0"
                        />
                      )}
                      <span
                        className="font-semibold text-sm capitalize truncate"
                        style={{ color: scorerColor.base }}
                      >
                        {scorer?.pokemonName ?? '—'}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">KO&apos;d</span>
                      {victim && (
                        <Image
                          src={getPokemonSpriteUrl(victim.pokemonId)}
                          alt={victim.pokemonName}
                          width={28}
                          height={28}
                          unoptimized
                          className="h-7 w-7 object-contain shrink-0"
                        />
                      )}
                      <span className="font-semibold text-sm capitalize truncate flex-1">
                        {victim?.pokemonName ?? ev.victimPokemonName ?? '—'}
                      </span>
                      {canUndo && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleUndo(ev.id)}
                          aria-label="Undo this KO"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RosterColumn({
  label, team, picks, color, events, activeScorerPickId, onPickClick, disabled,
}: {
  label: string
  team: Team
  picks: Pick[]
  color: ReturnType<typeof getTeamColor>
  events: KOEvent[]
  activeScorerPickId: string | null
  onPickClick: (p: Pick) => void
  disabled: boolean
}) {
  // KOs scored by each pick (offense) and times each pick was KO'd (defense)
  const offense = useMemo(() => {
    const m = new Map<string, number>()
    events.forEach(e => {
      if (e.scorerPickId) m.set(e.scorerPickId, (m.get(e.scorerPickId) ?? 0) + 1)
    })
    return m
  }, [events])
  const defense = useMemo(() => {
    const m = new Map<string, number>()
    events.forEach(e => m.set(e.victimPickId, (m.get(e.victimPickId) ?? 0) + 1))
    return m
  }, [events])

  return (
    <div
      className="rounded-xl border-2 p-3"
      style={{
        borderColor: `rgb(${color.rgb} / 0.35)`,
        background: `linear-gradient(180deg, rgb(${color.rgb} / 0.05) 0%, transparent 100%)`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-bold" style={{ color: color.base }}>
            {label}
          </div>
          <div className="font-bold text-sm truncate">{team.name}</div>
        </div>
        <Badge variant="outline" className="text-[10px]" style={{ borderColor: color.base, color: color.base }}>
          {picks.length} mons
        </Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {picks.map(p => {
          const scored = offense.get(p.id) ?? 0
          const fainted = defense.get(p.id) ?? 0
          const isActive = activeScorerPickId === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPickClick(p)}
              disabled={disabled}
              className={cn(
                'group relative flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-2 transition-all',
                'min-h-[88px] cursor-pointer text-left',
                'disabled:cursor-not-allowed disabled:opacity-60',
                isActive
                  ? 'border-primary bg-primary/10 ring-2 ring-primary shadow-md scale-[1.03]'
                  : 'border-border/70 hover:border-border hover:bg-muted/40 active:scale-[0.98]'
              )}
              aria-label={`${p.pokemonName}, ${scored} KOs scored, ${fainted} times fainted`}
              aria-pressed={isActive}
            >
              <Image
                src={getPokemonSpriteUrl(p.pokemonId)}
                alt={p.pokemonName}
                width={56}
                height={56}
                unoptimized
                className="h-12 w-12 object-contain"
              />
              <div className="text-[11px] font-semibold capitalize text-center leading-tight line-clamp-1 w-full">
                {p.pokemonName}
              </div>
              <div className="flex items-center gap-1.5">
                {scored > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `rgb(${color.rgb} / 0.2)`, color: color.base }}
                    title={`${scored} KOs scored`}
                  >
                    {scored} KO
                  </span>
                )}
                {fainted > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400"
                    title={`Fainted ${fainted} times`}
                  >
                    -{fainted}
                  </span>
                )}
              </div>
              {isActive && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                  <Crosshair className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
