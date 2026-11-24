# Clerk → Supabase authentication — production checklist

This one-time configuration lets Supabase validate Clerk session tokens so
PostgREST, Realtime, and Postgres RLS can identify signed-in users through
`auth.jwt() ->> 'sub'` and `public.clerk_user_id()`.

The legacy Clerk `supabase` JWT template (signed with the Supabase JWT secret)
was deprecated in April 2025. Do not create or request *that* template.

## 1. Give the Clerk token a `role: authenticated` claim

PostgREST only assumes the `authenticated` Postgres role (and every grant/RLS
policy built on it) when the Clerk token carries `role: authenticated`. The
plain session token does not. The app therefore requests a plain Clerk JWT
template named `supabase-authenticated` (see
`src/lib/clerk-supabase-template.ts`) whose only custom claim is
`{"role": "authenticated"}`. It is signed with Clerk's normal key, so Supabase's
Clerk third-party provider accepts it unchanged. It must exist on **every**
Clerk instance the app runs against (dev and prod); create it with:

```
clerk api /jwt_templates --app <app id> --instance prod -X POST   -d '{"name":"supabase-authenticated","claims":{"role":"authenticated"},"lifetime":60,"allowed_clock_skew":5}'
```

Alternatively, activating Clerk's Supabase integration
(dashboard.clerk.com/setup/supabase, with the **Production** instance selected)
adds the same claim to the plain session token; the template is then redundant
but harmless. The code still requests the template, so keep it either way.

Finally, copy the instance's **Frontend API URL** from the Clerk dashboard
(**API Keys**, or the domain shown by the Supabase integration page). Step 2
needs it.

## 2. Register Clerk in Supabase

1. Open the production Supabase dashboard.
2. Go to **Authentication → Sign In / Providers**.
3. Add **Clerk** as a third-party provider.
4. Paste the Clerk instance domain copied in step 1 and save.

Both dashboards must point at the same production Clerk instance used by
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

## 3. Verify the deployed client code

- `src/lib/supabase.ts` passes
  `window.Clerk.session.getToken({ template: CLERK_SUPABASE_JWT_TEMPLATE })`
  through the Supabase client's `accessToken` callback.
- `src/lib/supabase-server.ts` uses
  `(await auth()).getToken({ template: CLERK_SUPABASE_JWT_TEMPLATE })` for
  server-side Clerk-authenticated requests.
- `CLERK_SUPABASE_JWT_TEMPLATE` is `'supabase-authenticated'`
  (`src/lib/clerk-supabase-template.ts`). Dropping the template argument is
  safe only on an instance where the Clerk Supabase integration is active;
  otherwise the token lacks `role: authenticated` and PostgREST treats the
  user as `anon`.
- Trusted server workflows use `createServiceRoleClient()` only after Clerk
  authentication and authorization have already succeeded.

Never import the browser Supabase singleton into a route handler that needs
the calling user's identity.

## 4. Apply and verify database identity helpers

Apply the repository's Supabase migrations in timestamp order. They create
`public.clerk_user_id()` and the `public.whoami()` health probe, then bind RLS
policies and write RPCs to the Clerk `sub`.

While signed in to production, request:

```text
GET /api/health/bridge
```

The expected response is:

```json
{ "bridge": "up" }
```

A signed-in `bridge: down` response is a production incident: confirm the
Clerk integration is active, the Clerk domain is registered in Supabase, and
the deployment uses the matching production Clerk keys.

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Clerk `/tokens/supabase` returns 404 | Deployed code still requests the deprecated `supabase` template | Deploy current code, which requests `supabase-authenticated` |
| Clerk `/tokens/supabase-authenticated` returns 404 | The template is missing on this Clerk instance | Create it (section 1). Only if the Clerk Supabase integration is active on that instance may the code call `getToken()` with no template instead |
| Supabase returns 401/403 for signed-in users | Clerk is not registered as a Supabase third-party provider | Repeat steps 1 and 2 for the production instances |
| `whoami()` returns null | Supabase received no valid Clerk session token | Check `/api/health/bridge`, environment keys, and provider domain |
| Server route writes fail | Route uses an anonymous/browser client | Use `createClerkSupabaseClientServer()` or an authenticated service-role workflow |
| Guest writes fail | The flow bypasses the server-authoritative guest endpoint/RPC | Route the action through its cookie-authenticated server endpoint |

Do not log bearer tokens or expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.

## Account-deletion webhook (`/api/webhooks/clerk`)

Users deleted in the Clerk dashboard (not through `/api/user/delete`) are
wiped by `POST /api/webhooks/clerk`, which runs the same `delete_user_data`
RPC. Clerk only delivers once both of these exist:

1. Vercel env: `CLERK_WEBHOOK_SIGNING_SECRET` (the endpoint's signing secret).
   `verifyWebhook()` reads exactly this name; `CLERK_WEBHOOK_SECRET` is ignored.
2. Clerk dashboard > Webhooks: an endpoint for
   `https://<prod-domain>/api/webhooks/clerk` subscribed to `user.deleted`.

Middleware needs no change: `/api/webhooks` is not auth-gated and falls under
the default 100/min API rate limit. A bad signature returns 400; a missing
service-role key returns 503 so Clerk retries.
