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
        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-all duration-150 group',
        isActive
          ? 'bg-primary/10 text-primary font-semibold shadow-sm'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className={cn(
        "h-4 w-4 shrink-0 transition-colors",
        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
      )} />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className={cn(
          "ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold tabular-nums",
          isActive
            ? "bg-primary/20 text-primary"
            : "bg-muted text-muted-foreground"
        )}>
          {badge}
        </span>
      )}
    </Link>
  )
}
