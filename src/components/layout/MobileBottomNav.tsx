'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, FileText, Trophy, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/create-draft', label: 'Drafts', icon: FileText },
  { href: '/dashboard', label: 'Leagues', icon: Trophy },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

export function MobileBottomNav() {
  const pathname = usePathname()

  // Hide bottom nav on draft/match/tournament active pages where it would interfere
  const hideOnPaths = ['/draft/', '/match/', '/spectate/']
  if (hideOnPaths.some((p) => pathname.startsWith(p))) {
    return null
  }

  return (
    <nav
      role="navigation"
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-50 flex md:hidden items-center justify-around border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 h-14 pb-[env(safe-area-inset-bottom)]"
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href ||
          (href === '/create-draft' && pathname.startsWith('/create-draft')) ||
          (href === '/create-draft' && pathname.startsWith('/join-draft')) ||
          (label === 'Leagues' && pathname.startsWith('/league'))

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] font-medium transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
