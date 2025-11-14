'use client'

import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { MobileSidebar } from './MobileSidebar'

interface SidebarLayoutProps {
  children: ReactNode
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Mobile Menu (only visible on mobile) */}
      <div className="md:hidden sticky top-14 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-12 items-center">
          <MobileSidebar />
        </div>
      </div>

      {/* Main Content with Sidebar */}
      <div className="flex-1 flex">
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
