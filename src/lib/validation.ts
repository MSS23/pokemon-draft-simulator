/**
 * Input Validation and Sanitization Utilities
 * Protects against XSS, SQL injection, and other malicious input
 */

// ============================================================================
// STRING SANITIZATION
// ============================================================================

/**
 * Sanitize string input to prevent XSS attacks
 * Removes HTML tags and dangerous characters
 */
export function sanitizeString(input: string | null | undefined): string {
  if (!input) return ''

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .slice(0, 1000) // Limit length to prevent overflow
}

/**
 * Sanitize display name (more permissive than general strings)
 */
export function sanitizeDisplayName(name: string | null | undefined): string {
  if (!name) return ''

  return name
    .trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .slice(0, 50) // Reasonable limit for names
}

/**
 * Sanitize Pokemon name (alphanumeric + some special chars)
 */
export function sanitizePokemonName(name: string | null | undefined): string {
  if (!name) return ''

  return name
    .trim()
    .replace(/[^a-zA-Z0-9\s\-'.]/g, '') // Allow letters, numbers, spaces, hyphens, apostrophes, dots
    .slice(0, 100)
}

// ============================================================================
// NUMBER VALIDATION
// ============================================================================

/**
 * Validate and sanitize integer input
 */
export function sanitizeInteger(
  value: number | string | null | undefined,
  min?: number,
  max?: number
): number {
  const parsed = typeof value === 'string' ? parseInt(value, 10) : value

  if (parsed === null || parsed === undefined || isNaN(parsed)) {
    return min ?? 0
  }

  let result = Math.floor(parsed)

  if (min !== undefined && result < min) result = min
  if (max !== undefined && result > max) result = max

  return result
}

/**
 * Validate budget value (0-10000)
 */
export function sanitizeBudget(budget: number | string | null | undefined): number {
  return sanitizeInteger(budget, 0, 10000)
}

/**
 * Validate cost value (0-1000)
 */
export function sanitizeCost(cost: number | string | null | undefined): number {
  return sanitizeInteger(cost, 0, 1000)
}

/**
 * Validate team count (2-20)
 */
export function sanitizeTeamCount(count: number | string | null | undefined): number {
  return sanitizeInteger(count, 2, 20)
}

// ============================================================================
// ENUM VALIDATION
// ============================================================================

/**
 * Validate draft format
 */
export function sanitizeDraftFormat(format: string | null | undefined): 'snake' | 'auction' {
  if (format === 'snake' || format === 'auction') {
    return format
  }
  return 'snake' // Default to snake
}

/**
 * Validate draft status
 */
export function sanitizeDraftStatus(
  status: string | null | undefined
): 'setup' | 'active' | 'completed' | 'paused' {
  const validStatuses = ['setup', 'active', 'completed', 'paused']
  if (status && validStatuses.includes(status)) {
    return status as 'setup' | 'active' | 'completed' | 'paused'
  }
  return 'setup'
}

/**
 * Validate auction status
 */
export function sanitizeAuctionStatus(
  status: string | null | undefined
): 'active' | 'completed' | 'cancelled' {
  const validStatuses = ['active', 'completed', 'cancelled']
  if (status && validStatuses.includes(status)) {
    return status as 'active' | 'completed' | 'cancelled'
  }
  return 'active'
}

// ============================================================================
// ID VALIDATION
// ============================================================================

/**
 * Validate UUID format
 */
export function isValidUUID(id: string | null | undefined): boolean {
  if (!id) return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}

/**
 * Validate guest/spectator ID format
 */
export function isValidGuestId(id: string | null | undefined): boolean {
  if (!id) return false
  return /^(guest|spectator)-[a-zA-Z0-9]{8,}$/.test(id)
}

/**
 * Validate user ID (UUID or guest/spectator ID)
 */
export function isValidUserId(id: string | null | undefined): boolean {
  return isValidUUID(id) || isValidGuestId(id)
}

/**
 * Sanitize and validate ID
 */
export function sanitizeId(id: string | null | undefined): string | null {
  if (!id) return null

  const sanitized = id.trim().slice(0, 100)

  if (isValidUserId(sanitized)) {
    return sanitized
  }

  return null
}

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validate URL (basic check)
 */
export function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Sanitize URL
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

// ============================================================================
// OBJECT VALIDATION
// ============================================================================

/**
 * Validate JSONB object size (prevent DoS via large objects)
 */
export function isValidJsonbSize(obj: any, maxSizeKB: number = 100): boolean {
  try {
    const jsonString = JSON.stringify(obj)
    const sizeKB = new Blob([jsonString]).size / 1024
    return sizeKB <= maxSizeKB
  } catch {
    return false
  }
}

/**
 * Sanitize JSONB object
 */
export function sanitizeJsonb<T = any>(obj: any, maxSizeKB: number = 100): T | null {
  if (!obj || typeof obj !== 'object') return null

  if (!isValidJsonbSize(obj, maxSizeKB)) {
    console.warn('JSONB object exceeds size limit')
    return null
  }

  return obj as T
}

// ============================================================================
// ARRAY VALIDATION
// ============================================================================

/**
 * Sanitize array with element validation
 */
export function sanitizeArray<T>(
  arr: any[] | null | undefined,
  elementValidator: (item: any) => T | null,
  maxLength: number = 1000
): T[] {
  if (!Array.isArray(arr)) return []

  return arr
    .slice(0, maxLength)
    .map(elementValidator)
    .filter((item): item is T => item !== null)
}

// ============================================================================
// RATE LIMITING HELPERS
// ============================================================================

/**
 * Simple in-memory rate limiter
 * For production, use Redis or similar
 */
class RateLimiter {
  private requests = new Map<string, number[]>()

  /**
   * Check if action is allowed
   * @param key - Unique identifier (user ID, IP, etc.)
   * @param maxRequests - Max requests allowed in window
   * @param windowMs - Time window in milliseconds
   */
  isAllowed(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now()
    const timestamps = this.requests.get(key) || []

    // Remove old timestamps outside window
    const validTimestamps = timestamps.filter(t => now - t < windowMs)

    if (validTimestamps.length >= maxRequests) {
      return false
    }

    validTimestamps.push(now)
    this.requests.set(key, validTimestamps)

    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      this.cleanup(windowMs)
    }

    return true
  }

  private cleanup(windowMs: number) {
    const now = Date.now()
    for (const [key, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs)
      if (valid.length === 0) {
        this.requests.delete(key)
      } else {
        this.requests.set(key, valid)
      }
    }
  }
}

export const rateLimiter = new RateLimiter()

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Validate draft creation input
 */
export interface CreateDraftInput {
  name: string
  format: 'snake' | 'auction'
  ruleset: string
  budget_per_team: number
  max_teams: number
  host_id: string
}

export function validateCreateDraftInput(input: any): CreateDraftInput | null {
  if (!input || typeof input !== 'object') return null

  const name = sanitizeString(input.name)
  if (!name || name.length < 3) return null

  const format = sanitizeDraftFormat(input.format)
  const ruleset = sanitizeString(input.ruleset)
  const budget = sanitizeBudget(input.budget_per_team)
  const maxTeams = sanitizeTeamCount(input.max_teams)
  const hostId = sanitizeId(input.host_id)

  if (!hostId) return null

  return {
    name,
    format,
    ruleset,
    budget_per_team: budget,
    max_teams: maxTeams,
    host_id: hostId
  }
}

/**
 * Validate pick creation input
 */
export interface CreatePickInput {
  draft_id: string
  team_id: string
  pokemon_id: string
  pokemon_name: string
  cost: number
  pick_order: number
  round: number
}

export function validateCreatePickInput(input: any): CreatePickInput | null {
  if (!input || typeof input !== 'object') return null

  const draftId = sanitizeId(input.draft_id)
  const teamId = sanitizeId(input.team_id)
  const pokemonId = sanitizeString(input.pokemon_id)
  const pokemonName = sanitizePokemonName(input.pokemon_name)
  const cost = sanitizeCost(input.cost)
  const pickOrder = sanitizeInteger(input.pick_order, 0, 10000)
  const round = sanitizeInteger(input.round, 1, 100)

  if (!draftId || !teamId || !pokemonId || !pokemonName) return null

  return {
    draft_id: draftId,
    team_id: teamId,
    pokemon_id: pokemonId,
    pokemon_name: pokemonName,
    cost,
    pick_order: pickOrder,
    round
  }
}

/**
 * Validate bid input
 */
export interface CreateBidInput {
  auction_id: string
  draft_id: string
  team_id: string
  team_name: string
  bid_amount: number
}

export function validateCreateBidInput(input: any): CreateBidInput | null {
  if (!input || typeof input !== 'object') return null

  const auctionId = sanitizeId(input.auction_id)
  const draftId = sanitizeId(input.draft_id)
  const teamId = sanitizeId(input.team_id)
  const teamName = sanitizeDisplayName(input.team_name)
  const bidAmount = sanitizeBudget(input.bid_amount)

  if (!auctionId || !draftId || !teamId || !teamName) return null

  return {
    auction_id: auctionId,
    draft_id: draftId,
    team_id: teamId,
    team_name: teamName,
    bid_amount: bidAmount
  }
}
