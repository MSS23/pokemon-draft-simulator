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
const pokemonIdSchema = z.string().min(1).max(50)
const displayNameSchema = z.string().min(1).max(50).trim()

// ============================================================================
// API Route Schemas
// ============================================================================

/** POST /api/ai/analyze-team */
export const analyzeTeamSchema = z.object({
  teamId: uuidSchema,
  leagueId: uuidSchema,
})

/** Draft creation payload (used by DraftService) */
export const createDraftSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  format: z.string().min(1).max(50),
  draftType: z.enum(['tiered', 'points', 'auction']),
  teamCount: z.number().int().min(2).max(8),
  budgetPerTeam: z.number().int().min(50).max(200),
  pokemonPerTeam: z.number().int().min(3).max(15),
  timeLimit: z.number().int().min(15).max(300).optional(),
  isPublic: z.boolean().optional().default(false),
})

/** Make pick payload */
export const makePickSchema = z.object({
  draftId: uuidSchema,
  teamId: uuidSchema,
  pokemonId: pokemonIdSchema,
  pokemonName: z.string().min(1).max(100),
  cost: z.number().int().min(0),
})

/** Place bid payload */
export const placeBidSchema = z.object({
  auctionId: uuidSchema,
  teamId: uuidSchema,
  bidAmount: z.number().int().min(1),
})

/** Join draft payload */
export const joinDraftSchema = z.object({
  draftId: uuidSchema,
  displayName: displayNameSchema,
  userId: z.string().optional(),
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
