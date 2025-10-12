import { vi } from 'vitest'

/**
 * Mock Supabase client for testing
 */
export const createMockSupabaseClient = () => {
  const mockData: Record<string, any> = {
    drafts: [],
    teams: [],
    participants: [],
    picks: [],
    auctions: [],
    user_profiles: [],
  }

  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    unsubscribe: vi.fn(),
  }

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn((columns?: string) => ({
        eq: vi.fn((column: string, value: any) => ({
          single: vi.fn(async () => {
            const item = mockData[table]?.find((item: any) => item[column] === value)
            return { data: item || null, error: item ? null : { message: 'Not found' } }
          }),
          maybeSingle: vi.fn(async () => {
            const item = mockData[table]?.find((item: any) => item[column] === value)
            return { data: item || null, error: null }
          }),
        })),
        in: vi.fn((column: string, values: any[]) => ({
          async: vi.fn(async () => {
            const items = mockData[table]?.filter((item: any) => values.includes(item[column]))
            return { data: items || [], error: null }
          }),
        })),
      })),
      insert: vi.fn((data: any) => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => {
            const id = `${table}-${Date.now()}`
            const newItem = { ...data, id }
            if (!mockData[table]) mockData[table] = []
            mockData[table].push(newItem)
            return { data: newItem, error: null }
          }),
        })),
      })),
      update: vi.fn((data: any) => ({
        eq: vi.fn((column: string, value: any) => ({
          async: vi.fn(async () => {
            const index = mockData[table]?.findIndex((item: any) => item[column] === value)
            if (index >= 0) {
              mockData[table][index] = { ...mockData[table][index], ...data }
              return { data: mockData[table][index], error: null }
            }
            return { data: null, error: { message: 'Not found' } }
          }),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn((column: string, value: any) => ({
          async: vi.fn(async () => {
            const index = mockData[table]?.findIndex((item: any) => item[column] === value)
            if (index >= 0) {
              mockData[table].splice(index, 1)
              return { data: null, error: null }
            }
            return { data: null, error: { message: 'Not found' } }
          }),
        })),
      })),
    })),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: null,
      })),
      signUp: vi.fn(async () => ({
        data: { user: { id: 'user-1', email: 'test@example.com' }, session: null },
        error: null,
      })),
      signIn: vi.fn(async () => ({
        data: { user: { id: 'user-1', email: 'test@example.com' }, session: {} },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  }
}

/**
 * Mock vi.mock setup for @/lib/supabase
 */
export const mockSupabaseModule = () => {
  vi.mock('@/lib/supabase', () => ({
    supabase: createMockSupabaseClient(),
  }))
}
