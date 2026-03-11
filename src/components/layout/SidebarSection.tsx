'use client'

import { ReactNode } from 'react'

interface SidebarSectionProps {
  title: string
  children: ReactNode
}

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="py-1.5">
      <h3 className="px-2.5 mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  )
}
