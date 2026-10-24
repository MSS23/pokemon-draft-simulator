import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClerkSupabaseClientServer } from '@/lib/supabase-server'
import { createLogger } from '@/lib/logger'
import { CLERK_SUPABASE_JWT_TEMPLATE } from '@/lib/clerk-supabase-template'

// Needs the Clerk-authenticated server Supabase client. Node-only, never cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const log = createLogger('api/health/bridge')

function decodeRole(jwt: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as { role?: string }
    return payload.role ?? null
  } catch {
    return null
  }
}

/**
 * Clerk -> Supabase JWT bridge probe (TIER-0).
 *
 * The whole write-authorization model depends on `clerk_user_id()` resolving
 * the caller's Clerk `sub` inside Postgres. This route lets a signed-in client
 * (or an authenticated uptime check) verify the bridge is actually live: it
 * calls the whoami() RPC and asserts it equals the Clerk userId.
 *
 *   - 200 { bridge: 'up' }        — signed in AND whoami() === Clerk userId
 *   - 200 { bridge: 'down', ... } — signed in but whoami() is null/mismatched
 *                                    (Clerk third-party auth is not configured)
 *   - 401                         — not signed in (cannot probe)
 *
 * A `down` result while signed in is a P0 alert: writes are silently running in
 * a degraded auth state. We log at error level so Sentry captures it.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json(
      { bridge: 'unknown', reason: 'Not authenticated — sign in to probe the bridge' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  try {
    // Postgres grants (make_draft_pick, UPDATE drafts, ...) are issued to the
    // `authenticated` role. PostgREST only assumes that role when the Clerk
    // token carries `role: authenticated`, which the JWT template adds.
    // Without it every signed-in request silently runs as `anon`, so whoami()
    // can succeed while every write fails with 42501.
    const token = await (await auth()).getToken({ template: CLERK_SUPABASE_JWT_TEMPLATE })
    const role = token ? decodeRole(token) : null
    if (role !== 'authenticated') {
      log.error('JWT bridge DOWN: session token has no role=authenticated claim', { role })
      return NextResponse.json(
        { bridge: 'down', reason: `token missing role=authenticated — JWT template "${CLERK_SUPABASE_JWT_TEMPLATE}" missing on this Clerk instance?` },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const db = await createClerkSupabaseClientServer()
    const { data: resolved, error } = await db.rpc('whoami')

    if (error) {
      log.error('whoami RPC failed during bridge probe', { error: error.message })
      return NextResponse.json(
        { bridge: 'down', reason: 'whoami RPC error' },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (resolved === userId) {
      return NextResponse.json(
        { bridge: 'up' },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // Signed in, but Postgres does not see our identity — the bridge is broken.
    log.error('JWT bridge DOWN: whoami() did not match Clerk userId', {
      clerkUserId: userId,
      resolved: resolved ?? null,
    })
    return NextResponse.json(
      { bridge: 'down', reason: resolved ? 'identity mismatch' : 'clerk_user_id() is null' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    log.error('Bridge probe threw', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json(
      { bridge: 'down', reason: 'probe exception' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
