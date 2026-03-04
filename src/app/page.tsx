'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { Trophy, Users, Eye, Zap, Plus, LogIn } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarLayout } from '@/components/layout/SidebarLayout'

export default function Home() {
  const router = useRouter()
  const { user, loading } = useAuth()

  // Redirect logged-in users to dashboard
  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  // Show nothing while checking auth or redirecting
  if (loading || user) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* Hero */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight brand-gradient-text">
            Pokemon Draft League
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Build your dream team in real-time competitive drafts. Snake or auction format.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button size="lg" onClick={() => router.push('/join-draft')}>
              <Users className="h-4 w-4 mr-2" />
              Join a Draft
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.push('/watch-drafts')}>
              <Eye className="h-4 w-4 mr-2" />
              Watch Live
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <Card
            className="group card-interactive"
            onClick={() => router.push('/create-draft')}
          >
            <CardContent className="p-5 text-center space-y-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Create Draft</h3>
              <p className="text-xs text-muted-foreground">Set up a new draft room</p>
            </CardContent>
          </Card>

          <Card
            className="group card-interactive"
            onClick={() => router.push('/join-draft')}
          >
            <CardContent className="p-5 text-center space-y-2">
              <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center mx-auto group-hover:bg-info/20 transition-colors">
                <Users className="h-5 w-5 text-info" />
              </div>
              <h3 className="font-semibold text-sm">Join Draft</h3>
              <p className="text-xs text-muted-foreground">Enter a room code</p>
            </CardContent>
          </Card>

          <Card
            className="group card-interactive"
            onClick={() => router.push('/watch-drafts')}
          >
            <CardContent className="p-5 text-center space-y-2">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mx-auto group-hover:bg-accent/20 transition-colors">
                <Eye className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-semibold text-sm">Watch Live</h3>
              <p className="text-xs text-muted-foreground">Spectate public drafts</p>
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-lg border bg-card space-y-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-4.5 w-4.5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Real-Time Drafting</h3>
            <p className="text-xs text-muted-foreground">Instant sync across all participants with WebSocket technology.</p>
          </div>
          <div className="p-5 rounded-lg border bg-card space-y-3">
            <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center">
              <Trophy className="h-4.5 w-4.5 text-accent" />
            </div>
            <h3 className="font-semibold text-sm">Official Formats</h3>
            <p className="text-xs text-muted-foreground">VGC, Smogon, and custom formats with automatic cost calculation.</p>
          </div>
          <div className="p-5 rounded-lg border bg-card space-y-3">
            <div className="h-9 w-9 rounded-lg bg-info/10 flex items-center justify-center">
              <Users className="h-4.5 w-4.5 text-info" />
            </div>
            <h3 className="font-semibold text-sm">Multiplayer Ready</h3>
            <p className="text-xs text-muted-foreground">2-8 teams with spectator mode and live activity feed.</p>
          </div>
        </div>

        {/* Sign In CTA */}
        <div className="text-center py-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')} className="text-muted-foreground">
            <LogIn className="h-4 w-4 mr-2" />
            Sign in to manage your drafts and leagues
          </Button>
        </div>

      </div>
    </SidebarLayout>
  )
}
