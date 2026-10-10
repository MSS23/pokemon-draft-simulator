# Go-Live Action Plan — Pokémon Champions Draft League

**Date:** 2026-07-06
**Purpose:** the exact, ordered set of things to fix so the app works as intended and can go to production **with immediate effect**. Scoped to your four asks: **login works · creating a draft league works · the draft UI looks good · other improvements**.
**Method:** whole-codebase audit — auth flow, create/join flow, draft UI, and production infra — cross-checked against the existing `PRODUCTION-READINESS.md`.

---

## TL;DR — where you actually stand

**Good news:** this is a mature codebase, not a prototype. The prior `PRODUCTION-READINESS.md` audit's Tier 1–3 fixes are **written and merged in code** (server-authoritative draft engine, atomic pick/auction RPCs, PII lockdown, cron backstop). Typecheck is clean (`tsc --noEmit` → 0 errors). CI runs lint + typecheck + test + build + e2e. Migration pipeline has staging→prod gating. The draft UI is genuinely polished.

**The catch:** the code is ready, but **the production database and environment are not yet switched on to match it**, and there are **three specific defects that will break the core experience** the moment a second real person joins a draft. None are large. All are listed below in dependency order.

### The one thing that matters most
Nearly every blocker traces to a single dependency: **the Clerk → Supabase JWT bridge** (the `supabase` JWT template in the Clerk dashboard). If it is not live in production:
- **Login UI may not even render** (CSP blocks Clerk.js), and
- **Creating a draft works, but nobody can join it** (join inserts run on the anon key and RLS rejects them with `42501`).

Verify the bridge **first**. Everything else is downstream.

---

## 🔴 CRITICAL PATH — do these in order, before any real users

Legend: 🧑 = you (dashboard / env / ops) · 🤖 = code change (I can do these).

### ✅ Gate 0 — Verify the Clerk→Supabase JWT bridge is live  🧑
This is the single most important pre-flight check.
1. Clerk dashboard → **JWT Templates** → confirm a template named exactly **`supabase`** exists, HS256, signed with the **current** Supabase JWT secret.
2. Deploy, sign in on the real domain, and hit **`GET /api/health/bridge`** while signed in. It **must** return `{ "bridge": "up" }`.
   - ⚠️ It returns HTTP **200 even when the bridge is down** (body says `{"bridge":"down"}`). Read the JSON body, not the status code.
3. If it returns `down`: the template is missing/misnamed or the Supabase JWT secret rotated. **Fix this before anything else** — otherwise joins and every authenticated write silently fail.

**Acceptance:** signed-in `/api/health/bridge` → `{"bridge":"up"}`.

---

### 🔴 Blocker 1 — CSP will block Clerk.js → login page never loads  🧑 + 🤖
**Files:** `src/middleware.ts:19-25` (FAPI host derivation), `:37/:44/:65` (CSP `script-src`/`frame-src`/`connect-src`), `.env.example`.

The middleware tries to derive the Clerk FAPI host from the publishable key (`pk.split('_')[2]?.split('.')[0]`). That segment is **base64-encoded**, not a slug, so the derived host is bogus. The real Clerk domain is only allowed in CSP if **`NEXT_PUBLIC_CLERK_DOMAIN`** is set — and that variable is **absent from `.env.example`** and the deploy checklist. If it's unset in prod, `script-src`/`frame-src` block Clerk.js and **the sign-in/up UI never renders**.

**Do:**
- 🧑 Set in Vercel prod: `NEXT_PUBLIC_CLERK_DOMAIN=clerk.draftpokemon.com` (your real Clerk FAPI domain) and `NEXT_PUBLIC_CLERK_AUTHORIZED_PARTIES=https://draftpokemon.com` (add `www` / preview domains if you serve from them — otherwise Clerk rejects the JWT `azp`).
- 🤖 Fix the broken FAPI-host derivation in `middleware.ts:19-25` so CSP works even if the env var is missing, and add both vars to `.env.example` + the in-file deploy checklist.

**Acceptance:** on the production domain, the sign-in page renders with no CSP violations in the console; sign-in and sign-up complete and redirect to `/dashboard`.

---

### 🔴 Blocker 2 — Joining a draft fails on the anon key (RLS `42501`)  🤖 (+ 🧑 Gate 0)
**Files:** `src/lib/draft-service.ts:573` (`joinDraft`), `:678-716`; `src/app/api/draft/create/route.ts:6-11` (documents the exact failure mode). There is **no `/api/draft/join` route** — join inserts run client-side on the anon Supabase client.

Create-draft goes through a **service-role API route** (robust). Join does **not** — it inserts into `teams`/`participants` on the anon client, relying entirely on the JWT bridge. So even with the bridge live, the join path is fragile; without it, **create succeeds but every join fails** and the user sees a generic "Failed to join draft" after "Draft Found!". This is the most likely thing to break your core loop in the wild.

The same anon read-then-write path also has **race conditions**:
- `nextDraftOrder = existingTeams.length + 1` → two simultaneous joiners get the **same `draft_order`**.
- `max_teams` capacity and duplicate team-name/display-name checks are app-side reads → concurrent joins can **over-subscribe** past `max_teams`.

**Do (🤖):** add a service-role **`POST /api/draft/join`** mirroring `create/route.ts` (verify Clerk `auth()`/guest cookie in Node, then insert with the service-role client). Compute `draft_order` and enforce `max_teams` inside a single guarded step. Point `join-draft/page.tsx` at it. Do the same for tournament join (`KnockoutService.joinTournament`).
Also surface the real DB error instead of swallowing it to a generic string (`draft-service.ts:716`).

**Acceptance:** with two browsers, both join the same room code; distinct `draft_order`; the (N+1)th joiner past `max_teams` is cleanly turned into a spectator, not a hard error.

> Interim (if you must ship before this route exists): Gate 0 green makes the current anon+bridge join *work*, but leaves the race windows. Blocker 2 is the durable fix and closes Blocker 5's races too.

---

### 🔴 Blocker 3 — The pending auction migration errors on apply (signature mismatch)  🤖
**File:** `supabase/migrations/20260705120100_auction_resolve_and_system_rpcs.sql` (currently **modified but uncommitted** in your working tree).

The `CREATE FUNCTION system_make_pick(...)` takes **6 args** (`:169-176`), but the committed `REVOKE`/`GRANT`/`COMMENT`/rollback statements reference a **7-arg** signature. Postgres will **error** ("function does not exist") when the migration runs, failing the whole `migrate.yml` pipeline. Your **uncommitted local edit already fixes this** (7-arg → 6-arg).

**Do (🤖):** commit that fix. Do **not** apply this migration to any DB until it's committed.

**Acceptance:** the migration applies cleanly on staging with no "function does not exist" error.

---

### 🔴 Blocker 4 — Apply the 4 pending migrations (staging → prod)  🧑 + 🤖
**Files:** `supabase/migrations/20260705120000_*` … `20260705120300_*` (4 files). These are the **server-authoritative engine + security fixes that are live in code but not in the prod DB**.

⚠️ **Data prerequisite:** `20260705120000_sec_p3_pick_authz_and_global_uniqueness.sql` adds `UNIQUE (draft_id, pokemon_id)` and **fails loudly** if prod already contains the same Pokémon on two teams (legacy duplicate-pick bug). **Before applying:** run a query to find duplicate `(draft_id, pokemon_id)` rows in `picks`, keep the earliest, delete the rest.

**Do:**
1. 🤖 Commit Blocker 3's fix.
2. 🧑 Clean duplicate picks in prod (query first, delete second).
3. 🧑 Apply all four `2026070512*` migrations to **staging** via `migrate.yml`.
4. 🧑 Re-verify `/api/health/bridge` = `up` on staging (migration `…120000` makes `make_draft_pick` require identity — if the bridge is down, every pick becomes "Authentication required").
5. 🧑 Run a full draft + auction on staging with 2–3 browsers, then promote to prod.

**Acceptance:** all four migrations applied to prod; a full snake draft and a full auction complete correctly with 3 simultaneous browsers (exactly one pick per Pokémon, correct budgets, turn advances once).

---

### 🔴 Blocker 5 — Set the required production env vars  🧑
Confirm all of these exist in **Vercel prod** (some gate whole features):

| Var | Why | Symptom if missing |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | create-draft + new join route | create returns **503** |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | client + realtime | Supabase client is `null`; all lookups/joins no-op |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | auth | opaque Clerk init failure |
| `NEXT_PUBLIC_CLERK_DOMAIN` / `_AUTHORIZED_PARTIES` | CSP + JWT (Blocker 1) | login UI blocked / JWT rejected |
| `CRON_SECRET` | `/api/cron/draft-tick` backstop | route returns **503**; drafts freeze when tabs close |
| `NEXT_PUBLIC_SITE_URL` | absolute URLs | wrong redirect/OG links |

**Acceptance:** a fresh deploy has no 503s from create/cron; the every-minute cron runs (check Vercel cron logs).

---

## ✅ Ask #1 — "Login works"
After **Gate 0 + Blocker 1 + Blocker 5**, login works. Remaining hardening (not blockers):
- 🤖 `src/lib/env.ts` validates only Supabase vars — add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` so a missing key fails fast with a clear message instead of an opaque Clerk crash.
- 🤖 `AuthContext.tsx:48` mislabels OAuth users as `provider:'email'` (any user with a primary email). Cosmetic — fix if any consumer reads `provider`; grep first.
- 🧑 Make the bridge probe alert: `/api/health/bridge` returns `down` with a 200, so a naive uptime check won't notice. Add a synthetic signed-in check or alert on the JSON body / the Sentry error it already logs.

---

## ✅ Ask #2 — "Creating a draft league works"
Create itself is the **robust** part (service-role route, ordered inserts, manual rollback, bcrypt passwords). **Join** is the weak half — see **Blocker 2**. Additional cleanups:
- 🤖 **Room-code collision:** `generateRoomCode()` is called once with no uniqueness retry (`create/route.ts:115`; also tournament create). Low probability (36^6) but an unhandled collision → generic 500. Add a small retry loop, or a DB unique constraint + catch-and-retry.
- 🤖 **DB-level guarantees:** add constraints for `UNIQUE(draft_id, draft_order)`, `UNIQUE(draft_id, team_name)`, and enforce `max_teams` in the join RPC — this is what actually closes the join races, not app-side checks.
- 🤖 **Tournament casing bug:** tournament create stores `room_code` **UPPERCASE** (`api/tournament/create/route.ts:86`) while draft create/lookup use **lowercase**. Normalize to lowercase to avoid a latent "code not found" bug; also give the tournament host a `participants` row for parity with drafts.
- 🤖 **Dead controls:** remove unreachable `_handleDownloadTemplate` and the tracked-but-ignored `formData.scoringSystem` in `create-draft/page.tsx`.
- 🤖 `user_profiles` auto-create errors are logged, not thrown (`draft-service.ts:602`) — fine, but note it as a known silent partial-failure.

---

## ✅ Ask #3 — "The draft league UI looks good"
It already does — cohesive token-driven "Championship Arena" design system, a standout "On The Clock" hero, refined Pokémon cards, thorough loading/empty/error states, real accessibility work, and genuine mobile thought. The rough edges are **localized**, not systemic. In priority order:

1. 🤖 **Fix or remove the dead mobile wishlist FAB** (`draft/[id]/page.tsx:1386-1406`). The purple heart FAB opens `MobileWishlistSheet` wired to hardcoded `wishlist={[]}` / no-op handlers — a **visibly broken feature on mobile**, the most-scrutinized surface, and redundant with the real `WishlistManager` shown above the grid. Wire it to the Zustand wishlist store or delete the FAB. **Fastest credibility win.**
2. 🤖 **Type-badge contrast fails WCAG AA** for bright types (electric/ice/steel/fairy render white text on light backgrounds) — `PokemonCard.tsx:330-336`, `DraftConfirmationModal.tsx:154-163`. Add a `getTypeTextColor(type)` helper (dark text on light types) applied everywhere type badges render. Closes the main accessibility hole.
3. 🤖 **Mobile tab bar doesn't stick** — `page.tsx:999` uses `sticky top-[auto]`, which makes `position:sticky` a no-op, so core in-draft navigation scrolls away. Give it a real `top` offset below the hero.
4. 🤖 **AuctionTimer status colors** (`text-red-400`/`text-amber-400` "SOLD"/"Going once", `AuctionTimer.tsx:171-189`) are tuned for a dark background but render in a light container → low contrast. Swap to `--warning`/`--destructive` tokens.
5. 🤖 **Add `role="tab"`/`aria-selected`** to the mobile tab bar (`page.tsx:1000-1032`) and sidebar filters (`DraftActivitySidebar.tsx:143-156`) — small change that completes the accessibility story recent commits started.

Minor/optional: skeletons use raw `bg-gray-200` vs the app's `bg-muted`; two different "confirm pick" UIs (inline bar + modal) for the same action; the hero is intentionally always-dark even in light mode.

---

## 🟠 Ask #4 — "Other improvements" (do soon after launch, not blocking)
- 🧑 **Staging Sentry DSN.** Sentry is gated to the prod hostname, so staging/preview send nothing — you're blind on pre-prod. Add a staging DSN/env gate.
- 🤖 **Coverage gate.** CI runs tests but the 60% threshold isn't enforced. Measure `npm run test:coverage`, then flip the gate on so concurrency regressions in the draft engine can't ship. Make the "two clients complete a snake draft" e2e **blocking** (currently `continue-on-error: true`).
- 🤖 **DB-integration tests** for the new RPCs (`tests/db/README.md` has the plan): concurrent `make_draft_pick`/`resolve_auction`, global-uniqueness rejection, turn-advance idempotency, undo. These guard the exact code you're about to rely on.
- 🤖 **Draft-tick observability.** Confirm the cron backstop actually advances a stalled draft (close all tabs mid-turn → server auto-picks/skips within a tick). Add a log/metric.
- 🤖 **God-file split** (`draft/[id]/page.tsx` is 1,430 lines) — tech debt, already on your Phase 30 roadmap. Not a blocker; do it post-launch to make the UI fixes above safer.
- 🧑 Add **Dependabot/CodeQL**; reconcile `.planning/` docs (they reference deps not in `package.json`).

---

## 🚦 Definition of "ready for real users"
Ship when **all of these are true**:
- [ ] `/api/health/bridge` returns `{"bridge":"up"}` signed-in on prod (Gate 0)
- [ ] Sign-in/up render and complete on the prod domain, no CSP errors (Blocker 1)
- [ ] All prod env vars set; no 503s from create/cron (Blocker 5)
- [ ] Blocker 3 committed; all four `2026070512*` migrations applied to prod after duplicate-pick cleanup (Blockers 3–4)
- [ ] Two browsers: create a draft, both **join**, run a full snake draft **and** a full auction — one pick per Pokémon, correct budgets, turn advances once (Blocker 2 + Blocker 4)
- [ ] Close all tabs mid-turn → the cron backstop advances the draft within a minute
- [ ] Mobile: no dead wishlist FAB, tab bar sticks, type badges legible (Ask #3, items 1–3)

**Suggested order:** Gate 0 → Blocker 3 (commit) → Blocker 1 + Blocker 5 (env) → Blocker 4 (migrations, staging then prod) → Blocker 2 (join route) → Ask #3 UI items 1–3 → deploy → Ask #4 as capacity allows.

---

## Appendix — hotspot file map
| Concern | Primary files |
|---|---|
| JWT bridge (Gate 0) | `src/app/api/health/bridge/route.ts`, `src/lib/supabase.ts:1508-1523`, `supabase-server.ts:39-68` |
| CSP / Clerk domain (B1) | `src/middleware.ts:19-25, 37, 44, 65`, `.env.example` |
| Join path (B2) | `src/lib/draft-service.ts:573, 678-716`; new `src/app/api/draft/join/route.ts` |
| Migration signature (B3) | `supabase/migrations/20260705120100_auction_resolve_and_system_rpcs.sql` |
| Pending migrations (B4) | `supabase/migrations/20260705120000…120300_*.sql`, `.github/workflows/migrate.yml` |
| Create/room-code (Ask 2) | `src/app/api/draft/create/route.ts:115, 149`, `src/lib/room-utils.ts`, `src/app/api/tournament/create/route.ts:86` |
| Mobile wishlist FAB (Ask 3) | `src/app/draft/[id]/page.tsx:1386-1406` |
| Type-badge contrast (Ask 3) | `src/components/pokemon/PokemonCard.tsx:330-336`, `DraftConfirmationModal.tsx:154-163` |
| Auth env validation (Ask 1) | `src/lib/env.ts`, `src/contexts/AuthContext.tsx:48` |
