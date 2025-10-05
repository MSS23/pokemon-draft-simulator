'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Users, Trophy, Clock, LogOut } from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

interface UserDraft {
  id: string
  name: string
  status: string
  created_at: string
  format: string
  max_teams: number
  room_code: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<UserDraft[]>([])

  useEffect(() => {
    const checkUser = async () => {
      if (!supabase) {
        router.push('/auth/login')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      setUser(user)

      // Fetch user's drafts
      const { data: userDrafts } = await (supabase
        .from('drafts') as any)
        .select('*')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false })

      if (userDrafts) {
        setDrafts(userDrafts)
      }

      setLoading(false)
    }

    checkUser()
  }, [router])

  const handleSignOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome back, {displayName}!</p>
          </div>
          <Button variant="ghost" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/create-draft">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Create Draft
                  </CardTitle>
                  <CardDescription>Start a new Pokemon draft</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/join-draft">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Join Draft
                  </CardTitle>
                  <CardDescription>Enter a room code to join</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/spectate">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Spectate
                  </CardTitle>
                  <CardDescription>Watch live drafts</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>

          {/* My Drafts */}
          <Card>
            <CardHeader>
              <CardTitle>My Drafts</CardTitle>
              <CardDescription>
                {drafts.length === 0
                  ? "You haven't created any drafts yet"
                  : `You have ${drafts.length} draft${drafts.length === 1 ? '' : 's'}`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {drafts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Create your first draft to get started!</p>
                  <Link href="/create-draft">
                    <Button className="mt-4">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Draft
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {drafts.map((draft) => (
                    <Card key={draft.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{draft.name}</h3>
                              <Badge
                                variant={draft.status === 'active' ? 'default' : 'secondary'}
                              >
                                {draft.status}
                              </Badge>
                              <Badge variant="outline">
                                {draft.format}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {draft.max_teams} teams
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(draft.created_at).toLocaleDateString()}
                              </span>
                              <span className="font-mono text-xs">
                                Room: {draft.room_code}
                              </span>
                            </div>
                          </div>
                          <Link href={`/draft/${draft.id}`}>
                            <Button>Open</Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
