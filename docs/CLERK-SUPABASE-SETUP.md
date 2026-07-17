# Clerk → Supabase authentication — production checklist

This one-time configuration lets Supabase validate Clerk session tokens so
PostgREST, Realtime, and Postgres RLS can identify signed-in users through
`auth.jwt() ->> 'sub'` and `public.clerk_user_id()`.

The legacy Clerk `supabase` JWT template was deprecated in April 2025. Do not
create or request that template. A missing template returns 404 and can create
a retry storm on every Supabase request.

## 1. Activate Clerk's Supabase integration

1. Open the Clerk dashboard for the production Clerk instance.
2. Open the Supabase integration setup and select **Activate Supabase integration**.
3. Copy the Clerk instance domain shown by Clerk.

Activation adds the `role: authenticated` claim to normal Clerk session
tokens. The application retrieves this token with `getToken()` and never
shares the Supabase JWT secret with Clerk.

## 2. Register Clerk in Supabase

1. Open the production Supabase dashboard.
2. Go to **Authentication → Sign In / Providers**.
3. Add **Clerk** as a third-party provider.
4. Paste the Clerk instance domain copied in step 1 and save.

Both dashboards must point at the same production Clerk instance used by
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

## 3. Verify the deployed client code

- `src/lib/supabase.ts` passes `window.Clerk.session.getToken()` through the
  Supabase client's `accessToken` callback.
- `src/lib/supabase-server.ts` uses `(await auth()).getToken()` for server-side
  Clerk-authenticated requests.
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
| Clerk `/tokens/supabase` returns 404 | Deployed code still requests the deprecated template | Deploy code that calls `getToken()` with no template |
| Supabase returns 401/403 for signed-in users | Clerk is not registered as a Supabase third-party provider | Repeat steps 1 and 2 for the production instances |
| `whoami()` returns null | Supabase received no valid Clerk session token | Check `/api/health/bridge`, environment keys, and provider domain |
| Server route writes fail | Route uses an anonymous/browser client | Use `createClerkSupabaseClientServer()` or an authenticated service-role workflow |
| Guest writes fail | The flow bypasses the server-authoritative guest endpoint/RPC | Route the action through its cookie-authenticated server endpoint |

Do not log bearer tokens or expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.
