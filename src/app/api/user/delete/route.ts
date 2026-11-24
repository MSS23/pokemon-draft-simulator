import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createLogger } from '@/lib/logger'
import { deleteUserData } from '@/lib/user-data-deletion'

const log = createLogger('UserDeleteAPI')

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // SEC-AUDIT: account deletion must never fall back to the anon key.
  // Anon-key writes are gated by RLS and would silently leave orphan rows
  // (participants, wishlist_items) in violation of the user's deletion
  // request. Refuse loudly instead of doing a partial wipe.
  let db: ReturnType<typeof createServiceRoleClient>
  try {
    db = createServiceRoleClient()
  } catch {
    log.error('Account deletion requires SUPABASE_SERVICE_ROLE_KEY')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  // One transaction (delete_user_data RPC), idempotent, so a user who gets a
  // 500 can simply retry.
  try {
    await deleteUserData(db, userId)
  } catch (err) {
    log.error('Account deletion failed during data cleanup', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }

  // Clerk last: if it fails the session still exists and the user can retry.
  try {
    const clerk = await clerkClient()
    await clerk.users.deleteUser(userId)
  } catch (err) {
    // 404 = already deleted by an earlier attempt.
    if ((err as { status?: number } | null)?.status !== 404) {
      log.error('Failed to delete Clerk user', { error: err instanceof Error ? err.message : String(err) })
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
