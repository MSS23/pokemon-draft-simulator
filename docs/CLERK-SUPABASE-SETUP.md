# Clerk → Supabase JWT bridge — setup checklist

This is a one-time configuration that lets PostgREST identify your
Clerk-authenticated users via Postgres RLS. After completing every step,
`auth.jwt() ->> 'sub'` (and the `public.clerk_user_id()` helper) will
return the Clerk user id for every signed-in request.

**Do these in order.** Steps 1 + 2 must be live before you run the SQL
migration in step 3, otherwise you'll lock yourself out.

---

## 1. Configure the JWT template in Clerk

1. Open the Clerk dashboard for this project.
2. Go to **Configure → JWT Templates → New template**.
3. Pick the official **Supabase** template (Clerk has a preset). If the
   preset isn't visible, create a **Blank** template and use these
   values manually:
   - **Name**: `supabase` (must be exactly this — the app code reads
     `getToken({ template: 'supabase' })`)
   - **Signing algorithm**: `HS256`
   - **Signing key**: paste your **Supabase JWT secret** from Supabase
     dashboard → **Project Settings → API → JWT Settings → JWT Secret**
   - **Token lifetime**: 60 seconds is fine (Clerk auto-refreshes; the
     app calls `getToken()` per request anyway)
   - **Claims**: leave the defaults. The Clerk user id ends up in `sub`,
     which is what RLS reads.
4. **Save**.

## 2. Verify the app code is deployed

These two changes ship in this PR — confirm they're in the running build:

- `src/lib/supabase.ts` — the browser singleton now passes an
  `accessToken: getClerkSupabaseToken` callback to `createClient(...)`.
  That callback reads `window.Clerk.session.getToken({ template: 'supabase' })`
  on every request.
- `src/lib/supabase-server.ts` — new file. Exports
  `createClerkSupabaseClientServer()` for use inside Next.js route
  handlers and server actions, plus `createServiceRoleClient()` for
  privileged server work.

> If your route handlers currently `import { supabase } from '@/lib/supabase'`,
> they're using the **browser** client and will hit Supabase as anon
> from the server. Refactor those to use the new
> `createClerkSupabaseClientServer()` helper for proper auth.

## 3. Smoke-test that JWTs are reaching Supabase

In the browser console of any signed-in page:

```js
const { data, error } = await window.supabase
  .rpc('clerk_user_id')   // helper added by the migration
// or before the migration:
const { data: row } = await window.supabase
  .from('user_profiles').select('*').limit(1)
```

You can also temporarily add a debug component:

```tsx
const { data } = await supabase
  .from('drafts')                       // any table you have read access to
  .select('id')
  .limit(1)
console.log('JWT-aware request worked', data)
```

In the Supabase dashboard → **Logs → Postgres**, run:

```sql
select current_setting('request.jwt.claims', true)::json ->> 'sub'
```

— this should return your Clerk user id when called from a
signed-in browser session.

## 4. Apply the SQL migration

Once steps 1–3 are confirmed working:

```sql
-- in Supabase SQL editor
\i migrations/fix-supabase-linter-warnings-clerk-final.sql
```

(Or paste the file's contents directly.)

The migration:

- Adds the `public.clerk_user_id()` helper.
- Replaces every permissive `*_insert` policy with
  `WITH CHECK (clerk_user_id() IS NOT NULL)`.
- Tightens `push_subscriptions` to self-only access by Clerk user id.

## 5. After applying — what to watch for

| Symptom | Cause | Fix |
|---|---|---|
| All writes return 403 | JWT template not deployed yet | Re-check step 1; verify in browser DevTools that requests carry `Authorization: Bearer eyJ…` headers |
| Guest writes fail (e.g. creating a draft as a guest) | Direct INSERT bypassing the SECURITY DEFINER RPC | Migrate the affected flow to use the RPC, OR drop the policy for that specific table |
| Server route writes fail | Server code still uses the browser singleton | Switch to `createClerkSupabaseClientServer()` |
| `auth.jwt()` returns null inside a function called by an RPC | The RPC is `SECURITY DEFINER` — it loses caller context | Pass the Clerk user id as a parameter instead of reading it from JWT |

## 6. Optional follow-up — defence-in-depth in RPCs

The `*_security_definer_function_executable` lint warnings on app-facing
RPCs (`make_draft_pick`, `place_bid`, etc.) are structural and remain. To
make them safer without changing behaviour, add this guard at the top of
each RPC body:

```sql
IF public.clerk_user_id() IS NULL THEN
  RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
END IF;
```

This prevents anonymous callers (who'd otherwise pass an arbitrary
`p_user_id` through PostgREST) from invoking the function at all.
Guest mode breaks at this point — only do this once guests have
been migrated to authenticated accounts.
