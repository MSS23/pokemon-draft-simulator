'use client'

import { useState } from 'react'
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
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch
  useState(() => {
    setMounted(true)
  })

  const openSignIn = () => {
    setAuthMode('signin')
    setAuthModalOpen(true)
  }

  const openSignUp = () => {
    setAuthMode('signup')
    setAuthModalOpen(true)
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <div className="mr-4 flex items-center gap-6">
            <Link href="/" className="flex items-center space-x-2">
              <span className="font-bold text-xl">Pokémon Draft League</span>
            </Link>
            <Link href="/watch-drafts">
              <Button variant="ghost" size="sm" className="gap-2">
                <Eye className="h-4 w-4" />
                Watch Drafts
              </Button>
            </Link>
          </div>
          <div className="flex flex-1 items-center justify-end space-x-2">
            <ImageTypeToggle />
            <ThemeToggle />

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
                  <DropdownMenuItem onClick={() => router.push('/profile')}>
                    <User className="h-4 w-4 mr-2" />
                    Profile Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // User is not signed in
              <>
                <Button variant="ghost" size="sm" onClick={openSignIn}>
                  Sign In
                </Button>
                <Button size="sm" onClick={openSignUp}>
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        mode={authMode}
      />
    </>
  )
}
