# Testing Patterns

**Analysis Date:** 2026-04-02

## Test Framework

**Runner:**
- Vitest 3.2.4
- Config: `vitest.config.ts`

**Environment:** happy-dom (DOM simulation)

**Assertion Library:**
- Vitest built-in `expect` (Jest-compatible)
- `@testing-library/jest-dom` matchers (extended via setup file)

**Supporting Libraries:**
- `@testing-library/react` 16.3.0 - Component rendering
- `@testing-library/user-event` 14.6.1 - User interaction simulation
- `@testing-library/dom` 10.4.1 - DOM queries
- `fake-indexeddb` 6.2.5 - IndexedDB mock for cache tests

**Run Commands:**
```bash
npm test                    # Run all tests in watch mode (vitest default)
npx vitest --run            # Run all tests once (CI mode)
npm test -- --coverage      # Run with coverage report
npm test tests/format-reg-h.test.ts  # Run specific test file
```

## Configuration

**`vitest.config.ts`:**
```typescript
export default defineConfig({
  test: {
    globals: true,           // describe/it/expect available without import
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
      exclude: [
        'node_modules/', 'tests/', '**/*.test.{ts,tsx}',
        'scripts/', '*.config.{js,ts}', 'public/',
        '.next/', 'coverage/', 'src/types/**',
        'src/lib/supabase.ts',  // Generated types excluded
      ],
    },
  },
  resolve: {
    alias: { '@': './src' },  // Mirrors tsconfig path alias
  },
})
```

**Setup File (`tests/setup.ts`):**
- Cleans up after each test: `cleanup()` + `vi.clearAllMocks()`
- Mocks `window.matchMedia` (responsive design)
- Mocks `localStorage` and `sessionStorage` with in-memory stores

## Test File Organization

**Location:**
- Primary: `tests/` directory at project root (13 test files)
- Secondary: `src/lib/__tests__/` for co-located tests (1 file: `validation.test.ts`)

**Naming:**
- `{module-name}.test.ts` for service/logic tests
- No `.spec.ts` files used

**Structure:**
```
tests/
  setup.ts                          # Global test setup
  utils/
    test-helpers.ts                 # Mock factories, assertion helpers
    test-data.ts                    # Static fixture data
    supabase-mock.ts                # Reusable Supabase client mock
  admin-service.test.ts             # AdminService tests
  auction-service.test.ts           # AuctionService tests
  draft-service.test.ts             # DraftService tests
  draftStore.test.ts                # Zustand store tests
  format-reg-h.test.ts              # VGC Reg H format validation
  format-validator.test.ts          # FormatValidator tests
  league-service.test.ts            # LeagueService tests
  middleware.test.ts                 # RateLimiter tests
  pokemon-data-performance.test.ts  # Performance benchmarks
  pokemon-search-index.test.ts      # Search index tests
  trade-service.test.ts             # TradeService tests
  user-session.test.ts              # UserSessionService tests
  wishlist-service.test.ts          # WishlistService tests
src/lib/__tests__/
  validation.test.ts                # Input sanitization/validation
```

## Test Results

**Current Status (2026-04-02):**
- 14 test files, all passing
- 414 total tests, all passing
- Total duration: ~4.6s

**Breakdown by file:**
| File | Tests | Focus |
|------|-------|-------|
| `validation.test.ts` | 41 | String sanitization, input validation, rate limiting |
| `draftStore.test.ts` | 28 | Zustand store state management, selectors |
| `admin-service.test.ts` | 20 | Admin CRUD, permission checks |
| `pokemon-data-performance.test.ts` | 20 | Performance benchmarks |
| `format-reg-h.test.ts` | ~80 | VGC Reg H bans, legality, costs (uses `it.each`) |
| `format-validator.test.ts` | ~30 | Format validation engine |
| `pokemon-search-index.test.ts` | ~20 | Search, filter, index |
| `draft-service.test.ts` | ~30 | Draft CRUD, joining, picks |
| `league-service.test.ts` | ~30 | League CRUD, matches, standings |
| `trade-service.test.ts` | ~20 | Trade proposals, acceptance, execution |
| `wishlist-service.test.ts` | ~20 | Wishlist add/remove/reorder |
| `auction-service.test.ts` | 7 | Auction bidding, cache |
| `middleware.test.ts` | ~15 | Rate limiting logic |
| `user-session.test.ts` | ~10 | Guest session management |

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('ServiceName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('methodName', () => {
    it('should handle expected case', async () => {
      // Arrange - set up mocks
      // Act - call the method
      // Assert - check results
    })

    it('should throw when supabase is not available', async () => {
      // Standard null-check test pattern
    })
  })
})
```

**Common Patterns:**
- `beforeEach` with `vi.clearAllMocks()` in every test suite
- Store tests reset state: `useDraftStore.getState().reset()`
- Supabase availability tests use `Object.defineProperty` to temporarily set module to null
- `it.each()` for parameterized tests (especially format ban lists)

## Mocking

**Framework:** Vitest `vi.mock()` and `vi.fn()`

**Supabase Mock Pattern (most common):**
```typescript
// Module-level mock declaration (hoisted automatically)
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn(),
  },
}))

// Cast for type-safe access in tests
const mockSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
}

// Chain mock setup for Supabase query builder
const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null })
const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
mockSupabase.from.mockReturnValue({ select: mockSelect })
```

**Logger Mock (used in every service test):**
```typescript
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))
```

**Other Mocked Modules:**
- `@/lib/notification-service` - Notification methods stubbed
- `@/lib/user-session` - Session methods stubbed
- `@/lib/room-utils` - Returns fixed room code
- `@/domain/rules` - Returns mock validation results
- `@/lib/pokemon-api` - Returns mock Pokemon data
- `@/utils/draft` - Returns simple snake order
- `bcryptjs` - Returns predictable hashed values

**What to Mock:**
- All Supabase database calls
- Logger (always)
- External service dependencies
- Notification service
- Auth/session management

**What NOT to Mock:**
- The module under test
- Pure utility functions (validation, sanitization, format rules)
- In-memory data structures (Zustand store, search index, rate limiter)

## Fixtures and Factories

**Factory Functions (`tests/utils/test-helpers.ts`):**
```typescript
// Create mock entities with override support
createMockDraft(overrides?: Partial<Draft>): Draft
createMockTeam(overrides?: Partial<Team>): Team
createMockParticipant(overrides?: Partial<Participant>): Participant

// Usage
const draft = createMockDraft({ id: 'draft-1', name: 'Test Draft' })
const team = createMockTeam({ budgetRemaining: 50 })
```

**Static Fixtures (`tests/utils/test-data.ts`):**
```typescript
export const mockDraft: Draft = { /* full draft object */ }
export const mockTeams: Team[] = [ /* array of teams */ ]
export const mockAuthUser = { /* mock auth user */ }
```

**Mock Pokemon Generator (used in search/format tests):**
```typescript
function generateMockPokemon(id: number, options?: Partial<CachedPokemon>): CachedPokemon
```

**Supabase Client Mock (`tests/utils/supabase-mock.ts`):**
```typescript
// Full mock client with in-memory data store
createMockSupabaseClient()
// Convenience setup function
mockSupabaseModule()
```

**Helper Utilities:**
```typescript
waitFor(ms: number): Promise<void>
flushPromises(): Promise<void>
mockSupabaseResponse<T>(data: T, error?): SupabaseResponse
generateTestId(prefix?): string
expectToThrow(fn, expectedMessage?): Promise<Error>
```

## Coverage

**Requirements:** 60% threshold for lines, functions, branches, and statements

**View Coverage:**
```bash
npm test -- --coverage       # Generate coverage report
# Reports output to: coverage/ directory
# Formats: text (console), html, json, lcov
```

**Excluded from Coverage:**
- `node_modules/`, `tests/`, test files
- `scripts/`, config files, `public/`, `.next/`
- `src/types/**` (type-only files)
- `src/lib/supabase.ts` (generated database types)

## Test Types

**Unit Tests (majority):**
- Service method tests: `admin-service.test.ts`, `auction-service.test.ts`, `draft-service.test.ts`, `league-service.test.ts`, `trade-service.test.ts`, `wishlist-service.test.ts`
- Store tests: `draftStore.test.ts` (state management, selectors, actions)
- Utility tests: `validation.test.ts`, `middleware.test.ts`
- Data structure tests: `pokemon-search-index.test.ts`

**Format Validation Tests:**
- `format-reg-h.test.ts` - Validates compiled VGC Reg H format against real data
- `format-validator.test.ts` - Tests format rules engine logic
- These read compiled JSON from `public/data/` (requires `npm run build:formats` first)

**Performance Benchmark Tests:**
- `pokemon-data-performance.test.ts` - Timing assertions on search, filter, validation, caching
- Tests include explicit timing thresholds (e.g., "should search 1000 Pokemon in < 50ms")

**Integration Tests:** None (no end-to-end tests, no component rendering tests in current suite)

**E2E Tests:** Not used (no Playwright/Cypress)

## Common Patterns

**Async Testing:**
```typescript
it('should handle async operation', async () => {
  const result = await service.someMethod('param')
  expect(result).toEqual(expected)
})

// Async error testing
it('should throw on failure', async () => {
  await expect(
    service.someMethod('bad-param')
  ).rejects.toThrow('Expected error')
})
```

**Error Testing:**
```typescript
it('should return error when supabase is not available', async () => {
  // Temporarily override supabase to null
  const supabaseModule = await import('@/lib/supabase')
  const original = supabaseModule.supabase
  Object.defineProperty(supabaseModule, 'supabase', {
    value: null, writable: true, configurable: true,
  })

  const result = await service.someMethod()
  expect(result).toEqual({ success: false, error: 'Supabase not available' })

  // Restore
  Object.defineProperty(supabaseModule, 'supabase', {
    value: original, writable: true, configurable: true,
  })
})
```

**Parameterized Testing:**
```typescript
const paradoxPokemon = ['great-tusk', 'iron-valiant', 'flutter-mane', ...]

it.each(paradoxPokemon)('should ban %s', (pokemon) => {
  expect(compiledFormat.legalPokemon).not.toContain(pokemon)
})
```

**Zustand Store Testing:**
```typescript
// Direct state access without React rendering
const state = useDraftStore.getState()
expect(state.draft).toBeNull()

// Action testing
useDraftStore.getState().setDraft(mockDraft)
const updated = useDraftStore.getState()
expect(updated.draft?.name).toBe('Test Draft')
```

**Private Cache Access (test-only):**
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serviceAny = auctionService as any
serviceAny.bidHistoryCache.set('auction-99', cachedBids)
```

## Test Gaps

**Not Currently Tested:**
- React component rendering (no `render()` from testing-library in current tests)
- Hooks (no `renderHook()` tests)
- Real-time Supabase subscriptions
- Client-side routing / navigation
- UI interactions (click, drag-and-drop, form submission)
- Error boundaries
- PWA functionality
- Image loading / fallback behavior
- CSS / visual regression

**Areas with Coverage:**
- All major services (draft, league, trade, wishlist, auction, admin)
- Zustand store (state, actions, selectors)
- Format validation and compiled format data
- Input sanitization and security validation
- Rate limiting logic
- Pokemon search index
- User session management
- Performance benchmarks for data operations

---

*Testing analysis: 2026-04-02*
