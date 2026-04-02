'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { SignInButton, UserButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { HelpCircle } from 'lucide-react'
import { TOUR_OPEN_EVENT } from '@/components/tour/TourGuide'

export function Header() {
  const { user, loading } = useAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
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
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'h-7 w-7 ring-2 ring-primary/20',
                  },
                }}
              />
            ) : (
              <SignInButton mode="modal">
                <Button variant="brand" size="sm" className="rounded-xl">
                  Sign In
                </Button>
              </SignInButton>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
