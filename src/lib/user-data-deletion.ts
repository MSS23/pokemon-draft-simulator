import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

/**
 * Wipe or anonymise every Supabase row tied to a Clerk user, in one
 * transaction (service-role delete_user_data RPC, migration 048). Teams,
 * bids and hosted drafts are kept for other players' history but anonymised;
 * renamed teams get an id suffix so two deleted owners in one draft do not
 * collide on the per-draft unique team name. Idempotent, so callers can retry.
 * Returns per-table row counts.
 */
export async function deleteUserData(db: SupabaseClient<Database>, userId: string): Promise<Record<string, number>> {
  const { data, error } = await db.rpc('delete_user_data', { p_user_id: userId })
  if (error) throw new Error(`delete_user_data: ${error.message}`)
  return data ?? {}
}
