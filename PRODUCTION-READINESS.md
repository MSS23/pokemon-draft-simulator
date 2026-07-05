# Production Readiness Plan — Pokémon Draft League

**Audience:** an implementation agent (Claude Opus) that will do the coding.
**Author:** deep-dive audit, 2026-07-05.
**Goal:** get this app from "the website exists but doesn't work as intended" to "500+ signups can use it live, today, and it behaves correctly under real concurrent multiplayer load."

---

## ✅ Tier 1 implementation status (updated 2026-07-05)

Tier 1 has been **implemented in code**. It is NOT yet applied to any database —
the three new migrations must go through the normal `migrate.yml` pipeline
(staging first, then production behind manual approval). Do that in the order
below and verify the bridge probe on staging before promoting.

**What was written**
- **1.1 / 1.3** — Auction resolution + turn-timeout progression are now
  server-authoritative and idempotent. New `resolve_auction`, `system_make_pick`,
  `system_advance_turn` RPCs (`supabase/migrations/20260705120100_*.sql`); a
  shared `src/lib/draft-tick.ts`; a client-triggered `POST /api/draft/[id]/tick`;
  and a Vercel Cron backstop `GET /api/cron/draft-tick` (every minute, in
  `vercel.json`, guarded by `CRON_SECRET`). The client now calls the idempotent
  RPC / tick route instead of every browser running resolution.
- **1.2** — `UNIQUE (draft_id, pokemon_id)` on `picks` + explicit global checks in
  the pick RPCs (`20260705120000_*.sql`).
- **1.4** — `make_draft_pick` hardened: `anon` grant revoked, null/mismatched
  identity rejected (`20260705120000_*.sql`).
- **1.5** — `user_profiles.email` nulled and client writes revoked
  (`20260705120200_*.sql`).
- **1.6** — Legacy `migrations/` tree moved to `migrations/_archive/` with a
  DO-NOT-APPLY README; the old reset-your-DB README was removed.
- **1.7** — Unit tests for the tick orchestration (`tests/draft-tick.test.ts`, 7
  passing) + a DB-integration test plan (`tests/db/README.md`) for the
  concurrency guarantees that need a real Postgres.
- **Tier 0** — `whoami()` RPC + `GET /api/health/bridge` probe
  (`20260705120300_*.sql`) so the Clerk→Supabase JWT bridge is monitorable.

Local checks: `tsc --noEmit` clean, lint clean, full unit suite 392 passing.

**⚠️ Before applying to production — do these in order**
1. Apply all four new `supabase/migrations/2026070512*` files to **staging**.
2. Sign in on staging and hit `GET /api/health/bridge` — it must return
   `{ "bridge": "up" }`. If it returns `down`, the Clerk→Supabase JWT template is
   misconfigured; **fix that first** — otherwise migration `20260705120000`
   (which makes `make_draft_pick` require identity) will turn every interactive
   pick into "Authentication required". This is the Tier-0 question, now testable.
3. Set `CRON_SECRET` in the Vercel project env (see `.env.example`).
4. Run the `tests/db/README.md` concurrency cases against staging.
5. Do a full draft + auction on staging with 2–3 browsers, then promote.

Migration `20260705120000` will **fail loudly** if production already contains
the same Pokémon on two teams (legacy duplicate-bug data) — clean those rows
first (keep earliest pick), then re-run.

## ✅ Tier 2 + Tier 3 implementation status (updated 2026-07-05)

Also implemented in code and validated locally (`tsc` clean, lint clean, 391
unit tests passing, **`next build` succeeds**). Like Tier 1, the one new DB
change (none for Tier 2/3 beyond Tier 1's migrations) needs no extra migration.

**Tier 2 — done**
- **2.1 / 2.2** — Deleted the unused non-atomic `AuctionService.placeBid` (and its
  dead broadcast helper). Bidding stays on the optimistic-locked
  `draft-auction-methods.placeBid` + `recordBidHistory`. Budget reservation (2.1)
  is substantially mitigated already: only one auction is active per draft at a
  time, and `resolve_auction` voids a win the team can no longer afford. A true
  hold-at-bid reservation is noted as a follow-up but is low-risk now.
- **2.3** — Reconnect resync: `DraftRealtimeManager` now fires an `onResync`
  callback after any RE-subscribe; `useDraftRealtime` wires it to an immediate
  full state refetch, so events missed during an outage are caught up.
- **2.4** — `undoLastPick` now delegates to the atomic, JWT-bound `undo_last_pick`
  RPC instead of three unlocked writes. (`advanceTurn` already used an optimistic
  lock, so it was left as-is.)
- **2.5** — Fixed the bid-broadcast wrong-column flash (`current_bidder`, not
  `current_bidder_team_id`). The M5 auto-skip-timestamp bug is moot — its host
  (`auto-skip-service.ts`) was deleted (see 2.7).
- **2.7** — Deleted dead `auto-skip-service.ts` (the tick replaced it) and the
  `[]`-stub `generatePowerRankings`; neutralized the store's silent-data-loss
  `draftStore.makePick` (it now throws pointing to the real path instead of
  optimistically mutating and dropping the write).
- **2.8** — Rewrote the stale, misleading sections of `CLAUDE.md` (auth model,
  guest pattern, route list, branding, version) and added a
  "Server-authoritative draft engine" section so future agents don't fight the
  new design.
- **2.9** — Removed the placeholder "type coverage" code from the AI analysis and
  labeled it honestly as heuristic/stats-based (not type analysis, not an LLM).
- **2.10** — Genericized the raw Supabase error messages returned by
  `/api/draft/create` (still logged server-side); the feedback route now logs a
  warning when the Discord webhook is unset instead of silently dropping; fixed
  the `DISCORD_FEEDBACK_WEBHOOK_URL` name in `.env.example`.

**Tier 3 — partially done, rest deliberately deferred**
- **3.2 (done)** — React Query devtools is now dev-only + lazy (out of the prod
  bundle); moved `@tanstack/react-query-devtools` and `@types/bcryptjs` to
  devDependencies; added `typecheck`, `test:run`, `test:coverage`, `e2e` scripts.
- **3.4 (partly done)** — Added a dedicated `typecheck` step to CI. Coverage-gate
  enforcement (also 1.7) was **not** flipped on: current coverage wasn't measured,
  and turning on the existing 60% threshold blind could break the pipeline. Decide
  after measuring with `npm run test:coverage`. Staging Sentry DSN + Dependabot/
  CodeQL remain as noted below.
- **3.1 / 3.3 / 3.5 (deferred, with rationale)** — These are high-blast-radius and
  need iterative build/deploy validation, so they were intentionally NOT done in
  this pass:
  - **3.1 replace `next-pwa`**: it's unmaintained but *works today*, and the
    `overrides` in package.json already pin the transitive `serialize-javascript`
    CVE, so the security urgency is gone. Swapping to `@serwist/next` rewrites the
    central `next.config.ts` PWA wrapper and needs real device/PWA testing — do it
    as its own change, not bundled with correctness fixes.
  - **3.3 tighten public SELECT** (hide raw user IDs from spectators): the concrete
    PII leak (email) is already closed in 1.5. Hiding `participants.user_id` /
    `teams.owner_id` from spectators needs `SECURITY DEFINER` views + app query
    changes that could break spectator/draft reads; do it deliberately with test
    coverage.
  - **3.5 god-file splits**: the project's own roadmap (Phase 30) already plans the
    draft-page extraction. Not a correctness blocker; continue there post-launch.

---

## How to read this document

Work is split into three tiers. **Do NOW before any real users touch it** — these are the reasons the app doesn't work and the security holes. **NEXT** — needed for a stable public launch. **LATER** — quality, cost, and polish that can follow launch.

Every item is written to be executable: it names the files, describes the defect, states the fix, and gives an acceptance check. Line numbers are from the audit snapshot on 2026-07-05 and may drift — search for the described code, don't trust the number blindly.

**Verified true at audit time:** TypeScript compiles clean (`tsc --noEmit` → 0 errors), 385 unit tests pass, CI exists (lint + audit + test + build), Sentry/error boundaries are wired, and ~40 pages are genuinely implemented (no dead buttons, no "coming soon" stubs in the UI). The problems are **not** "the pages are fake." The problems are in the **real-time draft engine, the auth-trust model, and a few dangerous ops artifacts.**

---

## ⚠️ TIER 0 — Resolve this ambiguity FIRST (it changes everything below)

The single most important unknown, and it must be answered before anything else, because two audits disagree and the correct fix for several items depends on the answer:

**Is the Clerk → Supabase JWT bridge actually configured and live in production?**

- The bridge is the `supabase` JWT template in the Clerk dashboard (HS256, signed with the Supabase JWT secret). When it works, `auth.jwt() ->> 'sub'` resolves to the Clerk user ID inside Postgres via `public.clerk_user_id()`, and **all** the RLS write policies and RPC identity checks function.
- The security migrations assume it is **live** ("User confirmed bridge is live" — `supabase/migrations/20260510174552_sec_p1_rpc_authz_and_wishlist_privacy.sql`).
- But the pick RPC migration comments describe the **offline/legacy** path as "the current production state" (`supabase/migrations/20260510163221_sec_p0_make_draft_pick_jwt_binding.sql`, around lines 13–19 and 63–68).

Both cannot be true. **Action for the agent / user:**
1. In the Clerk dashboard, confirm a JWT template named `supabase` exists and is signed with the current Supabase JWT secret.
2. Add a runtime probe: a server route (extend `src/app/api/health/route.ts`) that makes an authenticated Supabase call as a signed-in user and asserts `clerk_user_id()` returns non-null. Fail the health check and alert (Sentry) if it ever returns null for an authenticated request.
3. Write the answer at the top of this file before proceeding.

If the bridge is **off**, the entire write-authorization model is currently running in a permissive "trust the client-supplied user_id" fallback, and TIER 1 security items are live exploits, not theoretical.

---

## 🔴 TIER 1 — DO NOW (correctness + security blockers before real users)

These are the reasons the app "doesn't work as intended" and the holes that let a bad actor grief every draft. Nothing else matters until these are done.

### 1.1 Make auction resolution server-authoritative and atomic — **THE #1 BUG**

**Symptom:** auctions "don't work" with more than one real person in the room.

**Root cause:** `src/components/draft/AuctionTimer.tsx` (~lines 58–62) fires `onTimeExpired()` on **every** connected client when the countdown hits zero. Each call runs `DraftService.resolveAuction` (`src/lib/draft-auction-methods.ts`, ~lines 278–383), which is a **non-atomic multi-step client sequence**: read auction → check `status==='active'` → INSERT pick → read+update budget → finally set `status='completed'`. With N clients, all pass the `status==='active'` gate before anyone writes `completed`, producing duplicate pick inserts, wrong budget deductions, and multiple `checkAuctionDraftProgress` runs. There is **no transaction and no rollback** of the inserted pick if the later budget step throws.

**Fix:** move auction resolution into a single `SECURITY DEFINER` Postgres RPC (mirror the existing `make_draft_pick` pattern in `supabase/migrations/20260324114022_atomic_pick_realtime.sql`). The RPC must, in one transaction with `FOR UPDATE` locks:
- lock the auction row, and if `status != 'active'` return success-no-op (idempotent — so N callers is harmless);
- verify the Pokémon is not already drafted anywhere in the draft (see 1.2);
- insert the winning pick for `current_bidder`;
- deduct the winning bid from that team's budget;
- set `status='completed'`;
- advance turn/round bookkeeping in the same transaction (fixes M2 stale-cache math).

Then change `AuctionTimer`/`useDraftAuction` so the client only *calls* the RPC; the DB decides the winner exactly once. Optionally gate calling to a single client (host) as a bandwidth optimization, but the RPC's idempotency is what makes it correct.

**Acceptance:** open a draft in 3 browsers, let an auction expire simultaneously → exactly one pick row, one budget deduction, `status='completed'`, turn advances once. Add an automated test that calls the RPC concurrently (see 1.7).

### 1.2 Enforce global "Pokémon already drafted" uniqueness at the database

**Symptom:** the same Pokémon can end up on two teams.

**Root cause:** duplicate protection is only *per team*. `make_draft_pick` checks `picks WHERE team_id = p_team_id AND pokemon_id = ...` and the unique constraint is `UNIQUE (draft_id, team_id, pokemon_id)`. Global uniqueness is enforced **only** by the client filtering `availablePokemon`. Two teams picking the same mon on their turns (or a stale UI) both succeed. Auction `nominatePokemon` (`draft-auction-methods.ts` ~111–165) never checks either.

**Fix:**
- Add `UNIQUE (draft_id, pokemon_id)` to the `picks` table via a new migration (this is the real guarantee).
- Add an explicit check inside `make_draft_pick` and the new auction-resolve RPC that returns a clean error ("already drafted") instead of a raw constraint violation.
- Add the same pre-check to `nominatePokemon` so you can't even start an auction for an owned Pokémon.

**Acceptance:** attempt to insert the same `pokemon_id` twice in one draft via direct RPC calls → second fails with a friendly error; UI shows the mon as unavailable.

### 1.3 Add a server-side scheduler so drafts don't freeze when tabs close

**Symptom:** the draft stalls forever if the person whose turn it is (or, for auctions, everyone) closes the tab.

**Root cause:** there is **no server scheduler** — no `pg_cron`, no edge function, no Vercel cron. Turn skips depend on a browser `setInterval` (`src/hooks/useDraftTimers.ts` ~144–166) and auction resolution depends on an open `AuctionTimer` tab. `AutoSkipService.scheduleAutoSkip` is a client `setTimeout`.

**Fix (pick one, in order of preference):**
- **Preferred:** a Vercel Cron job (add to `vercel.json`) hitting a new `/api/draft/tick` route every 30–60s that finds active drafts whose `turn_started_at + turn_seconds < now()` and runs the auto-skip / auto-pick / auction-resolve RPCs server-side with the service-role key. Idempotent because the RPCs are (1.1/1.2).
- **Alternative:** `pg_cron` inside Supabase calling the resolution functions on a schedule.

Keep the client timers as the fast, responsive path; the server tick is the safety net that guarantees progress.

**Acceptance:** start a timed draft, close every browser during someone's turn, wait past the timer → the server advances the turn / auto-picks within one tick.

### 1.4 Close the `make_draft_pick` anon-execution hole — **CONFIRMED EXPLOIT**

**Verified during this audit.** The canonical applied migration `supabase/migrations/20260510163221_sec_p0_make_draft_pick_jwt_binding.sql` line 205 grants `EXECUTE ... TO anon, authenticated`, and the function body (lines ~62–68) only rejects a JWT/`p_user_id` mismatch **when a JWT is present**. A caller using the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` with **no** bearer token lands in the `v_jwt_user IS NULL` branch, which validates only that the client-supplied `p_user_id` is a participant. Because `participants` and `teams` are world-readable, an attacker reads any victim's `user_id`/`team_id` and **forces picks for whichever team's turn it is, in any active draft.**

**Fix:** mirror what `place_bid` / `execute_trade` / `undo_last_pick` already do correctly (`...174552_sec_p1_rpc_authz...sql`):
- `REVOKE EXECUTE ON FUNCTION make_draft_pick(...) FROM anon;`
- Change the `v_jwt_user IS NULL` branch to `RAISE EXCEPTION 'Authentication required'` **once the bridge is confirmed live** (TIER 0). Until then, keep the fallback but at minimum remove the anon grant so only authenticated Clerk sessions can call it.
- Best end state: route picks through a server API route (like `/api/draft/create` already does) so identity is verified in Node, not trusted from `p_user_id`.

**Acceptance:** calling `make_draft_pick` with the anon key and no JWT returns "Authentication required"; a legitimate signed-in pick still works.

### 1.5 Stop `user_profiles` from leaking email/PII to anyone with the public key

**Root cause:** `user_profiles` has `SELECT USING (true)` (world-readable) and the row type includes `email`, `preferences`, `stats`. The sec-p2a migration tightened only INSERT/UPDATE/DELETE, leaving SELECT fully public. Anyone with the anon key can `select email from user_profiles` for every user, if that column is populated.

**Fix:**
- First confirm whether `email` is actually written (grep for inserts/updates to `user_profiles.email`; check the Clerk sync path).
- Either stop storing email in this table, or split it: keep public display fields (`display_name`, avatar) world-readable and restrict `email`/`preferences`/`stats` to `clerk_user_id() = <owner column>` via a policy, or move them behind a `SECURITY DEFINER` view that only returns self rows.

**Acceptance:** an anon `select email, preferences from user_profiles` returns zero rows (or errors); a user can still read their own profile.

### 1.6 Quarantine the destructive / superseded SQL footguns

**Root cause:** `migrations/` (the loose, historical tree — **not** the canonical `supabase/migrations/`) still contains `RESET_DATABASE.sql`, `CLEAR_DRAFTS_AND_LEAGUES.sql`, and `fix-rls-policies.sql` / `sec-p2-close-anon-escape-DRAFT.sql` which contain the old `OR auth.uid() IS NULL` anon-escape holes. Running the wrong file re-opens every write policy or wipes prod.

**Fix:** move the entire legacy `migrations/` tree into `migrations/_archive/` (or delete it), leave a `README` pointing to `supabase/migrations/` as the only source of truth, and confirm the schema-drift workflow only reads the canonical tree.

**Acceptance:** the only migrations that can be applied are the timestamped canonical set; destructive files are clearly not runnable by accident.

### 1.7 Add automated tests for the live-draft engine (it currently has ZERO)

**Root cause:** the historically race-prone core — `draft-picks-service`, `draft-auction-methods`, `auto-skip-service`, `draft-realtime`, turn advancement — has **no unit or integration tests**, and the Playwright suite is smoke-only and non-blocking in CI. This is why regressions in the exact area that's broken keep shipping.

**Fix:** add tests that would have caught 1.1–1.3:
- concurrent `make_draft_pick` / auction-resolve RPC calls → exactly one winning pick, correct budget (run against a local/Supabase test DB or a transactional harness);
- global uniqueness rejection;
- turn advancement idempotency (double-skip, skip-races-pick);
- undo correctness.

Make the CI `vitest run` include `--coverage` and enforce the existing 60% thresholds in `vitest.config.ts`, and make the Playwright e2e job **blocking** for a core "two clients complete a snake draft" flow.

**Acceptance:** CI fails if a concurrency regression is introduced; coverage gate is enforced.

---

## 🟠 TIER 2 — NEXT (stable public launch)

These won't corrupt data but will confuse or degrade real users. Do them before promoting to the full 500 signups.

### 2.1 Reserve budget when bidding, not at resolution (auction correctness)
`placeBid` (`draft-auction-methods.ts` ~170–273) validates `bid > current_bid` with an optimistic lock (good) but budget is only deducted at resolve time (H1). A team can be high bidder on an auction it can no longer afford after a concurrent purchase. Reserve/hold the bid amount against the team's budget at bid time, release it if outbid. Fold this into the resolve RPC from 1.1.

### 2.2 Delete or fix the second, unsafe `placeBid` (H2)
`src/lib/auction-service.ts` (~84–204) exports a **second** `placeBid` that does a plain non-atomic `UPDATE auctions SET current_bid/current_bidder` with **no optimistic lock**. It isn't the wired path today, but it's exported and one mis-wire reintroduces last-write-wins bid clobbering. Delete it (keep only `recordBidHistory` if that's the used method), or make it delegate to the safe implementation.

### 2.3 Resync state after realtime reconnect (H4)
`DraftRealtimeManager` reconnects with backoff but on `SUBSCRIBED` it never triggers a refetch — a client offline during picks shows **stale state until the next live event**. Wire `onRefreshNeeded` / a full `getDraftState` refetch into the reconnect/`SUBSCRIBED` handler (`src/lib/draft-realtime.ts` ~216–229 and `src/hooks/useDraftRealtime.ts` ~179–182).

### 2.4 Make `advanceTurn` and `undoLastPick` atomic (M1, M3)
Both are direct client UPDATEs relying only on optimistic locks (`draft-picks-service.ts` ~570–651 and ~427–497). Move them into RPCs (or fold skip into the resolve/tick path) so turn/budget can't corrupt under concurrent skip+pick or double-undo.

### 2.5 Fix the bid-broadcast wrong-column flash (M4) and auto-skip timestamp (M5)
- `draft-realtime.ts` (~418–431) emits a synthetic auctions update using `current_bidder_team_id` but the column is `current_bidder` — wrong high-bidder flashes until the refetch corrects it. Use the real column.
- `AutoSkipService.getRemainingTime` derives elapsed from `draft.updated_at` (changes on any update) instead of `turn_started_at`. Align it with the UI (`useDraftTimers.ts` uses `turn_started_at`).

### 2.6 Surface silent auction-progress failures
`checkAuctionDraftProgress` (`draft-auction-methods.ts` ~527, ~548) only logs on error, leaving the draft silently inconsistent. Surface failures to the host UI (toast + Sentry) and/or let the server tick (1.3) reconcile.

### 2.7 Remove or finish the dead/stub code that traps future edits
- `useDraftStore.makePick` (`src/stores/draftStore.ts` ~508–599) has its **server mutation commented out** (~555–570) — it never persists. It's unused (real flow is `useDraftActions.handleDraftPokemon` → `DraftService.makePick`) but is a trap. Delete it or wire it to the real service.
- `makeProxyPick` throws `'Proxy picking not yet implemented'` (`draft-picks-service.ts` ~321) while exported and surfaced on `DraftService`; the host proxy-pick UI is wired to no-ops. Either implement it or remove the surface so it doesn't look available.

### 2.8 Rewrite CLAUDE.md — it actively misleads coding agents
This is high-leverage because **you're handing this repo to an AI to build on**, and the docs describe a different app:
- Auth: docs say "no auth / guest-only / `supabase.auth.getUser` / `localStorage guestUserId`." Reality: **Clerk** auth + httpOnly-cookie guest IDs (`crypto.randomUUID()`), `AuthContext` maps Clerk to a Supabase-User shape.
- Routes: docs list 7 routes; the app ships ~40 including the **entire league system** (rankings, schedule, stats, trades, free-agents, matchups, team pages, weekly-results, admin) and **tournaments**.
- Branding: app is "Pokémon Champions Draft League"; docs say generic "VGC 2024 Reg H."
- Version strings disagree (CLAUDE.md v0.1.2 / footer v0.1.1 / package.json 0.1.1).
Update CLAUDE.md to match reality, or an agent will keep "fixing" things toward the wrong design.

### 2.9 Truth-in-labeling for "AI" analysis
`/api/ai/analyze-team` is **heuristic stat-threshold logic, not an LLM.** Its type-coverage dimension uses **placeholder data** (`src/lib/ai-analysis-service.ts` ~144–149) and `generatePowerRankings()` returns `[]` (~437–449, dead — the rankings page computes its own score). Either (a) implement real type-coverage from the Pokémon data you already have and delete the dead stub, or (b) rename the feature to "Team Analysis" and drop "AI" so you're not overclaiming. Don't ship placeholder analysis as "AI insights."

### 2.10 Minor API hardening
- `draft/create` echoes raw Supabase error messages to the client (route ~186, 227, 251) — return generic messages, log details server-side.
- Feedback webhook env mismatch: route reads `DISCORD_FEEDBACK_WEBHOOK_URL` but `.env.example` documents `NEXT_PUBLIC_DISCORD_WEBHOOK_URL`; if unset the endpoint returns `{success:true}` while silently dropping feedback. Align the names and fail loudly (or log) when unset.

---

## 🟡 TIER 3 — LATER (quality, cost, polish)

### 3.1 Replace or remove `next-pwa`
It's **unmaintained** (last real release 2022) and forces transitive `overrides` for `serialize-javascript`/`rollup-plugin-terser` in `package.json` — a supply-chain patch smell. Migrate to `@serwist/next` (the maintained successor) or drop PWA if it isn't core to the value prop.

### 3.2 Trim the prod bundle
- Move `@tanstack/react-query-devtools` and `@types/bcryptjs` out of `dependencies` into `devDependencies` (they currently ship / mis-classify).
- Audit the `@pkmn/*` + `@smogon/calc` + `framer-motion` + `posthog-js` weight against actual usage; lazy-load the heavy analysis paths.

### 3.3 Tighten public SELECT surface where possible (MEDIUM-2)
`participants.user_id` / `teams.owner_id` are world-readable (needed for spectators) and are the enumeration vector that made 1.4 exploitable. Once picks route through verified server identity, consider exposing spectator views through a `SECURITY DEFINER` view that omits raw user IDs.

### 3.4 CI/ops hygiene
- Add a `typecheck` script (`tsc --noEmit`) and run it as its own CI step instead of relying on `next build`.
- Add Dependabot / CodeQL.
- Sentry is gated to `hostname === 'draftpokemon.com'`, so **staging/preview send nothing** — add a staging DSN or env gate so you get errors from pre-prod.
- Reconcile `.planning/` docs with reality (they reference deps like `nuqs`, `motion@12`, `react-resizable-panels` that aren't in `package.json`).

### 3.5 Consolidate the god-files (tech debt, not a blocker)
`.planning/codebase/CONCERNS.md` still flags large files (`draft/[id]/page.tsx` ~1,430 lines, several 700–1,500-line pages). The v6 roadmap (Phase 30) already plans the draft-page extraction. Fine to continue post-launch; don't let it block correctness work.

---

## Suggested execution order for the implementation agent

1. **TIER 0** — answer the JWT-bridge question; add the health probe. *(Everything depends on this.)*
2. **1.4, 1.5, 1.6** — security holes, small and self-contained, ship immediately.
3. **1.1 + 1.2 + 2.1** together — the auction resolve RPC with global uniqueness and budget reservation is one coherent piece of work.
4. **1.3** — server tick scheduler (depends on the idempotent RPCs from step 3).
5. **1.7** — tests for everything in steps 3–4; turn on the coverage gate + blocking e2e.
6. **2.3, 2.4, 2.5, 2.6** — remaining realtime/atomicity correctness.
7. **2.7, 2.8, 2.9, 2.10** — cleanup, docs, labeling, API hardening.
8. **TIER 3** — as capacity allows.

**Definition of "ready for the 500 signups":** TIER 0 answered, all of TIER 1 done and tested, and 2.1–2.6 done. At that point the multiplayer engine is server-authoritative, correct under concurrency, self-healing when tabs close, and free of the anon-pick and PII holes — which is exactly the set of things that make it "not work as intended" today.

---

## Appendix — file map of the hotspots

| Concern | Primary files |
|---|---|
| Auction resolution race (1.1) | `src/components/draft/AuctionTimer.tsx`, `src/lib/draft-auction-methods.ts`, `src/hooks/useDraftAuction.ts` |
| Global uniqueness (1.2) | `supabase/migrations/…atomic_pick_realtime.sql`, `draft-auction-methods.ts` |
| Server scheduler (1.3) | `vercel.json`, new `src/app/api/draft/tick/route.ts`, `src/lib/auto-skip-service.ts`, `src/hooks/useDraftTimers.ts` |
| Anon pick exploit (1.4) | `supabase/migrations/20260510163221_sec_p0_make_draft_pick_jwt_binding.sql` |
| PII leak (1.5) | `user_profiles` policies in `supabase/migrations/…sec_p2a_low_risk_tables.sql`, `src/lib/supabase.ts` (types) |
| SQL footguns (1.6) | `migrations/` (legacy tree) |
| Engine tests (1.7) | `tests/`, `vitest.config.ts`, `.github/workflows/ci.yml`, `e2e/smoke.spec.ts` |
| Realtime resync (2.3) | `src/lib/draft-realtime.ts`, `src/hooks/useDraftRealtime.ts` |
| Stale docs (2.8) | `CLAUDE.md` |
| Fake "AI" (2.9) | `src/lib/ai-analysis-service.ts`, `src/app/api/ai/analyze-team/route.ts` |
