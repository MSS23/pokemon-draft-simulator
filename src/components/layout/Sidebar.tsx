'use client'

import { useEffect, useState } from 'react'
import {
  Plus,
  UserPlus,
  Eye,
  LayoutDashboard,
  History,
  Trophy,
  Settings,
  LogOut,
} from 'lucide-react'
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
  const { user, signOut } = useAuth()
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
      .eq('teams.owner_id', userId) as any

    if (leagueTeamsResponse?.data) {
      const userLeagues = leagueTeamsResponse.data
        .filter((item: any) => item.leagues && (item.leagues.status === 'active' || item.leagues.status === 'upcoming'))
        .map((item: any) => ({
          id: item.leagues.id,
          name: item.leagues.name,
          team_id: item.team_id
        }))
      setLeagues(userLeagues)
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  const handleProtectedClick = (e: React.MouseEvent, href: string) => {
    if (!user) {
      e.preventDefault()
      setAuthRedirectTo(href)
      setAuthModalOpen(true)
    }
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'

  return (
    <aside className="w-60 bg-card border-r border-border flex flex-col h-full">
      {/* User Profile */}
      <div className="p-4 border-b border-border">
        {user ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        <SidebarSection title="Draft">
          <SidebarLink
            href="/create-draft"
            icon={Plus}
            label="Create Draft"
            isProtected={true}
            onProtectedClick={handleProtectedClick}
          />
          <SidebarLink
            href="/join-draft"
            icon={UserPlus}
            label="Join Draft"
          />
          <SidebarLink
            href="/watch-drafts"
            icon={Eye}
            label="Watch Live"
          />
        </SidebarSection>

        <Separator className="my-1" />

        <SidebarSection title="My Activity">
          <SidebarLink
            href="/dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
            isProtected={true}
            onProtectedClick={handleProtectedClick}
          />
          <SidebarLink
            href="/history"
            icon={History}
            label="History"
            isProtected={true}
            onProtectedClick={handleProtectedClick}
          />
        </SidebarSection>

        {leagues.length > 0 && (
          <>
            <Separator className="my-1" />
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
        <div className="p-2 border-t border-border space-y-0.5">
          <SidebarLink
            href="/settings"
            icon={Settings}
            label="Settings"
            isProtected={true}
            onProtectedClick={handleProtectedClick}
          />
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
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
