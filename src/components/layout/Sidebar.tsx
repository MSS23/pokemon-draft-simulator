'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  Plus,
  Users,
  Eye,
  LayoutDashboard,
  FileText,
  History,
  Trophy,
  Settings,
  LogOut,
  UserPlus
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
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authRedirectTo, setAuthRedirectTo] = useState<string>('/dashboard')

  // Load user's leagues when user changes
  useEffect(() => {
    if (user?.id) {
      loadUserLeagues(user.id)
    } else {
      setLeagues([])
    }
  }, [user?.id])

  async function loadUserLeagues(userId: string) {
    if (!supabase) return

    // Load user's active leagues through junction table
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
      // Filter for active/upcoming leagues in JavaScript
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

  // Helper function to handle protected link clicks
  const handleProtectedClick = (e: React.MouseEvent, href: string) => {
    if (!user) {
      e.preventDefault()
      setAuthRedirectTo(href)
      setAuthModalOpen(true)
    }
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col h-full">
      {/* User Profile or Sign In Prompt */}
      <div className="p-4 border-b border-border">
        {user ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground truncate">Pokémon Trainer</div>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setAuthModalOpen(true)}
            className="w-full"
            variant="default"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Sign In
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <SidebarSection title="Quick Actions">
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

        <Separator className="my-2" />

        <SidebarSection title="My Activity">
          <SidebarLink
            href="/dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
            isProtected={true}
            onProtectedClick={handleProtectedClick}
          />
          <SidebarLink
            href="/my-drafts"
            icon={FileText}
            label="League Matches"
            isProtected={true}
            onProtectedClick={handleProtectedClick}
          />
          <SidebarLink
            href="/draft-history"
            icon={Trophy}
            label="Draft History"
            isProtected={true}
            onProtectedClick={handleProtectedClick}
          />
          <SidebarLink
            href="/history"
            icon={History}
            label="League History"
            isProtected={true}
            onProtectedClick={handleProtectedClick}
          />
        </SidebarSection>

        {leagues.length > 0 && (
          <>
            <Separator className="my-2" />
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

        <Separator className="my-2" />

        <SidebarSection title="Community">
          <SidebarLink href="/watch-drafts" icon={Eye} label="Watch Drafts" />
          <SidebarLink href="/spectate" icon={Users} label="Spectate" />
        </SidebarSection>
      </nav>

      {/* Bottom Actions */}
      {user && (
        <div className="p-2 border-t border-border">
          <SidebarLink
            href="/settings"
            icon={Settings}
            label="Settings"
            isProtected={true}
            onProtectedClick={handleProtectedClick}
          />
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </Button>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        redirectTo={authRedirectTo}
      />
    </aside>
  )
}
