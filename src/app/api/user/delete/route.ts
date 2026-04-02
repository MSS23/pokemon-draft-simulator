import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'

const log = createLogger('UserDeleteAPI')

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  // Use service role key if available for admin-level data cleanup, otherwise anon key
  const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

  try {
    // Anonymize teams owned by this user (don't delete - preserves draft history)
    await supabase
      .from('teams')
      .update({ owner_id: 'deleted-user', name: 'Deleted User' })
      .eq('owner_id', userId)

    // Delete user-specific data (use allSettled so one failure doesn't block others)
    const results = await Promise.allSettled([
      supabase.from('user_profiles').delete().eq('user_id', userId),
      supabase.from('participants').delete().eq('user_id', userId),
      supabase.from('wishlist_items').delete().eq('participant_id', userId),
    ])
    const failures = results.filter(r => r.status === 'rejected')
    if (failures.length > 0) {
      log.warn('Some user data deletions failed', { userId, failureCount: failures.length })
    }

    // Delete Clerk user account
    try {
      const clerk = await clerkClient()
      await clerk.users.deleteUser(userId)
    } catch (deleteError) {
      log.error('Failed to delete Clerk user:', deleteError)
      // Continue anyway - data is already cleaned up
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    log.error('Account deletion error:', err)
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
