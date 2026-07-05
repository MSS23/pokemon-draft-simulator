import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { processDraftTick } from '@/lib/draft-tick'
import { createLogger } from '@/lib/logger'

// Service-role sweep across active drafts. Node-only, never cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const log = createLogger('api/cron/draft-tick')

// Never process an unbounded number of drafts in one invocation.
const MAX_DRAFTS_PER_RUN = 200

/**
 * Vercel Cron backstop that guarantees drafts make progress even when no client
 * is connected to drive the timer. Configured in vercel.json to run every
 * minute. Sweeps every active draft and advances any whose turn / auction has
 * timed out. Idempotent with the client-triggered /api/draft/[id]/tick route.
 *
 * Auth: Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when
 * CRON_SECRET is set in the project env. We reject anything else so the
 * endpoint can't be driven by the public.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    log.error('CRON_SECRET not configured — refusing to run')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = createServiceRoleClient()
    const { data: activeDrafts, error } = await db
      .from('drafts')
      .select('id')
      .eq('status', 'active')
      .limit(MAX_DRAFTS_PER_RUN)

    if (error) {
      log.error('Failed to list active drafts', { error: error.message })
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    const drafts = activeDrafts ?? []
    const results = await Promise.allSettled(
      drafts.map((d) => processDraftTick(d.id))
    )

    const advanced = results.filter(
      (r) => r.status === 'fulfilled' && r.value.action !== 'none' && r.value.action !== 'not_expired' && r.value.action !== 'not_active'
    ).length

    if (drafts.length >= MAX_DRAFTS_PER_RUN) {
      log.info(`Cron hit the ${MAX_DRAFTS_PER_RUN}-draft cap — some active drafts were not swept this run`)
    }

    return NextResponse.json(
      { scanned: drafts.length, advanced, capped: drafts.length >= MAX_DRAFTS_PER_RUN },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    log.error('Cron sweep failed', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}
