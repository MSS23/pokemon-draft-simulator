import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createLogger } from '@/lib/logger'
import { z } from 'zod'
import { auth } from '@clerk/nextjs/server'

const log = createLogger('PushSubscribeAPI')

const GUEST_COOKIE_NAME = 'guest-session-id'

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  // user_id is now optional. For Clerk users we always derive it server-side
  // from the session. For guests we derive it from the httpOnly cookie. The
  // body field, if present, is ignored — kept for backwards compatibility.
  user_id: z.string().min(1).optional(),
  platform: z.string().default('web'),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

// Service-role client. push_subscriptions has self-only RLS that requires
// clerk_user_id() = user_id. Guest users (cookie-derived id) cannot pass
// that check from the anon client, and we already validate identity here
// server-side, so we bypass RLS deliberately.
//
// NOTE: push_subscriptions is created by a pending migration and is not
// yet present in the generated Database<> type — cast to any so we can
// query it. Once the type generator is re-run we can drop the cast.
function getSupabase() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createServiceRoleClient() as any
  } catch {
    return null
  }
}

/**
 * POST /api/push/subscribe
 * Store or update a push subscription.
 */
export async function POST(request: Request) {
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { endpoint, p256dh, auth: authToken, platform } = parsed.data

  // SEC-AUDIT (vibe-security): always derive user_id server-side, never
  // trust the body field. For Clerk users → session identity. For guests
  // → httpOnly cookie identity (same one /api/guest/session sets). Without
  // either, refuse the request.
  const { userId: clerkUserId } = await auth()
  let resolvedUserId: string | null = clerkUserId ?? null
  if (!resolvedUserId) {
    const cookieStore = await cookies()
    const guestCookie = cookieStore.get(GUEST_COOKIE_NAME)
    if (guestCookie?.value) {
      resolvedUserId = guestCookie.value
    }
  }
  if (!resolvedUserId) {
    return NextResponse.json(
      { error: 'No session identity — sign in or call /api/guest/session first.' },
      { status: 401 }
    )
  }

  try {
    // Upsert by endpoint (unique constraint) so re-subscribing updates the record
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          endpoint,
          p256dh,
          auth: authToken,
          user_id: resolvedUserId,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      log.error('Failed to store push subscription', { error: error.message, user_id: resolvedUserId })
      return NextResponse.json({ error: 'Failed to store subscription' }, { status: 500 })
    }

    log.info('Push subscription stored', { user_id: resolvedUserId, platform })
    return NextResponse.json({ success: true })
  } catch (err) {
    log.error('Unexpected error storing push subscription', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/push/subscribe
 * Remove a push subscription by endpoint.
 */
export async function DELETE(request: Request) {
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = unsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { endpoint } = parsed.data

  // SEC-AUDIT: ownership check. Without this, anyone who learns another
  // user's endpoint URL could delete their subscription. We require either
  // a Clerk session OR the guest cookie that originally created the
  // subscription, and we filter the DELETE by `user_id` so a stolen
  // endpoint can only be deleted by its owner.
  const { userId: clerkUserId } = await auth()
  let resolvedUserId: string | null = clerkUserId ?? null
  if (!resolvedUserId) {
    const cookieStore = await cookies()
    const guestCookie = cookieStore.get(GUEST_COOKIE_NAME)
    if (guestCookie?.value) {
      resolvedUserId = guestCookie.value
    }
  }
  if (!resolvedUserId) {
    return NextResponse.json(
      { error: 'No session identity — sign in or call /api/guest/session first.' },
      { status: 401 }
    )
  }

  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', resolvedUserId)

    if (error) {
      log.error('Failed to remove push subscription', { error: error.message })
      return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 })
    }

    log.info('Push subscription removed', { endpoint, user_id: resolvedUserId })
    return NextResponse.json({ success: true })
  } catch (err) {
    log.error('Unexpected error removing push subscription', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
