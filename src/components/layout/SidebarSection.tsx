'use client'

import { ReactNode } from 'react'

interface SidebarSectionProps {
  title: string
  children: ReactNode
}

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="py-2">
      <h3 className="px-3 mb-1.5 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
        {title}
      </h3>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  )
}
