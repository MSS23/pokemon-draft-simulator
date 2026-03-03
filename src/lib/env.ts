/**
 * Environment Configuration
 *
 * Centralized access to environment variables and feature flags.
 * Uses Zod for validation. Throws in production when required vars missing.
 */

import { z } from 'zod'
import { createLogger } from '@/lib/logger'

const log = createLogger('Env')

// Zod schema for required Supabase env vars
const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

const envResult = supabaseEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
})

export const env = {
  // Supabase
  supabase: {
    url: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    anonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
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
  return process.env[key] || fallback
}

/**
 * Validate required environment variables.
 * Throws in production when required vars are missing.
 */
export function validateEnv(): { isValid: boolean; missing: string[] } {
  if (envResult.success) {
    return { isValid: true, missing: [] }
  }

  const missing = envResult.error.issues.map((i) => i.path.join('.'))

  // Demo mode in development skips validation
  if (env.app.isDemoMode && env.app.isDevelopment) {
    return { isValid: true, missing: [] }
  }

  // In production at runtime, throw. During build (SSG phase), only warn.
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
  if (env.app.isProduction && !isBuildPhase) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Set these in your deployment environment.'
    )
  } else if (isBuildPhase) {
    log.warn(`Missing environment variables during build: ${missing.join(', ')}`)
  }

  // Development: warn but don't throw
  if (env.app.isDevelopment) {
    log.warn(`Missing environment variables: ${missing.join(', ')}`)
  }

  return { isValid: false, missing }
}
