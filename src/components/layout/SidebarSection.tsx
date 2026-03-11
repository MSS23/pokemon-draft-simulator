'use client'

import { ReactNode } from 'react'

interface SidebarSectionProps {
  title: string
  children: ReactNode
}

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="py-2">
      <h3 className="px-3 mb-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em]">
        {title}
      </h3>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  )
}
