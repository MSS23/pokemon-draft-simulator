/**
 * Security Test Suite
 * Tests for password hashing, input validation, and rate limiting
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { hashPassword, verifyPassword, validatePasswordStrength, generateSecurePassword } from '../src/lib/password'
import { validate, createDraftParamsSchema, makePickParamsSchema, roomCodeSchema } from '../src/lib/validation-schemas'
import { rateLimiter, RATE_LIMITS, calculateBackoff, backoffTracker } from '../src/lib/rate-limiter'

// ============================================================================
// PASSWORD HASHING TESTS
// ============================================================================

describe('Password Security', () => {
  it('should hash passwords with bcrypt', async () => {
    const password = 'SecurePass123!'
    const hash = await hashPassword(password)

    // Hash should not equal plaintext
    expect(hash).not.toBe(password)

    // Should be bcrypt format
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true)

    // Should be reasonable length (bcrypt hashes are 60 chars)
    expect(hash.length).toBe(60)
  })

  it('should verify correct password', async () => {
    const password = 'SecurePass123!'
    const hash = await hashPassword(password)
    const isValid = await verifyPassword(password, hash)

    expect(isValid).toBe(true)
  })

  it('should reject incorrect password', async () => {
    const password = 'SecurePass123!'
    const hash = await hashPassword(password)
    const isValid = await verifyPassword('WrongPassword!', hash)

    expect(isValid).toBe(false)
  })

  it('should reject empty passwords', async () => {
    await expect(hashPassword('')).rejects.toThrow()
    await expect(hashPassword(null as any)).rejects.toThrow()
  })

  it('should enforce minimum password length', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 8 characters')
  })

  it('should enforce maximum password length', async () => {
    const longPassword = 'a'.repeat(200)
    await expect(hashPassword(longPassword)).rejects.toThrow('less than 128 characters')
  })

  it('should produce different hashes for same password', async () => {
    const password = 'SecurePass123!'
    const hash1 = await hashPassword(password)
    const hash2 = await hashPassword(password)

    // Different salts mean different hashes
    expect(hash1).not.toBe(hash2)

    // But both should verify
    expect(await verifyPassword(password, hash1)).toBe(true)
    expect(await verifyPassword(password, hash2)).toBe(true)
  })

  it('should validate password strength', () => {
    // Weak passwords
    const weak1 = validatePasswordStrength('abc')
    expect(weak1.isValid).toBe(false)
    expect(weak1.errors.length).toBeGreaterThan(0)

    const weak2 = validatePasswordStrength('password123')
    expect(weak2.errors.some(e => e.includes('common patterns'))).toBe(true)

    // Medium password
    const medium = validatePasswordStrength('SecurePass1')
    expect(medium.strength).toBe('medium')

    // Strong password
    const strong = validatePasswordStrength('SecurePass123!')
    expect(strong.isValid).toBe(true)
    expect(strong.strength).toBe('strong')
  })

  it('should require at least 2 character types', () => {
    const allLowercase = validatePasswordStrength('abcdefgh')
    expect(allLowercase.isValid).toBe(false)
    expect(allLowercase.errors.some(e => e.includes('at least 2 of'))).toBe(true)
  })

  it('should generate secure random passwords', () => {
    const password = generateSecurePassword(16)

    expect(password.length).toBe(16)

    // Should contain at least one of each type
    expect(/[a-z]/.test(password)).toBe(true)
    expect(/[A-Z]/.test(password)).toBe(true)
    expect(/[0-9]/.test(password)).toBe(true)
    expect(/[^a-zA-Z0-9]/.test(password)).toBe(true)

    // Should be strong
    const strength = validatePasswordStrength(password)
    expect(strength.isValid).toBe(true)
  })
})

// ============================================================================
// INPUT VALIDATION TESTS
// ============================================================================

describe('Input Validation', () => {
  describe('Draft Creation', () => {
    it('should validate correct draft creation params', () => {
      const params = {
        name: 'Test Draft',
        hostName: 'HostUser',
        teamName: 'Team Alpha',
        settings: {
          maxTeams: 4,
          draftType: 'snake' as const,
          timeLimit: 60,
          pokemonPerTeam: 6,
          budgetPerTeam: 100
        }
      }

      const result = validate(createDraftParamsSchema, params)
      expect(result.success).toBe(true)
    })

    it('should reject draft name too short', () => {
      const params = {
        name: 'AB', // Too short (min 3)
        hostName: 'HostUser',
        teamName: 'Team Alpha',
        settings: {
          maxTeams: 4,
          draftType: 'snake' as const,
          timeLimit: 60,
          pokemonPerTeam: 6
        }
      }

      const result = validate(createDraftParamsSchema, params)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('at least 3 characters')
      }
    })

    it('should reject invalid draft type', () => {
      const params = {
        name: 'Test Draft',
        hostName: 'HostUser',
        teamName: 'Team Alpha',
        settings: {
          maxTeams: 4,
          draftType: 'invalid' as any,
          timeLimit: 60,
          pokemonPerTeam: 6
        }
      }

      const result = validate(createDraftParamsSchema, params)
      expect(result.success).toBe(false)
    })

    it('should reject too many teams', () => {
      const params = {
        name: 'Test Draft',
        hostName: 'HostUser',
        teamName: 'Team Alpha',
        settings: {
          maxTeams: 100, // Max is 16
          draftType: 'snake' as const,
          timeLimit: 60,
          pokemonPerTeam: 6
        }
      }

      const result = validate(createDraftParamsSchema, params)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('16 teams')
      }
    })

    it('should reject negative time limit', () => {
      const params = {
        name: 'Test Draft',
        hostName: 'HostUser',
        teamName: 'Team Alpha',
        settings: {
          maxTeams: 4,
          draftType: 'snake' as const,
          timeLimit: -10, // Negative
          pokemonPerTeam: 6
        }
      }

      const result = validate(createDraftParamsSchema, params)
      expect(result.success).toBe(false)
    })

    it('should sanitize whitespace in names', () => {
      const params = {
        name: '  Test Draft  ',
        hostName: '  Valid Name  ',
        teamName: '  Team Alpha  ',
        settings: {
          maxTeams: 4,
          draftType: 'snake' as const,
          timeLimit: 60,
          pokemonPerTeam: 6
        }
      }

      const result = validate(createDraftParamsSchema, params)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('Test Draft')
        expect(result.data.hostName).toBe('Valid Name')
        expect(result.data.teamName).toBe('Team Alpha')
      }
    })

    it('should reject names with invalid characters', () => {
      const params = {
        name: 'Test Draft',
        hostName: '<script>alert(1)</script>', // XSS attempt
        teamName: 'Team Alpha',
        settings: {
          maxTeams: 4,
          draftType: 'snake' as const,
          timeLimit: 60,
          pokemonPerTeam: 6
        }
      }

      const result = validate(createDraftParamsSchema, params)
      expect(result.success).toBe(false)
    })
  })

  describe('Pick Validation', () => {
    it('should validate correct pick params', () => {
      const params = {
        draftId: 'draft-123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        pokemonId: '25',
        pokemonName: 'Pikachu',
        cost: 50
      }

      const result = validate(makePickParamsSchema, params)
      expect(result.success).toBe(true)
    })

    it('should reject invalid Pokemon ID', () => {
      const params = {
        draftId: 'draft-123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        pokemonId: 'abc', // Must be numeric
        pokemonName: 'Pikachu',
        cost: 50
      }

      const result = validate(makePickParamsSchema, params)
      expect(result.success).toBe(false)
    })

    it('should reject negative cost', () => {
      const params = {
        draftId: 'draft-123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        pokemonId: '25',
        pokemonName: 'Pikachu',
        cost: -10
      }

      const result = validate(makePickParamsSchema, params)
      expect(result.success).toBe(false)
    })

    it('should reject excessive cost', () => {
      const params = {
        draftId: 'draft-123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        pokemonId: '25',
        pokemonName: 'Pikachu',
        cost: 500 // Max is 200
      }

      const result = validate(makePickParamsSchema, params)
      expect(result.success).toBe(false)
    })
  })

  describe('Room Code Validation', () => {
    it('should validate correct room code', () => {
      const result = validate(roomCodeSchema, 'ABC123')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('ABC123')
      }
    })

    it('should convert lowercase to uppercase', () => {
      const result = validate(roomCodeSchema, 'abc123')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('ABC123')
      }
    })

    it('should reject invalid format', () => {
      const invalid = ['abc', 'abcdefg', 'abc!23', 'ABC-123']
      invalid.forEach(code => {
        const result = validate(roomCodeSchema, code)
        expect(result.success).toBe(false)
      })
    })
  })
})

// ============================================================================
// RATE LIMITING TESTS
// ============================================================================

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Reset rate limiter between tests
    rateLimiter.reset('test-user')
    rateLimiter.reset('test-draft')
  })

  it('should allow requests within limit', () => {
    const config = { maxRequests: 5, windowMs: 60000 }

    for (let i = 0; i < 5; i++) {
      const result = rateLimiter.check('test-user', config)
      expect(result.success).toBe(true)
      expect(result.remaining).toBe(5 - i - 1)
    }
  })

  it('should block requests exceeding limit', () => {
    const config = { maxRequests: 3, windowMs: 60000 }

    // Make 3 allowed requests
    for (let i = 0; i < 3; i++) {
      rateLimiter.check('test-user', config)
    }

    // 4th request should be blocked
    const result = rateLimiter.check('test-user', config)
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.message).toBeTruthy()
  })

  it('should reset after time window', async () => {
    const config = { maxRequests: 2, windowMs: 100 } // 100ms window

    // Make 2 requests
    rateLimiter.check('test-user', config)
    rateLimiter.check('test-user', config)

    // 3rd should be blocked
    let result = rateLimiter.check('test-user', config)
    expect(result.success).toBe(false)

    // Wait for window to pass
    await new Promise(resolve => setTimeout(resolve, 150))

    // Should be allowed again
    result = rateLimiter.check('test-user', config)
    expect(result.success).toBe(true)
  })

  it('should track different keys separately', () => {
    const config = { maxRequests: 2, windowMs: 60000 }

    // User A makes 2 requests
    rateLimiter.check('user-a', config)
    rateLimiter.check('user-a', config)

    // User B should still be allowed
    const result = rateLimiter.check('user-b', config)
    expect(result.success).toBe(true)
  })

  it('should return correct resetAt timestamp', () => {
    const config = { maxRequests: 1, windowMs: 60000 }
    const now = Date.now()

    const result = rateLimiter.check('test-user', config)

    expect(result.resetAt).toBeGreaterThan(now)
    expect(result.resetAt).toBeLessThanOrEqual(now + 60000)
  })

  it('should handle concurrent requests correctly', () => {
    const config = { maxRequests: 5, windowMs: 60000 }
    const results: boolean[] = []

    // Simulate 10 concurrent requests
    for (let i = 0; i < 10; i++) {
      const result = rateLimiter.check('test-user', config)
      results.push(result.success)
    }

    // First 5 should succeed, next 5 should fail
    const successes = results.filter(r => r).length
    const failures = results.filter(r => !r).length

    expect(successes).toBe(5)
    expect(failures).toBe(5)
  })

  describe('Predefined Rate Limits', () => {
    it('should define reasonable limits for draft creation', () => {
      expect(RATE_LIMITS.CREATE_DRAFT.maxRequests).toBe(5)
      expect(RATE_LIMITS.CREATE_DRAFT.windowMs).toBe(60 * 60 * 1000) // 1 hour
    })

    it('should define reasonable limits for password verification', () => {
      expect(RATE_LIMITS.PASSWORD_VERIFY.maxRequests).toBe(10)
      expect(RATE_LIMITS.PASSWORD_VERIFY.windowMs).toBe(60 * 60 * 1000) // 1 hour
    })

    it('should allow more frequent picks than draft creation', () => {
      expect(RATE_LIMITS.MAKE_PICK.maxRequests).toBeGreaterThan(RATE_LIMITS.CREATE_DRAFT.maxRequests)
    })
  })
})

// ============================================================================
// EXPONENTIAL BACKOFF TESTS
// ============================================================================

describe('Exponential Backoff', () => {
  it('should calculate backoff with exponential growth', () => {
    const backoff1 = calculateBackoff(0, 1000, 60000)
    const backoff2 = calculateBackoff(1, 1000, 60000)
    const backoff3 = calculateBackoff(2, 1000, 60000)

    // Each backoff should be larger
    expect(backoff2).toBeGreaterThan(backoff1)
    expect(backoff3).toBeGreaterThan(backoff2)
  })

  it('should respect maximum delay', () => {
    const maxDelay = 10000
    const backoff = calculateBackoff(10, 1000, maxDelay)

    // Should not exceed max (plus jitter margin)
    expect(backoff).toBeLessThanOrEqual(maxDelay * 1.2)
  })

  it('should add jitter to prevent thundering herd', () => {
    const backoffs = new Set()

    // Generate multiple backoffs with same parameters
    for (let i = 0; i < 10; i++) {
      const backoff = calculateBackoff(3, 1000, 60000)
      backoffs.add(backoff)
    }

    // Should have some variation due to jitter
    expect(backoffs.size).toBeGreaterThan(5)
  })

  describe('Backoff Tracker', () => {
    beforeEach(() => {
      // Clear any existing state
      ;(backoffTracker as any).attempts.clear()
    })

    it('should record failures and lock access', () => {
      const key = 'test-operation'

      // Record multiple failures
      for (let i = 0; i < 3; i++) {
        backoffTracker.recordFailure(key)
      }

      // Should be locked
      expect(backoffTracker.isLocked(key)).toBe(true)
    })

    it('should unlock after backoff period', async () => {
      const key = 'test-operation-2'

      // Record failure
      backoffTracker.recordFailure(key)

      // Should be locked
      expect(backoffTracker.isLocked(key)).toBe(true)

      // Wait for backoff to expire (first failure is short)
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Should be unlocked
      expect(backoffTracker.isLocked(key)).toBe(false)
    })

    it('should reset on success', () => {
      const key = 'test-operation-3'

      // Record failures
      backoffTracker.recordFailure(key)
      backoffTracker.recordFailure(key)

      // Record success
      backoffTracker.recordSuccess(key)

      // Should no longer be locked
      expect(backoffTracker.isLocked(key)).toBe(false)
    })
  })
})

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Security Integration', () => {
  it('should validate and rate limit draft creation flow', () => {
    const params = {
      name: 'Secure Draft',
      hostName: 'SecureHost',
      teamName: 'Secure Team',
      settings: {
        maxTeams: 4,
        draftType: 'snake' as const,
        timeLimit: 60,
        pokemonPerTeam: 6,
        budgetPerTeam: 100
      }
    }

    // Validate input
    const validation = validate(createDraftParamsSchema, params)
    expect(validation.success).toBe(true)

    // Check rate limit
    const rateLimitResult = rateLimiter.check(
      'user:test-host:create-draft',
      RATE_LIMITS.CREATE_DRAFT
    )
    expect(rateLimitResult.success).toBe(true)
  })

  it('should prevent rapid draft creation abuse', () => {
    const userId = 'abuse-test-user'
    const config = RATE_LIMITS.CREATE_DRAFT
    let blockedCount = 0

    // Try to create many drafts rapidly
    for (let i = 0; i < 10; i++) {
      const result = rateLimiter.check(`user:${userId}:create-draft`, config)
      if (!result.success) {
        blockedCount++
      }
    }

    // Should block some requests
    expect(blockedCount).toBeGreaterThan(0)
    // Should allow some requests (up to limit)
    expect(blockedCount).toBeLessThan(10)
  })
})
