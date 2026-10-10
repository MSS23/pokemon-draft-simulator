# Pokémon Champions Draft League

Real-time, multiplayer Pokémon draft-league platform: run a snake, tiered or
auction draft with friends, then play out a full league season (schedule,
standings, trades, waivers, playoffs) or a tournament. Live at
**[draftpokemon.com](https://draftpokemon.com)**.

## Features

- **Draft types** — snake (points budget), tiered (per-tier slot caps), and
  auction (nominate + live bidding).
- **Formats** — Pokémon Champions Regulation **M-C** (default, current
  official pool, Sep 8 – Dec 1 2026), M-B and M-A; VGC Regulations A, C, E, F,
  G, H, I; Smogon Gen 9 OU / Gen 6 OU / Gen 6 RU; Budget Balanced;
  Unrestricted; or a custom CSV price list (optionally from usage-based
  pricing templates). Defined in `src/lib/formats.ts`, Champions allowlists in
  `src/data/champions-regulations.ts`.
- **Server-authoritative engine** — picks, budgets, tier caps, auction
  resolution and turn timeouts are enforced in Postgres RPCs
  (`make_draft_pick`, `resolve_auction`, `system_*`). Per-species costs for
  built-in formats are written to `pokemon_tiers` at draft creation so the
  server, not the client, decides what a pick costs.
- **Realtime** — Supabase Realtime keeps every participant in sync; a Vercel
  Cron backstop (`/api/cron/draft-tick`, every minute) auto-picks from
  wishlists or skips absent players.
- **Accounts or guests** — Clerk sign-in, or play as a guest via an httpOnly
  cookie issued by `/api/guest/session`. Share a 6-character room code.
- **Leagues & tournaments** — schedules, KO-based scoring, trades with
  DB-enforced consent, waivers/free agency, playoffs, player profiles.

## Stack

Next.js 15 (App Router) · React 18 · TypeScript · Supabase (Postgres, RLS,
Realtime) · Clerk · Zustand · TanStack Query · Tailwind + Radix/shadcn ·
Upstash rate limiting · Sentry · PostHog · next-pwa · Vitest · Playwright.
Pokémon data ships as a pre-built National Dex index in `public/data/`
(`npm run build:formats`), with `@pkmn/*` and `@smogon/calc` for sets/calcs.

## Local setup

```bash
cp .env.example .env.local   # fill in Supabase + Clerk keys (see comments)
npm ci
npm run dev                  # http://localhost:3000
```

Required env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server routes), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, `CRON_SECRET` (cron route), `NEXT_PUBLIC_SITE_URL`.
Everything else in `.env.example` is optional.

**Database.** The only schema source of truth is `supabase/migrations/`
(applied by `.github/workflows/migrate.yml`: staging automatically, production
behind manual approval). A fresh project can be built by running that folder
in order — `00000000000000_bootstrap.sql` refuses to run on an existing
database. Never run anything in `migrations/_archive/`. Clerk ↔ Supabase auth
setup: [`docs/CLERK-SUPABASE-SETUP.md`](docs/CLERK-SUPABASE-SETUP.md);
staging: [`docs/STAGING_SETUP.md`](docs/STAGING_SETUP.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (also regenerates `public/sw.js`) |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run test:run` | Vitest unit tests (no DB needed) |
| `npm run e2e` | Playwright smoke tests (needs a running app) |
| `npm run build:formats` | Recompile format packs from `data/formats/*.json` |
| `make help` | Supabase staging/prod/local helpers |

## Layout

```
src/app/            routes + API routes (draft create/join/tick, cron, guest, tournament…)
src/components/     UI (draft, league, tournament, shadcn ui/)
src/lib/            services: draft, auction, league, trade, draft-tick, formats…
src/domain/rules/   format legality + cost engine
src/stores/         Zustand draft store
supabase/migrations RLS policies + RPCs (source of truth)
tests/              Vitest suites     e2e/  Playwright
docs/               setup guides, change logs, archived audits, reviews
```

More detail for contributors and agents: [`CLAUDE.md`](CLAUDE.md). Latest
review and open suggestions: [`docs/REVIEW-2026-10-10.md`](docs/REVIEW-2026-10-10.md).

## License

MIT
