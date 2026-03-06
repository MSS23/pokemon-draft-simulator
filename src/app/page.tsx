'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { Trophy, Users, Eye, Zap, Plus, LogIn, Shield } from 'lucide-react'
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* Hero */}
        <div className="relative text-center space-y-5 py-10 px-4 rounded-2xl overflow-hidden">
          {/* Background layers */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-info/8 pointer-events-none" />
          <div className="absolute inset-0 pokeball-bg pointer-events-none" />

          <div className="relative space-y-4">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
              <Zap className="h-3 w-3" />
              Real-time multiplayer drafts
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight brand-gradient-text leading-tight">
              Pokémon<br className="sm:hidden" /> Draft League
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
              Build your dream team in live competitive drafts. Snake or auction format with full VGC support.
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="lg" onClick={() => router.push('/join-draft')} className="shadow-sm">
                <Users className="h-4 w-4 mr-2" />
                Join a Draft
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/create-draft')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Draft
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-1">Get started</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card
              className="group card-interactive border-primary/20 hover:border-primary/40"
              onClick={() => router.push('/create-draft')}
            >
              <CardContent className="p-6 space-y-3">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Create Draft</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Set up a new draft room for your group</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="group card-interactive border-info/20 hover:border-info/40"
              onClick={() => router.push('/join-draft')}
            >
              <CardContent className="p-6 space-y-3">
                <div className="h-11 w-11 rounded-xl bg-info/10 flex items-center justify-center group-hover:bg-info/20 transition-colors">
                  <Users className="h-5 w-5 text-info" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Join Draft</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Enter a room code to join a live draft</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="group card-interactive border-accent/20 hover:border-accent/40"
              onClick={() => router.push('/watch-drafts')}
            >
              <CardContent className="p-6 space-y-3">
                <div className="h-11 w-11 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Eye className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Watch Live</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Spectate public drafts in real time</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Features */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-1">Why Poké Draft</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border bg-card/60 space-y-3 hover:bg-card transition-colors">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Real-Time Drafting</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Instant sync across all participants with WebSocket technology.</p>
              </div>
            </div>
            <div className="p-5 rounded-xl border bg-card/60 space-y-3 hover:bg-card transition-colors">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Official Formats</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">VGC Reg H, Smogon, and custom formats with automatic cost calculation.</p>
              </div>
            </div>
            <div className="p-5 rounded-xl border bg-card/60 space-y-3 hover:bg-card transition-colors">
              <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Full League Support</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Create leagues, track standings, record matches, and run playoffs.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sign In CTA */}
        <div className="text-center pb-2">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/60 border border-border/60">
            <LogIn className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Already have an account?</span>
            <Button variant="link" size="sm" className="h-auto p-0 text-primary font-medium" onClick={() => router.push('/dashboard')}>
              Sign in
            </Button>
          </div>
        </div>

      </div>
    </SidebarLayout>
  )
}
