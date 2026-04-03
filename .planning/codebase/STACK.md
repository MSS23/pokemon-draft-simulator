# Technology Stack

**Analysis Date:** 2026-04-02

## Languages

**Primary:**
- TypeScript 5 - All application code (`src/**/*.ts`, `src/**/*.tsx`)
- TSX - React components

**Secondary:**
- JavaScript - Generated service worker (`public/sw.js`), config files
- JSON - Format packs (`data/formats/*.json`), manifest, package config
- SQL - Database schema (`supabase-schema.sql`, migration files)

## Runtime

**Environment:**
- Node.js 20 (specified in `.nvmrc`)
- Browser (client-side SPA with SSR)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js ^15.5.12 - Full-stack React framework (App Router)
- React 18.3.1 / React DOM 18.3.1 - UI library (pinned exact version)

**State Management:**
- Zustand ^5.0.8 - Client-side state (single store pattern with `subscribeWithSelector`)
- TanStack Query ^5.90.2 - Server state, caching, deduplication
- Immer ^10.1.3 - Immutable state updates

**Testing:**
- Vitest ^3.2.4 - Test runner (happy-dom environment)
- @testing-library/react ^16.3.0 - Component testing
- @testing-library/jest-dom ^6.9.1 - DOM assertions
- @testing-library/user-event ^14.6.1 - User interaction simulation
- @vitest/coverage-v8 ^3.2.4 - Coverage (v8 provider, 60% threshold)
- fake-indexeddb ^6.2.5 - IndexedDB mocking for cache tests

**Build/Dev:**
- TypeScript ^5 - Type checking (`strict: true` in `tsconfig.json`)
- ESLint ^9 - Linting (flat config, `eslint.config.mjs`)
- PostCSS ^8.5.6 + Autoprefixer ^10.4.21 - CSS processing
- tsx ^4.7.0 - TypeScript script runner (for `build:formats` script)
- webpack-bundle-analyzer ^4.10.2 - Bundle analysis (`npm run analyze`)

## Key Dependencies

**Critical:**
- @supabase/supabase-js ^2.58.0 - Database client, auth, realtime subscriptions
- @supabase/ssr ^0.7.0 - Server-side Supabase client (cookie-based sessions)
- @tanstack/react-query ^5.90.2 - Data fetching, caching, background refetch
- @tanstack/react-virtual ^3.13.12 - List virtualization for 1000+ Pokemon grids
- Zustand ^5.0.8 - Client state management

**UI/Styling:**
- Tailwind CSS ^3.4.17 - Utility-first CSS
- tailwindcss-animate ^1.0.7 - Animation utilities
- tailwind-merge ^3.3.1 - Class merging
- class-variance-authority ^0.7.1 - Variant-based component styling (shadcn/ui pattern)
- clsx ^2.1.1 - Conditional class names
- Radix UI (13 packages) - Accessible headless UI primitives:
  - `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`,
    `@radix-ui/react-select`, `@radix-ui/react-popover`, `@radix-ui/react-alert-dialog`,
    `@radix-ui/react-avatar`, `@radix-ui/react-label`, `@radix-ui/react-progress`,
    `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-slider`,
    `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-icons`
- lucide-react ^0.544.0 - Icon library
- Framer Motion ^12.35.0 - Animations (landing page, dashboard, sidebar)
- sonner ^2.0.7 - Toast notifications

**Data/Utilities:**
- Zod ^4.1.12 - Schema validation
- date-fns ^4.1.0 - Date formatting/manipulation
- Fuse.js ^7.1.0 - Fuzzy search (Pokemon search)
- idb ^8.0.3 - IndexedDB wrapper (offline cache for draft state and Pokemon data)
- bcryptjs ^3.0.2 - Password hashing (draft room passwords)

**Drag and Drop:**
- @dnd-kit/core ^6.3.1 - Drag and drop primitives
- @dnd-kit/sortable ^10.0.0 - Sortable lists (wishlist reordering)
- @dnd-kit/utilities ^3.2.2 - DnD utilities

**Infrastructure:**
- @sentry/nextjs ^10.27.0 - Error tracking (client, server, edge configs)
- @vercel/analytics ^2.0.1 - Vercel web analytics
- posthog-js ^1.363.4 - Product analytics (typed events)
- @upstash/ratelimit ^2.0.8 - Rate limiting (sliding window)
- @upstash/redis ^1.37.0 - Redis client for rate limiter
- next-pwa ^5.6.0 - Progressive Web App support (Workbox service worker)

## Configuration

**TypeScript** (`tsconfig.json`):
- Target: ES2017
- Module resolution: `bundler`
- Strict mode: enabled
- Path alias: `@/*` maps to `./src/*`
- JSX: `preserve` (handled by Next.js)
- Incremental compilation: enabled

**ESLint** (`eslint.config.mjs`):
- Flat config format (ESLint 9)
- Extends: `next/core-web-vitals`, `next/typescript`
- `@typescript-eslint/no-explicit-any`: error
- `@typescript-eslint/no-unused-vars`: error (with `_` prefix ignore)
- `react-hooks/exhaustive-deps`: warn

**Tailwind** (`tailwind.config.ts`):
- Dark mode: class-based
- Custom font: Sora (sans), JetBrains Mono (mono)
- Custom colors: HSL CSS variable system (shadcn/ui pattern)
- Pokemon type colors: 18 type-specific colors as CSS variables
- Plugin: `tailwindcss-animate`
- Container: centered, 1400px max, 2rem padding

**Next.js** (`next.config.ts`):
- React strict mode: enabled
- Image optimization: AVIF + WebP, remote patterns for PokeAPI sprites
- Webpack: custom chunk splitting (react, supabase, radixui, vendor, common)
- Experimental: `optimizePackageImports` for supabase-js, lucide-react, radix-icons
- Security headers: HSTS, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy
- PWA: Workbox service worker with runtime caching strategies
- Sentry: conditional (production only when DSN is set)
- Powered-by header: disabled
- Compression: enabled

**Vitest** (`vitest.config.ts`):
- Environment: happy-dom
- Globals: enabled
- Setup file: `tests/setup.ts`
- Coverage: v8 provider, 60% threshold (lines, functions, branches, statements)
- Path alias: `@/` mapped to `./src/`

**PostCSS** (`postcss.config.mjs`):
- Plugins: tailwindcss, autoprefixer

## Build Scripts

```bash
npm run dev              # Next.js dev server (localhost:3000)
npm run build            # Production build + type checking
npm run start            # Start production server
npm run lint             # ESLint
npm test                 # Vitest watch mode
npm run build:formats    # Compile format packs (tsx scripts/build-format.ts)
npm run analyze          # Bundle analysis (ANALYZE=true next build)
npm run analyze:server   # Server bundle analysis
npm run analyze:browser  # Browser bundle analysis
```

## Platform Requirements

**Development:**
- Node.js 20+
- npm
- Supabase project (or runs in degraded mode without it)

**Production:**
- Vercel (primary deployment target)
- Supabase (PostgreSQL + Realtime + Auth)
- Upstash Redis (rate limiting, optional with in-memory fallback)
- Sentry account (error tracking, optional)
- PostHog account (analytics, optional)
- VAPID keys (push notifications, optional)

**Environment Variables (Required):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

**Environment Variables (Optional):**
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` - Error tracking
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` - Product analytics
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` - Rate limiting
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` - Push notifications
- `NEXT_PUBLIC_SITE_URL` - Production domain for OG images/sitemap

---

*Stack analysis: 2026-04-02*
