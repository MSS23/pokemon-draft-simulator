'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ImageTypeToggle } from '@/components/ui/image-type-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, LogOut, Eye } from 'lucide-react'

export function Header() {
  const router = useRouter()
  const { user, signOut, loading } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch - only render user-dependent UI after client mount
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <div className="mr-4 flex items-center gap-6">
            <Link href="/" className="flex items-center space-x-2 group">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <span className="text-white font-bold text-lg">P</span>
              </div>
              <span className="font-bold text-xl hidden sm:inline">Pokémon Draft League</span>
              <span className="font-bold text-xl sm:hidden">PDL</span>
            </Link>
            <nav className="hidden md:flex items-center gap-2">
              <Link href="/watch-drafts">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Watch Drafts
                </Button>
              </Link>
            </nav>
          </div>
          <div className="flex flex-1 items-center justify-end space-x-2">
            <ImageTypeToggle />
            <ThemeToggle />

            <div suppressHydrationWarning>
              {!mounted || loading ? (
                // Placeholder during loading to prevent hydration mismatch
                <>
                  <Button variant="ghost" size="sm" disabled>
                    Sign In
                  </Button>
                  <Button size="sm" disabled>
                    Sign Up
                  </Button>
                </>
              ) : user ? (
              // User is signed in
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <User className="h-4 w-4 mr-2" />
                    {user.email}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut()
                      router.push('/')
                    }}
                    suppressHydrationWarning
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // User is not signed in
              <Button variant="ghost" size="sm" onClick={() => setAuthModalOpen(true)}>
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
