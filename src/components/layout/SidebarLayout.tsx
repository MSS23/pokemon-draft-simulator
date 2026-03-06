'use client'

import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { MobileSidebar } from './MobileSidebar'

interface SidebarLayoutProps {
  children: ReactNode
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  return (
    <div className="flex">
      {/* Desktop Sidebar — sticky below global header */}
      <div className="hidden md:block sticky top-14 h-[calc(100vh-3.5rem)] self-start shrink-0">
        <Sidebar />
      </div>

      {/* Content column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-[calc(100vh-3.5rem)]">
        {/* Mobile Menu — sticky below global header */}
        <div className="md:hidden sticky top-14 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-12 items-center px-4">
            <MobileSidebar />
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
