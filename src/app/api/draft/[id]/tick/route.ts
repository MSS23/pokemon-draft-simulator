import { NextRequest, NextResponse } from 'next/server'
import { processDraftTick } from '@/lib/draft-tick'
import { createLogger } from '@/lib/logger'

// Needs the service-role client (Node-only). Never cache.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const log = createLogger('api/draft/tick')

// Basic id shape guard (UUID or short room id are both possible upstream, but
// this route is always called with the internal draft UUID).
function isPlausibleId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && /^[a-zA-Z0-9-]+$/.test(id)
}

/**
 * Client-triggered draft tick. A connected client POSTs here the moment its
 * local countdown hits 0. The work is server-authoritative and idempotent
 * (see processDraftTick / the system_* RPCs), so it is safe to be unauthenticated
 * and safe for multiple clients to hit simultaneously — the first effective
 * caller advances the draft, the rest no-op. The Vercel cron backstop covers
 * the case where no client is connected.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!isPlausibleId(id)) {
    return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
  }

  try {
    const result = await processDraftTick(id)
    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    log.error('Draft tick failed', { id, error: err instanceof Error ? err.message : String(err) })
    // Non-fatal for the client — the cron backstop will retry.
    return NextResponse.json({ error: 'Tick failed' }, { status: 500 })
  }
}
