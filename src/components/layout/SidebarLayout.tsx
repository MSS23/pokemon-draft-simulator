'use client'

import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { MobileSidebar } from './MobileSidebar'
import { MobileBottomNav } from './MobileBottomNav'

interface SidebarLayoutProps {
  children: ReactNode
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  return (
    <div className="flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block sticky top-12 h-[calc(100vh-3rem)] self-start shrink-0">
        <Sidebar />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-[calc(100vh-3rem)]">
        {/* Mobile Menu (hamburger for full sidebar access) */}
        <div className="md:hidden sticky top-12 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-10 items-center px-4">
            <MobileSidebar />
          </div>
        </div>

        {/* Add bottom padding on mobile to account for fixed bottom nav */}
        <div className="flex-1 pb-16 md:pb-0">
          {children}
        </div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <MobileBottomNav />
    </div>
  )
}
