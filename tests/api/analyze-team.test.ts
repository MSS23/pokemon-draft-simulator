import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** POST /api/ai/analyze-team: the team must belong to the caller's league. */

let currentUser: string | null = 'user_a'
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: currentUser }),
}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('@/lib/league-stats-service', () => ({
  LeagueStatsService: { getAdvancedTeamStats: async () => null },
}))
vi.mock('@/lib/ai-analysis-service', () => ({
  AIAnalysisService: { analyzeTeam: (teamId: string) => ({ teamId, ok: true }) },
}))

const LEAGUE_A = '11111111-1111-4111-8111-111111111111'
const TEAM_A = '22222222-2222-4222-8222-222222222222'
const TEAM_B = '33333333-3333-4333-8333-333333333333'
const teams: Record<string, { draft_id: string; owner_id: string }> = {
  [TEAM_A]: { draft_id: 'draft-a', owner_id: 'user_a' },
  [TEAM_B]: { draft_id: 'draft-b', owner_id: 'user_b' },
}

vi.mock('@/lib/supabase-server', () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const filters: Record<string, string> = {}
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.limit = () => builder
      builder.eq = (col: string, val: string) => { filters[col] = val; return builder }
      builder.maybeSingle = async () => {
        if (table === 'leagues') return { data: filters.id === LEAGUE_A ? { draft_id: 'draft-a' } : null, error: null }
        return { data: teams[filters.id] ?? null, error: null }
      }
      builder.then = (resolve: (v: unknown) => void) => {
        if (table === 'picks') return resolve({ data: [], error: null })
        const rows = Object.entries(teams)
          .filter(([, t]) => t.draft_id === filters.draft_id && t.owner_id === filters.owner_id)
          .map(([id]) => ({ id }))
        return resolve({ data: rows, error: null })
      }
      return builder
    },
  }),
}))

import { POST } from '@/app/api/ai/analyze-team/route'

function analyze(teamId: string, leagueId = LEAGUE_A) {
  return POST(new NextRequest('http://localhost/api/ai/analyze-team', {
    method: 'POST',
    body: JSON.stringify({ teamId, leagueId }),
  }))
}

describe('/api/ai/analyze-team access', () => {
  beforeEach(() => { currentUser = 'user_a' })

  it('requires a signed-in user', async () => {
    currentUser = null
    expect((await analyze(TEAM_A)).status).toBe(401)
  })

  it('analyzes a team in the caller\'s league', async () => {
    const res = await analyze(TEAM_A)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ teamId: TEAM_A, ok: true })
  })

  it('refuses a team from another league', async () => {
    expect((await analyze(TEAM_B)).status).toBe(403)
  })

  it('refuses non-members of the league', async () => {
    currentUser = 'user_b'
    expect((await analyze(TEAM_A)).status).toBe(403)
  })
})
