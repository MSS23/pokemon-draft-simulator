import { describe, it, expect } from 'vitest'
import { COUNTRIES, countryFlag, countryName } from '@/lib/countries'

describe('countries', () => {
  it('builds regional-indicator flag emoji from ISO codes (case-insensitive)', () => {
    expect(countryFlag('GB')).toBe('\u{1F1EC}\u{1F1E7}')
    expect(countryFlag('gb')).toBe('\u{1F1EC}\u{1F1E7}')
    expect(countryFlag('JP')).toBe('\u{1F1EF}\u{1F1F5}')
  })

  it('returns empty string for invalid or missing codes', () => {
    expect(countryFlag(null)).toBe('')
    expect(countryFlag('')).toBe('')
    expect(countryFlag('GBR')).toBe('')
    expect(countryFlag('1A')).toBe('')
  })

  it('resolves English country names', () => {
    expect(countryName('JP')).toBe('Japan')
    expect(countryName('GB')).toBe('United Kingdom')
  })

  it('exposes a sorted dropdown list with flags', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200)
    const names = COUNTRIES.map(c => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    const gb = COUNTRIES.find(c => c.code === 'GB')
    expect(gb?.flag).toBe('\u{1F1EC}\u{1F1E7}')
  })
})
