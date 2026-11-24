# Docs

- [MIGRATIONS.md](MIGRATIONS.md) — how migrations are written, applied (by hand) and verified; 2026-11-24 hotfix history
- [REVIEW-2026-10-10.md](REVIEW-2026-10-10.md) — 2026-10-10 review: live findings, changes, suggestions with status
- [CLERK-SUPABASE-SETUP.md](CLERK-SUPABASE-SETUP.md) — Clerk ↔ Supabase auth bridge
- [STAGING_SETUP.md](STAGING_SETUP.md) — staging Supabase/Clerk/Vercel setup
- [changes/](changes/) — dated change logs (2026-08-23 audit, 2026-08-24 market-readiness)
- [archive/](archive/) — superseded July 2026 audits (PRODUCTION-READINESS, GO-LIVE-ACTION-PLAN); kept for history, their action items are done or tracked in the latest review

Schema source of truth: [`../supabase/migrations/`](../supabase/migrations/). Contributor guide: [`../CLAUDE.md`](../CLAUDE.md). Domain terms: [`../GLOSSARY.md`](../GLOSSARY.md). Decisions: [`adr/`](adr/).

Ops scripts (one-off Node scripts such as email broadcasts) belong in `scripts/` as `.mjs`, read secrets only from env vars, and default to a dry run. The Resend broadcast scripts are not merged yet; they are on branch `wip/local-uncommitted`.
