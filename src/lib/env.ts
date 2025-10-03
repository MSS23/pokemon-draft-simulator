/**
 * Environment Configuration
 *
 * Centralized access to environment variables and feature flags
 */

export const env = {
  // Supabase
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },

  // Feature Flags
  features: {
    spectatorMode: true,
    auctionDraft: true,
    wishlistAutopick: true,
    teamChat: false, // Future feature
    analytics: false, // Future feature
  },

  // App Config
  app: {
    isDemoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
  },

  // Format Settings
  formats: {
    useCompiledPacks: true, // Use compiled format packs from /public/data
    defaultFormat: 'vgc-reg-h',
  },

  // Draft Settings
  draft: {
    maxTeams: 8,
    defaultBudget: 100,
    defaultTimeLimit: 60, // seconds
    defaultPokemonPerTeam: 6,
  },
} as const

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof env.features): boolean {
  return env.features[feature]
}

/**
 * Get environment variable with fallback
 */
export function getEnv(key: string, fallback: string = ''): string {
  if (typeof window !== 'undefined') {
    // Client-side
    return (window as any).__ENV__?.[key] || process.env[key] || fallback
  }
  // Server-side
  return process.env[key] || fallback
}

/**
 * Validate required environment variables
 */
export function validateEnv(): { isValid: boolean; missing: string[] } {
  const missing: string[] = []

  // Only validate if not in demo mode
  if (!env.app.isDemoMode) {
    if (!env.supabase.url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!env.supabase.anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return {
    isValid: missing.length === 0,
    missing
  }
}