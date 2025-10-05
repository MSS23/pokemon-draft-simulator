import { describe, it, expect } from 'vitest'
import {
  sanitizeString,
  sanitizeDisplayName,
  sanitizePokemonName,
  sanitizeInteger,
  sanitizeBudget,
  sanitizeCost,
  sanitizeTeamCount,
  sanitizeDraftFormat,
  sanitizeDraftStatus,
  isValidUUID,
  isValidGuestId,
  isValidUserId,
  sanitizeId,
  isValidUrl,
  sanitizeUrl,
  validateCreateDraftInput,
  validateCreatePickInput,
  validateCreateBidInput,
  rateLimiter,
} from '../validation'

describe('String Sanitization', () => {
  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script')
    })

    it('should remove javascript: protocol', () => {
      expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)')
    })

    it('should remove event handlers', () => {
      expect(sanitizeString('test onclick=alert(1)')).toBe('test alert(1)')
    })

    it('should trim and limit length', () => {
      const longString = 'a'.repeat(2000)
      expect(sanitizeString(longString).length).toBe(1000)
    })

    it('should handle null/undefined', () => {
      expect(sanitizeString(null)).toBe('')
      expect(sanitizeString(undefined)).toBe('')
    })
  })

  describe('sanitizeDisplayName', () => {
    it('should allow regular names', () => {
      expect(sanitizeDisplayName('John Doe')).toBe('John Doe')
    })

    it('should remove dangerous characters', () => {
      expect(sanitizeDisplayName('<b>John</b>')).toBe('bJohn/b')
    })

    it('should limit length to 50 chars', () => {
      const longName = 'a'.repeat(100)
      expect(sanitizeDisplayName(longName).length).toBe(50)
    })
  })

  describe('sanitizePokemonName', () => {
    it('should allow valid Pokemon names', () => {
      expect(sanitizePokemonName('Pikachu')).toBe('Pikachu')
      expect(sanitizePokemonName("Farfetch'd")).toBe("Farfetch'd")
      expect(sanitizePokemonName('Mr. Mime')).toBe('Mr. Mime')
      expect(sanitizePokemonName('Ho-Oh')).toBe('Ho-Oh')
    })

    it('should remove invalid characters', () => {
      expect(sanitizePokemonName('Pika<script>chu')).toBe('Pikascriptchu')
      expect(sanitizePokemonName('Test@#$%')).toBe('Test')
    })
  })
})

describe('Number Validation', () => {
  describe('sanitizeInteger', () => {
    it('should parse string numbers', () => {
      expect(sanitizeInteger('42')).toBe(42)
    })

    it('should floor decimals', () => {
      expect(sanitizeInteger(42.7)).toBe(42)
    })

    it('should enforce min/max', () => {
      expect(sanitizeInteger(5, 10, 20)).toBe(10)
      expect(sanitizeInteger(25, 10, 20)).toBe(20)
      expect(sanitizeInteger(15, 10, 20)).toBe(15)
    })

    it('should return min for invalid values', () => {
      expect(sanitizeInteger('invalid', 10)).toBe(10)
      expect(sanitizeInteger(null, 5)).toBe(5)
    })
  })

  describe('sanitizeBudget', () => {
    it('should enforce 0-10000 range', () => {
      expect(sanitizeBudget(-100)).toBe(0)
      expect(sanitizeBudget(15000)).toBe(10000)
      expect(sanitizeBudget(500)).toBe(500)
    })
  })

  describe('sanitizeCost', () => {
    it('should enforce 0-1000 range', () => {
      expect(sanitizeCost(-10)).toBe(0)
      expect(sanitizeCost(2000)).toBe(1000)
      expect(sanitizeCost(50)).toBe(50)
    })
  })

  describe('sanitizeTeamCount', () => {
    it('should enforce 2-20 range', () => {
      expect(sanitizeTeamCount(1)).toBe(2)
      expect(sanitizeTeamCount(100)).toBe(20)
      expect(sanitizeTeamCount(8)).toBe(8)
    })
  })
})

describe('Enum Validation', () => {
  describe('sanitizeDraftFormat', () => {
    it('should allow valid formats', () => {
      expect(sanitizeDraftFormat('snake')).toBe('snake')
      expect(sanitizeDraftFormat('auction')).toBe('auction')
    })

    it('should default to snake for invalid', () => {
      expect(sanitizeDraftFormat('invalid')).toBe('snake')
      expect(sanitizeDraftFormat(null)).toBe('snake')
    })
  })

  describe('sanitizeDraftStatus', () => {
    it('should allow valid statuses', () => {
      expect(sanitizeDraftStatus('setup')).toBe('setup')
      expect(sanitizeDraftStatus('active')).toBe('active')
      expect(sanitizeDraftStatus('completed')).toBe('completed')
      expect(sanitizeDraftStatus('paused')).toBe('paused')
    })

    it('should default to setup for invalid', () => {
      expect(sanitizeDraftStatus('invalid')).toBe('setup')
    })
  })
})

describe('ID Validation', () => {
  describe('isValidUUID', () => {
    it('should validate correct UUIDs', () => {
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    })

    it('should reject invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false)
      expect(isValidUUID('123e4567-e89b-12d3')).toBe(false)
      expect(isValidUUID(null)).toBe(false)
    })
  })

  describe('isValidGuestId', () => {
    it('should validate guest IDs', () => {
      expect(isValidGuestId('guest-abc12345')).toBe(true)
      expect(isValidGuestId('spectator-xyz98765')).toBe(true)
    })

    it('should reject invalid guest IDs', () => {
      expect(isValidGuestId('guest-abc')).toBe(false) // too short
      expect(isValidGuestId('user-abc12345')).toBe(false)
      expect(isValidGuestId(null)).toBe(false)
    })
  })

  describe('isValidUserId', () => {
    it('should accept UUIDs and guest IDs', () => {
      expect(isValidUserId('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
      expect(isValidUserId('guest-abc12345')).toBe(true)
    })
  })

  describe('sanitizeId', () => {
    it('should return valid IDs', () => {
      expect(sanitizeId('123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567-e89b-12d3-a456-426614174000')
      expect(sanitizeId('guest-abc12345')).toBe('guest-abc12345')
    })

    it('should return null for invalid IDs', () => {
      expect(sanitizeId('invalid')).toBeNull()
      expect(sanitizeId(null)).toBeNull()
    })
  })
})

describe('URL Validation', () => {
  describe('isValidUrl', () => {
    it('should validate HTTP/HTTPS URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true)
      expect(isValidUrl('http://example.com')).toBe(true)
    })

    it('should reject invalid URLs', () => {
      expect(isValidUrl('javascript:alert(1)')).toBe(false)
      expect(isValidUrl('not-a-url')).toBe(false)
      expect(isValidUrl(null)).toBe(false)
    })
  })

  describe('sanitizeUrl', () => {
    it('should return valid URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com/')
    })

    it('should reject dangerous protocols', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull()
    })
  })
})

describe('Validation Schemas', () => {
  describe('validateCreateDraftInput', () => {
    it('should validate correct input', () => {
      const input = {
        name: 'Test Draft',
        format: 'snake',
        ruleset: 'regulation-h',
        budget_per_team: 100,
        max_teams: 8,
        host_id: 'guest-abc12345',
      }

      const result = validateCreateDraftInput(input)
      expect(result).not.toBeNull()
      expect(result?.name).toBe('Test Draft')
      expect(result?.format).toBe('snake')
    })

    it('should reject invalid input', () => {
      expect(validateCreateDraftInput(null)).toBeNull()
      expect(validateCreateDraftInput({ name: 'ab' })).toBeNull() // name too short
      expect(validateCreateDraftInput({ name: 'Test', host_id: 'invalid' })).toBeNull()
    })

    it('should sanitize values', () => {
      const input = {
        name: '<script>Test</script>',
        format: 'invalid',
        ruleset: 'test',
        budget_per_team: -100,
        max_teams: 100,
        host_id: 'guest-abc12345',
      }

      const result = validateCreateDraftInput(input)
      expect(result?.format).toBe('snake') // defaulted
      expect(result?.budget_per_team).toBe(0) // min clamped
      expect(result?.max_teams).toBe(20) // max clamped
    })
  })

  describe('validateCreatePickInput', () => {
    it('should validate correct input', () => {
      const input = {
        draft_id: '123e4567-e89b-12d3-a456-426614174000',
        team_id: '123e4567-e89b-12d3-a456-426614174001',
        pokemon_id: '25',
        pokemon_name: 'Pikachu',
        cost: 10,
        pick_order: 1,
        round: 1,
      }

      const result = validateCreatePickInput(input)
      expect(result).not.toBeNull()
      expect(result?.pokemon_name).toBe('Pikachu')
    })

    it('should reject invalid input', () => {
      expect(validateCreatePickInput(null)).toBeNull()
      expect(validateCreatePickInput({ draft_id: 'invalid' })).toBeNull()
    })
  })

  describe('validateCreateBidInput', () => {
    it('should validate correct input', () => {
      const input = {
        auction_id: '123e4567-e89b-12d3-a456-426614174000',
        draft_id: '123e4567-e89b-12d3-a456-426614174001',
        team_id: '123e4567-e89b-12d3-a456-426614174002',
        team_name: 'Team Rocket',
        bid_amount: 50,
      }

      const result = validateCreateBidInput(input)
      expect(result).not.toBeNull()
      expect(result?.team_name).toBe('Team Rocket')
    })
  })
})

describe('Rate Limiter', () => {
  it('should allow requests within limit', () => {
    const key = 'test-user-1'
    expect(rateLimiter.isAllowed(key, 3, 1000)).toBe(true)
    expect(rateLimiter.isAllowed(key, 3, 1000)).toBe(true)
    expect(rateLimiter.isAllowed(key, 3, 1000)).toBe(true)
  })

  it('should block requests over limit', () => {
    const key = 'test-user-2'
    rateLimiter.isAllowed(key, 2, 1000)
    rateLimiter.isAllowed(key, 2, 1000)
    expect(rateLimiter.isAllowed(key, 2, 1000)).toBe(false)
  })

  it('should reset after time window', async () => {
    const key = 'test-user-3'
    rateLimiter.isAllowed(key, 1, 100)
    expect(rateLimiter.isAllowed(key, 1, 100)).toBe(false)

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(rateLimiter.isAllowed(key, 1, 100)).toBe(true)
  })
})
