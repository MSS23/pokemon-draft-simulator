# Coding Conventions

**Analysis Date:** 2026-04-02

## Naming Patterns

**Files:**
- Components: PascalCase `.tsx` files (e.g., `DraftActivitySidebar.tsx`, `PokemonCard.tsx`, `TeamRoster.tsx`)
- Utilities/services: kebab-case `.ts` files (e.g., `draft-service.ts`, `pokemon-api.ts`, `user-session.ts`)
- Hooks: camelCase with `use` prefix (e.g., `useOptimisticUpdates.ts`, `usePokemonImage.ts`)
- Test files: kebab-case with `.test.ts` suffix (e.g., `draftStore.test.ts`, `format-validator.test.ts`)
- Loading skeletons: `loading.tsx` in each route directory
- Error boundaries: `error.tsx` in route directories

**Functions:**
- Use camelCase for all functions: `createMockDraft()`, `generateRoomCode()`, `fetchPokemon()`
- Factory functions: `create` prefix (e.g., `createLogger()`, `createFormatRulesEngine()`, `createMemoizedSelector()`)
- Boolean getters: `is` prefix (e.g., `isAdmin()`, `isValidUUID()`, `isPokemonLegal()`)
- Event handlers: `handle` prefix (e.g., `handleClick`, `handleButtonClick`)

**Variables:**
- camelCase for all variables and state: `draftOrder`, `budgetRemaining`, `currentTurn`
- Constants: UPPER_SNAKE_CASE for module-level constants: `LOG_LEVELS`, `TEAM_COLORS`, `DEFAULT_FORMAT`
- Refs: `Ref` suffix (e.g., `pickInFlightRef`, `parentRef`)

**Types/Interfaces:**
- PascalCase for all types and interfaces: `Draft`, `Team`, `Pokemon`, `NormalizedDraftState`
- Use `interface` for object shapes that may be extended: `interface Draft { ... }`
- Use `type` for unions, intersections, and aliases: `type LogLevel = 'debug' | 'info' | 'warn' | 'error'`
- Supabase row types use `Row` suffix: `DraftRow`, `TeamRow`, `PickRow` (in `src/types/supabase-helpers.ts`)
- Insert/Update types use respective suffixes: `DraftInsert`, `DraftUpdate`
- Unused type aliases prefixed with underscore: `type _DraftWithParticipants = ...`

## Code Style

**Formatting:**
- No Prettier config file detected; formatting relies on ESLint and editor defaults
- 2-space indentation (inferred from all source files)
- Single quotes for imports and strings
- Trailing commas in multiline structures
- Semicolons are NOT consistently used (some files omit them)

**Linting:**
- ESLint 9 with flat config: `eslint.config.mjs`
- Extends: `next/core-web-vitals`, `next/typescript`
- Key enforced rules:
  - `@typescript-eslint/no-explicit-any`: **error** (strict - no `any` allowed)
  - `@typescript-eslint/no-unused-vars`: **error** (with `^_` ignore patterns for args, vars, caught errors, destructured arrays)
  - `react/no-unescaped-entities`: **error**
  - `react-hooks/exhaustive-deps`: **warn**
  - `@next/next/no-img-element`: **warn**
- Ignored paths: `node_modules/`, `.next/`, `out/`, `build/`, `scripts/`, PWA worker files

## Import Organization

**Order:**
1. React/Next.js imports (`import { useState } from 'react'`, `import Link from 'next/link'`)
2. Third-party libraries (`import { toast } from 'sonner'`, `import { z } from 'zod'`)
3. Internal `@/` aliased imports (`import { useDraftStore } from '@/stores/draftStore'`)
4. Relative imports for co-located files (`import { cn } from './utils'`)

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in `tsconfig.json`)
- Always use `@/` for cross-directory imports:
  ```typescript
  import { useDraftStore } from '@/stores/draftStore'
  import { DraftService } from '@/lib/draft-service'
  import type { Pokemon } from '@/types'
  ```
- Use relative imports only within the same directory (e.g., `src/lib/` files importing from `./supabase`)

**Type-only imports:**
- Use `import type` for type-only imports:
  ```typescript
  import type { Draft, Team, Participant } from '@/types'
  import type { CachedPokemon } from '@/lib/pokemon-cache-db'
  ```

## Component Patterns

**Client vs Server Components:**
- All interactive components use `'use client'` directive at the top of the file
- 141 files use `'use client'` across the codebase
- Pages are client components when they need interactivity (most pages)
- Layout files (`layout.tsx`) are server components by default
- Loading files (`loading.tsx`) are server components

**Memo Usage:**
- `React.memo` is used sparingly - only on 2 components: `PokemonCard` and `RosterCard`
- These are performance-critical components rendered in large lists
- Pattern:
  ```typescript
  export const PokemonCard = React.memo(({ pokemon, onSelect }: Props) => {
    // ...
  }, (prev, next) => prev.pokemon.id === next.pokemon.id)
  ```

**Export Patterns:**
- Components: `export default` for page components and most UI components (125 files use `export default`)
- Services: Named class exports (`export class AdminService`, `export class DraftService`)
- Singletons: Export instance + destructured methods (`export const auctionService = AuctionService.getInstance()`)
- Hooks: Named exports (`export function useOptimisticUpdates()`)
- Types: Named exports from `@/types/index.ts`
- UI components (shadcn): Named exports (`export { Button, buttonVariants }`)
- Utility functions: Named exports (`export function cn()`)

**Prop Patterns:**
- Use `interface Props` for component props (not inline):
  ```typescript
  interface Props {
    pokemonId: string
    onSelect: (id: string) => void
  }
  ```
- Destructure props in function signature
- Use `React.ButtonHTMLAttributes<HTMLButtonElement>` extends for HTML element wrappers

## State Management Conventions

**Zustand Store Pattern:**
- Single store: `src/stores/draftStore.ts`
- Uses three middleware layers: `subscribeWithSelector`, `immer`
- Normalized state with `byId` records + `Ids` arrays:
  ```typescript
  teamsById: Record<string, Team>
  teamIds: string[]
  picksByTeamId: Record<string, string[]>
  ```

**Selector Patterns:**
- Memoized selectors in `src/stores/selectors.ts` using closure-based caching
- Always subscribe to specific slices, never destructure full store:
  ```typescript
  // Correct
  const draft = useDraftStore(state => state.draft)
  const currentTeam = useDraftStore(selectCurrentTeam)

  // Wrong
  const { draft, teams } = useDraftStore()
  ```
- Parameterized selectors return selector functions: `selectUserTeam(userId)(state)`

**Update Patterns:**
- Use store actions, never mutate directly: `useDraftStore.getState().addPick(teamId, pick)`
- Batch updates via `setDraftState()` for multiple entity changes
- Immer middleware allows mutable-style updates internally

## Error Handling

**Service Layer:**
- Check Supabase availability first: `if (!supabase) { throw new Error('Supabase not available') }`
- Explicit `{ data, error }` destructuring from Supabase responses
- Try-catch blocks around async operations with error logging via `createLogger()`
- Return `{ success: boolean, error?: string }` objects from admin operations

**Component Layer:**
- Next.js `error.tsx` error boundaries at route level: `src/app/error.tsx`, `src/app/draft/[id]/error.tsx`
- Enhanced error boundary component: `src/components/ui/enhanced-error-boundary.tsx`
- Toast notifications via `sonner` library, wrapped in `src/lib/notifications.tsx`:
  ```typescript
  notify.success('Pick confirmed', 'Bulbasaur added to your team')
  notify.error('Failed to pick', error.message)
  notify.warning('Low budget', 'Only 10 points remaining')
  ```

**Logging:**
- Scoped loggers via factory: `const log = createLogger('DraftService')`
- Four levels: `debug`, `info`, `warn`, `error`
- Production: only `warn` and `error` logged as structured JSON
- Development: all levels with human-readable output

## TypeScript Usage

**Strict Mode:** Enabled in `tsconfig.json` (`"strict": true`)

**Type vs Interface:**
- `interface` for object shapes: entity types, props, service interfaces
- `type` for unions/aliases: `type LogLevel = 'debug' | 'info' | 'warn' | 'error'`
- `type` for computed/derived types: `type DraftState = ReturnType<typeof useDraftStore.getState>`

**Generics:**
- Used in helper types: `Row<T extends TableName>`, `Insert<T extends TableName>`
- Used in mock helpers: `mockSupabaseResponse<T>(data: T)`
- Used in memoized selectors: `createMemoizedSelector<T>(selector, equalityFn)`

**`any` Usage:**
- Banned by ESLint rule (`@typescript-eslint/no-explicit-any: "error"`)
- Exceptions use `eslint-disable` comments when unavoidable (e.g., accessing private caches in tests)
- Tests use `as unknown as` double-cast pattern for mock typing:
  ```typescript
  const mockSupabase = supabase as unknown as {
    from: ReturnType<typeof vi.fn>
    rpc: ReturnType<typeof vi.fn>
  }
  ```
- Unused vars prefixed with `_` to satisfy the lint rule

**Zod Validation:**
- Centralized schemas in `src/lib/schemas.ts`
- Input validation schemas for draft creation, picks, bids
- Sanitization utilities in `src/lib/validation.ts` (XSS prevention, length limits)

## CSS/Styling Conventions

**Tailwind CSS:**
- Tailwind CSS v3 with `tailwindcss-animate` plugin
- Utility-first approach throughout all components
- Design tokens via CSS custom properties in `globals.css` (HSL color system):
  - `--primary`, `--secondary`, `--destructive`, `--muted`, etc.
  - `--brand-from`, `--brand-to` for gradient brand colors
  - `--font-sora` (heading/body), `--font-mono` (code)

**`cn()` Utility:**
- Defined in `src/lib/utils.ts` using `clsx` + `tailwind-merge`
- Used in 78 component files (268 occurrences)
- Always use for conditional/merged class names:
  ```typescript
  className={cn(
    "base-classes",
    variant === "active" && "active-classes",
    className  // allow parent override
  )}
  ```

**Component Variants (CVA):**
- `class-variance-authority` for variant-based styling (buttons, badges, alerts)
- Pattern from shadcn/ui:
  ```typescript
  const buttonVariants = cva("base-classes", {
    variants: { variant: { default: "...", destructive: "..." } },
    defaultVariants: { variant: "default" },
  })
  ```

**Icons:**
- `lucide-react` for all icons (standard sizing: `h-4 w-4`)
- `@radix-ui/react-icons` also available but less commonly used

**Animation:**
- `framer-motion` for complex animations (landing page, dashboard, sidebar)
- `tailwindcss-animate` for simple CSS transitions
- Custom magic UI components in `src/components/magicui/`

## Commit Message Style

**Format:** `type: description` (conventional commits)

**Types observed:**
- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for restructuring

**Style:**
- Lowercase description after colon
- Em dash (`--`) used to separate main description from detail
- Concise, descriptive summaries
- Examples:
  ```
  feat: comprehensive UI overhaul -- Championship Arena aesthetic
  fix: redesign league hub -- full-width layout, proper table, bigger match cards
  refactor: move tournament actions to sidebar, remove from dashboard
  feat: community launch features -- 15 new features for public release
  ```

---

*Convention analysis: 2026-04-02*
