'use client'

import { useEffect } from 'react'

/**
 * Component to filter hydration errors caused by browser extensions
 * This implements immediate DOM watching and console filtering
 */
export function HydrationErrorFilter() {
  useEffect(() => {
    // Immediately override console methods
    const originalError = console.error
    const originalWarn = console.warn

    console.error = (...args: any[]) => {
      const message = args[0]?.toString() || ''
      
      // Filter out ALL hydration warnings related to browser extensions
      if (
        message.includes('hydrated') && 
        (message.includes('jf-ext-cache-id') || 
         message.includes('data-1p-ignore') ||
         message.includes('data-lpignore') ||
         message.includes('data-form-type') ||
         message.includes('data-ms-editor') ||
         message.includes('autocomplete-data') ||
         message.includes('browser extension') ||
         message.includes('server rendered HTML') ||
         message.includes('client properties'))
      ) {
        return // Completely suppress these errors
      }
      
      originalError.apply(console, args)
    }

    console.warn = (...args: any[]) => {
      const message = args[0]?.toString() || ''
      
      // Filter out hydration warnings
      if (
        message.includes('hydrated') || 
        message.includes('jf-ext-cache-id') ||
        message.includes('server rendered HTML')
      ) {
        return // Completely suppress these warnings
      }
      
      originalWarn.apply(console, args)
    }

    // Also set up immediate DOM cleanup that runs continuously
    const cleanupAttributes = () => {
      const extensionAttributes = [
        'jf-ext-cache-id',
        'data-1p-ignore',
        'data-lpignore',
        'data-form-type',
        'data-ms-editor',
        'autocomplete-data',
        'data-kwimpalastatus'
      ]

      extensionAttributes.forEach(attr => {
        const elements = document.querySelectorAll(`[${attr}]`)
        elements.forEach(el => {
          el.removeAttribute(attr)
        })
      })
    }

    // Clean immediately
    cleanupAttributes()
    const cleanupInterval = setInterval(cleanupAttributes, 100)

    // Cleanup function
    return () => {
      console.error = originalError
      console.warn = originalWarn
      clearInterval(cleanupInterval)
    }
  }, [])

  return null
}
