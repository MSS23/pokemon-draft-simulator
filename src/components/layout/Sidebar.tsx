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

interface League {
  id: string
  name: string
  team_id: string
}

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [leagues, setLeagues] = useState<League[]>([])

  useEffect(() => {
    loadUserData()
  }, [])

  async function loadUserData() {
    if (!supabase) return

    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      setUser(user)
      await loadUserLeagues(user.id)
    }
  }

  async function loadUserLeagues(userId: string) {
    if (!supabase) return

    // Load user's active leagues through their teams
    const teamsResponse = await supabase
      .from('teams')
      .select(`
        id,
        league_id,
        leagues!inner (
          id,
          name,
          status
        )
      `)
      .eq('owner_id', userId)
      .in('leagues.status', ['active', 'upcoming']) as any

    if (teamsResponse?.data) {
      const userLeagues = teamsResponse.data.map((team: any) => ({
        id: team.leagues.id,
        name: team.leagues.name,
        team_id: team.id
      }))
      setLeagues(userLeagues)
    }
  }

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    router.push('/')
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col h-full">
      {/* User Profile */}
      {user && (
        <div className="p-4 border-b border-border">
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
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <SidebarSection title="Quick Actions">
          <SidebarLink href="/create-draft" icon={Plus} label="Create Draft" />
          <SidebarLink href="/join-draft" icon={UserPlus} label="Join Draft" />
          <SidebarLink href="/watch-drafts" icon={Eye} label="Watch Live" />
        </SidebarSection>

        <Separator className="my-2" />

        <SidebarSection title="My Activity">
          <SidebarLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarLink href="/my-drafts" icon={FileText} label="My Drafts" />
          <SidebarLink href="/history" icon={History} label="History" />
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
          <SidebarLink href="/settings" icon={Settings} label="Settings" />
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
    </aside>
  )
}
