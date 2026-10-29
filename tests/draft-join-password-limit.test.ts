import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * /api/draft/join must give wrong draft passwords the same 5/min budget that
 * /api/draft/verify-password has, instead of the 30/min join bucket.
 */

let currentUser = 'user_a'
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: currentUser }),
}))
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('bcryptjs', () => ({
  default: { compare: async (plain: string) => plain === 'right-password' },
}))

const rows: Record<string, unknown> = {
  drafts: { id: 'draft-1', has_password: true, settings: {} },
  draft_passwords: { password: 'hash' },
  user_profiles: null,
}
vi.mock('@/lib/supabase-server', () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.ilike = () => builder
      builder.maybeSingle = async () => ({ data: rows[table] ?? null, error: null })
      return builder
    },
    rpc: async () => ({ data: { success: true, teamId: 'team-1' }, error: null }),
  }),
}))

import { POST } from '@/app/api/draft/join/route'

function join(password: string) {
  return POST(new NextRequest('http://localhost/api/draft/join', {
    method: 'POST',
    body: JSON.stringify({ roomCode: 'abc123', teamName: 'Team Rocket', password }),
  }))
}

describe('/api/draft/join password attempts', () => {
  beforeEach(() => {
    currentUser = `user_${Math.random().toString(36).slice(2)}`
  })

  it('joins with the right password', async () => {
    const res = await join('right-password')
    expect(res.status).toBe(200)
  })

  it('blocks the caller after 5 wrong passwords, even with the right one', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await join('wrong')).status).toBe(401)
    }
    expect((await join('wrong')).status).toBe(429)
    expect((await join('right-password')).status).toBe(429)
  })

  it('does not count successful joins toward the limit', async () => {
    for (let i = 0; i < 6; i += 1) {
      expect((await join('right-password')).status).toBe(200)
    }
  })

  it('keeps separate budgets per user', async () => {
    for (let i = 0; i < 5; i += 1) await join('wrong')
    currentUser = 'someone_else'
    expect((await join('right-password')).status).toBe(200)
  })
})
