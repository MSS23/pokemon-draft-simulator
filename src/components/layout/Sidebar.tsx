'use client'

import { useEffect, useState } from 'react'
import {
  Plus,
  UserPlus,
  Globe,
  LayoutDashboard,
  History,
  Trophy,
  Settings,
  LogOut,
  Info,
  Swords,
  MessageSquareText,
} from 'lucide-react'
import { SidebarSection } from './SidebarSection'
import { SidebarLink } from './SidebarLink'
import { supabase } from '@/lib/supabase'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useRouter } from 'next/navigation'
import { SignInButton } from '@clerk/nextjs'
import { useAuth } from '@/contexts/AuthContext'

interface LeagueInfo {
  id: string
  name: string
  status: string
  currentWeek: number | null
  totalWeeks: number | null
}

export function Sidebar() {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const [leagues, setLeagues] = useState<LeagueInfo[]>([])

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
      leagues: { id: string; name: string; status: string; current_week: number | null; total_weeks: number | null } | null
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
          status,
          current_week,
          total_weeks
        )
      `)
      .eq('teams.owner_id', userId) as unknown as { data: LeagueTeamJoin[] | null; error: unknown }

    if (leagueTeamsResponse?.data) {
      const userLeagues = leagueTeamsResponse.data
        .filter((item) => item.leagues && (item.leagues.status === 'active' || item.leagues.status === 'upcoming' || item.leagues.status === 'scheduled'))
        .map((item) => ({
          id: item.leagues!.id,
          name: item.leagues!.name,
          status: item.leagues!.status,
          currentWeek: item.leagues!.current_week,
          totalWeeks: item.leagues!.total_weeks,
        }))
      // Deduplicate by league id
      const unique = Array.from(new Map(userLeagues.map(l => [l.id, l])).values())
      setLeagues(unique)
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'

  return (
    <aside className="w-56 bg-card/50 backdrop-blur-sm border-r border-border/50 flex flex-col h-full">
      {/* User */}
      <div className="px-3 py-3 border-b border-border/50">
        {user ? (
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 ring-2 ring-primary/20">
              <AvatarImage src={user.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{displayName}</div>
              <div className="text-[11px] text-muted-foreground/70 truncate">{user.email}</div>
            </div>
          </div>
        ) : (
          <SignInButton mode="modal">
            <Button
              className="w-full"
              size="sm"
              variant="brand"
            >
              Sign In
            </Button>
          </SignInButton>
        )}
      </div>

      {/* Nav */}
      <nav role="navigation" aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <SidebarLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
        <SidebarLink href="/lobby" icon={Globe} label="Browse" />
        <SidebarLink href="/history" icon={History} label="History" />

        <Separator className="my-2.5 opacity-50" />

        {/* Quick actions */}
        <SidebarSection title="Play">
          <SidebarLink href="/create-draft" icon={Plus} label="New Draft" />
          <SidebarLink href="/join-draft" icon={UserPlus} label="Join Draft" />
          <SidebarLink href="/create-tournament" icon={Swords} label="New Tournament" />
        </SidebarSection>

        {/* Active leagues — the most important section */}
        {leagues.length > 0 && (
          <>
            <Separator className="my-2.5 opacity-50" />
            <SidebarSection title="My Leagues">
              {leagues.map((league) => (
                <SidebarLink
                  key={league.id}
                  href={`/league/${league.id}`}
                  icon={Trophy}
                  label={league.name}
                  badge={league.currentWeek && league.totalWeeks
                    ? `W${league.currentWeek}`
                    : undefined
                  }
                />
              ))}
            </SidebarSection>
          </>
        )}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-2.5 border-t border-border/50 space-y-0.5">
        <SidebarLink href="/feedback" icon={MessageSquareText} label="Feedback" />
        <SidebarLink href="/about" icon={Info} label="About" />
        {user && (
          <>
            <SidebarLink href="/settings" icon={Settings} label="Settings" />
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-150"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </>
        )}
      </div>

    </aside>
  )
}
