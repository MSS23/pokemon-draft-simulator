# External Integrations

**Analysis Date:** 2026-04-02

## APIs & External Services

### Supabase (Primary Backend)

**SDK/Client:** `@supabase/supabase-js` ^2.58.0, `@supabase/ssr` ^0.7.0

**Client Setup:**
- Browser client: `src/lib/supabase.ts` - singleton with `Window.__supabaseInstance` guard
- Server client: `src/lib/supabase/server.ts` - cookie-based via `createServerClient()` from `@supabase/ssr`
- Middleware client: `src/middleware.ts` - rate limiting + auth session refresh
- Auth env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Graceful degradation: warns but does not throw when env vars missing (allows build-time static generation)

**Database Tables:**
- `drafts` - Draft metadata, status, turn state, room codes
- `teams` - Team info, budget, draft order
- `picks` - Individual Pokemon selections
- `participants` - Users in draft (guest support)
- `auctions` - Active/completed auctions
- `bid_history` - Auction bid log
- `wishlist_items` - Auto-pick priority queue
- `spectator_events` - Spectator activity tracking
- `user_profiles` - Display names and preferences
- `pokemon_tiers` - Per-draft Pokemon costs/legality
- `leagues` - League metadata
- `league_matches` - Match scheduling
- `match_results` - Game outcomes
- `pokemon_ko_tracking` - KO/death tracking per game
- `trades` - Trade proposals between teams
- `waivers` - Free agent claims

**Database Types:** Manually maintained in `src/lib/supabase.ts` as `Database['public']['Tables']` with full Row/Insert/Update types. Shorthand exports in `src/types/supabase-helpers.ts`.

**Row Level Security (RLS):** Policies documented in `FIX-RLS-POLICIES.md`. Applied via migration SQL files.

### Supabase Realtime

**Manager:** `src/lib/draft-realtime.ts` - `DraftRealtimeManager` class

**Channel Pattern:**
```typescript
// Single channel per draft: `draft:{draftId}`
// Subscribes to postgres_changes on: drafts, teams, picks, participants, auctions
```

**Features:**
- Exponential backoff reconnection (1s base, 30s max, 10 attempts)
- Event deduplication (3-second window via `lastEventIds` Map)
- Supabase Presence for online user tracking
- AbortController-based cleanup
- Connection status tracking: disconnected, connecting, connected, reconnecting, failed

**Broadcast Channels (non-postgres):**
- `admin-ping:{draftId}` - Admin bell/notification to participants
- `league-trades:{leagueId}` - Trade event notifications
- `league-trades-badge:{leagueId}` - Trade count badge updates

**Subscription Tables Monitored:**
- `drafts` (UPDATE) - Turn changes, status updates
- `teams` (UPDATE) - Budget changes, roster updates
- `picks` (INSERT) - New picks made
- `participants` (INSERT/UPDATE) - Player joins, status changes
- `auctions` (INSERT/UPDATE) - Bid events

### Supabase Authentication

**Provider:** Supabase Auth (built-in)
**Context:** `src/contexts/AuthContext.tsx` - React context wrapping `supabase.auth`
**Auth Methods:**
- Email/password (`signInWithPassword`, `signUp`)
- Google OAuth (configured in Supabase dashboard)
- Discord OAuth (configured in Supabase dashboard)
- Password reset flow (`src/app/auth/reset-password/page.tsx`)

**Callback Route:** `src/app/auth/callback/route.ts` - handles OAuth redirects

**Session Management:**
- Authenticated users: Supabase session (cookie-based via `@supabase/ssr`)
- Guest users: `src/lib/user-session.ts` - `UserSessionService` class
  - Guest ID format: `guest-{crypto.randomUUID()}` (with fallbacks)
  - Stored in localStorage under `pokemon-draft-user-session`
  - Session backup with `pokemon-draft-backup-` prefix
  - Draft participation tracked in `pokemon-draft-participation`
- Authenticated users are prioritized over guest sessions

### PokeAPI

**Base URL:** `https://pokeapi.co/api/v2`
**Client:** `src/lib/pokemon-api.ts` - custom fetch wrapper

**Endpoints Used:**
- `/pokemon/{id}` - Pokemon data (types, stats, abilities, sprites, moves)
- `/pokemon-species/{id}` - Species data (legendary/mythical flags, generation)
- `/move/{id}` - Move details (power, accuracy, type, damage class)

**Caching Strategy (Multi-Layer):**

1. **Service Worker (Workbox):** `next.config.ts` PWA config
   - Sprites: `CacheFirst`, 1000 entries, 7-day TTL
   - API responses: `NetworkFirst`, 100 entries, 1-hour TTL, 10s network timeout

2. **In-Memory LRU Cache:** `src/lib/pokemon-cache.ts` - `PokemonCache` class
   - 50MB max size, 24-hour max age, 5-minute stale time
   - Background refresh for stale data
   - Garbage collection every 5 minutes
   - Hit rate tracking
   - Optional localStorage persistence

3. **IndexedDB Cache:** `src/lib/pokemon-cache-db.ts` - via `idb` package
   - Offline persistence for Pokemon data
   - Pattern shared with `src/lib/draft-cache-db.ts` for draft state

4. **TanStack Query:** Used in hooks like `src/hooks/useEnhancedPokemonCache.ts`
   - `staleTime: 5 * 60 * 1000` (5 minutes)
   - `gcTime: 10 * 60 * 1000` (10 minutes)
   - Prefetch on hover for instant navigation

**Image Sources (fallback chain):**
- Animated GIF: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/{id}.gif`
- Official artwork: PokeAPI `sprites.other.official-artwork.front_default`
- Default sprite: PokeAPI `sprites.front_default`
- Pokemon Showdown sprites (in CSP): `https://play.pokemonshowdown.com`

**Error Handling:** Fetch with timeout, graceful fallbacks, logged via `createLogger('PokemonApi')`

### Format Build System

**Script:** `scripts/build-format.ts` (run via `npm run build:formats`)
**Input:** `data/formats/*.json` - Format definitions (bans, allowed dex, cost config)
**Output:** `public/data/format_*.json` - Compiled runtime artifacts with Pokemon index
**Manifest:** `public/data/format-manifest.json` - Index of compiled formats

## Monitoring & Observability

### Sentry (Error Tracking)

**SDK:** `@sentry/nextjs` ^10.27.0
**Configs:**
- `sentry.client.config.ts` - Client-side (browser)
- `sentry.server.config.ts` - Server-side (Node.js)
- `sentry.edge.config.ts` - Edge runtime

**Settings:**
- Traces sample rate: 10% production, 100% development
- Suppressed in development (`beforeSend` returns null)
- Ignored errors: hydration failures, network errors, fetch failures
- Conditional activation: only wraps config when `NEXT_PUBLIC_SENTRY_DSN` is set AND `NODE_ENV === 'production'`

### PostHog (Product Analytics)

**SDK:** `posthog-js` ^1.363.4
**Client:** `src/lib/analytics.ts`

**Configuration:**
- Host: `NEXT_PUBLIC_POSTHOG_HOST` (default: `https://us.i.posthog.com`)
- Auto-capture: disabled (explicit events only)
- Page views: captured automatically
- Page leave: captured automatically
- Persistence: `localStorage+cookie`
- Person profiles: `identified_only`

**Tracked Events (typed):**
- `draft_created`, `draft_joined`, `draft_started`, `draft_completed`
- Additional events defined in `analytics` object

### Vercel Analytics

**SDK:** `@vercel/analytics` ^2.0.1
**Purpose:** Web Vitals and page view tracking on Vercel deployment

### Custom Logger

**Module:** `src/lib/logger.ts` - `createLogger(scope)` factory
**Behavior:**
- Production: `warn` and `error` only, structured JSON output
- Development: all levels, human-readable output
- Scoped: each module creates its own logger (e.g., `createLogger('PokemonApi')`)

## Rate Limiting

**Implementation:** `src/middleware.ts`
**Primary:** Upstash Redis (`@upstash/ratelimit` sliding window)
**Fallback:** In-memory rate limiter (when Redis unconfigured)

**Limits:**
| Route Pattern | Limit | Window |
|---|---|---|
| `/api/drafts` | 10 requests | 1 hour |
| `/api/picks` | 60 requests | 1 minute |
| `/api/bids` | 120 requests | 1 minute |
| `/api/user/export` | 5 requests | 1 hour |
| `/api/*` (default) | 100 requests | 1 minute |

**Client Identification:** User ID cookie > `x-forwarded-for` header > `x-real-ip` header > `"unknown"`

## PWA & Offline Support

**Config:** `next-pwa` in `next.config.ts`
**Service Worker:** `public/sw.js` (generated by Workbox, precaches all routes)
**Manifest:** `public/manifest.json`

**PWA Features:**
- Standalone display mode
- Offline fallback page: `public/offline.html`
- App shortcuts: "Create Draft", "Join Draft"
- Share target: accepts shared URLs as draft room codes
- Icons: 192px and 512px (PNG, maskable)
- Theme color: `#dc2855` (red)

**Runtime Caching Strategies:**
| URL Pattern | Strategy | Cache Name | TTL |
|---|---|---|---|
| PokeAPI sprites | CacheFirst | `pokemon-sprites` | 7 days, 1000 entries |
| PokeAPI data | NetworkFirst | `pokemon-api` | 1 hour, 100 entries |
| JS/CSS/fonts | StaleWhileRevalidate | `static-resources` | 30 days, 50 entries |
| All other HTTPS | NetworkFirst | `offlineCache` | 24 hours, 200 entries |

**IndexedDB Offline Storage:**
- `src/lib/draft-cache-db.ts` - Persists active draft state for offline viewing
- `src/lib/pokemon-cache-db.ts` - Persists Pokemon data for offline access
- Both use `idb` package for typed IndexedDB access

## Push Notifications

**Client:** `src/lib/push-notifications.ts`
**Server:** `src/app/api/push/subscribe/route.ts`
**Auth:** VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)
**Features:** Permission management, subscribe/unsubscribe, server sync

## API Routes

**Directory:** `src/app/api/`

| Route | Purpose |
|---|---|
| `/api/health` | Health check (DB + PokeAPI status, uptime, version) |
| `/api/ai/analyze-team` | AI-powered team analysis |
| `/api/formats/sync` | Format data synchronization |
| `/api/push/subscribe` | Push notification subscription management |
| `/api/sheets` | Teamsheet export |
| `/api/user/delete` | Account deletion (GDPR) |
| `/api/user/export` | Data export (GDPR) |
| `/api/webhooks/` | Incoming webhook handlers |

## CI/CD & Deployment

**Hosting:** Vercel (inferred from `@vercel/analytics`, `.env.vercel.local`, deployment checklist)
**CI Pipeline:** Not explicitly configured (relies on Vercel's built-in CI)
**Build:** `next build` with type checking
**Security Headers:** Applied via `next.config.ts` `headers()` function

## Content Security Policy

Defined in `next.config.ts`, allows connections to:
- `*.supabase.co` (REST + WebSocket)
- `pokeapi.co` (Pokemon data)
- `*.sentry.io` (error tracking)
- `us.i.posthog.com` (analytics)
- `accounts.google.com` (OAuth)
- `discord.com` (OAuth)

Image sources allowed:
- `raw.githubusercontent.com` (PokeAPI sprites)
- `pokeapi.co`
- `play.pokemonshowdown.com` (Showdown sprites)
- `lh3.googleusercontent.com` (Google avatars)
- `cdn.discordapp.com` (Discord avatars)

---

*Integration audit: 2026-04-02*
