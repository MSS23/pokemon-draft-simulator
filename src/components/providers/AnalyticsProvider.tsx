'use client'

import { useEffect } from 'react'
import { initAnalytics } from '@/lib/analytics'

/**
 * Initializes PostHog analytics on mount.
 * Only activates when NEXT_PUBLIC_POSTHOG_KEY is set.
 * Renders children immediately — analytics init is non-blocking.
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics()
  }, [])

  return <>{children}</>
}
