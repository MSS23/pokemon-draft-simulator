'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'
import { getPokemonAnimatedUrl, toShowdownName } from '@/utils/pokemon'
import { Settings, Trophy, Swords, CalendarDays, Twitter, Twitch, Star } from 'lucide-react'
import { Loader2 } from 'lucide-react'

interface UserProfile {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  favorite_pokemon: string | null
  bio: string | null
  twitter_profile: string | null
  twitch_channel: string | null
  created_at?: string
}

interface ProfileStats {
  totalDrafts: number
  picksMade: number
  leagueWins: number
  leagueLosses: number
  leagueDraws: number
  activeLeagues: number
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<ProfileStats>({
    totalDrafts: 0,
    picksMade: 0,
    leagueWins: 0,
    leagueLosses: 0,
    leagueDraws: 0,
    activeLeagues: 0,
  })
  const [authModalOpen, setAuthModalOpen] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    loadProfileAndStats(user.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProfileAndStats only uses setters and supabase (stable refs)
  }, [authLoading, user])

  async function loadProfileAndStats(userId: string) {
    if (!supabase) { setLoading(false); return }

    const [profileRes, teamsRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', userId).single(),
      supabase
        .from('teams')
        .select('id, drafts!inner(id, status)')
        .eq('owner_id', userId)
        .is('drafts.deleted_at', null),
    ])

    if (profileRes.data) {
      setProfile(profileRes.data as unknown as UserProfile)
    } else {
      // Build a default profile from auth metadata
      setProfile({
        user_id: userId,
        username: user?.user_metadata?.display_name || user?.email?.split('@')[0] || '',
        display_name: user?.user_metadata?.display_name || user?.email?.split('@')[0] || '',
        avatar_url: user?.user_metadata?.avatar_url || null,
        favorite_pokemon: null,
        bio: null,
        twitter_profile: null,
        twitch_channel: null,
      })
    }

    const teams = (teamsRes.data ?? []) as unknown as { id: string; drafts: { id: string; status: string } }[]
    const teamIds = teams.map(t => t.id)
    const totalDrafts = teams.length

    let picksMade = 0
    if (teamIds.length > 0) {
      const { count } = await supabase
        .from('picks')
        .select('*', { count: 'exact', head: true })
        .in('team_id', teamIds)
      picksMade = count ?? 0
    }

    // League record via league_teams → matches
    let wins = 0, losses = 0, draws = 0, activeLeagues = 0
    if (teamIds.length > 0) {
      const { data: leagueTeams } = await supabase
        .from('league_teams')
        .select('league_id, leagues!inner(status)')
        .in('team_id', teamIds) as unknown as { data: { league_id: string; leagues: { status: string } }[] | null }

      if (leagueTeams) {
        activeLeagues = leagueTeams.filter(lt => lt.leagues?.status === 'active').length
        const leagueIds = [...new Set(leagueTeams.map(lt => lt.league_id))]

        if (leagueIds.length > 0) {
          const { data: matches } = await supabase
            .from('matches')
            .select('home_team_id, away_team_id, home_score, away_score, winner_team_id, status')
            .in('league_id', leagueIds)
            .eq('status', 'completed')

          if (matches) {
            for (const m of matches) {
              const userIsHome = teamIds.includes(m.home_team_id)
              const userIsAway = teamIds.includes(m.away_team_id)
              if (!userIsHome && !userIsAway) continue
              if (m.winner_team_id === null) {
                draws++
              } else if (teamIds.includes(m.winner_team_id)) {
                wins++
              } else {
                losses++
              }
            }
          }
        }
      }
    }

    setStats({ totalDrafts, picksMade, leagueWins: wins, leagueLosses: losses, leagueDraws: draws, activeLeagues })
    setLoading(false)
  }

  if (authLoading || loading) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SidebarLayout>
    )
  }

  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <Card className="max-w-sm w-full">
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Sign in to view your profile</CardTitle>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setAuthModalOpen(true)}>Sign In</Button>
            </CardContent>
          </Card>
          <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} redirectTo="/profile" />
        </div>
      </SidebarLayout>
    )
  }

  const displayName = profile?.display_name || profile?.username || user.email?.split('@')[0] || 'Trainer'
  const initials = displayName[0]?.toUpperCase() || 'T'
  const joinDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : null

  const favoritePokemon = profile?.favorite_pokemon
  const favPokemonGifUrl = favoritePokemon ? getPokemonAnimatedUrl('', favoritePokemon) : null
  // Backup: use the front-facing static sprite via Showdown's non-animated folder
  const favPokemonBackupUrl = favoritePokemon
    ? `https://play.pokemonshowdown.com/sprites/gen5/${toShowdownName(favoritePokemon)}.png`
    : null

  const hasLeagueRecord = stats.leagueWins + stats.leagueLosses + stats.leagueDraws > 0

  return (
    <SidebarLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Profile Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              {/* Avatar */}
              <div className="relative shrink-0">
                <Avatar className="w-24 h-24 ring-4 ring-primary/10">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback className="brand-gradient-bg text-white text-3xl font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {favoritePokemon && favPokemonGifUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={favPokemonGifUrl}
                    alt={favoritePokemon}
                    className="absolute -bottom-3 -right-3 w-12 h-12 pixelated drop-shadow"
                    onError={(e) => {
                      const t = e.target as HTMLImageElement
                      if (!t.dataset.fallback && favPokemonBackupUrl) {
                        t.dataset.fallback = '1'
                        t.src = favPokemonBackupUrl
                      }
                    }}
                  />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
                    {profile?.username && profile.username !== displayName && (
                      <p className="text-sm text-muted-foreground">@{profile.username}</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/settings">
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      Edit Profile
                    </Link>
                  </Button>
                </div>

                {profile?.bio && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {joinDate && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Joined {joinDate}
                    </span>
                  )}
                  {favoritePokemon && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Star className="h-3.5 w-3.5 text-yellow-500" />
                      Fav: {favoritePokemon}
                    </span>
                  )}
                  {profile?.twitter_profile && (
                    <a
                      href={profile.twitter_profile.startsWith('http') ? profile.twitter_profile : `https://twitter.com/${profile.twitter_profile}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-sky-500 hover:text-sky-400 transition-colors"
                    >
                      <Twitter className="h-3.5 w-3.5" />
                      Twitter
                    </a>
                  )}
                  {profile?.twitch_channel && (
                    <a
                      href={profile.twitch_channel.startsWith('http') ? profile.twitch_channel : `https://twitch.tv/${profile.twitch_channel}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-purple-500 hover:text-purple-400 transition-colors"
                    >
                      <Twitch className="h-3.5 w-3.5" />
                      Twitch
                    </a>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Trophy className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">{stats.totalDrafts}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Drafts</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Star className="h-4 w-4 text-emerald-500" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">{stats.picksMade}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Picks Made</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Swords className="h-4 w-4 text-blue-500" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">
                {hasLeagueRecord
                  ? `${stats.leagueWins}-${stats.leagueLosses}${stats.leagueDraws > 0 ? `-${stats.leagueDraws}` : ''}`
                  : '-'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">League W-L</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Trophy className="h-4 w-4 text-violet-500" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">{stats.activeLeagues}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Active Leagues</p>
            </CardContent>
          </Card>
        </div>

        {/* Account Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{user.email}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Account type</span>
              <Badge variant="outline" className="text-xs">
                {user.app_metadata?.provider === 'email' ? 'Email' : user.app_metadata?.provider || 'Email'}
              </Badge>
            </div>
            {joinDate && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Member since</span>
                  <span className="text-sm font-medium">{joinDate}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">My Dashboard</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/history">Draft History</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings">Settings</Link>
          </Button>
        </div>

      </div>
    </SidebarLayout>
  )
}
