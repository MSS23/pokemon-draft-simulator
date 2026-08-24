'use client'

/**
 * Public player profile: display name, nationality flag, career record,
 * titles won, and season-by-season history with each drafted team.
 * World-readable data only (display fields + league history).
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { SeasonHistory } from '@/components/profile/SeasonHistory'
import { PlayerProfileService, type PlayerCareer } from '@/lib/player-profile-service'
import { countryFlag, countryName } from '@/lib/countries'
import { ArrowLeft, Trophy, Swords, Medal, Loader2 } from 'lucide-react'

export default function PlayerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string

  const [career, setCareer] = useState<PlayerCareer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    PlayerProfileService.getCareer(userId)
      .then(setCareer)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load player'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SidebarLayout>
    )
  }

  if (error || !career || (!career.profile && career.seasons.length === 0)) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <Card className="max-w-sm w-full">
            <CardContent className="pt-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                {error || 'This player has no public profile yet.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </SidebarLayout>
    )
  }

  const displayName = career.profile?.displayName || 'Trainer'
  const initials = displayName[0]?.toUpperCase() || 'T'
  const nationality = career.profile?.nationality
  const { wins, losses, draws } = career.record
  const games = wins + losses + draws
  const winRate = games > 0 ? Math.round(((wins + draws * 0.5) / games) * 100) : null

  return (
    <SidebarLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Player header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-5">
              <Avatar className="w-20 h-20 ring-4 ring-primary/10 shrink-0">
                <AvatarImage src={career.profile?.avatarUrl || ''} />
                <AvatarFallback className="brand-gradient-bg text-white text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  {displayName}
                  {nationality && (
                    <span title={countryName(nationality)} className="text-2xl leading-none">
                      {countryFlag(nationality)}
                    </span>
                  )}
                </h1>
                {career.profile?.username && career.profile.username !== displayName && (
                  <p className="text-sm text-muted-foreground">@{career.profile.username}</p>
                )}
                {nationality && (
                  <p className="text-xs text-muted-foreground mt-0.5">{countryName(nationality)}</p>
                )}
                {career.profile?.bio && (
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{career.profile.bio}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Career stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Swords className="h-4 w-4 text-blue-500" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">
                {games > 0 ? `${wins}-${losses}${draws > 0 ? `-${draws}` : ''}` : '-'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Career Record</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Medal className="h-4 w-4 text-emerald-500" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">
                {winRate !== null ? `${winRate}%` : '-'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Win Rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="h-8 w-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">{career.titles}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Titles Won</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Trophy className="h-4 w-4 text-violet-500" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">{career.leaguesPlayed}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Leagues Played</p>
            </CardContent>
          </Card>
        </div>

        {/* Season-by-season history with drafted teams */}
        <SeasonHistory seasons={career.seasons} />

      </div>
    </SidebarLayout>
  )
}
