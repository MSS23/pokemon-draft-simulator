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
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors',
        isActive
          ? 'bg-muted text-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium tabular-nums">
          {badge}
        </span>
      )}
    </Link>
  )
}
