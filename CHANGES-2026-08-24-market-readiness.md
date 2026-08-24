# Market-Readiness Pass — 2026-08-24

Closes the six deliberate gaps left by the 2026-08-23 audit
([CHANGES-2026-08-23-audit.md](CHANGES-2026-08-23-audit.md) §7). Verified:
`tsc` clean, **436/436 tests pass** (8 new), ESLint clean, production build
succeeds.

> **⚠️ ACTION REQUIRED:** apply
> [`supabase/migrations/20260824120000_market_readiness.sql`](supabase/migrations/20260824120000_market_readiness.sql)
> to the live Supabase project **after** the still-pending
> `20260801120000_system_skip_nomination.sql` and
> `20260823120000_league_engine_fixes.sql`. Do **NOT** run
> `00000000000000_bootstrap.sql` on the live project — it is for fresh
> Supabase projects only (it refuses to run if `drafts` already exists).

## 1. Canonical score unit (was: live scorer vs recorder modal disputes)

`matches.home_score / away_score` are now **total KOs (kills)** whenever the
match has rosters — the unit the live KO scorer already submitted — so
dual-confirmation submissions from either tool agree instead of flagging
`disputed`. Rosterless room-code tournament matches fall back to games won.
W/L always comes from `winner_team_id` (series winner), never the score, so
Bo3 results stay correct even when the series loser out-killed the winner.
Standings **PF/PA now read as kill totals** (the column was already labeled
"PF"). Pure logic lives in `src/lib/match-score.ts` (unit-tested).
*Note: matches completed before this change stored games-won in PF/PA, so
historical PF/PA mixes units.*

## 2. Trade consent enforced at the DB level

- New SECURITY DEFINER RPCs: `respond_to_trade` (only an owner of a team in
  the trade **other than the proposing team** — `proposed_by` is a team id —
  or the commissioner may accept/reject/counter-close; records
  `responded_by`), `cancel_trade` (proposer/commissioner), `approve_trade`
  (commissioner verified server-side).
- `execute_trade` refuses trades whose acceptance did not come from the
  non-proposing side (legacy accepted rows require the executor to be the
  non-proposer or commissioner), and now honors the admin **roster lock**.
- The `trades` client UPDATE policy is **dropped** — status flips via
  PostgREST are no longer possible. `TradeService` routes through the RPCs
  with PGRST202 legacy fallbacks until the migration is applied.

## 3. In-season free agency

New league setting `allowInSeasonWaivers` (admin → Settings → Waiver Wire):
when enabled, claims stay open all season instead of locking at the first
played match. `process_waiver_claim` also now enforces the commissioner's
`waiverDeadline` (previously settable but a no-op) and `rosterLocked`.
Client pre-checks and the free-agents page lock messaging follow the same
rules. Still FCFS with per-season claim limits — `waiver_priority`/FAAB
processing windows remain out of scope.

## 4. Per-game results persisted (`match_games`)

- Recorder modal and live scorer write one `match_games` row per played game
  (winner + per-game KO score; live-scored matches are game 1).
- `UNIQUE (match_id, game_number)` + upsert so re-records overwrite cleanly;
  scoped INSERT/UPDATE/DELETE policies (participants/commissioner) replace
  the old `WITH CHECK (true)` INSERT.
- Matchup page shows the game-by-game line (e.g. `G1 4-2 · G2 3-4`) on
  completed matches.

## 5. Match rescheduling + cross-conference standings

- `LeagueService.rescheduleMatch` + a reschedule control on the matchup page
  for the two team owners and the commissioner (RLS already scoped match
  updates to exactly those people). Completed matches can't be rescheduled.
- `recalculate_league_standings` now includes completed matches stored in
  the **sibling conference's league row** (cross-conference matches count
  for both sides), and the client keeps the sibling conference's standings
  in sync after every recalc. Bonus fix: playoff/knockout matches (notes
  contain `bracketMatchId`) are **excluded** from regular-season standings —
  they previously polluted W/L/PF/PA once completed.

## 6. Bootstrap migration for fresh projects

`supabase/migrations/00000000000000_bootstrap.sql` — a guarded snapshot of
the archived complete schema. A brand-new Supabase project can now be built
by running the migrations folder in order. The guard raises immediately if
`public.drafts` already exists, so it cannot half-apply over production.

## Known ceilings (deliberate)

1. The live scorer remains a single-game tool: on a Bo3/Bo5 match it submits
   its KO tally as the whole match. Use the recorder modal for multi-game
   series (units still agree; only the winner derivation could differ).
2. `waiverDeadline` has no timezone (datetime-local string) — Postgres
   interprets it in the server timezone (UTC).
3. In-season claims are not blocked while a claiming team's match is
   in progress; a mid-match roster swap is possible.
4. Historical PF/PA mixes games-won and kill units (see §1).
