import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

/** POST /api/draft/create validates its body with createDraftRequestSchema. */

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: 'user_host' }),
}))
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hash' } }))
vi.mock('@/lib/server-format-pool', () => ({
  getServerFormatPool: async () => ({ ids: ['25'], entries: [{ id: '25', name: 'pikachu', cost: 5 }] }),
}))

const inserts: Record<string, unknown[]> = {}
vi.mock('@/lib/supabase-server', () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {}
      builder.insert = (row: unknown) => { (inserts[table] ??= []).push(row); return builder }
      builder.select = () => builder
      builder.delete = () => builder
      builder.eq = () => builder
      builder.single = async () => ({ data: { id: `${table}-1` }, error: null })
      builder.then = (resolve: (v: unknown) => void) => resolve({ error: null })
      return builder
    },
  }),
}))

import { POST } from '@/app/api/draft/create/route'

// Exactly what src/app/create-draft/page.tsx sends for a default points draft.
function pagePayload() {
  return {
    name: "Ash's Draft",
    hostName: 'Ash',
    teamName: 'Team Ash',
    settings: {
      maxTeams: 8,
      draftType: 'points',
      timeLimit: 3600,
      pokemonPerTeam: 6,
      budgetPerTeam: 100,
      formatId: 'vgc-reg-h',
      scoringSystem: 'budget',
      tierConfig: undefined,
      createLeague: false,
      splitIntoConferences: false,
      leagueWeeks: null,
    },
    isPublic: true,
    description: null,
    tags: null,
    password: null,
    customFormat: undefined,
  }
}

function create(body: unknown) {
  return POST(new NextRequest('http://localhost/api/draft/create', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
}

describe('/api/draft/create body validation', () => {
  it('accepts the create-draft page payload', async () => {
    const res = await create(pagePayload())
    expect(res.status).toBe(200)
    expect(inserts.drafts?.length).toBeGreaterThan(0)
  })

  it('rejects a fractional timeLimit', async () => {
    const body = pagePayload()
    body.settings.timeLimit = 0.2
    expect((await create(body)).status).toBe(400)
  })

  it('rejects a non-numeric budget', async () => {
    const body = { ...pagePayload(), settings: { ...pagePayload().settings, budgetPerTeam: 'abc' } }
    expect((await create(body)).status).toBe(400)
  })

  it('rejects a password longer than bcrypt hashes', async () => {
    expect((await create({ ...pagePayload(), isPublic: false, password: 'x'.repeat(100) })).status).toBe(400)
  })

  it('rejects an oversized or offensive public name', async () => {
    expect((await create({ ...pagePayload(), name: 'x'.repeat(10_000) })).status).toBe(400)
    expect((await create({ ...pagePayload(), name: "Hitler's Draft" })).status).toBe(400)
  })

  it('rejects more than 10 tags', async () => {
    expect((await create({ ...pagePayload(), tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).status).toBe(400)
  })
})
