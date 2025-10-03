'use client'

import { useEffect } from 'react'

export function ErrorBoundaryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason)
      
      // Prevent the default browser behavior of logging to console
      event.preventDefault()
      
      // If it's just an Event object, ignore it (common with cancelled requests)
      if (event.reason && typeof event.reason === 'object' && event.reason.toString() === '[object Event]') {
        return
      }
      
      // Log meaningful errors
      if (event.reason instanceof Error) {
        console.error('Promise rejection error:', event.reason.message, event.reason.stack)
      } else if (typeof event.reason === 'string') {
        console.error('Promise rejection reason:', event.reason)
      }
    }

    // Handle uncaught errors
    const handleError = (event: ErrorEvent) => {
      console.error('Uncaught error:', event.error)
      
      // If it's just an Event object, ignore it
      if (event.error && typeof event.error === 'object' && event.error.toString() === '[object Event]') {
        return
      }
    }

    // Add event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)

    // Cleanup
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [])

  return <>{children}</>
}
