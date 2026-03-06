'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

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
        'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
        isActive
          ? 'text-primary font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      {/* Sliding active background */}
      {isActive && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-lg bg-primary/10"
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        />
      )}

      <Icon className="relative h-4 w-4 shrink-0" />
      <span className="relative flex-1">{label}</span>
      {badge && (
        <span className="relative ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
          {badge}
        </span>
      )}
    </Link>
  )
}
