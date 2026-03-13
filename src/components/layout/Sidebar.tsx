'use client'

import { useEffect, useState } from 'react'
import {
  Plus,
  UserPlus,
  Eye,
  LayoutDashboard,
  History,
  Trophy,
  Swords,
  Settings,
  LogOut,
  UserCircle,
} from 'lucide-react'
import Link from 'next/link'
import { SidebarSection } from './SidebarSection'
import { SidebarLink } from './SidebarLink'
import { supabase } from '@/lib/supabase'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useRouter } from 'next/navigation'
import { AuthModal } from '@/components/auth/AuthModal'
import { useAuth } from '@/contexts/AuthContext'

interface League {
  id: string
  name: string
  team_id: string
}

export function Sidebar() {
  const router = useRouter()
  const { user, signOut, loading: authLoading } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authRedirectTo, setAuthRedirectTo] = useState<string>('/dashboard')

  useEffect(() => {
    if (user?.id) {
      loadUserLeagues(user.id)
    } else {
      setLeagues([])
    }
  }, [user?.id])

  async function loadUserLeagues(userId: string) {
    if (!supabase) return

    type LeagueTeamJoin = {
      id: string
      team_id: string
      league_id: string
      teams: { id: string; name: string; owner_id: string | null } | null
      leagues: { id: string; name: string; status: string } | null
    }

    const leagueTeamsResponse = await supabase
      .from('league_teams')
      .select(`
        id,
        team_id,
        league_id,
        teams!inner (
          id,
          name,
          owner_id
        ),
        leagues!inner (
          id,
          name,
          status
        )
      `)
      .eq('teams.owner_id', userId) as unknown as { data: LeagueTeamJoin[] | null; error: unknown }

    if (leagueTeamsResponse?.data) {
      const userLeagues = leagueTeamsResponse.data
        .filter((item) => item.leagues && (item.leagues.status === 'active' || item.leagues.status === 'upcoming'))
        .map((item) => ({
          id: item.leagues!.id,
          name: item.leagues!.name,
          team_id: item.team_id
        }))
      setLeagues(userLeagues)
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  const _handleProtectedClick = (e: React.MouseEvent, href: string) => {
    // Don't block navigation while auth is still loading
    if (authLoading) return
    if (!user) {
      e.preventDefault()
      setAuthRedirectTo(href)
      setAuthModalOpen(true)
    }
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'

  return (
    <aside className="w-56 bg-card border-r flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 py-3 border-b">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-full overflow-hidden relative flex-shrink-0">
            <div className="absolute inset-0 top-0 h-1/2 bg-primary" />
            <div className="absolute inset-0 top-1/2 h-1/2 bg-white dark:bg-zinc-200" />
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-foreground/30 -translate-y-1/2" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[7px] w-[7px] rounded-full border-[1px] border-foreground/30 bg-background" />
          </div>
          <span className="font-semibold text-sm">Poké Draft</span>
        </Link>
      </div>

      {/* User */}
      <div className="px-3 py-3 border-b">
        {user ? (
          <div className="flex items-center gap-2.5">
            <Avatar className="h-7 w-7">
              <AvatarImage src={user.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-medium">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{displayName}</div>
              <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setAuthModalOpen(true)}
            className="w-full"
            size="sm"
          >
            Sign In
          </Button>
        )}
      </div>

      {/* Nav */}
      <nav role="navigation" aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <SidebarSection title="Draft">
          <SidebarLink href="/create-draft" icon={Plus} label="Create Draft" />
          <SidebarLink href="/join-draft" icon={UserPlus} label="Join Draft" />
          <SidebarLink href="/watch-drafts" icon={Eye} label="Watch Live" />
        </SidebarSection>

        <Separator className="my-1.5" />

        <SidebarSection title="Tournament">
          <SidebarLink href="/create-tournament" icon={Swords} label="Create Tournament" />
          <SidebarLink href="/join-tournament" icon={UserPlus} label="Join Tournament" />
        </SidebarSection>

        <Separator className="my-1.5" />

        <SidebarSection title="Activity">
          <SidebarLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarLink href="/profile" icon={UserCircle} label="Profile" />
          <SidebarLink href="/history" icon={History} label="History" />
        </SidebarSection>

        {leagues.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <SidebarSection title="Leagues">
              {leagues.map((league) => (
                <SidebarLink
                  key={league.id}
                  href={`/league/${league.id}`}
                  icon={Trophy}
                  label={league.name}
                />
              ))}
            </SidebarSection>
          </>
        )}
      </nav>

      {/* Bottom */}
      {user && (
        <div className="px-2 py-2 border-t space-y-0.5">
          <SidebarLink href="/settings" icon={Settings} label="Settings" />
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] w-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      )}

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        redirectTo={authRedirectTo}
      />
    </aside>
  )
}
