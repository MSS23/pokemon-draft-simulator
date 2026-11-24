import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { processDraftTick } from '@/lib/draft-tick'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createLogger } from '@/lib/logger'

// Needs the service-role client (Node-only). Never cache.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const log = createLogger('api/draft/tick')

const GUEST_COOKIE_NAME = 'guest-session-id'

// Basic id shape guard (UUID or short room id are both possible upstream, but
// this route is always called with the internal draft UUID).
function isPlausibleId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && /^[a-zA-Z0-9-]+$/.test(id)
}

function hasCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization')
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/**
 * Client-triggered draft tick. A connected client POSTs here the moment its
 * local countdown hits 0. The work is server-authoritative and idempotent
 * (see processDraftTick / the system_* RPCs), so it is safe for multiple
 * clients to hit simultaneously — the first effective caller advances the
 * draft, the rest no-op. The Vercel cron backstop covers the case where no
 * client is connected.
 *
 * Auth: CRON_SECRET bearer, or a Clerk/guest session with a participants row
 * in this draft (spectators who joined have one too). Anyone else would only
 * burn service-role reads and probe draft state, so they get 401/403.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!isPlausibleId(id)) {
    return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
  }

  try {
    if (!hasCronSecret(request)) {
      const { userId } = await auth()
      const callerId = userId ?? request.cookies.get(GUEST_COOKIE_NAME)?.value
      if (!callerId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { data: participant } = await createServiceRoleClient()
        .from('participants')
        .select('id')
        .eq('draft_id', id)
        .eq('user_id', callerId)
        .limit(1)
        .maybeSingle()
      if (!participant) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const result = await processDraftTick(id)
    // detail can carry raw RPC error text; only the auto-picked species name
    // is meant for the client toast.
    const body = result.action === 'auto_picked'
      ? result
      : { draftId: result.draftId, action: result.action }
    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    log.error('Draft tick failed', { id, error: err instanceof Error ? err.message : String(err) })
    // Non-fatal for the client — the cron backstop will retry.
    return NextResponse.json({ error: 'Tick failed' }, { status: 500 })
  }
}
