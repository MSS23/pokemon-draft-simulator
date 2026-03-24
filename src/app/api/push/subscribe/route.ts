import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'
import { z } from 'zod'

const log = createLogger('PushSubscribeAPI')

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  user_id: z.string().min(1),
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

  const { endpoint, p256dh, auth, user_id, platform } = parsed.data

  try {
    // Upsert by endpoint (unique constraint) so re-subscribing updates the record
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
          user_id,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      log.error('Failed to store push subscription', { error: error.message, user_id })
      return NextResponse.json({ error: 'Failed to store subscription' }, { status: 500 })
    }

    log.info('Push subscription stored', { user_id, platform })
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
