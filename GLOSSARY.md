# Glossary

Terms as this codebase uses them.

| Term | Meaning |
|---|---|
| Draft | One drafting session (`drafts` row). Formats: snake, tiered or auction. Status in the DB: `setup`, `active`, `completed`. The client draft state calls the active phase `drafting`. |
| Room code | The 6-character code players share to join a draft. It appears lowercased in `/draft/<code>` URLs. |
| Team | One drafter's roster in a draft (`teams` row), with `budget_remaining` and `draft_order`. |
| Participant | A user (Clerk id or guest id) attached to a draft, optionally to a team. A team can have more than one participant (co-owned team). |
| Pick | One Pokémon taken by a team (`picks` row). Created only by `make_draft_pick` or the `system_*` RPCs. |
| Turn | `drafts.current_turn`, 1-indexed. Snake order reverses each round. |
| Format | A legality and cost rule set (`src/lib/formats.ts`). Default: Pokémon Champions Regulation M-C (`vgc-reg-mc`). |
| Cost | Points a Pokémon costs. For built-in formats the server-authoritative cost is the `pokemon_tiers` row written at draft creation. |
| Tiered draft | Snake draft where each tier has a per-team slot cap (`tierConfig.tiers[].slotsPerTeam`). |
| Auction | Nominate a Pokémon, then live bidding until the timer ends; `resolve_auction` settles it. |
| Wishlist | A participant's private priority queue used for auto-pick when their turn times out. |
| Draft tick | Server progression for absent players (`src/lib/draft-tick.ts`): auto-pick from the wishlist or skip the turn. Triggered by `POST /api/draft/[id]/tick` and the cron backstop. |
| Guest | A user without a Clerk account, identified by the httpOnly `guest-<uuid>` cookie from `/api/guest/session`. |
| JWT bridge | Clerk token (template `supabase-authenticated`) accepted by Supabase third-party auth; Postgres reads it with `public.clerk_user_id()`. Probe: `/api/health/bridge`. |
| League | A season built from a completed draft: schedule, KO-based standings, trades, waivers, playoffs. |
| Commissioner | The league's host/admin. |
