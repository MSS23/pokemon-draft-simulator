# Codebase Structure

**Analysis Date:** 2026-04-02

## Directory Layout

```
pokemon-draft/
├── .claude/                # Claude Code config and skills
├── .github/workflows/      # CI pipeline (ci.yml)
├── .planning/              # GSD planning documents
├── data/
│   └── formats/            # Format definitions (JSON + schema)
├── docs/                   # Project documentation
├── migrations/             # Supabase SQL migrations
├── public/                 # Static assets (icons, manifest, SW)
│   ├── data/               # Compiled format packs (build artifact)
│   └── fonts/              # Custom fonts
├── scripts/                # Build scripts (format compiler, icon generator)
├── src/
│   ├── app/                # Next.js App Router pages
│   ├── components/         # React components (organized by domain)
│   ├── contexts/           # React Context providers
│   ├── domain/             # Domain logic (format rules engine)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Service layer + utilities
│   ├── services/           # Secondary services (format loader, showdown sync)
│   ├── stores/             # Zustand state management
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Pure utility functions
└── tests/                  # Test files (Vitest)
    └── utils/              # Test helpers and mocks
```

## Route Structure (All Pages)

### Core Draft Flow
- `/` - `src/app/page.tsx` - Landing page with draft creation/join CTAs
- `/create-draft` - `src/app/create-draft/page.tsx` - Draft setup wizard (format, teams, budget, settings)
- `/join-draft` - `src/app/join-draft/page.tsx` - Join draft by room code
- `/draft/[id]` - `src/app/draft/[id]/page.tsx` - **Main draft room** (real-time picking/bidding)
- `/draft/[id]/results` - `src/app/draft/[id]/results/page.tsx` - Post-draft results (recap, rosters, tournament)

### League System
- `/league/[id]` - `src/app/league/[id]/page.tsx` - League hub (standings, schedule, activity)
- `/league/[id]/admin` - `src/app/league/[id]/admin/page.tsx` - Commissioner admin panel
- `/league/[id]/free-agents` - `src/app/league/[id]/free-agents/page.tsx` - Waiver wire / free agent market
- `/league/[id]/matchup/[matchId]` - `src/app/league/[id]/matchup/[matchId]/page.tsx` - Head-to-head matchup view
- `/league/[id]/rankings` - `src/app/league/[id]/rankings/page.tsx` - Power rankings
- `/league/[id]/schedule` - `src/app/league/[id]/schedule/page.tsx` - Weekly fixture schedule
- `/league/[id]/stats` - `src/app/league/[id]/stats/page.tsx` - Per-Pokemon KO/death statistics
- `/league/[id]/team/[teamId]` - `src/app/league/[id]/team/[teamId]/page.tsx` - Team detail (roster, match history, AI analysis)
- `/league/[id]/trades` - `src/app/league/[id]/trades/page.tsx` - Trade center (propose, accept, counter)

### Match
- `/match/[id]` - `src/app/match/[id]/page.tsx` - Match detail / KO recording view

### Tournament
- `/create-tournament` - `src/app/create-tournament/page.tsx` - Tournament setup
- `/join-tournament` - `src/app/join-tournament/page.tsx` - Join tournament
- `/tournament/[id]` - `src/app/tournament/[id]/page.tsx` - Tournament bracket/view

### Spectator
- `/spectate` - `src/app/spectate/page.tsx` - Browse public drafts
- `/spectate/[id]` - `src/app/spectate/[id]/page.tsx` - Watch draft in real-time
- `/watch-drafts` - `src/app/watch-drafts/page.tsx` - Watch drafts listing

### User & Account
- `/dashboard` - `src/app/dashboard/page.tsx` - User dashboard (active drafts, leagues)
- `/my-drafts` - `src/app/my-drafts/page.tsx` - Draft history
- `/history` - `src/app/history/page.tsx` - Activity history
- `/profile` - `src/app/profile/page.tsx` - User profile
- `/settings` - `src/app/settings/page.tsx` - App settings
- `/lobby` - `src/app/lobby/page.tsx` - Draft lobby

### Auth
- `/auth/login` - `src/app/auth/login/page.tsx` - Login page
- `/auth/register` - `src/app/auth/register/page.tsx` - Registration page
- `/auth/reset-password` - `src/app/auth/reset-password/page.tsx` - Password reset
- `/auth/callback` - `src/app/auth/callback/` - OAuth callback handler

### Admin & Static
- `/admin` - `src/app/admin/page.tsx` - Admin dashboard (cache, format sync, draft management)
- `/about` - `src/app/about/page.tsx` - About page
- `/privacy` - `src/app/privacy/page.tsx` - Privacy policy
- `/terms` - `src/app/terms/page.tsx` - Terms of service

### API Routes
- `/api/health` - `src/app/api/health/route.ts` - Health check (DB + PokeAPI)
- `/api/ai/analyze-team` - `src/app/api/ai/analyze-team/route.ts` - AI team analysis
- `/api/formats/sync` - `src/app/api/formats/sync/route.ts` - Format data sync
- `/api/push/subscribe` - `src/app/api/push/subscribe/route.ts` - Push notification subscription
- `/api/sheets` - `src/app/api/sheets/route.ts` - Spreadsheet export
- `/api/user/delete` - `src/app/api/user/delete/route.ts` - Account deletion
- `/api/user/export` - `src/app/api/user/export/route.ts` - User data export (GDPR)
- `/api/webhooks/` - `src/app/api/webhooks/` - Webhook handlers

### Layouts
- `src/app/layout.tsx` - Root layout (provider chain, header, footer)
- `src/app/draft/[id]/layout.tsx` - Draft room layout
- `src/app/draft/[id]/results/layout.tsx` - Results page layout

### Loading States
- 29 `loading.tsx` files across all routes for Suspense boundaries

## Component Organization

### `src/components/ui/` - Base UI Components (Shadcn/Radix)
Reusable primitives. Do not contain business logic.
- `alert.tsx`, `alert-dialog.tsx` - Alert components
- `avatar.tsx`, `badge.tsx`, `button.tsx` - Basic elements
- `card.tsx` - Card container
- `confirm-dialog.tsx`, `dialog.tsx` - Modal dialogs
- `dropdown-menu.tsx`, `popover.tsx` - Overlay menus
- `input.tsx`, `label.tsx`, `select.tsx`, `slider.tsx`, `switch.tsx`, `textarea.tsx` - Form inputs
- `tabs.tsx` - Tab navigation
- `progress.tsx`, `progress-bar.tsx` - Progress indicators
- `scroll-area.tsx` - Scrollable container
- `separator.tsx`, `sheet.tsx` - Layout helpers
- `toast.tsx` - Toast notification component
- `enhanced-error-boundary.tsx` - Error boundary with retry
- `error-display.tsx` - Error state display
- `loading-states.tsx` - Skeleton loaders (DraftRoomLoading, TeamStatusSkeleton, etc.)
- `pokeball-icon.tsx`, `pokemon-sprite.tsx` - Pokemon-specific UI atoms
- `keyboard-shortcuts-dialog.tsx` - Keyboard shortcuts overlay
- `settings-dialog.tsx` - Settings modal
- `theme-toggle.tsx` - Dark/light theme switcher

### `src/components/draft/` - Draft-Specific Components
Core draft room UI. Only used within `/draft/[id]` page.
- `DraftControls.tsx` - Host admin controls (start, pause, skip, ping)
- `DraftConfirmationModal.tsx` - Pick confirmation dialog
- `DraftActivitySidebar.tsx` - Real-time pick history sidebar
- `DraftResults.tsx` - Post-draft results view (recap, rosters, tournament)
- `DraftTimer.tsx` - Turn countdown timer
- `DraftHistory.tsx` - Draft pick log
- `DraftStatistics.tsx` - Draft analytics
- `DraftSettings.tsx` - Draft configuration panel
- `DraftOrderReveal.tsx` - Draft order animation
- `DraftRecapAnimation.tsx` - Post-draft recap animation
- `DraftReplay.tsx` - Draft replay viewer
- `DraftSummaryPanel.tsx` - Summary statistics
- `DraftChat.tsx` - In-draft chat
- `ActivityFeed.tsx` - Live activity feed
- `AdminManagement.tsx` - Admin controls
- `AuctionBiddingInterface.tsx` - Auction bidding UI
- `AuctionBidHistory.tsx` - Bid log display
- `AuctionNomination.tsx` - Pokemon nomination for auction
- `AuctionNotifications.tsx` - Auction event alerts
- `AuctionTimer.tsx` - Auction countdown
- `AuctionTimerSettings.tsx` - Auction timer config
- `AutoPickIndicator.tsx` - Wishlist auto-pick status
- `BudgetAdjustmentModal.tsx` - Admin budget adjustment
- `BudgetWarnings.tsx` - Low budget alerts
- `ConnectionStatus.tsx` - Realtime connection indicator
- `CSVUpload.tsx` - CSV import for draft data
- `ExportDraft.tsx` - Draft export functionality
- `HelpOverlay.tsx` - Help/tutorial overlay
- `KeyboardShortcutsCard.tsx` - Shortcuts reference
- `LiveParticipants.tsx` - Online user list
- `MobileDraftView.tsx` - Mobile-optimized draft UI
- `MobileWishlistSheet.tsx` - Mobile wishlist bottom sheet
- `NotificationPrompt.tsx` - Push notification permission
- `PokemonPoolBuilder.tsx` - Custom Pokemon pool editor
- `ShareableRecapCard.tsx` - Social media share card
- `SpectatorMode.tsx` - Spectator view controls
- `TeamBuilderView.tsx` - Team composition view
- `WishlistManager.tsx` - Drag-and-drop wishlist editor

### `src/components/pokemon/` - Pokemon Display Components
- `PokemonCard.tsx` - Individual Pokemon card (image, type badges, stats, cost)
- `PokemonDetailsModal.tsx` - Expanded Pokemon details (moves, abilities, stats)
- `PokemonGrid.tsx` - Pokemon selection grid with search/filter
- `RosterCard.tsx` - Pokemon card variant for team rosters
- `VirtualizedPokemonGrid.tsx` - @tanstack/react-virtual grid for 1000+ Pokemon

### `src/components/team/` - Team Management Components
- `TeamRoster.tsx` - Team roster display (picks, budget, sprites)
- `DraftProgress.tsx` - Draft progress bar with timer
- `RosterCardStack.tsx` - Stacked roster card display
- `TeamExportButton.tsx` - Team export to various formats
- `TeamStatus.tsx` - Team status indicator

### `src/components/league/` - League Components
- `CreateLeagueModal.tsx` - League creation dialog
- `CreateTournamentModal.tsx` - Tournament creation
- `LeagueNav.tsx` - League page navigation
- `LeagueSettingsModal.tsx` - League settings editor
- `MatchRecorderModal.tsx` - Match result recording (dual-confirmation, per-game KOs)
- `PlayoffBracket.tsx` - Playoff bracket visualization
- `PokemonStatusBadge.tsx` - Alive/fainted/dead indicator
- `PokePasteImport.tsx` - PokePaste format importer
- `StartPlayoffsModal.tsx` - Playoff initiation
- `TeamIcon.tsx` - Team icon display

### `src/components/spectator/` - Spectator Components
- `SpectatorDraftGrid.tsx` - Read-only draft grid for spectators

### `src/components/layout/` - Layout Components
- `Header.tsx` - Global app header/navbar
- `Sidebar.tsx`, `SidebarLayout.tsx`, `SidebarLink.tsx`, `SidebarSection.tsx` - Sidebar navigation
- `MobileSidebar.tsx` - Mobile hamburger sidebar
- `MobileBottomNav.tsx` - Mobile bottom navigation bar
- `PageTransition.tsx` - Page transition animations

### `src/components/providers/` - Context Providers
- `QueryProvider.tsx` - TanStack Query provider
- `ThemeProvider.tsx` - next-themes provider
- `HydrationFixProvider.tsx` - SSR hydration mismatch fix
- `ErrorBoundaryProvider.tsx` - Global error boundary
- `PerformanceMonitorProvider.tsx` - Performance monitoring
- `AnalyticsProvider.tsx` - Analytics tracking
- `PWAProvider.tsx` - Progressive Web App service worker

### `src/components/auth/` - Authentication Components
- `AuthForm.tsx` - Login/register form with validation
- `AuthModal.tsx` - Auth dialog overlay

### `src/components/admin/` - Admin Components
- `CachePerformanceDashboard.tsx` - Pokemon cache stats
- `DraftManagementPanel.tsx` - Draft CRUD admin panel
- `FormatSyncPanel.tsx` - Format data synchronization

### `src/components/analytics/` - Analytics Components
- `DraftAnalyticsSummary.tsx` - Draft statistics overview

### `src/components/tour/` - Onboarding Tour
- `TourGuide.tsx` - Step-by-step tour overlay
- `TourProvider.tsx` - Tour state management

### `src/components/tournament/` - Tournament Components
- `TeamSheetModal.tsx` - Team sheet entry
- `TeamSheetView.tsx` - Team sheet display
- `TournamentMatchView.tsx` - Tournament match display
- `TournamentSchedule.tsx` - Tournament bracket/schedule

### `src/components/magicui/` - Animation Components
Magic UI animation primitives (likely shimmer, gradient effects).

## Service Layer (`src/lib/`)

### Core Draft Services
- `draft-service.ts` - Draft CRUD, getDraftState, makePick, joinDraft, startDraft (main orchestrator)
- `draft-realtime.ts` - `DraftRealtimeManager` class for WebSocket subscriptions
- `draft-access.ts` - Draft access control (permissions checks)
- `draft-errors.ts` - Draft-specific error types
- `draft-cache-db.ts` - IndexedDB cache for draft state
- `draft-export.ts` - Export draft data to various formats
- `draft-templates.ts` - Predefined draft configurations

### Auction
- `auction-service.ts` - `AuctionService` singleton: placeBid, bid history, auction lifecycle

### Pokemon Data
- `pokemon-api.ts` - PokeAPI fetching with caching
- `pokemon-cache.ts` - LRU in-memory Pokemon cache
- `pokemon-cache-db.ts` - IndexedDB Pokemon cache
- `pokemon-data-manager.ts` - Unified Pokemon data access
- `pokemon-prefetch.ts` - Predictive prefetching
- `pokemon-search-index.ts` - Full-text search index for Pokemon names/types
- `image-optimization.ts` - Image URL optimization
- `image-preloader.ts` - Image preloading for upcoming Pokemon

### Format & Rules
- `formats.ts` - Format definitions (VGC Reg H, etc.), `POKEMON_FORMATS` array, `getFormatById()`
- `format-validator.ts` - `FormatValidator` with legendary/mythical/paradox detection
- `format-export.ts` - Format data export
- `tier-utils.ts` - Tier cost lookup helpers

### League System
- `league-service.ts` - League CRUD, schedule generation, standings, fixtures
- `league-stats-service.ts` - Aggregated Pokemon statistics across matches
- `match-ko-service.ts` - `MatchKOService`: record KOs, deaths per game
- `trade-service.ts` - `TradeService`: propose, accept, reject, counter, execute trades
- `trade-deadline.ts` - Trade deadline enforcement logic
- `waiver-service.ts` - `WaiverService`: free agent claims, budget validation
- `commissioner-service.ts` - Commissioner-specific operations
- `weekly-highlights-service.ts` - Weekly league highlights generation

### User & Auth
- `user-session.ts` - `UserSessionService`: guest ID generation, localStorage persistence
- `supabase.ts` - Supabase client initialization + full Database type definition
- `supabase/server.ts` - Server-side Supabase client

### Notifications & Sound
- `notifications.tsx` - Toast notification helpers (notify.success, notify.error, etc.)
- `notification-service.ts` - Notification service with sound integration
- `push-notifications.ts` - Browser push notification management
- `sound-service.ts` - Audio feedback for draft events

### Analytics & Monitoring
- `analytics.ts` - Event tracking
- `advanced-analytics.ts` - Detailed analytics
- `performance-monitor.ts` - Performance measurement
- `leaderboard-achievements.ts` - Achievement system

### AI & Analysis
- `ai-access-control.ts` - AI feature gating
- `ai-analysis-service.ts` - Team analysis AI service
- `team-analytics.ts` - Team strength/weakness analysis
- `damage-calculator.ts` - Pokemon damage calculation

### Utilities
- `utils.ts` - General utilities (includes `cn()` for Tailwind class merging)
- `room-utils.ts` - Room code generation
- `schemas.ts` - Zod validation schemas
- `logger.ts` - Structured logger factory (`createLogger()`)
- `env.ts` - Environment variable validation
- `error-handler.ts` - Global error handling
- `hydration-fix.ts` - SSR hydration mismatch workaround
- `validation.ts` - Input validation helpers
- `csv-parser.ts` - CSV file parsing
- `pokepaste-parser.ts` - PokePaste format parser
- `export-service.ts` - Generic data export
- `teamsheet-service.ts` - Team sheet management

### Performance
- `batch-requests.ts` - Request batching
- `request-deduplicator.ts` - Duplicate request prevention
- `store-optimization.ts` - Zustand store optimization helpers
- `update-queue.ts` - Queued state updates
- `usage-pricing-templates.ts` - Usage-based pricing data

### Draft Features
- `auto-skip-service.ts` - Auto-skip timed-out turns
- `undo-service.ts` - Pick undo functionality
- `wishlist-service.ts` - Wishlist CRUD, priority management

## Secondary Services (`src/services/`)
- `format-loader.ts` - Loads compiled format packs from `public/data/`
- `showdown-sync.ts` - Pokemon Showdown data synchronization

## Hook Inventory (`src/hooks/`)

### Draft Lifecycle
- `useDraftRealtime.ts` - Manages `DraftRealtimeManager`, connection status, event callbacks
- `useDraftStats.ts` - Derived draft statistics
- `useAutoPick.ts` - Wishlist-based auto-pick on timer expiry
- `useTurnNotifications.ts` - Browser/toast notifications on turn changes
- `useOptimisticUpdates.ts` - Optimistic state management helpers

### Pokemon Data
- `usePokemon.ts` - Pokemon data fetching with TanStack Query (`usePokemonListByFormat`)
- `useEnhancedPokemonCache.ts` - Multi-tier caching (memory + IndexedDB)
- `usePokemonImage.ts` - Image URL resolution with GIF/artwork/sprite fallback chain
- `usePokemonDataManager.ts` - Unified Pokemon data access hook

### Validation & Budget
- `useBudgetValidation.ts` - Team budget constraint checking

### UI Interaction
- `useDragAndDrop.ts` - Drag-and-drop with touch support (wishlist reordering)
- `useKeyboardShortcuts.ts` - Keyboard shortcut bindings

### Utilities
- `useAsyncData.ts` - Generic async data fetching hook
- `useLatest.ts` - Ref that always holds latest value (avoids stale closures)
- `useSupabase.ts` - Supabase client access hook
- `useWishlistSync.ts` - Real-time wishlist synchronization across clients

## Store Structure (`src/stores/`)

- `draftStore.ts` - Main Zustand store with normalized state, actions, middleware (subscribeWithSelector + immer)
- `selectors.ts` - Memoized selectors with closure-based caching pattern

## Type Definitions (`src/types/`)

- `index.ts` - All app-level interfaces: `Pokemon`, `Draft`, `Team`, `Pick`, `Participant`, `Auction`, `PokemonTier`, `WishlistItem`, `League`, `Match`, `Standing`, `MatchGame`, `MatchPokemonKO`, `TeamPokemonStatus`, `WaiverClaim`, `TradeWithDetails`, `DraftSettings`, `LeagueSettings`, `ExtendedLeagueSettings`, `CustomFormat`, `TierDefinition`, `Move`, `PokemonStats`, `PokemonType`
- `supabase-helpers.ts` - Shorthand type exports mapping Database table rows/inserts/updates (e.g., `DraftRow`, `TeamInsert`)

## Utility Functions (`src/utils/`)

- `draft.ts` - `generateSnakeDraftOrder()`, `getCurrentPick()`, `getNextTeamTurn()`, `isDraftComplete()`
- `draft-settings.ts` - Draft settings parsing/defaults
- `budget-feasibility.ts` - `getMaxAffordableCost()`, `isPickSafe()` - budget constraint calculations
- `pokemon.ts` - Pokemon data transformation helpers
- `team-colors.ts` - `TEAM_COLORS` array (8 colors), `getTeamColor()`, `buildTeamColorMap()`
- `type-effectiveness.ts` - Pokemon type matchup calculations

## Data Files

### `data/formats/`
- `reg_h.json` - VGC 2024 Regulation H format definition (banned Pokemon, allowed dex numbers, cost config)
- `format-schema.ts` - TypeScript types for format definitions (`CompiledFormat`, `PokemonIndex`)

### `public/data/` (Build Artifact)
- Compiled format packs generated by `npm run build:formats`
- Loaded at runtime by `src/services/format-loader.ts`

### `scripts/`
- `build-format.ts` - Compiles format JSON definitions, fetches from PokeAPI, generates optimized runtime artifacts
- `generate-icons.js` - PWA icon generation

### `migrations/`
- `COMPLETE_SCHEMA.sql` - Full database schema
- `SETUP_SCHEMA.sql` - Initial setup schema
- Various incremental migrations (RLS fixes, new tables, column additions)
- `RESET_DATABASE.sql` - Development database reset
- `DEPLOY_TO_PRODUCTION.sql` - Production deployment script

### `tests/`
- `setup.ts` - Vitest setup file
- `utils/supabase-mock.ts` - Supabase client mock for testing
- `utils/test-data.ts` - Test fixtures and factory functions
- `utils/test-helpers.ts` - Shared test utilities
- Test files: `draft-service.test.ts`, `draftStore.test.ts`, `format-reg-h.test.ts`, `format-validator.test.ts`, `league-service.test.ts`, `auction-service.test.ts`, `admin-service.test.ts`, `trade-service.test.ts`, `user-session.test.ts`, `wishlist-service.test.ts`, `middleware.test.ts`, `pokemon-data-performance.test.ts`, `pokemon-search-index.test.ts`

## Naming Conventions

**Files:**
- Components: PascalCase (`TeamRoster.tsx`, `DraftControls.tsx`)
- Services/lib: kebab-case (`draft-service.ts`, `pokemon-api.ts`)
- Hooks: camelCase with `use` prefix (`useDraftRealtime.ts`, `usePokemon.ts`)
- Utils: kebab-case (`budget-feasibility.ts`, `team-colors.ts`)
- Tests: kebab-case with `.test.ts` suffix (`draft-service.test.ts`)

**Directories:**
- Lowercase, hyphen-separated for route segments (`create-draft`, `join-draft`)
- Lowercase for component groups (`draft/`, `pokemon/`, `team/`, `league/`)

## Where to Add New Code

**New Page/Route:**
- Create directory in `src/app/{route-name}/`
- Add `page.tsx` (required) and `loading.tsx` (recommended)
- Use `'use client'` directive for interactive pages

**New Component:**
- Draft-related: `src/components/draft/`
- Pokemon display: `src/components/pokemon/`
- Team management: `src/components/team/`
- League features: `src/components/league/`
- Reusable UI primitives: `src/components/ui/`
- Layout/navigation: `src/components/layout/`

**New Service:**
- Business logic: `src/lib/{service-name}.ts`
- Use static class methods pattern (e.g., `MyService.doThing()`)
- Always check `if (!supabase) throw new Error('Supabase not available')`
- Use `createLogger('ServiceName')` for logging

**New Hook:**
- Place in `src/hooks/use{HookName}.ts`
- Prefix with `use` per React convention

**New Type:**
- App-level interfaces: add to `src/types/index.ts`
- Supabase row helpers: add to `src/types/supabase-helpers.ts`

**New Utility Function:**
- Pure functions: `src/utils/{category}.ts`
- Draft logic: `src/utils/draft.ts`
- Pokemon helpers: `src/utils/pokemon.ts`

**New Test:**
- Place in `tests/{service-name}.test.ts`
- Use mocks from `tests/utils/supabase-mock.ts`
- Use test data from `tests/utils/test-data.ts`

**New Format:**
- JSON definition: `data/formats/{format-name}.json`
- Register in `src/lib/formats.ts` `POKEMON_FORMATS` array
- Run `npm run build:formats` to compile

**New Migration:**
- SQL file in `migrations/{description}.sql`
- Update Database type in `src/lib/supabase.ts` if adding tables/columns

## Special Directories

**`public/data/`:**
- Purpose: Compiled format pack artifacts
- Generated: Yes (by `npm run build:formats`)
- Committed: Yes (for deployment without build step)

**`migrations/`:**
- Purpose: Supabase SQL migration scripts
- Generated: No (hand-written)
- Committed: Yes

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: Yes (by GSD commands)
- Committed: Yes

**`draft pool/`:**
- Purpose: Draft pool screenshots/reference materials
- Generated: No
- Committed: Tracked but unrelated to build

---

*Structure analysis: 2026-04-02*
