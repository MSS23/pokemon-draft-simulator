'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LogOut, Settings, LayoutDashboard, UserCircle, HelpCircle } from 'lucide-react'
import { TOUR_OPEN_EVENT } from '@/components/tour/TourGuide'

export function Header() {
  const router = useRouter()
  const { user, signOut, loading } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        {/* Top accent line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <div className="container flex h-12 items-center">
          <Link href="/" className="flex items-center gap-2.5 mr-auto group">
            {/* Pokeball logo — refined */}
            <div className="h-7 w-7 rounded-full overflow-hidden relative flex-shrink-0 shadow-sm ring-1 ring-black/5 dark:ring-white/10 transition-transform duration-200 group-hover:scale-110">
              <div className="absolute inset-0 top-0 h-1/2 bg-primary" />
              <div className="absolute inset-0 top-1/2 h-1/2 bg-white dark:bg-zinc-200" />
              <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-foreground/30 -translate-y-1/2" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border-[2px] border-foreground/30 bg-background" />
            </div>
            <span className="font-bold text-sm tracking-tight">
              <span className="hidden sm:inline text-foreground">Poke</span>
              <span className="text-gradient">Draft</span>
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl"
              aria-label="Open tour guide"
              title="Tour guide"
              onClick={() => window.dispatchEvent(new CustomEvent(TOUR_OPEN_EVENT))}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            <ThemeToggle />

            <div suppressHydrationWarning>
              {!mounted || loading ? (
                <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
              ) : user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                      <Avatar className="h-7 w-7 ring-2 ring-primary/20">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                          {displayName[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg">
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold">{displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/dashboard')} className="rounded-lg mx-1">
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/profile')} className="rounded-lg mx-1">
                      <UserCircle className="h-4 w-4 mr-2" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/settings')} className="rounded-lg mx-1">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async () => {
                        await signOut()
                        router.push('/')
                      }}
                      className="rounded-lg mx-1 text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button variant="brand" size="sm" onClick={() => setAuthModalOpen(true)} className="rounded-xl">
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  )
}
