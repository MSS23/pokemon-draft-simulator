'use client'

/**
 * Season-by-season career history for a player: each league with the finish,
 * record, and the team drafted that season. Used by /profile (own view) and
 * /player/[userId] (public view).
 */

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PokemonSprite } from '@/components/ui/pokemon-sprite'
import { Trophy } from 'lucide-react'
import type { PlayerSeason } from '@/lib/player-profile-service'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function finishLabel(season: PlayerSeason): { text: string; isTitle: boolean } {
  if (season.isTitle) return { text: 'Champion', isTitle: true }
  const place = season.finalPlacement ?? (season.currentRank > 0 ? season.currentRank : null)
  if (place == null) return { text: season.leagueStatus === 'completed' ? 'Finished' : 'In progress', isTitle: false }
  const suffix = season.leagueStatus === 'completed' ? '' : ' (current)'
  return { text: `${ordinal(place)}${season.totalTeams ? ` of ${season.totalTeams}` : ''}${suffix}`, isTitle: false }
}

export function SeasonHistory({ seasons }: { seasons: PlayerSeason[] }) {
  if (seasons.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Season History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No league seasons yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Season History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {seasons.map(season => {
          const finish = finishLabel(season)
          return (
            <div key={`${season.leagueId}-${season.teamId}`} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <Link
                    href={`/league/${season.leagueId}`}
                    className="text-sm font-semibold hover:underline truncate block"
                  >
                    {season.leagueName}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">
                    {season.teamName}
                    {season.endDate && ` · ${new Date(season.endDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold tabular-nums">
                    {season.wins}-{season.losses}{season.draws > 0 ? `-${season.draws}` : ''}
                  </span>
                  {finish.isTitle ? (
                    <Badge className="bg-yellow-500 hover:bg-yellow-500 text-yellow-950">
                      <Trophy className="h-3 w-3 mr-1" />
                      Champion
                    </Badge>
                  ) : (
                    <Badge variant={season.leagueStatus === 'completed' ? 'secondary' : 'outline'}>
                      {finish.text}
                    </Badge>
                  )}
                </div>
              </div>
              {season.picks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {season.picks.map(pick => (
                    <span key={pick.id} title={pick.pokemonName}>
                      <PokemonSprite
                        pokemonId={pick.pokemonId}
                        pokemonName={pick.pokemonName}
                        className="w-8 h-8 object-contain"
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
