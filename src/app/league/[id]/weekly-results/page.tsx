'use client'

/**
 * Weekly Results Grid — the marquee league view from the source spreadsheet.
 *
 * Layout: rows = teams (ordered by draft_order), cols = weeks. Each cell shows:
 *   W/L · +/- · Pokémon-level K/D drilldown (expandable)
 *
 * Data sources:
 *   - matches table for W/L + raw home/away score
 *   - match_pokemon_kos for per-Pokémon K/D within each match (Milestone A schema)
 *
 * Read-only; full league spectator-friendly.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { LeagueService } from '@/lib/league-service'
import { LoadingScreen } from '@/components/ui/loading-states'
import { supabase } from '@/lib/supabase'
import { getTeamColor } from '@/lib/team-colors'
import { getPokemonSpriteUrl } from '@/utils/pokemon'
import { cn } from '@/lib/utils'
import type { League, Match, Team, Pick } from '@/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('WeeklyResultsPage')

interface KOEventRow {
  id: string
  match_id: string
  scorer_pick_id: string | null
  scorer_team_id: string | null
  pick_id: string
  team_id: string | null
  pokemon_name: string | null
  pokemon_id: string
}

interface WeekCell {
  matchId: string
  isHome: boolean
  oppTeamId: string
  result: 'W' | 'L' | 'D' | null
  scoreFor: number
  scoreAgainst: number
  diff: number
  // Per-pokemon for THIS team in THIS match: kills, deaths
  perPokemon: Map<string, { kills: number; deaths: number; pokemonId: string; name: string }>
}

export default function WeeklyResultsPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [matches, setMatches] = useState<(Match & { homeTeam: Team; awayTeam: Team })[]>([])
  const [koEvents, setKoEvents] = useState<KOEventRow[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const leagueData = await LeagueService.getLeague(leagueId)
        if (!leagueData) { router.push('/dashboard'); return }
        if (!mounted) return
        setLeague(leagueData)

        if (!supabase) throw new Error('Supabase not available')

        // Pull matches with team joins
        const { data: rawMatches } = await supabase
          .from('matches')
          .select(`
            *,
            home_team:teams!matches_home_team_id_fkey(*),
            away_team:teams!matches_away_team_id_fkey(*)
          `)
          .eq('league_id', leagueId)
          .order('week_number', { ascending: true })

        if (!mounted) return
        if (rawMatches) {
          type MatchWithTeams = Match & {
            home_team: Team
            away_team: Team
            week_number: number
            home_score: number | null
            away_score: number | null
          }
          setMatches(
            (rawMatches as unknown as MatchWithTeams[]).map(m => ({
              id: m.id,
              leagueId: leagueId,
              weekNumber: m.week_number,
              matchNumber: 1,
              homeTeamId: (m.home_team as Team).id,
              awayTeamId: (m.away_team as Team).id,
              scheduledDate: m.scheduledDate ?? null,
              status: m.status,
              homeScore: m.home_score ?? 0,
              awayScore: m.away_score ?? 0,
              winnerTeamId: m.winnerTeamId ?? null,
              battleFormat: m.battleFormat ?? 'best_of_3',
              notes: m.notes ?? null,
              createdAt: m.createdAt,
              updatedAt: m.updatedAt,
              completedAt: m.completedAt ?? null,
              homeTeam: m.home_team as Team,
              awayTeam: m.away_team as Team,
            }))
          )
        }

        // Pull all KO events for this league's matches
        const matchIds = (rawMatches ?? []).map(m => m.id)
        if (matchIds.length > 0) {
          const { data: koData } = await supabase
            .from('match_pokemon_kos')
            .select('id, match_id, scorer_pick_id, scorer_team_id, pick_id, team_id, pokemon_name, pokemon_id')
            .in('match_id', matchIds)
          if (mounted && koData) setKoEvents(koData as unknown as KOEventRow[])
        }

        // Picks for all teams in the league
        const teamIds = leagueData.teams.map(t => t.id)
        if (teamIds.length > 0) {
          const { data: pickRows } = await supabase
            .from('picks')
            .select('*')
            .in('team_id', teamIds)
          if (mounted && pickRows) {
            setPicks(pickRows.map(p => ({
              id: p.id,
              draftId: p.draft_id,
              teamId: p.team_id,
              pokemonId: p.pokemon_id,
              pokemonName: p.pokemon_name,
              cost: p.cost ?? 0,
              pickOrder: p.pick_order ?? 0,
              round: p.round ?? 1,
              createdAt: p.created_at,
            })))
          }
        }
      } catch (e) {
        log.error('Load failed:', e)
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load weekly results')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void load()
    return () => { mounted = false }
  }, [leagueId, router])

  // Sort teams by draft order (or division+draft order)
  const teamsSorted = useMemo(() => {
    if (!league) return []
    return [...league.teams].sort((a, b) => {
      const da = a.divisionName ?? ''
      const db = b.divisionName ?? ''
      if (da !== db) return da.localeCompare(db)
      return (a.draftOrder ?? 0) - (b.draftOrder ?? 0)
    })
  }, [league])

  const weekNumbers = useMemo(() => {
    const set = new Set<number>()
    matches.forEach(m => set.add(m.weekNumber))
    return Array.from(set).sort((a, b) => a - b)
  }, [matches])

  // Build pickId → pick map for quick lookup
  const pickMap = useMemo(() => {
    const m = new Map<string, Pick>()
    picks.forEach(p => m.set(p.id, p))
    return m
  }, [picks])

  // Per-team per-week cell. teamId → weekNumber → WeekCell
  const teamWeekGrid = useMemo(() => {
    const grid = new Map<string, Map<number, WeekCell>>()
    teamsSorted.forEach(t => grid.set(t.id, new Map()))

    for (const m of matches) {
      const isCompleted = m.status === 'completed'
      const homeWin = isCompleted && m.homeScore > m.awayScore
      const awayWin = isCompleted && m.awayScore > m.homeScore
      const draw    = isCompleted && m.homeScore === m.awayScore

      const homeCell: WeekCell = {
        matchId: m.id,
        isHome: true,
        oppTeamId: m.awayTeamId,
        result: !isCompleted ? null : homeWin ? 'W' : awayWin ? 'L' : 'D',
        scoreFor: m.homeScore ?? 0,
        scoreAgainst: m.awayScore ?? 0,
        diff: (m.homeScore ?? 0) - (m.awayScore ?? 0),
        perPokemon: new Map(),
      }
      const awayCell: WeekCell = {
        matchId: m.id,
        isHome: false,
        oppTeamId: m.homeTeamId,
        result: !isCompleted ? null : awayWin ? 'W' : homeWin ? 'L' : draw ? 'D' : null,
        scoreFor: m.awayScore ?? 0,
        scoreAgainst: m.homeScore ?? 0,
        diff: (m.awayScore ?? 0) - (m.homeScore ?? 0),
        perPokemon: new Map(),
      }

      // Aggregate KOs for this match
      const matchKos = koEvents.filter(e => e.match_id === m.id)
      for (const ko of matchKos) {
        // Scorer side gets a kill on their pokemon
        if (ko.scorer_pick_id && ko.scorer_team_id) {
          const cell = ko.scorer_team_id === m.homeTeamId ? homeCell : awayCell
          const pick = pickMap.get(ko.scorer_pick_id)
          const key = ko.scorer_pick_id
          const existing = cell.perPokemon.get(key) ?? {
            kills: 0,
            deaths: 0,
            pokemonId: pick?.pokemonId ?? '',
            name: pick?.pokemonName ?? '—',
          }
          existing.kills += 1
          cell.perPokemon.set(key, existing)
        }
        // Victim side gets a death on their pokemon
        if (ko.team_id) {
          const cell = ko.team_id === m.homeTeamId ? homeCell : awayCell
          const pick = pickMap.get(ko.pick_id)
          const key = ko.pick_id
          const existing = cell.perPokemon.get(key) ?? {
            kills: 0,
            deaths: 0,
            pokemonId: pick?.pokemonId ?? ko.pokemon_id,
            name: pick?.pokemonName ?? ko.pokemon_name ?? '—',
          }
          existing.deaths += 1
          cell.perPokemon.set(key, existing)
        }
      }

      grid.get(m.homeTeamId)?.set(m.weekNumber, homeCell)
      grid.get(m.awayTeamId)?.set(m.weekNumber, awayCell)
    }
    return grid
  }, [teamsSorted, matches, koEvents, pickMap])

  // Team running totals (for the row footer)
  const teamTotals = useMemo(() => {
    const totals = new Map<string, { w: number; l: number; d: number; pf: number; pa: number; diff: number }>()
    for (const team of teamsSorted) {
      let w = 0, l = 0, d = 0, pf = 0, pa = 0
      const cells = teamWeekGrid.get(team.id)
      if (cells) {
        for (const cell of cells.values()) {
          if (cell.result === 'W') w++
          else if (cell.result === 'L') l++
          else if (cell.result === 'D') d++
          pf += cell.scoreFor
          pa += cell.scoreAgainst
        }
      }
      totals.set(team.id, { w, l, d, pf, pa, diff: pf - pa })
    }
    return totals
  }, [teamsSorted, teamWeekGrid])

  if (isLoading) return <LoadingScreen title="Loading weekly results..." description="Aggregating KO logs across the season." />
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => router.push(`/league/${leagueId}`)}>Back to league</Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (!league) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-[1600px]">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`/league/${leagueId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold truncate">Weekly Results</h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {league.name} · {weekNumbers.length} {weekNumbers.length === 1 ? 'week' : 'weeks'} · click a row to expand Pokémon-level breakdown
            </p>
          </div>
        </div>

        {weekNumbers.length === 0 ? (
          <Card className="mt-6">
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No weeks scheduled yet.
              <br />
              The commissioner can generate the schedule from the league admin page.
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="sticky left-0 z-10 bg-muted/80 backdrop-blur-sm px-3 py-2 text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold border-r border-border min-w-[200px]">
                      Team
                    </th>
                    {weekNumbers.map(w => (
                      <th
                        key={w}
                        className="px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold whitespace-nowrap border-l border-border min-w-[100px]"
                      >
                        Week {w}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold whitespace-nowrap border-l border-border bg-muted/60 sticky right-0">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teamsSorted.map(team => {
                    const c = getTeamColor(team)
                    const totals = teamTotals.get(team.id) ?? { w: 0, l: 0, d: 0, pf: 0, pa: 0, diff: 0 }
                    const cells: Map<number, WeekCell> = teamWeekGrid.get(team.id) ?? new Map<number, WeekCell>()
                    const isExpanded = expandedTeam === team.id
                    return (
                      <>
                        <tr key={team.id} className="border-t border-border hover:bg-muted/20">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 px-3 py-2 text-left whitespace-nowrap border-r border-border backdrop-blur-sm cursor-pointer"
                            style={{
                              background: `linear-gradient(90deg, rgb(${c.rgb} / 0.18) 0%, rgb(${c.rgb} / 0.04) 100%)`,
                              boxShadow: `inset 4px 0 0 0 ${c.base}`,
                            }}
                            onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                          >
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-90')}
                                aria-hidden="true"
                              />
                              <span
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-black"
                                style={{ background: c.base, color: c.fg }}
                              >
                                {team.abbreviation || team.draftOrder}
                              </span>
                              <span className="font-semibold truncate max-w-[140px]">
                                {team.name}
                              </span>
                            </div>
                          </th>
                          {weekNumbers.map(w => {
                            const cell = cells.get(w)
                            return (
                              <td
                                key={w}
                                className={cn(
                                  'border-l border-border align-middle px-2 py-1 text-center',
                                  cell?.result === 'W' && 'bg-emerald-500/10',
                                  cell?.result === 'L' && 'bg-red-500/10',
                                  cell?.result === 'D' && 'bg-yellow-500/10',
                                )}
                              >
                                {cell ? (
                                  <button
                                    type="button"
                                    onClick={() => router.push(`/league/${leagueId}/matchup/${cell.matchId}`)}
                                    className="block w-full hover:underline"
                                  >
                                    <div className="font-bold text-xs">
                                      {cell.result ?? '—'}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground tabular-nums">
                                      {cell.scoreFor}-{cell.scoreAgainst}
                                    </div>
                                    <div
                                      className={cn(
                                        'text-[10px] tabular-nums font-semibold',
                                        cell.diff > 0 && 'text-emerald-600 dark:text-emerald-400',
                                        cell.diff < 0 && 'text-red-600 dark:text-red-400',
                                      )}
                                    >
                                      {cell.diff > 0 ? '+' : ''}{cell.diff}
                                    </div>
                                  </button>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                            )
                          })}
                          <td className="border-l border-border bg-muted/40 px-2 py-1 text-center sticky right-0">
                            <div className="font-bold text-xs tabular-nums">
                              {totals.w}-{totals.l}{totals.d > 0 ? `-${totals.d}` : ''}
                            </div>
                            <div
                              className={cn(
                                'text-[10px] tabular-nums font-semibold',
                                totals.diff > 0 && 'text-emerald-600 dark:text-emerald-400',
                                totals.diff < 0 && 'text-red-600 dark:text-red-400',
                              )}
                            >
                              {totals.diff > 0 ? '+' : ''}{totals.diff}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-t border-border/40 bg-muted/20">
                            <td className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold border-r border-border">
                              Pokémon
                            </td>
                            {weekNumbers.map(w => {
                              const cell = cells.get(w)
                              const monsList = cell ? Array.from(cell.perPokemon.values()) : []
                              return (
                                <td key={w} className="border-l border-border align-top px-1.5 py-2">
                                  {monsList.length === 0 ? (
                                    <span className="text-[10px] text-muted-foreground/50">—</span>
                                  ) : (
                                    <ul className="space-y-1">
                                      {monsList.map((mon, i) => (
                                        <li key={i} className="flex items-center gap-1 text-[10px]">
                                          {mon.pokemonId && (
                                            <Image
                                              src={getPokemonSpriteUrl(mon.pokemonId)}
                                              alt={mon.name}
                                              width={20}
                                              height={20}
                                              unoptimized
                                              className="h-5 w-5 object-contain shrink-0"
                                            />
                                          )}
                                          <span className="truncate capitalize" title={mon.name}>
                                            {mon.name}
                                          </span>
                                          <span className="ml-auto tabular-nums shrink-0">
                                            <span className="text-emerald-600 dark:text-emerald-400">{mon.kills}</span>
                                            <span className="text-muted-foreground">/</span>
                                            <span className="text-red-600 dark:text-red-400">{mon.deaths}</span>
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </td>
                              )
                            })}
                            <td className="border-l border-border bg-muted/40 sticky right-0 px-2 py-2 text-[10px] text-muted-foreground">
                              <div>K: <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{totals.pf}</span></div>
                              <div>D: <span className="text-red-600 dark:text-red-400 tabular-nums">{totals.pa}</span></div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border bg-muted/30 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className="text-[9px] bg-emerald-500/15 border-emerald-500/30">W</Badge>
                <Badge variant="outline" className="text-[9px] bg-red-500/15 border-red-500/30">L</Badge>
                <Badge variant="outline" className="text-[9px] bg-yellow-500/15 border-yellow-500/30">D</Badge>
              </div>
              <span>Click a cell to view the matchup · click a team to expand the per-Pokémon log</span>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
