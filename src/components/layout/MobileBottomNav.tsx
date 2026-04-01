'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Plus, Trophy, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/lobby', label: 'Browse', icon: Globe },
  { href: '/create-draft', label: 'New', icon: Plus, isAction: true },
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
      className="fixed bottom-0 inset-x-0 z-50 flex md:hidden items-center justify-around border-t border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 h-16 pb-[env(safe-area-inset-bottom)]"
    >
      {navItems.map(({ href, label, icon: Icon, ...rest }) => {
        const isAction = 'isAction' in rest && rest.isAction
        const isActive =
          pathname === href ||
          (href === '/dashboard' && pathname === '/') ||
          (href === '/history' && pathname.startsWith('/history'))

        if (isAction) {
          return (
            <Link
              key={label}
              href={href}
              className="flex flex-col items-center justify-center gap-1 flex-1 h-full"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-from))] to-[hsl(var(--brand-to))] flex items-center justify-center shadow-energy">
                <Icon className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
            </Link>
          )
        }

        return (
          <Link
            key={label}
            href={href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-semibold transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground/60 hover:text-foreground'
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{label}</span>
            {isActive && (
              <div className="absolute top-0 w-8 h-[2px] rounded-full bg-primary" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
