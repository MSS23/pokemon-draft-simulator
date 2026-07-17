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
    const { count: totalActive, error: countError } = await db
      .from('drafts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')

    if (countError) {
      log.error('Failed to count active drafts', { error: countError.message })
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    const total = totalActive ?? 0
    const pageCount = Math.max(1, Math.ceil(total / MAX_DRAFTS_PER_RUN))
    const page = Math.floor(Date.now() / 60_000) % pageCount
    const rangeStart = page * MAX_DRAFTS_PER_RUN
    const { data: activeDrafts, error } = await db
      .from('drafts')
      .select('id')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(rangeStart, rangeStart + MAX_DRAFTS_PER_RUN - 1)

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

    if (pageCount > 1) {
      log.info(`Cron swept active-draft page ${page + 1}/${pageCount}`)
    }

    return NextResponse.json(
      { scanned: drafts.length, advanced, totalActive: total, page: page + 1, pageCount },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    log.error('Cron sweep failed', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}
