'use client'

import { useEffect, ReactNode } from 'react'
import { cleanExtensionAttributes, suppressExtensionHydrationWarnings } from '@/lib/hydration-fix'

interface HydrationFixProviderProps {
  children: ReactNode
}

/**
 * Provider to handle browser extension hydration issues
 * This component cleans up DOM modifications made by browser extensions
 * and suppresses related hydration warnings
 */
export function HydrationFixProvider({ children }: HydrationFixProviderProps) {
  useEffect(() => {
    // Initialize hydration fixes
    suppressExtensionHydrationWarnings()
    
    // Clean extension attributes after initial hydration
    cleanExtensionAttributes()
    
    // Set up a periodic cleanup for dynamic content
    const cleanupInterval = setInterval(cleanExtensionAttributes, 5000)
    
    return () => {
      clearInterval(cleanupInterval)
    }
  }, [])

  return <>{children}</>
}
