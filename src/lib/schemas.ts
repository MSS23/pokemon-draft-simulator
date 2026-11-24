/**
 * Zod Validation Schemas
 *
 * Centralized request validation for all API routes.
 */

import { z } from 'zod'

// ============================================================================
// Shared Primitives
// ============================================================================

const uuidSchema = z.string().uuid()

// ============================================================================
// API Route Schemas
// ============================================================================

/** POST /api/ai/analyze-team */
export const analyzeTeamSchema = z.object({
  teamId: uuidSchema,
  leagueId: uuidSchema,
})

/**
 * POST /api/draft/create. Mirrors the create-draft page payload: nullable
 * optionals (the page sends null), timeLimit 0 = no limit, up to 1 hour, and
 * unknown settings keys stripped rather than rejected. Range checks that need
 * cross-field context (pokemonPerTeam vs draftType, tier caps) stay in the route.
 */
export const createDraftRequestSchema = z.object({
  name: z.string().max(100).nullish(),
  hostName: z.string(),
  teamName: z.string(),
  settings: z.object({
    maxTeams: z.number().int(),
    draftType: z.enum(['tiered', 'points', 'auction']),
    timeLimit: z.number().int().refine(
      (t) => t === 0 || (t >= 15 && t <= 3600),
      'timeLimit must be 0 (no limit) or 15-3600 seconds',
    ),
    pokemonPerTeam: z.number().int().nullish(),
    budgetPerTeam: z.number().int().nullish(),
    formatId: z.string().max(100).nullish(),
    scoringSystem: z.enum(['budget', 'tiered']).nullish(),
    tierConfig: z.object({ tiers: z.array(z.record(z.string(), z.unknown())) }).nullish(),
    createLeague: z.boolean().nullish(),
    splitIntoConferences: z.boolean().nullish(),
    // parseInt('') on the page becomes NaN, which JSON sends as null.
    leagueWeeks: z.number().int().min(1).max(52).nullish(),
  }),
  isPublic: z.boolean().nullish(),
  description: z.string().max(500).nullish(),
  tags: z.array(z.string().max(30)).max(10).nullish(),
  // bcrypt only hashes the first 72 bytes.
  password: z.string().min(1).max(72).nullish(),
  customFormat: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500),
    pokemonPricing: z.record(z.string(), z.number()),
  }).nullish(),
})

/** POST /api/feedback */
export const feedbackSchema = z.object({
  category: z.enum(['bug', 'feature', 'improvement', 'other']),
  title: z.string().min(1).max(200).trim(),
  description: z.string().min(1).max(2000).trim(),
  contact: z.string().max(100).trim().optional(),
})

// ============================================================================
// Validation Helper
// ============================================================================

/**
 * Parse and validate a request body against a Zod schema.
 * Returns { success: true, data } or { success: false, error } with formatted message.
 */
export function validateRequestBody<T>(
  schema: z.ZodType<T>,
  body: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body)
  if (result.success) {
    return { success: true, data: result.data }
  }

  const messages = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`
  )
  return { success: false, error: `Validation failed: ${messages.join('; ')}` }
}
