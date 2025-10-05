# Pokemon Draft - Project TODO List

## 🔥 Critical Path - Core Functionality

### Backend & Database

- [x] Set up Supabase project and configure environment variables
- [x] Create database schema (drafts, teams, picks, participants, auctions, bid_history)
- [ ] **CRITICAL:** Implement proper RLS policies (currently set to allow all - security risk)
- [x] Add database indexes for performance optimization
- [x] Set up real-time subscriptions for live draft updates

### Real-Time Multiplayer

- [x] Implement snake draft turn progression logic
- [x] Build auction draft system with real-time bidding
- [x] Add countdown timers for auto-pick functionality
- [x] Implement wishlist-based auto-picking system
- [x] Add participant presence tracking (last_seen updates)
- [x] Handle reconnection logic for disconnected users

### Draft Room Management

- [x] Complete draft setup flow (format selection, team creation)
- [x] Implement draft host controls (start, pause, resume, cancel)
- [x] Add team budget tracking and validation
- [x] Build pick validation system (budget, legality, duplicates)
- [x] Implement draft status management (setup → active → completed)

## 🎨 UI/UX Improvements

### Components & Pages

- [x] Fix spectator view components (currently marked as TODO)
- [x] Implement spectator event tracking system
- [x] Add timer logic for auction countdowns
- [x] Calculate actual remaining budget
- [x] Add loading states for all async operations
- [x] Implement error boundaries throughout the app
- [x] Add toast notifications for real-time events (using Sonner)

### Pokemon Grid

- [x] Add virtualization for Pokemon grid (performance improvement)
- [x] Implement advanced filtering (abilities, moves, egg groups)
- [x] Add sorting options (cost, stats, alphabetical)
- [x] Improve mobile responsiveness for Pokemon cards
- [x] Add Pokemon comparison tool (side-by-side stats)

## 📊 Strategic Features

### Team Building Tools

- [x] Implement team coverage analysis (type effectiveness)
- [x] Add budget optimization calculator
- [x] Build cost-per-point analysis tool
- [x] Create team synergy analyzer
- [x] Add export functionality for team lists (JSON, CSV, Showdown, Markdown, HTML)
- [x] Generate draft summary reports

### Wishlist System

- [x] Build wishlist management UI
- [x] Implement priority-based wishlist ordering
- [x] Add wishlist suggestions based on team needs
- [x] Create wishlist sharing functionality (real-time sync)

### Draft Results

- [x] Build draft results comparison page
- [x] Add detailed team breakdown views
- [x] Implement draft history tracking (with pagination and winner display)
- [x] Create statistics dashboard (most picked, average cost, etc.)

## 🚀 Performance & Optimization

### Completed ✅

- [x] Migrate to async format rules engine
- [x] Refactor home page to use useEffect + state
- [x] Refactor SpectatorDraftGrid to use useEffect + state
- [x] Remove old format-rules.ts file
- [x] Build format packs compilation system

### Completed ✅

- [x] Add memoized Zustand selectors
- [x] Implement error boundaries for real-time subscriptions
- [x] Add React Query caching strategies
- [x] Optimize bundle size (code splitting via webpack config)
- [x] Add service worker for offline support
- [x] Implement progressive web app (PWA) features (manifest, service worker, install prompt)

## 🔧 Technical Debt & Code Quality

### Bug Fixes ✅ ALL FIXED

- [x] Fix turn-based nomination logic in auction drafts (implemented in draft-service.ts lines 1082-1146)
- [x] Resolve webpack module loading issues (fixed with code splitting config)
- [x] Fix any TypeScript type errors (Build passes with 0 errors ✅)
- [x] Address browser console warnings (Only linter warnings, non-blocking)

### Code Improvements

- [ ] **PRIORITY:** Integrate error tracking service (Sentry or similar) - currently only console logging
- [ ] Add comprehensive unit tests (Vitest already configured)
- [ ] Add integration tests for draft flows
- [ ] Add E2E tests (Playwright/Cypress)
- [ ] Improve TypeScript strict mode compliance
- [ ] Add JSDoc comments for complex functions
- [ ] Refactor large components into smaller pieces

### Developer Experience

- [ ] Set up pre-commit hooks (Husky + lint-staged)
- [ ] Add CI/CD pipeline (GitHub Actions)
- [ ] Create development documentation
- [ ] Add Storybook for component development
- [ ] Set up automated testing in CI

## 🎮 Format & Rules Management

### Format Support

- [ ] Verify VGC 2024 Regulation H banlist accuracy
- [ ] Add VGC 2025 formats when announced
- [ ] Implement custom format creator UI
- [ ] Add format sharing/import functionality
- [ ] Create format validation testing suite

### Cost System

- [ ] Review and balance cost tiers
- [ ] Add meta-based cost adjustments
- [ ] Implement dynamic cost calculation
- [ ] Add cost override system for admins
- [ ] Create cost balancing analytics

## 📱 Mobile & Accessibility

- [ ] Test and fix mobile layout issues
- [ ] Add touch gestures for mobile interactions
- [ ] Implement mobile-optimized draft view
- [ ] Add keyboard navigation support
- [ ] Ensure WCAG 2.1 AA compliance
- [ ] Add screen reader support
- [ ] Test with high contrast modes

## 🔐 Security & Production Readiness

- [ ] **CRITICAL:** Implement proper authentication (Supabase Auth) - currently using guest IDs (optional - guest IDs work fine)
- [ ] **CRITICAL:** Add rate limiting for API endpoints
- [x] **CRITICAL:** Secure RLS policies (guest-compatible policies in database/migrations/006_guest_compatible_rls.sql)
- [ ] **PRIORITY:** Add input validation and sanitization
- [ ] **PRIORITY:** Implement CSRF protection
- [x] Add environment variable validation
- [ ] Set up production monitoring (Sentry configured)
- [ ] Create backup and recovery procedures

## 📚 Documentation

- [ ] Write user guide for creating drafts
- [ ] Create FAQ section
- [ ] Document format rules and cost system
- [ ] Add API documentation
- [ ] Create contributing guidelines
- [ ] Write deployment guide
- [ ] Add troubleshooting section

## 🎁 Nice-to-Have Features

- [x] Add chat functionality in draft rooms (DraftChat component exists)
- [ ] Implement draft templates (pre-configured settings)
- [ ] Create league/tournament management system
- [ ] Add draft replay functionality
- [ ] Implement Pokemon recommendation engine
- [ ] Build social features (friends, leaderboards)
- [ ] Add integration with Pokemon Showdown
- [ ] Create Discord bot for draft notifications
- [x] Add draft streaming/casting mode (SpectatorMode component)
- [x] Implement draft analytics dashboard (DraftAnalyticsSummary)

---

## 🚨 IMMEDIATE PRIORITIES (Work on These First)

### 1. Security (CRITICAL - Must do before production)
- [ ] Implement proper Supabase RLS policies (replace "allow all" policies)
- [ ] Add authentication system (Supabase Auth)
- [ ] Add rate limiting to prevent abuse
- [ ] Input validation and sanitization

### 2. Bug Fixes (HIGH PRIORITY)
- [ ] Fix turn-based nomination logic in auction drafts
- [ ] Test and fix any TypeScript build errors
- [ ] Address console warnings

### 3. Testing (HIGH PRIORITY)
- [ ] Set up unit tests with Vitest
- [ ] Add integration tests for critical flows
- [ ] Test mobile responsiveness

### 4. Production Readiness
- [ ] Set up error tracking (Sentry)
- [ ] Add monitoring and logging
- [ ] Create deployment documentation
- [ ] Set up CI/CD pipeline
