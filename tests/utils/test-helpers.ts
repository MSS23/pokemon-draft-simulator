import { vi } from 'vitest'
import type { Draft, Team, Participant } from '@/types'

/**
 * Helper functions for test setup and assertions
 */

export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const flushPromises = () => new Promise(resolve => setImmediate(resolve))

/**
 * Create a mock draft with custom properties
 */
export function createMockDraft(overrides?: Partial<Draft>): Draft {
  return {
    id: 'draft-1',
    roomCode: 'TEST01',
    name: 'Test Draft',
    hostId: 'user-1',
    format: 'snake',
    maxTeams: 4,
    budgetPerTeam: 100,
    status: 'setup',
    currentTurn: 1,
    currentRound: 1,
    settings: {
      timeLimit: 60,
      pokemonPerTeam: 6,
      formatId: 'vgc-reg-h',
      maxPokemonPerTeam: 6,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create a mock team with custom properties
 */
export function createMockTeam(overrides?: Partial<Team>): Team {
  return {
    id: `team-${Date.now()}`,
    draftId: 'draft-1',
    name: 'Test Team',
    ownerId: 'user-1',
    draftOrder: 1,
    budgetRemaining: 100,
    picks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create a mock participant with custom properties
 */
export function createMockParticipant(overrides?: Partial<Participant>): Participant {
  return {
    id: `participant-${Date.now()}`,
    draftId: 'draft-1',
    userId: 'user-1',
    displayName: 'Test User',
    teamId: 'team-1',
    isHost: false,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Mock localStorage for tests
 */
export function mockLocalStorage() {
  const store: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key])
    }),
    get store() {
      return { ...store }
    },
  }
}

/**
 * Mock Supabase response
 */
export function mockSupabaseResponse<T>(data: T, error: any = null) {
  return {
    data,
    error,
    count: null,
    status: error ? 400 : 200,
    statusText: error ? 'Bad Request' : 'OK',
  }
}

/**
 * Generate a unique ID for testing
 */
export function generateTestId(prefix = 'test') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Assert that a function throws an error with a specific message
 */
export async function expectToThrow(fn: () => Promise<any>, expectedMessage?: string) {
  try {
    await fn()
    throw new Error('Expected function to throw')
  } catch (error: any) {
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(`Expected error message to include "${expectedMessage}", got "${error.message}"`)
    }
    return error
  }
}
