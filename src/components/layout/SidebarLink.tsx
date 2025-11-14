'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarLinkProps {
  href: string
  icon: LucideIcon
  label: string
  badge?: string | number
  onClick?: (e: React.MouseEvent) => void
  isProtected?: boolean
  onProtectedClick?: (e: React.MouseEvent, href: string) => void
}

export function SidebarLink({ href, icon: Icon, label, badge, onClick, isProtected, onProtectedClick }: SidebarLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + '/')

  const handleClick = (e: React.MouseEvent) => {
    if (isProtected && onProtectedClick) {
      onProtectedClick(e, href)
    }
    if (onClick) {
      onClick(e)
    }
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm',
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
          {badge}
        </span>
      )}
    </Link>
  )
}
