import { NextResponse, type NextRequest } from 'next/server'
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { deleteUserData } from '@/lib/user-data-deletion'
import { createLogger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const log = createLogger('api/webhooks/clerk')

/**
 * Clerk (Svix) webhook. On user.deleted, wipe the user's Supabase rows so a
 * deletion made in Clerk does not orphan PII. Signed with CLERK_WEBHOOK_SIGNING_SECRET.
 * Never deletes the Clerk user itself: that already happened upstream.
 */
export async function POST(req: NextRequest) {
  let evt: Awaited<ReturnType<typeof verifyWebhook>>
  try {
    evt = await verifyWebhook(req)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (evt.type === 'user.deleted' && evt.data.id) {
    try {
      // Idempotent, so Svix retries and duplicate deliveries are safe.
      await deleteUserData(createServiceRoleClient(), evt.data.id)
    } catch (err) {
      log.error('user.deleted cleanup failed', { error: err instanceof Error ? err.message : String(err) })
      // 500 makes Svix retry the delivery.
      return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
