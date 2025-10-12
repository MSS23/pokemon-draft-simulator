'use client'

import { useEffect } from 'react'
import { initPerformanceMonitoring } from '@/lib/performance-monitor'

/**
 * Performance Monitor Provider
 *
 * Initializes performance monitoring on client-side
 * Tracks Web Vitals and custom metrics
 */
export function PerformanceMonitorProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize performance monitoring
    if (typeof window !== 'undefined') {
      initPerformanceMonitoring()
    }
  }, [])

  return <>{children}</>
}
