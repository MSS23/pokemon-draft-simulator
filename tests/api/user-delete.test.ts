import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const deleteUser = vi.fn()
let userId: string | null = 'user_1'
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId }),
  clerkClient: async () => ({ users: { deleteUser } }),
}))

const rpc = vi.fn()
const db = { rpc }
vi.mock('@/lib/supabase-server', () => ({ createServiceRoleClient: () => db }))

import { DELETE } from '@/app/api/user/delete/route'

beforeEach(() => {
  userId = 'user_1'
  deleteUser.mockReset().mockResolvedValue({})
  rpc.mockReset().mockResolvedValue({ data: { participants: 2 }, error: null })
})

describe('DELETE /api/user/delete', () => {
  it('401 when signed out', async () => {
    userId = null
    expect((await DELETE()).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('wipes/anonymises in one delete_user_data RPC, then deletes the Clerk user', async () => {
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('delete_user_data', { p_user_id: 'user_1' })
    expect(deleteUser).toHaveBeenCalledWith('user_1')
  })

  it('500 and keeps the Clerk user when the RPC resolves {error}', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await DELETE()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to delete account' })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('500 when Clerk deleteUser throws', async () => {
    deleteUser.mockRejectedValue(Object.assign(new Error('revoked key'), { status: 401 }))
    expect((await DELETE()).status).toBe(500)
  })

  it('200 when Clerk reports the user already gone (404 on retry)', async () => {
    deleteUser.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))
    expect((await DELETE()).status).toBe(200)
  })
})
