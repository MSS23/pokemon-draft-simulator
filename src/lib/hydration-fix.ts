/**
 * Hydration fixes for browser extension compatibility
 * This handles the common issue where browser extensions (like form fillers)
 * add attributes to DOM elements causing React hydration mismatches
 */

import { useEffect } from 'react'

/**
 * Common browser extension attributes that cause hydration issues
 */
const EXTENSION_ATTRIBUTES = [
  'jf-ext-cache-id',
  'data-1p-ignore',
  'data-lpignore',
  'data-form-type',
  'data-ms-editor',
  'autocomplete-data',
  'data-kwimpalastatus',
  'data-kwimpalastatus',
]

/**
 * Clean extension attributes from DOM elements
 * This should be called after hydration is complete
 */
export function cleanExtensionAttributes() {
  if (typeof window === 'undefined') return

  // Wait for hydration to complete
  setTimeout(() => {
    EXTENSION_ATTRIBUTES.forEach(attr => {
      const elements = document.querySelectorAll(`[${attr}]`)
      elements.forEach(el => {
        el.removeAttribute(attr)
      })
    })
  }, 100)
}

/**
 * Hook to clean extension attributes on component mount
 * Use this in components that frequently get modified by extensions
 */
export function useHydrationFix() {
  useEffect(() => {
    cleanExtensionAttributes()
  }, [])
}

/**
 * Check if current environment has browser extensions that modify DOM
 */
export function hasDOMModifyingExtensions(): boolean {
  if (typeof window === 'undefined') return false
  
  // Check for common extension indicators
  return EXTENSION_ATTRIBUTES.some(attr => {
    return document.querySelector(`[${attr}]`) !== null
  })
}

/**
 * Suppress hydration warnings in development for known extension issues
 * This is a more targeted approach than blanket suppressHydrationWarning
 */
export function suppressExtensionHydrationWarnings() {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') return

  // Override console.error temporarily to filter out extension-related hydration warnings
  const originalError = console.error
  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || ''
    
    // Skip hydration warnings that mention extension attributes
    if (message.includes('hydrated') && EXTENSION_ATTRIBUTES.some(attr => message.includes(attr))) {
      return
    }
    
    // Allow all other errors through
    originalError.apply(console, args)
  }
}
