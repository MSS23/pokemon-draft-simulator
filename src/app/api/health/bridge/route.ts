import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClerkSupabaseClientServer } from '@/lib/supabase-server'
import { createLogger } from '@/lib/logger'

// Needs the Clerk-authenticated server Supabase client. Node-only, never cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const log = createLogger('api/health/bridge')

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
