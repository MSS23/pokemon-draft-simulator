# Full-App Audit & Bug-Fix Pass — 2026-08-23

A whole-application audit (knockouts/tournaments, league core, transfers, match
scoring, per-game Pokémon selection, sprites) surfaced ~100 real defects. This
pass fixes the root causes. Verified: `tsc` clean, **428/428 tests pass** (12
new regression tests), ESLint clean, production build succeeds.

> **⚠️ ACTION REQUIRED:** apply
> [`supabase/migrations/20260823120000_league_engine_fixes.sql`](supabase/migrations/20260823120000_league_engine_fixes.sql)
> to the live Supabase project (SQL editor). The client has `PGRST202`
> fallbacks where possible, but **standings, waiver claims, and team sheets
> stay broken in production until it is applied.**
> (`20260801120000_system_skip_nomination.sql` from the previous session may
> also still be pending.)

---

## 1. League core

| Fix | Where |
|---|---|
| **Round-robin generator paired teams against themselves** and dropped one team per round (`rotating[n-2-i]` off-by-one). Every league schedule was wrong. | `src/lib/league-service.ts` (`buildRoundRobinRounds`) |
| **Saving any league setting deleted the playoff bracket, knockout bracket, announcements, and waiver config.** `getLeagueSettings` rebuilt a whitelisted object and every save wrote it back over the whole `settings` JSONB. Now spreads the raw settings first so unknown keys survive. Also fixes `getPlayoffState()` always returning `null` (dead playoff report button, bracket vanishing on reload). | `src/lib/league-service.ts` (`getLeagueSettings`) |
| `pointsPerWin: 0` / `pointsPerDraw: 0` silently became 3 / 1 (`\|\|` → `??`). | same |
| **`getLeague` returned snake_case rows cast as camelCase `Team`** — `ownerId` was always `undefined`, so team owners never saw "Record Result" and every league page treated members as spectators. All `as unknown as Team` casts replaced with `mapTeamRowFull`. | `src/lib/league-service.ts` |
| **Standings writes were RLS-blocked and silently no-oped** (W/L/rank never moved; new leagues had no standings rows). `initializeStandings`/`updateStandings` now go through SECURITY DEFINER RPCs (`initialize_league_standings`, `recalculate_league_standings`) with a legacy client fallback. | `src/lib/league-service.ts` + migration |
| `recalculate_league_standings` erased `current_streak` — the RPC now computes streaks; it also orders by `COALESCE(completed_at, updated_at)` so results missing `completed_at` don't corrupt streak order. | migration |
| `updateMatchResult` wrote `status: 'completed'` with `completed_at: null` when `status` was omitted. | `src/lib/league-service.ts` |
| **Cross-conference matches could never be reported and their pages white-screened**: `notes` was the plain string `'Cross-conference'` and multiple readers did unguarded `JSON.parse`. Added tolerant `LeagueService.parseMatchNotes()` used by all readers; new cross matches store JSON. | `src/lib/league-service.ts`, `src/app/match/[id]/page.tsx`, `MatchRecorderModal.saveReplayUrls` |
| Cross-conference matches were scheduled into weeks past `total_weeks` (unreachable); `total_weeks` is now extended to cover them. Matchup + live-score pages no longer redirect/crash on cross-conference opponents (team resolved directly if not in the league list); `getTeamColor(-1)` no longer crashes the schedule page. | `src/lib/league-service.ts`, matchup/score pages, `src/utils/team-colors.ts` |
| Split-conference creation only initialized Conference A — extended settings and `team_pokemon_status` now applied to **both** leagues. | `src/components/league/CreateLeagueModal.tsx` |
| Power rankings: a team with **zero matches scored ~250** (flat `defensiveRating` of 100) and outranked every real team — unplayed teams now score 0. | `src/app/league/[id]/rankings/page.tsx` |
| Playoff seeding used an unordered standings list (random bracket) — `StartPlayoffsModal` now sorts by rank → wins → differential before slicing. | `src/components/league/StartPlayoffsModal.tsx` |
| Admin "Advance Week" dialog claimed it would forfeit unplayed matches (it doesn't) — copy corrected. Standings "Pts" column relabeled "PF" (it shows points-for, not league points). | `src/app/league/[id]/admin/page.tsx`, `src/app/league/[id]/page.tsx` |

## 2. Knockouts / tournaments

| Fix | Where |
|---|---|
| **Bracket advancement was silently discarded when a non-host reported a result** (`leagues.settings` is commissioner-only under RLS; 0-row update returns no error) — tournaments could never reach a champion. Reporting now goes through a new server route that verifies the caller is a participant of that match (or host/commissioner) and persists with the service role, then creates next-round match rows. | **new** `src/app/api/tournament/report/route.ts`; `KnockoutService.reportResult` now calls it |
| **Byes were packed into the first bracket slots**, so with 6 players seeds 1 and 2 always met in the semi-final. Replaced with standard seeded placement (1v8, 4v5, 2v7, 3v6…); byes go to top seeds; regression-tested for 5 and 6 players. | `src/lib/tournament-service.ts` |
| **Non-host players' team sheets were silently never saved** (host-only RLS on `drafts.settings`, error discarded). Now an owner-scoped atomic `submit_team_sheet` RPC (jsonb per-team merge → also fixes two players clobbering each other's sheets). Sheets are also validated: no duplicates, and in draft leagues every entry must be on the team's drafted roster. | `src/lib/teamsheet-service.ts` + migration |
| Commissioner "Record Result" was a **dead end for room-code tournaments** (KO validation demanded picks that don't exist) — KO validation/recording skipped when both rosters are empty. | `src/components/league/MatchRecorderModal.tsx` |
| "Upcoming Matches" showed "No Pokemon" for every room-code tournament — now falls back to team sheets. Own-sheet view after start hid your own EVs/nature and exported spreadless pastes (`isOwner` not passed) — fixed. | `src/app/tournament/[id]/page.tsx` |
| Join page reported "You're in the tournament!" when the RPC had silently downgraded the joiner to **spectator** (room full / already started) — now says so. | `src/app/join-tournament/page.tsx` |
| `best_of_5` was recorded as a Bo3 (clinched at 2 wins) — recorder now supports Bo1/Bo3/Bo5. Recording a knockout match from the league page never advanced the bracket (`advanceTournamentBracket` not passed) — fixed. | `MatchRecorderModal.tsx`, `src/app/league/[id]/page.tsx` |

## 3. Match scoring & stats

| Fix | Where |
|---|---|
| **The match recorder wrote killers into the victim column and never persisted deaths** — every kill showed as a death on the killer, kills were 0, and no Pokémon was ever marked fainted. New convention everywhere: kill rows carry `scorer_pick_id` (with `pick_id NULL`), faints are `pick_id` rows. New `MatchKOService.recordKillTally()`; `recordPokemonKO` no longer bumps a kill counter for a faint. | `src/lib/match-ko-service.ts`, `MatchRecorderModal.recordKOs` |
| **Kill leaderboard was permanently empty** (RLS-blocked counter) and drifted on undo — now derived from KO event rows. Same fix applied to league Pokémon stats, weekly results drill-down, and the weekly "KO Leader" highlight (which used to crown an arbitrary *victim*). | `match-ko-service.ts`, `league-stats-service.ts`, `weekly-results/page.tsx`, `weekly-highlights-service.ts` |
| **Result submission race + permission hole**: dual-confirmation was a read-modify-write on `matches.notes` (concurrent submissions vanished) and never checked the caller owned the submitting side (you could submit *for your opponent* and auto-confirm). New atomic `submit_match_side` RPC merges server-side and enforces side ownership; completed matches can no longer be re-submitted. | `league-service.submitMatchResult` + migration |
| KO-table writes (undo KO, mark dead, match stats) were RLS-blocked with no error — scoped UPDATE/DELETE policies restored for match participants/commissioner; `increment_pokemon_match_stats` (previously archive-only) defined; wrong "RPC missing" error code (`42883` vs `PGRST202`) fixed; `team_pokemon_status` lookups now scoped by league. | migration, `match-ko-service.ts` |
| `league-stats-service`: "KOs taken" summed **every KO row in the database**; per-match KOs always showed the season total; scheduled matches counted as draws; `winRate > 1` was reachable; `totalKOsTaken` hardcoded 0; `getAllTeamForms` queried `teams.draft_id` with a league id (always `[]`); multi-league teams crashed `.single()`. All corrected. | `src/lib/league-stats-service.ts` |
| Weekly results: W/L/D derived from scores instead of `winner_team_id` (disagreed with standings on forfeits), camelCase reads off snake_case rows (`winnerTeamId` always null), per-Pokémon tallies ignored `ko_count`, footer mislabeled PF/PA as "K:/D:", missing React key on row fragments. | `src/app/league/[id]/weekly-results/page.tsx` |
| Weekly highlights: draws announced the away team as a "dominant" winner; every Bo1 match flagged as a "shutout"; scoreline shown backwards for away wins. | `src/lib/weekly-highlights-service.ts` |
| Type-coverage table: stored immunity (`0`) was falsy and got overwritten by ×½. Commissioner with no team in a live-scored match can now record the final directly (button used to do nothing). | matchup + score pages |

## 4. Transfers (trades / waivers / free agents)

| Fix | Where |
|---|---|
| **Free-agent claims never dropped the Pokémon or charged budget** (FK-blocked delete + permission-denied budget update, both errors discarded, claim still marked completed). Now one atomic `process_waiver_claim` RPC: verifies team ownership, **drop-pick ownership** (previously unchecked — any pick id passed the budget gate), budget, claim limits, `enableWaivers`, and the first-match lock; swaps roster + budget in one transaction. `waiver_claims.dropped_pick_id` FK → `ON DELETE SET NULL`. Failed claims no longer burn a season claim slot. | `src/lib/waiver-service.ts` + migration |
| **Trade "manual fallback" marked failed trades completed with no roster change** and erased the RPC's ownership validation — deleted; the atomic `execute_trade` RPC is the only path and its errors are surfaced. | `src/lib/trade-service.ts` |
| `respondToTrade` had no status guard — rejected/cancelled trades could be flipped back to accepted and executed. Now only `status='proposed'` can be responded to. Counter-offers set `'countered'` which **violated the DB CHECK constraint** (error discarded, original stayed live alongside the counter) — constraint extended, close-of-original now verified. | `trade-service.ts` + migration |
| `approveTrade` trusted a client-supplied commissioner id and could resurrect dead trades — commissioner identity now verified against league settings, and only `accepted` trades are approvable. | `trade-service.ts` |
| **Any signed-in user could open a trade against two other teams** — `trades` INSERT policy tightened to proposer-owns-a-side (or commissioner). | migration |
| **Trade deadline / trades-disabled existed only as hidden UI** — `execute_trade` now enforces `enableTrades` and `tradeDeadlineWeek` server-side (commissioner may override the deadline). Misleading "Tomorrow (Sunday) - Last day to trade" copy fixed (Sunday is fully locked). | migration, `src/lib/trade-deadline.ts` |

## 5. Sprites & Pokémon selection

| Fix | Where |
|---|---|
| **`toShowdownName` kept hyphens → every hyphenated species 404'd on Showdown sprites** (all Paradox mons, Mr. Mime, Ho-Oh, Tapu-*, Urshifu-Rapid-Strike, Tauros-Paldea forms…). Now applies real Showdown ID rules: species-internal hyphens collapse (`great-tusk`→`greattusk`), forme hyphens keep one dash (`urshifu-rapid-strike`→`urshifu-rapidstrike`). Verified against live sprite URLs; regression-tested. | `src/utils/pokemon.ts` |
| Fallback chains: added the always-available static-PNG rung to `usePokemonImage` and `PokemonDetailsModal` (some mons — Iron Leaves, Ogerpon, Terapagos — 404'd on *both* old rungs and rendered `?` forever); error state now **resets when the component is reused for a different Pokémon**; `PokemonSprite` uses name-keyed fallbacks when callers pass `pokemonId="0"` (team sheets). | `src/hooks/usePokemonImage.ts`, `src/components/ui/pokemon-sprite.tsx`, `PokemonDetailsModal.tsx` |
| **OBS broadcast overlay showed `?` and dex numbers for every pick** (dex-number ids passed where names were required, no name passed down, no fallback rungs) — `pokemon_name` now flows through, real fallback chain added. | `src/app/spectate/[id]/broadcast/page.tsx` |
| OTS match view fallbacks were all dead URLs (numeric PokeAPI path fed a name; `gen5ani` for modern mons; literal `0.gif`) — replaced with working name-keyed fallbacks. | `src/components/tournament/TournamentMatchView.tsx` |
| **Teamsheet paste parser returned `"F"` as the species** for any gendered Pokémon and imported `=== [format] ===` folder headers as a phantom 7th Pokémon — the duplicated parser was deleted; the modal now delegates to the shared (correct) `pokepaste-parser`. | `src/components/tournament/TeamSheetModal.tsx` |
| **PokePaste URL import always failed** (pokepast.es sends no CORS headers; scheme-less URLs fetched as relative paths) — new locked-to-pokepast.es proxy route; browser fetches go through it. | **new** `src/app/api/pokepaste/route.ts`, `src/lib/pokepaste-parser.ts` |

## 6. New files

- `supabase/migrations/20260823120000_league_engine_fixes.sql` — all DB-side fixes (RPCs, policies, constraints; annotated per section).
- `src/app/api/tournament/report/route.ts` — authoritative knockout result reporting.
- `src/app/api/pokepaste/route.ts` — CORS proxy for pokepast.es.
- `tests/league-regression-fixes.test.ts` — round-robin validity (3–8 teams), `toShowdownName` cases, bracket bye seeding, `getTeamColor(-1)`, `parseMatchNotes`.

Updated tests: `tests/trade-service.test.ts`, `tests/league-service.test.ts` (they encoded the old buggy behaviors).

## 7. Known remaining gaps (deliberate)

1. **Score-unit mismatch by design** — the live KO scorer submits KO counts as the match score; the recorder modal submits games-won. Both are valid draft-league conventions, but if the two teams use different tools the match flags as `disputed` for the commissioner. Picking one canonical unit is a product decision.
2. `respondToTrade` counterparty consent is client+RLS only — RLS lets either involved owner flip status, so proposer self-accept is still possible at the DB level.
3. Waivers remain a **pre-season** free-agency window (locked after the first match, FCFS; `waiver_priority` unused).
4. `match_games` table still unused — per-game Bo3/Bo5 winners are collapsed to two integers.
5. No match rescheduling; no bootstrap migration for fresh Supabase projects.
6. Cross-conference matches are exhibition-only (counted in neither conference's standings) — they are now at least reachable and reportable.
