'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LeagueService } from '@/lib/league-service'
import { LeagueStatsService } from '@/lib/league-stats-service'
import { MatchKOService } from '@/lib/match-ko-service'
import { MatchRecorderModal } from '@/components/league/MatchRecorderModal'
import { PokemonStatusBadge } from '@/components/league/PokemonStatusBadge'
import { LoadingScreen } from '@/components/ui/loading-states'
import { ArrowLeft, Trophy, Swords, TrendingUp, Shield, Zap } from 'lucide-react'
import type { League, Match, Team, Pick, TeamPokemonStatus } from '@/types'
import type { HeadToHeadRecord, TeamFormIndicator } from '@/lib/league-stats-service'
import { buildTeamColorMap, type TeamColorSet } from '@/utils/team-colors'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, TYPE_COLORS } from '@/utils/pokemon'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'
import { createLogger } from '@/lib/logger'

const log = createLogger('MatchupPreview')

// All 18 Pokemon types
const ALL_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
]

// Type effectiveness chart (attacking type -> defending type -> multiplier)
const TYPE_EFFECTIVENESS: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
}

function getTypeCoverage(picks: Pick[], pokemonTypes: Map<string, string[]>): Set<string> {
  const covered = new Set<string>()
  for (const pick of picks) {
    const types = pokemonTypes.get(pick.pokemonId) || []
    for (const atkType of types) {
      const chart = TYPE_EFFECTIVENESS[atkType] || {}
      for (const [defType, mult] of Object.entries(chart)) {
        if (mult >= 2) covered.add(defType)
      }
    }
  }
  return covered
}

export default function MatchupPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string
  const matchId = params.matchId as string
  const { user } = useAuth()

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [match, setMatch] = useState<(Match & { homeTeam: Team; awayTeam: Team }) | null>(null)
  const [homePicks, setHomePicks] = useState<Pick[]>([])
  const [awayPicks, setAwayPicks] = useState<Pick[]>([])
  const [homeStatuses, setHomeStatuses] = useState<TeamPokemonStatus[]>([])
  const [awayStatuses, setAwayStatuses] = useState<TeamPokemonStatus[]>([])
  const [h2h, setH2H] = useState<HeadToHeadRecord | null>(null)
  const [homeForm, setHomeForm] = useState<TeamFormIndicator | null>(null)
  const [awayForm, setAwayForm] = useState<TeamFormIndicator | null>(null)
  const [pokemonTypes, setPokemonTypes] = useState<Map<string, string[]>>(new Map())
  const [showRecorder, setShowRecorder] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        // Get current user
        let userId = user?.id
        if (!userId) {
          try {
            const session = await UserSessionService.getOrCreateSession()
            userId = session.userId
          } catch { /* guest */ }
        }
        setCurrentUserId(userId || null)

        // Load league
        const leagueData = await LeagueService.getLeague(leagueId)
        if (!leagueData) { router.push('/dashboard'); return }
        setLeague(leagueData)

        // Load match
        if (!supabase) throw new Error('Supabase not available')
        const { data: matchData, error: matchErr } = await supabase
          .from('matches')
          .select('*')
          .eq('id', matchId)
          .single()
        if (matchErr || !matchData) { router.push(`/league/${leagueId}`); return }

        const homeTeam = leagueData.teams.find(t => t.id === matchData.home_team_id)
        const awayTeam = leagueData.teams.find(t => t.id === matchData.away_team_id)
        if (!homeTeam || !awayTeam) { router.push(`/league/${leagueId}`); return }

        const fullMatch = {
          id: matchData.id,
          leagueId: matchData.league_id,
          weekNumber: matchData.week_number,
          matchNumber: matchData.match_number || 1,
          homeTeamId: matchData.home_team_id,
          awayTeamId: matchData.away_team_id,
          scheduledDate: matchData.scheduled_date,
          status: matchData.status as Match['status'],
          homeScore: matchData.home_score || 0,
          awayScore: matchData.away_score || 0,
          winnerTeamId: matchData.winner_team_id,
          battleFormat: matchData.battle_format || 'best_of_3',
          notes: matchData.notes,
          createdAt: matchData.created_at,
          updatedAt: matchData.updated_at,
          completedAt: matchData.completed_at,
          homeTeam,
          awayTeam,
        }
        setMatch(fullMatch)

        // Load picks for both teams
        const { data: picks } = await supabase
          .from('picks')
          .select('*')
          .in('team_id', [homeTeam.id, awayTeam.id])
          .order('pick_order', { ascending: true })

        const allPicks = (picks || []).map(p => ({
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

        setHomePicks(allPicks.filter(p => p.teamId === homeTeam.id))
        setAwayPicks(allPicks.filter(p => p.teamId === awayTeam.id))

        // Load pokemon statuses, H2H, forms in parallel
        const [homeStatusRes, awayStatusRes, h2hRes, homeFormRes, awayFormRes] = await Promise.all([
          MatchKOService.getTeamPokemonStatuses(homeTeam.id, leagueId).catch(() => []),
          MatchKOService.getTeamPokemonStatuses(awayTeam.id, leagueId).catch(() => []),
          LeagueStatsService.getHeadToHeadRecord(homeTeam.id, awayTeam.id).catch(() => null),
          LeagueStatsService.getTeamForm(homeTeam.id).catch(() => null),
          LeagueStatsService.getTeamForm(awayTeam.id).catch(() => null),
        ])

        setHomeStatuses(homeStatusRes)
        setAwayStatuses(awayStatusRes)
        setH2H(h2hRes)
        setHomeForm(homeFormRes)
        setAwayForm(awayFormRes)

        // Load pokemon types for type coverage
        const uniquePokemonIds = [...new Set(allPicks.map(p => p.pokemonId))]
        const typesMap = new Map<string, string[]>()
        // Use PokeAPI or local data for types
        for (const pid of uniquePokemonIds) {
          try {
            const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${pid}`)
            if (res.ok) {
              const data = await res.json()
              typesMap.set(pid, data.types.map((t: { type: { name: string } }) => t.type.name))
            }
          } catch { /* skip */ }
        }
        setPokemonTypes(typesMap)
      } catch (err) {
        log.error('Failed to load matchup:', err)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [leagueId, matchId, router, user?.id])

  const teamColorMap = useMemo(() => {
    if (!league) return new Map<string, TeamColorSet>()
    return buildTeamColorMap(league.teams.map(t => t.id))
  }, [league])

  const homeCoverage = useMemo(() => getTypeCoverage(homePicks, pokemonTypes), [homePicks, pokemonTypes])
  const awayCoverage = useMemo(() => getTypeCoverage(awayPicks, pokemonTypes), [awayPicks, pokemonTypes])

  const currentUserTeamId = useMemo(() => {
    if (!currentUserId || !match) return undefined
    if (match.homeTeam.ownerId === currentUserId) return match.homeTeamId
    if (match.awayTeam.ownerId === currentUserId) return match.awayTeamId
    return undefined
  }, [currentUserId, match])

  if (isLoading) return <LoadingScreen title="Loading Matchup..." description="Preparing matchup preview." />
  if (!league || !match) return null

  const homeColors = teamColorMap.get(match.homeTeamId)
  const awayColors = teamColorMap.get(match.awayTeamId)
  const isCurrentWeek = match.weekNumber === league.currentWeek
  const canRecord = match.status === 'scheduled' && isCurrentWeek && !!currentUserTeamId

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => router.push(`/league/${leagueId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Matchup Preview</h1>
            <p className="text-sm text-muted-foreground">
              {league.name} &middot; Week {match.weekNumber}
            </p>
          </div>
          {canRecord && (
            <Button onClick={() => setShowRecorder(true)}>
              <Swords className="h-4 w-4 mr-2" />
              Record Result
            </Button>
          )}
        </div>

        {/* Main Matchup Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 text-center">
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-2 ${homeColors?.badge || ''}`}>
                  Home
                </div>
                <h2 className="text-xl font-bold">{match.homeTeam.name}</h2>
                {homeForm && (
                  <div className="flex items-center justify-center gap-1 mt-2">
                    {homeForm.form.map((r, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${
                          r === 'W' ? 'bg-green-500 text-white' :
                          r === 'L' ? 'bg-red-500 text-white' :
                          'bg-gray-400 text-white'
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                    {homeForm.streak.count > 0 && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {homeForm.streak.displayText}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <div className="text-center px-6">
                {match.status === 'completed' ? (
                  <div className="text-3xl font-bold tabular-nums">
                    {match.homeScore} - {match.awayScore}
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-muted-foreground">VS</div>
                )}
                <Badge
                  variant={match.status === 'completed' ? 'default' : match.status === 'scheduled' ? 'outline' : 'secondary'}
                  className="mt-2"
                >
                  {match.status.replace('_', ' ')}
                </Badge>
              </div>

              <div className="flex-1 text-center">
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-2 ${awayColors?.badge || ''}`}>
                  Away
                </div>
                <h2 className="text-xl font-bold">{match.awayTeam.name}</h2>
                {awayForm && (
                  <div className="flex items-center justify-center gap-1 mt-2">
                    {awayForm.form.map((r, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${
                          r === 'W' ? 'bg-green-500 text-white' :
                          r === 'L' ? 'bg-red-500 text-white' :
                          'bg-gray-400 text-white'
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                    {awayForm.streak.count > 0 && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {awayForm.streak.displayText}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Rosters Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Home Roster */}
          <Card className={`border-l-4 ${homeColors?.border || ''}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {match.homeTeam.name} Roster
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {homePicks.map(pick => {
                const status = homeStatuses.find(s => s.pickId === pick.id)
                const types = pokemonTypes.get(pick.pokemonId) || []
                return (
                  <div key={pick.id} className="flex items-center gap-3 p-2 rounded-lg border">
                    <img
                      src={getPokemonAnimatedUrl(pick.pokemonId, pick.pokemonName)}
                      alt={pick.pokemonName}
                      className="w-10 h-10 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.src = getPokemonAnimatedBackupUrl(pick.pokemonId)
                      }}
                      loading="lazy"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm capitalize truncate">{pick.pokemonName}</div>
                      <div className="flex items-center gap-1">
                        {types.map(t => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded-full text-white capitalize"
                            style={{ backgroundColor: TYPE_COLORS[t] || '#68A090' }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">{pick.cost}pts</div>
                      {status && <PokemonStatusBadge status={status.status} size="sm" />}
                      {status && status.totalKos > 0 && (
                        <div className="text-xs text-muted-foreground">{status.totalKos} KOs</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Away Roster */}
          <Card className={`border-l-4 ${awayColors?.border || ''}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {match.awayTeam.name} Roster
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {awayPicks.map(pick => {
                const status = awayStatuses.find(s => s.pickId === pick.id)
                const types = pokemonTypes.get(pick.pokemonId) || []
                return (
                  <div key={pick.id} className="flex items-center gap-3 p-2 rounded-lg border">
                    <img
                      src={getPokemonAnimatedUrl(pick.pokemonId, pick.pokemonName)}
                      alt={pick.pokemonName}
                      className="w-10 h-10 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.src = getPokemonAnimatedBackupUrl(pick.pokemonId)
                      }}
                      loading="lazy"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm capitalize truncate">{pick.pokemonName}</div>
                      <div className="flex items-center gap-1">
                        {types.map(t => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded-full text-white capitalize"
                            style={{ backgroundColor: TYPE_COLORS[t] || '#68A090' }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">{pick.cost}pts</div>
                      {status && <PokemonStatusBadge status={status.status} size="sm" />}
                      {status && status.totalKos > 0 && (
                        <div className="text-xs text-muted-foreground">{status.totalKos} KOs</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* Type Coverage Comparison */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Type Coverage (Super Effective)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[1fr_80px_80px] gap-1 text-sm">
              <div className="font-medium text-muted-foreground text-xs pb-1">Type</div>
              <div className="font-medium text-center text-xs pb-1 truncate">{match.homeTeam.name}</div>
              <div className="font-medium text-center text-xs pb-1 truncate">{match.awayTeam.name}</div>
              {ALL_TYPES.map(type => (
                <div key={type} className="contents">
                  <div className="flex items-center gap-2 py-0.5">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: TYPE_COLORS[type] }}
                    />
                    <span className="capitalize text-xs">{type}</span>
                  </div>
                  <div className="text-center py-0.5">
                    {homeCoverage.has(type) ? (
                      <span className="text-green-500 font-bold text-xs">SE</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </div>
                  <div className="text-center py-0.5">
                    {awayCoverage.has(type) ? (
                      <span className="text-green-500 font-bold text-xs">SE</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 pt-3 border-t text-sm">
              <div>
                <span className="font-medium">{match.homeTeam.name}:</span>{' '}
                <span className="text-muted-foreground">{homeCoverage.size}/{ALL_TYPES.length} types covered</span>
              </div>
              <div>
                <span className="font-medium">{match.awayTeam.name}:</span>{' '}
                <span className="text-muted-foreground">{awayCoverage.size}/{ALL_TYPES.length} types covered</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Head-to-Head Record */}
        {h2h && h2h.totalMatches > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Head-to-Head Record
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="text-center flex-1">
                  <div className="text-3xl font-bold text-green-500">{h2h.wins}</div>
                  <div className="text-xs text-muted-foreground">Wins</div>
                </div>
                <div className="text-center flex-1">
                  <div className="text-3xl font-bold text-gray-400">{h2h.draws}</div>
                  <div className="text-xs text-muted-foreground">Draws</div>
                </div>
                <div className="text-center flex-1">
                  <div className="text-3xl font-bold text-red-500">{h2h.losses}</div>
                  <div className="text-xs text-muted-foreground">Losses</div>
                </div>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Avg PF: {h2h.avgPointsFor.toFixed(1)}</span>
                <span>Avg PA: {h2h.avgPointsAgainst.toFixed(1)}</span>
              </div>
              {h2h.lastMeeting && (
                <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                  Last meeting: {h2h.lastMeeting.score} ({h2h.lastMeeting.winner})
                </div>
              )}
              {/* Match history */}
              {h2h.matches.length > 0 && (
                <div className="mt-3 space-y-1">
                  {h2h.matches.map(m => (
                    <div key={m.matchId} className="flex items-center justify-between text-xs p-2 rounded border">
                      <span className="text-muted-foreground">Wk {m.weekNumber}</span>
                      <span className="font-medium">{m.homeTeam} {m.homeScore} - {m.awayScore} {m.awayTeam}</span>
                      <Badge
                        variant={m.winner === 'team_a' ? 'default' : m.winner === 'team_b' ? 'secondary' : 'outline'}
                        className="text-[10px]"
                      >
                        {m.winner === 'team_a' ? match.homeTeam.name :
                         m.winner === 'team_b' ? match.awayTeam.name : 'Draw'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Team Form Comparison */}
        {homeForm && awayForm && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Team Form (Last 5)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-sm mb-2">{match.homeTeam.name}</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Record</span>
                      <span>{homeForm.last5Wins}W-{homeForm.last5Losses}L-{homeForm.last5Draws}D</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Points For</span>
                      <span>{homeForm.last5PointsFor}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Points Against</span>
                      <span>{homeForm.last5PointsAgainst}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-sm mb-2">{match.awayTeam.name}</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Record</span>
                      <span>{awayForm.last5Wins}W-{awayForm.last5Losses}L-{awayForm.last5Draws}D</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Points For</span>
                      <span>{awayForm.last5PointsFor}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Points Against</span>
                      <span>{awayForm.last5PointsAgainst}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Match Recorder Modal */}
      {match && (
        <MatchRecorderModal
          isOpen={showRecorder}
          onClose={() => setShowRecorder(false)}
          match={match}
          homeTeamPicks={homePicks}
          awayTeamPicks={awayPicks}
          currentUserTeamId={currentUserTeamId}
          onSuccess={() => {
            setShowRecorder(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
