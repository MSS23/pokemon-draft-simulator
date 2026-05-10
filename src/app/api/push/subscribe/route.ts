import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
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

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null
  return createClient(supabaseUrl, supabaseAnonKey)
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

  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)

    if (error) {
      log.error('Failed to remove push subscription', { error: error.message })
      return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 })
    }

    log.info('Push subscription removed', { endpoint })
    return NextResponse.json({ success: true })
  } catch (err) {
    log.error('Unexpected error removing push subscription', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
