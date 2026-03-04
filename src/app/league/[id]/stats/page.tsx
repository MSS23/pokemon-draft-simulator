'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
// Badge import removed - using PokemonStatusBadge instead
import { LeagueService } from '@/lib/league-service'
import { LeagueStatsService, type LeaguePokemonStat } from '@/lib/league-stats-service'
import { PokemonStatusBadge } from '@/components/league/PokemonStatusBadge'
import { LoadingScreen } from '@/components/ui/loading-states'
import { ArrowLeft, ArrowUpDown, Trophy, Skull, Target, Crown } from 'lucide-react'
import type { League, Team } from '@/types'
import { buildTeamColorMap } from '@/utils/team-colors'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl } from '@/utils/pokemon'
import { createLogger } from '@/lib/logger'

const log = createLogger('StatsPage')

type SortKey = 'pokemonName' | 'teamName' | 'cost' | 'matchesPlayed' | 'matchesWon' | 'matchesLost' | 'totalKOs' | 'totalDeaths' | 'kdRatio' | 'winRate'
type FilterMode = 'all' | 'alive' | 'dead'

export default function StatsPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.id as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [stats, setStats] = useState<LeaguePokemonStat[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('totalKOs')
  const [sortAsc, setSortAsc] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [leagueData, statsData] = await Promise.all([
          LeagueService.getLeague(leagueId),
          LeagueStatsService.getLeaguePokemonStats(leagueId),
        ])

        if (!leagueData) { router.push('/dashboard'); return }
        setLeague(leagueData)
        setStats(statsData)
      } catch (err) {
        log.error('Failed to load stats:', err)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [leagueId, router])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const teamColorMap = useMemo(() => {
    if (!league) return new Map()
    return buildTeamColorMap(league.teams.map(t => t.id))
  }, [league])

  const filteredStats = useMemo(() => {
    let filtered = stats

    if (filter === 'alive') filtered = filtered.filter(s => s.status === 'alive')
    else if (filter === 'dead') filtered = filtered.filter(s => s.status === 'dead')

    if (teamFilter) filtered = filtered.filter(s => s.teamId === teamFilter)

    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
  }, [stats, sortKey, sortAsc, filter, teamFilter])

  // MVP calculations
  const mvpKO = useMemo(() => {
    if (stats.length === 0) return null
    return stats.reduce((best, s) => s.totalKOs > best.totalKOs ? s : best, stats[0])
  }, [stats])

  const mvpWinRate = useMemo(() => {
    const eligible = stats.filter(s => s.matchesPlayed >= 3)
    if (eligible.length === 0) return null
    return eligible.reduce((best, s) => s.winRate > best.winRate ? s : best, eligible[0])
  }, [stats])

  if (isLoading) return <LoadingScreen title="Loading Stats..." description="Crunching season numbers." />
  if (!league) return null

  const SortHeader = ({ label, field, className = '' }: { label: string; field: SortKey; className?: string }) => (
    <button
      className={`flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      {label}
      {sortKey === field && (
        <ArrowUpDown className="h-3 w-3" />
      )}
    </button>
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => router.push(`/league/${leagueId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Season Stats</h1>
            <p className="text-sm text-muted-foreground">
              {league.name} &middot; Per-Pokemon performance
            </p>
          </div>
        </div>

        {/* MVP Highlights */}
        {(mvpKO || mvpWinRate) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {mvpKO && mvpKO.totalKOs > 0 && (
              <Card className="border-yellow-500/50">
                <CardContent className="pt-4 flex items-center gap-3">
                  <img
                    src={getPokemonAnimatedUrl(mvpKO.pokemonId, mvpKO.pokemonName)}
                    alt={mvpKO.pokemonName}
                    className="w-12 h-12 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getPokemonAnimatedBackupUrl(mvpKO.pokemonId)
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-yellow-500" />
                      <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">KO Leader</span>
                    </div>
                    <div className="font-bold capitalize">{mvpKO.pokemonName}</div>
                    <div className="text-xs text-muted-foreground">{mvpKO.teamName} &middot; {mvpKO.totalKOs} KOs</div>
                  </div>
                </CardContent>
              </Card>
            )}
            {mvpWinRate && mvpWinRate.winRate > 0 && (
              <Card className="border-green-500/50">
                <CardContent className="pt-4 flex items-center gap-3">
                  <img
                    src={getPokemonAnimatedUrl(mvpWinRate.pokemonId, mvpWinRate.pokemonName)}
                    alt={mvpWinRate.pokemonName}
                    className="w-12 h-12 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getPokemonAnimatedBackupUrl(mvpWinRate.pokemonId)
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-green-500" />
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">Best Win Rate</span>
                    </div>
                    <div className="font-bold capitalize">{mvpWinRate.pokemonName}</div>
                    <div className="text-xs text-muted-foreground">
                      {mvpWinRate.teamName} &middot; {(mvpWinRate.winRate * 100).toFixed(0)}% ({mvpWinRate.matchesWon}W-{mvpWinRate.matchesLost}L)
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex gap-1">
            {(['all', 'alive', 'dead'] as FilterMode[]).map(f => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'alive' ? 'Alive' : 'Dead'}
              </Button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button
              variant={teamFilter === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTeamFilter(null)}
            >
              All Teams
            </Button>
            {league.teams.map(team => {
              const colors = teamColorMap.get(team.id)
              return (
                <Button
                  key={team.id}
                  variant={teamFilter === team.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTeamFilter(team.id)}
                  className={teamFilter !== team.id ? colors?.bg : ''}
                >
                  {team.name}
                </Button>
              )
            })}
          </div>
        </div>

        {/* Stats Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Pokemon Stats ({filteredStats.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2">
                      <SortHeader label="Pokemon" field="pokemonName" />
                    </th>
                    <th className="text-left py-2 px-2 hidden sm:table-cell">
                      <SortHeader label="Team" field="teamName" />
                    </th>
                    <th className="text-right py-2 px-2">
                      <SortHeader label="Cost" field="cost" className="justify-end" />
                    </th>
                    <th className="text-right py-2 px-2 hidden md:table-cell">
                      <SortHeader label="GP" field="matchesPlayed" className="justify-end" />
                    </th>
                    <th className="text-right py-2 px-2 hidden md:table-cell">
                      <SortHeader label="W" field="matchesWon" className="justify-end" />
                    </th>
                    <th className="text-right py-2 px-2 hidden md:table-cell">
                      <SortHeader label="L" field="matchesLost" className="justify-end" />
                    </th>
                    <th className="text-right py-2 px-2">
                      <SortHeader label="KOs" field="totalKOs" className="justify-end" />
                    </th>
                    <th className="text-right py-2 px-2">
                      <SortHeader label="Deaths" field="totalDeaths" className="justify-end" />
                    </th>
                    <th className="text-right py-2 px-2 hidden sm:table-cell">
                      <SortHeader label="KD" field="kdRatio" className="justify-end" />
                    </th>
                    <th className="text-right py-2 px-2">
                      <SortHeader label="Win%" field="winRate" className="justify-end" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((stat) => {
                    const colors = teamColorMap.get(stat.teamId)
                    const isMvpKO = mvpKO?.pickId === stat.pickId && stat.totalKOs > 0
                    const isMvpWR = mvpWinRate?.pickId === stat.pickId && stat.winRate > 0

                    return (
                      <tr key={stat.pickId} className={`border-b last:border-0 hover:bg-muted/50 ${stat.status === 'dead' ? 'opacity-60' : ''}`}>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <img
                              src={getPokemonAnimatedUrl(stat.pokemonId, stat.pokemonName)}
                              alt={stat.pokemonName}
                              className="w-8 h-8 object-contain shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = getPokemonAnimatedBackupUrl(stat.pokemonId)
                              }}
                              loading="lazy"
                            />
                            <div>
                              <div className="font-medium capitalize flex items-center gap-1">
                                {stat.pokemonName}
                                {isMvpKO && <Crown className="h-3 w-3 text-yellow-500" />}
                                {isMvpWR && <Trophy className="h-3 w-3 text-green-500" />}
                              </div>
                              <div className="sm:hidden text-xs text-muted-foreground">{stat.teamName}</div>
                            </div>
                            <PokemonStatusBadge status={stat.status} size="sm" />
                          </div>
                        </td>
                        <td className="py-2 px-2 hidden sm:table-cell">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${colors?.badge || ''}`}>
                            {stat.teamName}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">{stat.cost}</td>
                        <td className="py-2 px-2 text-right tabular-nums hidden md:table-cell">{stat.matchesPlayed}</td>
                        <td className="py-2 px-2 text-right tabular-nums hidden md:table-cell">{stat.matchesWon}</td>
                        <td className="py-2 px-2 text-right tabular-nums hidden md:table-cell">{stat.matchesLost}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-medium">{stat.totalKOs}</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {stat.totalDeaths}
                          {stat.status === 'dead' && <Skull className="inline h-3 w-3 ml-1 text-red-500" />}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums hidden sm:table-cell">
                          {stat.kdRatio.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {stat.matchesPlayed > 0 ? `${(stat.winRate * 100).toFixed(0)}%` : '-'}
                        </td>
                      </tr>
                    )
                  })}
                  {filteredStats.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-muted-foreground">
                        No Pokemon stats available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
