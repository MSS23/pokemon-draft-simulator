# Staging Environment Setup

This runbook walks through the one-time dashboard work needed to wire up
the staging environment. The repo already contains the scaffolding
(`supabase/`, `.github/workflows/migrate.yml`, `Makefile`,
`STAGING_SETUP.md`) — what follows is the manual work you need to do on
the Supabase, Clerk, Vercel, and GitHub dashboards.

Estimated total time: 45–60 minutes.

---

## 1. Create the staging Supabase project

1. Open <https://app.supabase.com> and click **New project**.
2. Name it `pokemon-draft-staging`. Pick the same region as production.
   Generate a strong DB password and **save it** — you will use it as
   `STAGING_DB_PASSWORD` below.
3. Once the project is ready, grab two values from
   **Project Settings → API**:
   - **Project URL** → `STAGING_SUPABASE_URL`
   - **anon public key** → `STAGING_SUPABASE_ANON_KEY`
   - **service_role secret** → `STAGING_SUPABASE_SERVICE_ROLE_KEY`
     (Vercel only — do not put in `.env.local`.)
4. From **Project Settings → General**, copy the **Project Ref**
   (the part of the URL before `.supabase.co`) →
   `STAGING_PROJECT_REF`.
5. Apply the migrations to the new project:

   ```bash
   # one-time login (uses your personal Supabase access token)
   supabase login

   # link + push from your laptop
   export STAGING_PROJECT_REF=...   # from step 4
   export STAGING_DB_PASSWORD=...   # from step 2
   make staging
   ```

   Or trigger the `Migrate` GitHub workflow once secrets are configured
   (step 6 below).
6. Seed the staging DB with fixture data:

   ```bash
   make seed
   ```

---

## 2. Create the Clerk Development instance

1. Open <https://dashboard.clerk.com> and click **Add application**.
2. Name it `pokemon-draft-staging`. Enable the same sign-in methods as
   production (Discord, Google, Twitch).
3. From **API Keys**, copy:
   - **Publishable key** (`pk_test_...`) → `STAGING_CLERK_PK`
   - **Secret key** (`sk_test_...`) → `STAGING_CLERK_SK`
4. Re-create the `supabase` JWT template so Clerk-signed JWTs are
   accepted by the staging Supabase project:
   - Open **JWT Templates → New template → Supabase**.
   - Set **Signing key** to the staging Supabase JWT secret (from
     Supabase **Project Settings → API → JWT Settings → JWT Secret**).
   - Set the template name to `supabase` (must match the prod template
     name — the app code reads `clerk.session.getToken({ template: 'supabase' })`).
   - Save.
5. Add authorized parties so Clerk accepts requests from your dev hosts:
   - Open **Domains → Authorized parties**.
   - Add `http://localhost:3000`, `https://*.vercel.app`, and (when DNS
     is set up) `https://staging.draftpokemon.com`.

---

## 3. Configure Vercel Preview env vars

Use the Vercel CLI (`npm i -g vercel`) once you have run `vercel link`
inside the repo.

For each variable below, set the **Preview** scope only — Production
must keep using its existing values.

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL preview
# paste STAGING_SUPABASE_URL when prompted

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
# paste STAGING_SUPABASE_ANON_KEY

vercel env add SUPABASE_SERVICE_ROLE_KEY preview
# paste STAGING_SUPABASE_SERVICE_ROLE_KEY  (server-only)

vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY preview
# paste STAGING_CLERK_PK

vercel env add CLERK_SECRET_KEY preview
# paste STAGING_CLERK_SK
```

Verify with:

```bash
vercel env ls
```

You can do the same thing in the Vercel dashboard under
**Settings → Environment Variables** — set each var, check **Preview**,
uncheck Production and Development.

---

## 4. Add GitHub repo secrets for `migrate.yml`

The `.github/workflows/migrate.yml` workflow needs these secrets to
run. Use `gh secret set` or the GitHub UI (**Settings → Secrets and
variables → Actions → New repository secret**).

```bash
gh secret set SUPABASE_ACCESS_TOKEN   # personal token from supabase.com/dashboard/account/tokens
gh secret set STAGING_PROJECT_REF     # from §1.4
gh secret set STAGING_DB_PASSWORD     # from §1.2
gh secret set PROD_PROJECT_REF        # production ref (existing project)
gh secret set PROD_DB_PASSWORD        # production DB password
```

Optional repo *variable* (not a secret — used by `.github/workflows/ci.yml`):

```bash
gh variable set VERCEL_PREVIEW_URL --body "https://your-preview.vercel.app"
```

Leaving `VERCEL_PREVIEW_URL` empty is fine — Playwright will fall back
to building and serving the app locally on the runner.

---

## 5. Configure the `production` GitHub Environment

The production half of `migrate.yml` is gated by a GitHub Environment
that requires manual approval.

1. Open **Settings → Environments → New environment**.
2. Name it `production` (must match `environment: production` in
   `migrate.yml`).
3. Tick **Required reviewers** → add yourself.
4. Optionally tick **Wait timer** (e.g. 5 minutes) so accidental
   approvals can still be cancelled.
5. (Optional) Repeat for a `staging` environment with no reviewers —
   useful if you later want to add a Slack notification step.

---

## 6. Custom domain for staging (optional)

If you want a stable `staging.draftpokemon.com` URL instead of a fresh
preview URL per commit:

1. In Vercel, **Settings → Domains → Add** → `staging.draftpokemon.com`.
2. Assign it to the `main` branch *or* leave it floating to assign to
   any branch you like.
3. Add the DNS CNAME record (`cname.vercel-dns.com`) at your registrar.
4. Add `https://staging.draftpokemon.com` to Clerk **Authorized
   parties** (§2.5).

---

## 7. Local dev pointed at staging

To run the app locally against staging Supabase + Clerk (to repro a bug
seen on a Vercel preview):

1. Copy `.env.example` to `.env.local`.
2. Fill in the *staging* values for:
   - `NEXT_PUBLIC_SUPABASE_URL` ← `STAGING_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← `STAGING_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` ← `STAGING_CLERK_PK`
   - `CLERK_SECRET_KEY` ← `STAGING_CLERK_SK`
3. In Clerk, **Domains → Authorized domains** → add
   `http://localhost:3000` so Clerk's dev instance accepts the local
   origin.
4. `npm run dev` and visit <http://localhost:3000>. You are now talking
   to staging.

When you are done, restore the prod-or-dev values in `.env.local` — or
keep two files (`.env.local`, `.env.local.staging`) and swap them with
a tiny shell helper. **Do not commit either.**

---

## Verifying it works

After all of the above:

- [ ] `make staging` → applies migrations to staging without errors.
- [ ] `make seed` → resets + reseeds; you see the two fixture drafts in
      the staging Supabase Studio.
- [ ] Push a commit that touches `supabase/migrations/**` → the
      `Migrate / staging` workflow run goes green.
- [ ] Manually dispatch `Migrate / production` → workflow blocks on
      approval.
- [ ] Open the latest Vercel preview, sign in → no CSP/JWT errors and
      Clerk session works.
- [ ] `make schema-diff` from a clean checkout → reports `clean`.

---

## Things to know

- The staging Supabase project does **not** need to be on the Pro tier
  for basic e2e work — Free tier is fine. Upgrade only if you need
  point-in-time recovery or longer log retention.
- The `production` GitHub Environment also gates anything else you
  later add with `environment: production` in `.github/workflows/`.
- The `Schema Drift Check` workflow (`.github/workflows/schema-drift.yml`)
  runs daily at 11:00 UTC and opens a GitHub issue if PROD diverges
  from `main`. Re-run it manually after applying any out-of-band SQL.
