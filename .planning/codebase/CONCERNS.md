# Codebase Concerns

**Analysis Date:** 2026-04-02

## Tech Debt

**Massive File Sizes (Critical Maintainability Risk):**
- Issue: Multiple files far exceed manageable size, making navigation, testing, and review difficult
- Files:
  - `src/lib/draft-service.ts` (2616 lines) - Single static class with 40+ methods
  - `src/app/draft/[id]/page.tsx` (2372 lines) - 109 hooks, 16 useEffects, monolithic page component
  - `src/lib/league-service.ts` (1679 lines) - Another god-service
  - `src/lib/supabase.ts` (1433 lines) - Type definitions mixed with client setup
  - `src/app/create-draft/page.tsx` (1239 lines) - Wizard UI with all logic inline
  - `src/app/league/[id]/trades/page.tsx` (1234 lines)
  - `src/app/dashboard/page.tsx` (971 lines)
  - `src/components/league/MatchRecorderModal.tsx` (948 lines)
  - `src/stores/draftStore.ts` (873 lines)
  - `src/lib/league-stats-service.ts` (860 lines)
  - `src/lib/knockout-service.ts` (793 lines)
  - `src/app/league/[id]/team/[teamId]/page.tsx` (790 lines)
  - `src/lib/pokemon-api.ts` (766 lines)
  - `src/app/tournament/[id]/page.tsx` (751 lines)
  - `src/app/league/[id]/page.tsx` (743 lines)
  - `src/app/settings/page.tsx` (732 lines)
  - `src/app/league/[id]/admin/page.tsx` (728 lines)
- Impact: Extremely difficult to reason about, test, or modify safely. High risk of introducing bugs.
- Fix approach: Extract `draft-service.ts` into sub-modules (draft-creation, draft-picks, draft-queries, draft-realtime). Split draft page into custom hooks (useDraftPicking, useDraftTimer, useDraftRealtime, useDraftNotifications) and sub-components. Extract league-service similarly.

**`as any` and ESLint Suppressions Scattered Throughout:**
- Issue: ~20 instances of `as any` casts and 30+ `eslint-disable` comments indicating code working around type safety
- Files:
  - `src/app/draft/[id]/page.tsx:1638` - `let channel: any = null`
  - `src/app/dashboard/page.tsx:273` - `.map((r: any) => ...)`
  - `src/lib/pokemon-api.ts:718` - `.from('custom_formats' as any)` (table not in generated types)
  - `src/lib/pokemon-api.ts:729` - `(customFormat as any).pokemon_pricing`
  - `src/lib/notification-service.ts:202` - `(window as any).webkitAudioContext`
  - `src/lib/sound-service.ts:40` - Same webkitAudioContext cast
  - `src/utils/type-effectiveness.ts:204` - `{} as any` for record initialization
  - `src/lib/validation.ts:225,239,259,343,381,417` - Validator input params typed as `any`
  - `src/hooks/usePokemonDataManager.ts:76,309` - `JSON.stringify()` in dependency arrays (ESLint disabled)
- Impact: Type safety violations can mask runtime bugs. The `custom_formats` table cast means the DB types are out of sync with the actual schema.
- Fix approach: Regenerate Supabase types to include `custom_formats` table. Replace `any` validator inputs with `unknown`. Use `AudioContext` type assertion properly. Replace `JSON.stringify` dependency array hacks with proper deep comparison hooks.

**Unused State and Dead References:**
- Issue: State setters used only to discard values, prefixed-with-underscore types never referenced
- Files:
  - `src/app/draft/[id]/page.tsx:215` - `const [, setIsConnected] = useState(false)` (value never read)
  - `src/app/draft/[id]/page.tsx:216` - `const [, setIsLoading] = useState(true)` (value never read)
  - `src/app/draft/[id]/page.tsx:279` - `const [, setIsDraftStarting] = useState(false)` (value never read)
  - `src/app/draft/[id]/page.tsx:488` - `const _participantOnlineStatus = useMemo(...)` (underscore prefix = unused)
  - `src/lib/draft-service.ts:38-39` - `type _DraftWithParticipants` and `type _MakeDraftPickResponse` prefixed with underscore
- Impact: Dead code increases cognitive load and bundle size.
- Fix approach: Remove unused state hooks. Remove underscore-prefixed unused types. These are likely remnants of refactors.

**`JSON.stringify()` in React Dependency Arrays:**
- Issue: Using `JSON.stringify()` inside `useMemo`/`useEffect` dependency arrays is an anti-pattern
- Files:
  - `src/hooks/usePokemonDataManager.ts:76` - `}, [JSON.stringify(options)])`
  - `src/hooks/usePokemonDataManager.ts:309` - `useMemo(() => filters, [JSON.stringify(filters)])`
- Impact: Creates a new string every render for comparison. Can cause subtle bugs if JSON.stringify output is non-deterministic (property ordering).
- Fix approach: Use a `useDeepCompareMemo` or `useDeepCompareEffect` hook, or restructure to pass primitive dependencies.

## Security Considerations

**Client-Side bcrypt Hashing:**
- Risk: `bcrypt` is imported in `src/lib/draft-service.ts` (line 18) and used for password hashing/comparison (lines 155, 295). This runs client-side in Next.js App Router pages, meaning the hashing logic ships to the browser. While `bcryptjs` works in browsers, performing hash comparison on the client means the hashed password must be fetched from the database to the client.
- Files: `src/lib/draft-service.ts:155,295`
- Current mitigation: Passwords are bcrypt-hashed with cost factor 12.
- Recommendations: Move password verification to a server-side API route. The current pattern fetches the hash to the client for comparison, which exposes the hash.

**Guest ID Predictability:**
- Risk: Guest IDs use `Date.now()` + `Math.random()` which are not cryptographically secure. A fallback in `src/app/draft/[id]/page.tsx:198` generates IDs with `Math.random()`.
- Files:
  - `src/lib/user-session.ts:50,54` - Fallback generation with `Math.random()`
  - `src/app/draft/[id]/page.tsx:198` - Duplicate ID generation logic outside UserSessionService
- Current mitigation: `user-session.ts:42` tries `crypto.randomUUID()` first.
- Recommendations: Remove duplicate ID generation in draft page; always delegate to `UserSessionService.generateSecureGuestId()`. Remove `Math.random()` fallbacks entirely since `crypto.randomUUID()` is available in all modern browsers.

**No Server-Side Auth for Most Supabase Operations:**
- Risk: Most database operations go through the Supabase client with the anon key. Authorization relies entirely on RLS policies in the database. If RLS policies have gaps, any client can read/write data.
- Files: `src/lib/draft-service.ts`, `src/lib/league-service.ts`, `src/lib/trade-service.ts`
- Current mitigation: RLS policies exist (referenced in CLAUDE.md). A `FIX-RLS-POLICIES.md` file was referenced but does not exist on disk, suggesting policies may have been updated or the doc was removed.
- Recommendations: Audit all RLS policies directly in Supabase. Consider moving sensitive operations (pick validation, trade execution) to API routes or Edge Functions for defense-in-depth.

**API Routes Accept Bearer Tokens Without Refresh:**
- Risk: The AI analysis and user delete routes extract tokens from Authorization headers and create new Supabase clients per request. No CSRF protection on API routes.
- Files:
  - `src/app/api/ai/analyze-team/route.ts:27-37`
  - `src/app/api/user/delete/route.ts:17-31`
- Current mitigation: Token is verified via `getUser()`.
- Recommendations: Use `@supabase/ssr` `createServerClient` consistently for API routes instead of manual token extraction. Add CSRF tokens for state-changing operations.

**localStorage Stores Sensitive Session Data:**
- Risk: User session with userId stored in localStorage is accessible to any JS on the page (XSS vector). 40+ localStorage read/write calls across the codebase store various state.
- Files: `src/lib/user-session.ts:90,104,114,132`, `src/lib/draft-access.ts`, `src/lib/draft-templates.ts`, `src/lib/pokemon-cache.ts`
- Current mitigation: No highly sensitive data (tokens/passwords) stored in localStorage.
- Recommendations: Consider using HttpOnly cookies for session identification. Ensure no tokens ever leak into localStorage.

## Performance Bottlenecks

**Draft Page Excessive Hook Count:**
- Problem: The draft page (`src/app/draft/[id]/page.tsx`) uses 109 React hooks including 16 useEffect calls, 30+ useState, 20+ useMemo, 20+ useCallback, and 10+ useRef.
- Files: `src/app/draft/[id]/page.tsx`
- Cause: All draft logic (realtime, timers, notifications, auction, picking, activity feed) lives in a single component.
- Improvement path: Extract into focused custom hooks: `useDraftActions`, `useDraftTimers`, `useDraftActivity`, `useAuctionState`. Each hook manages its own lifecycle.

**70 `SELECT *` Queries:**
- Problem: 70 occurrences of `.select('*')` across the codebase fetch all columns from tables.
- Files: `src/lib/draft-service.ts` (5 occurrences), `src/lib/league-service.ts` (4), `src/hooks/useSupabase.ts` (2), `src/hooks/useWishlistSync.ts` (2), `src/lib/auto-skip-service.ts` (2), `src/app/league/[id]/page.tsx` (3), and 22 other files.
- Cause: Default pattern of fetching all columns rather than specifying needed fields.
- Improvement path: Replace `select('*')` with explicit column lists for each query. This reduces data transfer and prevents accidentally exposing sensitive fields (like password hashes).

**No Pagination on Several List Queries:**
- Problem: Several queries fetch unbounded result sets.
- Files:
  - `src/app/history/page.tsx:249` - Fetches all historical drafts with `select('*')`
  - `src/app/dashboard/page.tsx` - Loads all user drafts at once
  - `src/lib/league-service.ts` - Multiple unbounded queries for standings, matches
- Cause: Application assumes small data volumes.
- Improvement path: Add `.range()` or `.limit()` to all list queries. Implement cursor-based pagination for history and dashboard pages.

## Fragile Areas

**Draft Page Pick Flow (Race Condition History):**
- Files: `src/app/draft/[id]/page.tsx:506` (`pickInFlightRef`)
- Why fragile: The pick flow has a documented history of race conditions (see MEMORY.md). The fix uses a `pickInFlightRef` that suppresses realtime updates for 500ms after a pick, and manual `setDraftState()` calls bypass React's normal update flow. Any changes to the realtime subscription or state update logic risk re-introducing the "pick not showing for picker" bug.
- Safe modification: Always test pick visibility from both the picker's and other players' perspectives. Do not modify the `pickInFlightRef` guard or the non-`startTransition` refresh pattern without understanding the full race condition.
- Test coverage: No automated tests for this flow. Only manual testing catches regressions.

**Hydration Error Suppression:**
- Files: `src/lib/hydration-fix.ts`, `src/app/hydration-error-filter.tsx`
- Why fragile: Two separate files override `console.error` and `console.warn` to suppress hydration warnings caused by browser extensions. This masks legitimate hydration errors alongside extension-caused ones.
- Safe modification: If removing, verify no real hydration mismatches exist first. Consider using React 19's built-in hydration error improvements.
- Test coverage: None.

**Supabase Type Definitions Out of Sync:**
- Files: `src/lib/supabase.ts` (1433 lines), `src/lib/pokemon-api.ts:718`
- Why fragile: The `custom_formats` table requires `as any` cast because it is not in the generated types. Any schema changes in Supabase that are not reflected in the type file will cause silent failures.
- Safe modification: Regenerate types with `npx supabase gen types typescript` after any schema change.
- Test coverage: No tests verify type-schema alignment.

## Reliability Concerns

**Inconsistent Error Handling in Services:**
- Issue: Some service methods throw errors, others return `{ success: false }` objects, and some silently log and return defaults.
- Files:
  - `src/lib/admin-service.ts:107-109` - `catch` returns `false` (swallows error)
  - `src/lib/admin-service.ts:137-139` - `catch` returns `{ host: null, admins: [] }` (swallows error)
  - `src/lib/draft-service.ts` - Throws errors for caller to handle
  - `src/hooks/useEnhancedPokemonCache.ts:158-160,173-175,207-209,228-230` - Multiple catches that only `log.warn` and continue
- Impact: Callers cannot reliably distinguish between "no data" and "error fetching data".
- Fix approach: Standardize on a Result type pattern: `{ success: true, data } | { success: false, error }` across all services.

**No Automated Integration Tests:**
- Issue: Only 1 test file exists in `src/lib/__tests__/` and 15 in `tests/`. Total 334 tests cover only unit-level concerns (mocks, data validation). Zero integration tests for critical flows like pick-making, auction bidding, or realtime sync.
- Files: `tests/` directory, `src/lib/__tests__/validation.test.ts`
- Impact: The most critical and fragile flows (draft picking, realtime state sync, auction countdown) have zero automated test coverage. Regressions can only be caught manually.
- Fix approach: Add Playwright or Cypress E2E tests for: (1) creating a draft, (2) making a pick and verifying it appears, (3) auction bid flow, (4) trade proposal/acceptance.

## Scalability Concerns

**In-Memory Rate Limiter Fallback:**
- Issue: When Upstash Redis is not configured, the middleware falls back to an in-memory `Map`-based rate limiter that does not persist across serverless function invocations.
- Files: `src/middleware.ts:11-33`
- Current capacity: Works correctly only in single-server deployments.
- Limit: In Vercel's serverless environment, each function invocation gets a fresh memory space, making the in-memory limiter ineffective.
- Scaling path: Always configure Upstash Redis in production. Add a warning log when falling back to in-memory limiter.

**localStorage as Data Store:**
- Issue: Draft templates, Pokemon cache, access records, and user preferences all stored in localStorage, which has a ~5-10MB limit per origin.
- Files: `src/lib/draft-templates.ts:321,333`, `src/lib/pokemon-cache.ts:342,352`, `src/lib/draft-access.ts:24,38`
- Current capacity: Works for casual use.
- Limit: Users with many drafts or large caches may hit localStorage quota.
- Scaling path: Move Pokemon cache to IndexedDB. Implement localStorage quota monitoring and graceful degradation.

**Unbounded Realtime Channel Subscriptions:**
- Issue: Multiple components independently subscribe to Supabase realtime channels. While cleanup exists, complex navigation patterns could leave orphaned channels.
- Files: 18 `.subscribe()` calls across `src/lib/auction-service.ts`, `src/hooks/useWishlistSync.ts`, `src/hooks/useSupabase.ts`, `src/lib/draft-realtime.ts`, `src/app/draft/[id]/page.tsx`, `src/app/league/[id]/page.tsx`, `src/app/league/[id]/trades/page.tsx`, `src/lib/trade-service.ts`, `src/lib/waiver-service.ts`, `src/lib/wishlist-service.ts`
- Current capacity: Works for typical usage.
- Limit: Supabase has connection limits per project. Multiple tabs or rapid navigation could exhaust connections.
- Scaling path: Implement a centralized subscription manager that deduplicates channels and enforces max concurrent connections.

## Dependencies at Risk

**Supabase Types File is 1433 Lines of Hand-Maintained Types:**
- Risk: `src/lib/supabase.ts` is enormous and contains both generated database types and client initialization. If these are hand-edited (rather than generated), they will drift from the actual schema.
- Impact: Runtime errors when accessing columns that no longer exist or missing new columns.
- Migration plan: Split into `src/lib/supabase-client.ts` (client setup, ~50 lines) and `src/types/database.ts` (generated types). Set up CI to auto-regenerate types on schema changes.

## Test Coverage Gaps

**Draft Picking Flow:**
- What's not tested: The entire pick-making flow including optimistic updates, realtime sync, turn advancement, and race condition guards.
- Files: `src/app/draft/[id]/page.tsx`, `src/lib/draft-service.ts` (makePick), `src/stores/draftStore.ts`
- Risk: The documented race condition fix (pickInFlightRef) has no test. Any refactor risks regression.
- Priority: Critical

**Realtime Subscription Lifecycle:**
- What's not tested: Channel subscription, reconnection, cleanup on unmount.
- Files: `src/lib/draft-realtime.ts`, `src/hooks/useDraftRealtime.ts`, `src/lib/connection-manager.ts`
- Risk: Memory leaks from orphaned subscriptions. Connection exhaustion under load.
- Priority: High

**Auction Bidding UI:**
- What's not tested: Bid placement, countdown timers, winner determination from UI perspective.
- Files: `src/components/draft/AuctionBiddingInterface.tsx`, `src/lib/auction-service.ts`
- Risk: Timer drift, bid collision, incorrect winner.
- Priority: High

**League Management (Trade, Waiver, Match Recording):**
- What's not tested: Trade proposal/acceptance/execution UI, waiver claims, match KO recording.
- Files: `src/app/league/[id]/trades/page.tsx`, `src/lib/trade-service.ts`, `src/components/league/MatchRecorderModal.tsx`
- Risk: Data corruption in trade execution, incorrect standings after match recording.
- Priority: Medium

**Page-Level Components:**
- What's not tested: Zero page-level component tests. All 311 source files have no component-level test coverage.
- Files: All files in `src/app/`, `src/components/`
- Risk: UI regressions go undetected.
- Priority: Medium

---

*Concerns audit: 2026-04-02*
