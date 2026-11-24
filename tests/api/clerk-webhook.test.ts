import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** E-05: Clerk-side user deletion must wipe the user's Supabase rows. */

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
const verifyWebhook = vi.fn()
vi.mock('@clerk/nextjs/webhooks', () => ({ verifyWebhook: (req: unknown) => verifyWebhook(req) }))
const deleteUserData = vi.fn()
vi.mock('@/lib/user-data-deletion', () => ({ deleteUserData: (...a: unknown[]) => deleteUserData(...a) }))
const db = {}
vi.mock('@/lib/supabase-server', () => ({ createServiceRoleClient: () => db }))

import { POST } from '@/app/api/webhooks/clerk/route'

const call = () => POST(new NextRequest('http://localhost/api/webhooks/clerk', { method: 'POST', body: '{}' }))

beforeEach(() => {
  verifyWebhook.mockReset()
  deleteUserData.mockReset().mockResolvedValue(undefined)
})

describe('/api/webhooks/clerk', () => {
  it('rejects an unverified payload with 400 and touches nothing', async () => {
    verifyWebhook.mockRejectedValue(new Error('bad sig'))
    expect((await call()).status).toBe(400)
    expect(deleteUserData).not.toHaveBeenCalled()
  })

  it('wipes data for user.deleted', async () => {
    verifyWebhook.mockResolvedValue({ type: 'user.deleted', data: { id: 'user_1', deleted: true } })
    expect((await call()).status).toBe(200)
    expect(deleteUserData).toHaveBeenCalledWith(db, 'user_1')
  })

  it('returns 500 on cleanup failure so Svix retries', async () => {
    verifyWebhook.mockResolvedValue({ type: 'user.deleted', data: { id: 'user_1' } })
    deleteUserData.mockRejectedValue(new Error('teams: boom'))
    expect((await call()).status).toBe(500)
  })

  it('acknowledges other events without cleanup', async () => {
    verifyWebhook.mockResolvedValue({ type: 'user.created', data: { id: 'user_1' } })
    expect((await call()).status).toBe(200)
    expect(deleteUserData).not.toHaveBeenCalled()
  })
})
