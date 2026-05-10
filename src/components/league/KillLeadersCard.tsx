'use client'

/**
 * KillLeadersCard — top KO scorers across the league.
 *
 * Reads MatchKOService.getKOLeaderboard which already exists; surfaces it
 * as a compact card you can drop on the league dashboard or standings page.
 *
 * The "League of Rage" sheet's "Kill Leaders" widget on each weekly tab
 * inspired this — it's the single most-asked-about stat in a draft league.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Loader2 } from 'lucide-react'
import { MatchKOService } from '@/lib/match-ko-service'
import { getPokemonSpriteUrl } from '@/utils/pokemon'
import { getTeamColor } from '@/lib/team-colors'

interface KillLeader {
  pickId: string
  pokemonId: string
  pokemonName: string
  totalKos: number
  matchesPlayed: number
  teamId: string
}

interface TeamLite {
  id: string
  name: string
  abbreviation?: string | null
  draftOrder: number
}

interface KillLeadersCardProps {
  leagueId: string
  teams: TeamLite[]
  limit?: number
  className?: string
}

export function KillLeadersCard({ leagueId, teams, limit = 8, className }: KillLeadersCardProps) {
  const [leaders, setLeaders] = useState<KillLeader[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    MatchKOService.getKOLeaderboard(leagueId, limit)
      .then(rows => {
        if (mounted) {
          setLeaders(rows)
          setError(false)
        }
      })
      .catch(() => { if (mounted) setError(true) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [leagueId, limit])

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-amber-500" />
          Kill Leaders
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : error || leaders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No KOs logged yet. Once teams start scoring matches, the leaderboard will populate.
          </p>
        ) : (
          <ol className="space-y-1">
            {leaders.map((l, idx) => {
              const team = teams.find(t => t.id === l.teamId)
              const c = team ? getTeamColor(team) : getTeamColor({ id: l.teamId })
              const kpg = l.matchesPlayed > 0 ? (l.totalKos / l.matchesPlayed).toFixed(2) : '—'
              return (
                <li key={l.pickId}>
                  <Link
                    href={`/league/${leagueId}/team/${l.teamId}`}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-md border border-border/40 hover:bg-muted/40 transition-colors"
                  >
                    <span className="font-mono text-xs text-muted-foreground w-6 shrink-0 text-center">
                      #{idx + 1}
                    </span>
                    <Image
                      src={getPokemonSpriteUrl(l.pokemonId)}
                      alt={l.pokemonName}
                      width={32}
                      height={32}
                      unoptimized
                      className="h-8 w-8 object-contain shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm capitalize truncate">
                        {l.pokemonName}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: c.base }}
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {team?.abbreviation || team?.name || 'Unknown team'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <Badge
                        variant="default"
                        className="font-mono tabular-nums text-xs"
                        style={{ background: c.base, color: c.fg }}
                      >
                        {l.totalKos} KO
                      </Badge>
                      <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                        {kpg}/g
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export default KillLeadersCard
