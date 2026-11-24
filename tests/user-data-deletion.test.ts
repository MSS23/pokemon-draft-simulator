import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { deleteUserData } from '@/lib/user-data-deletion'

const stub = (result: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(result)
  return { db: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe('deleteUserData', () => {
  it('runs the whole wipe as one delete_user_data RPC and returns its counts', async () => {
    const { db, rpc } = stub({ data: { teams: 2, participants: 3 }, error: null })
    await expect(deleteUserData(db, 'user_1')).resolves.toEqual({ teams: 2, participants: 3 })
    expect(rpc).toHaveBeenCalledWith('delete_user_data', { p_user_id: 'user_1' })
  })

  it('throws when the RPC fails (the transaction rolled back, so a retry is safe)', async () => {
    const { db } = stub({ data: null, error: { message: 'boom' } })
    await expect(deleteUserData(db, 'user_1')).rejects.toThrow('delete_user_data: boom')
  })
})
