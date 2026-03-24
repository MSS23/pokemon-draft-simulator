'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Plus, Trophy, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/lobby', label: 'Browse', icon: Globe },
  { href: '/create-draft', label: 'New', icon: Plus },
  { href: '/history', label: 'Leagues', icon: Trophy },
] as const

export function MobileBottomNav() {
  const pathname = usePathname()

  // Hide on pages where bottom nav would interfere with the experience
  const hideOnPaths = ['/draft/', '/match/', '/spectate/', '/league/']
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
          (href === '/dashboard' && pathname === '/') ||
          (href === '/history' && pathname.startsWith('/history'))

        return (
          <Link
            key={label}
            href={href}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] font-medium transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5', label === 'New' && 'h-6 w-6')} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
