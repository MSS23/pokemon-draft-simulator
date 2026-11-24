# AGENTS.md

All agent and contributor guidance for this repository lives in
[CLAUDE.md](CLAUDE.md). Read it first; it applies to every coding agent,
not only Claude Code.

Key points, in case you read nothing else:

- Auth is Clerk with Supabase native third-party auth (`public.clerk_user_id()`), not Supabase Auth.
- The draft engine is server-authoritative. Write picks, auctions and turns only through RPCs (`make_draft_pick`, `resolve_auction`) and server routes; clients cannot insert into `picks`, `teams` or `pokemon_tiers`.
- Schema changes go in `supabase/migrations/` and are applied by hand: [docs/MIGRATIONS.md](docs/MIGRATIONS.md).
