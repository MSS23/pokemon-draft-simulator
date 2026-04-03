'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare } from 'lucide-react'

/**
 * Floating feedback button — visible on all pages except /feedback itself.
 * Positioned bottom-right, above the fold, does not obstruct content.
 * Links to the existing /feedback page (Discord webhook integration).
 */
export function FloatingFeedbackButton() {
  const pathname = usePathname()

  // Hide on the feedback page itself to avoid redundancy
  if (pathname === '/feedback') return null

  return (
    <Link
      href="/feedback"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:shadow-xl hover:scale-105 active:scale-95 print:hidden"
      aria-label="Send feedback"
    >
      <MessageSquare className="h-4 w-4" />
      <span className="hidden sm:inline">Feedback</span>
    </Link>
  )
}
