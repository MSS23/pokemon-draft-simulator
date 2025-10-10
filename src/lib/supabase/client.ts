import { createBrowserClient } from '@supabase/ssr'

// Get environment variables with fallbacks and trim whitespace
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

// Function to validate Supabase credentials
function isValidSupabaseConfig(url: string, key: string): boolean {
  // Check if values exist and are not placeholder text
  if (!url || !key) return false
  if (url === 'your-supabase-project-url' || key === 'your-supabase-anon-key') return false

  // Basic URL validation
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'https:' && urlObj.hostname.includes('supabase')
  } catch {
    return false
  }
}

// Check if we have valid Supabase configuration
export const isSupabaseConfigured = isValidSupabaseConfig(supabaseUrl, supabaseAnonKey)

// Create Supabase browser client for client-side operations
let browserClient: ReturnType<typeof createBrowserClient> | null = null

if (isSupabaseConfigured) {
  try {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  } catch (error) {
    console.warn('Failed to create Supabase browser client:', error)
    browserClient = null
  }
}

// Export the client (will be null if not configured)
export const supabase = browserClient

// Helper function to check if Supabase is available
export function isSupabaseAvailable(): boolean {
  return supabase !== null
}

// Re-export the types from the existing file for backwards compatibility
export type { Database } from '../supabase'