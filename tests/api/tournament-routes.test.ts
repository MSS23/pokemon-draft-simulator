import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createTournament, reportMatchResult, startTournament, type Tournament } from '@/lib/tournament-service'

/**
 * Knockout tournament API routes: dual confirmation (F-01), bracket CAS (F-02),
 * idempotent next-round sync (F-03), host-only create-from-draft with
 * reconcile (F-04), and start closing the lobby first (F-05).
 */

let currentUser = 'host'
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: currentUser }),
}))
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

// ---- tiny in-memory PostgREST fake ----------------------------------------
type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let ops: string[]
let tick = 0
let beforeUpdate: ((table: string) => void) | null
let failUpsert: string | null
let noServiceKey = false

const conflictKeys: Record<string, string[]> = {
  league_teams: ['league_id', 'team_id'],
  matches: ['league_id', 'week_number', 'home_team_id', 'away_team_id'],
}

function query(table: string) {
  let op: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select'
  let payload: Row | Row[] | null = null
  let returning = false
  const filters: Array<(r: Row) => boolean> = []
  const b: Record<string, unknown> = {}
  const chain = (fn: () => void) => (...args: unknown[]) => { void args; fn(); return b }
  b.select = (...args: unknown[]) => { void args; if (op !== 'select') returning = true; return b }
  b.eq = (col: string, val: unknown) => { filters.push(r => r[col] === val); return b }
  b.neq = (col: string, val: unknown) => { filters.push(r => r[col] !== val); return b }
  b.in = (col: string, vals: unknown[]) => { filters.push(r => vals.includes(r[col])); return b }
  b.is = (col: string, val: unknown) => { filters.push(r => r[col] === val); return b }
  b.order = chain(() => {})
  b.limit = chain(() => {})
  b.update = (p: Row) => { op = 'update'; payload = p; return b }
  b.insert = (p: Row | Row[]) => { op = 'insert'; payload = p; return b }
  b.upsert = (p: Row[]) => { op = 'upsert'; payload = p; return b }
  b.delete = () => { op = 'delete'; return b }

  const run = (): { data: Row[] | null; error: { message: string } | null } => {
    const rows = (tables[table] ??= [])
    const match = (r: Row) => filters.every(f => f(r))
    ops.push(`${table}.${op}`)
    if (op === 'select') return { data: rows.filter(match).map(r => structuredClone(r)), error: null }
    if (op === 'update') {
      beforeUpdate?.(table)
      const hit = rows.filter(match)
      for (const r of hit) {
        Object.assign(r, structuredClone(payload))
        if (table === 'leagues') r.updated_at = `t${++tick}` // update trigger
      }
      ops.push(`${table}.update:${hit.length}:${JSON.stringify(payload)}`)
      return { data: returning ? hit.map(r => ({ ...r })) : null, error: null }
    }
    if (op === 'insert') {
      const list = (Array.isArray(payload) ? payload : [payload!]).map(p => ({ id: `${table}-${rows.length + 1}`, created_at: `c${++tick}`, updated_at: `t${tick}`, ...p }))
      rows.push(...list)
      return { data: list, error: null }
    }
    if (op === 'upsert') {
      if (failUpsert === table) return { data: null, error: { message: 'boom' } }
      const keys = conflictKeys[table]
      for (const p of payload as Row[]) {
        if (!rows.some(r => keys.every(k => r[k] === p[k]))) rows.push({ id: `${table}-${rows.length + 1}`, ...p })
      }
      return { data: null, error: null }
    }
    tables[table] = rows.filter(r => !match(r))
    return { data: null, error: null }
  }
  b.maybeSingle = async () => { const { data, error } = run(); return { data: data?.[0] ?? null, error } }
  b.single = b.maybeSingle
  b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    try { resolve(run()) } catch (e) { reject(e) }
  }
  return b
}

vi.mock('@/lib/supabase-server', () => ({
  createServiceRoleClient: () => {
    if (noServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
    return { from: (t: string) => query(t) }
  },
}))

import { POST as report } from '@/app/api/tournament/report/route'
import { POST as start } from '@/app/api/tournament/start/route'
import { POST as createFromDraft } from '@/app/api/tournament/create-from-draft/route'
import { POST as createLobby } from '@/app/api/tournament/create/route'

const LEAGUE = '11111111-1111-4111-8111-111111111111'
const DRAFT = '22222222-2222-4222-8222-222222222222'
const M1 = '33333333-3333-4333-8333-333333333331'
const M2 = '33333333-3333-4333-8333-333333333332'

const post = (handler: (r: NextRequest) => Promise<Response>, body: unknown) =>
  handler(new NextRequest('http://localhost/api/tournament/x', { method: 'POST', body: JSON.stringify(body) }))

function fourPlayerBracket(): Tournament {
  const participants = ['A', 'B', 'C', 'D'].map((id, i) => ({ id, teamId: id, name: `Team ${id}`, seed: i + 1 }))
  return startTournament(createTournament('Cup', 'single-elimination', participants))
}

function seedReportFixture() {
  const tournament = fourPlayerBracket()
  const [semi1, semi2] = tournament.rounds[0].matches
  const matchRow = (id: string, m: typeof semi1) => ({
    id, league_id: LEAGUE, week_number: 1,
    home_team_id: m.participant1!.teamId, away_team_id: m.participant2!.teamId,
    status: 'scheduled', winner_team_id: null, home_score: 0, away_score: 0,
  })
  tables = {
    leagues: [{ id: LEAGUE, draft_id: DRAFT, status: 'active', updated_at: 't0',
      settings: { commissionerId: 'host', matchFormat: 'best_of_3', tournament: JSON.parse(JSON.stringify(tournament)) } }],
    matches: [matchRow(M1, semi1), matchRow(M2, semi2)],
    teams: ['A', 'B', 'C', 'D'].map(id => ({ id, owner_id: `owner-${id}`, draft_id: DRAFT })),
    drafts: [{ id: DRAFT, host_id: 'host', status: 'completed' }],
    league_teams: [],
  }
  return { tournament, semi1, semi2 }
}

const storedBracket = () => (tables.leagues[0].settings as { tournament: Tournament }).tournament
const row = (id: string) => tables.matches.find(m => m.id === id)!

beforeEach(() => {
  ops = []
  beforeUpdate = null
  failUpsert = null
  noServiceKey = false
  currentUser = 'host'
})

describe('/api/tournament/report', () => {
  it('F-01: a player cannot self-report an unconfirmed match', async () => {
    const { semi1 } = seedReportFixture()
    currentUser = `owner-${semi1.participant1!.teamId}`
    const res = await post(report, { leagueId: LEAGUE, matchId: M1, winnerId: semi1.participant1!.teamId, score: { home: 2, away: 0 } })
    expect(res.status).toBe(403)
    expect(row(M1).status).toBe('scheduled')
    expect(storedBracket().rounds[0].matches[0].status).not.toBe('completed')
  })

  it('F-01: a player advances a confirmed match using the confirmed score', async () => {
    const { semi1 } = seedReportFixture()
    const winner = semi1.participant2!.teamId!
    Object.assign(row(M1), { status: 'completed', winner_team_id: winner, home_score: 1, away_score: 2 })
    currentUser = `owner-${winner}`
    const res = await post(report, { leagueId: LEAGUE, matchId: M1, winnerId: winner, score: { home: 0, away: 9 } })
    expect(res.status).toBe(200)
    const bm = storedBracket().rounds[0].matches[0]
    expect(bm.status).toBe('completed')
    expect(bm.winner?.teamId).toBe(winner)
    expect(bm.score).toEqual({ participant1: 1, participant2: 2 })
  })

  it('F-01: a player cannot advance a winner other than the confirmed one', async () => {
    const { semi1 } = seedReportFixture()
    Object.assign(row(M1), { status: 'completed', winner_team_id: semi1.participant2!.teamId })
    currentUser = `owner-${semi1.participant1!.teamId}`
    const res = await post(report, { leagueId: LEAGUE, matchId: M1, winnerId: semi1.participant1!.teamId, score: { home: 2, away: 0 } })
    expect(res.status).toBe(403)
  })

  it('F-01: the host can record an unconfirmed match', async () => {
    const { semi1 } = seedReportFixture()
    const res = await post(report, { leagueId: LEAGUE, matchId: M1, winnerId: semi1.participant1!.teamId, score: { home: 2, away: 1 } })
    expect(res.status).toBe(200)
    expect(row(M1)).toMatchObject({ status: 'completed', winner_team_id: semi1.participant1!.teamId, home_score: 2, away_score: 1 })
  })

  it('F-02: a concurrent report is not overwritten; the bracket keeps both semis and the final row is created', async () => {
    const { semi1, semi2 } = seedReportFixture()
    let raced = false
    beforeUpdate = table => {
      if (table !== 'leagues' || raced) return
      raced = true
      // Another request commits semi2 between our read and our write.
      const league = tables.leagues[0]
      const settings = league.settings as { tournament: Tournament }
      settings.tournament = JSON.parse(JSON.stringify(
        reportMatchResult(settings.tournament, semi2.id, semi2.participant1!.id, { participant1: 2, participant2: 0 })))
      league.updated_at = `t${++tick}`
      Object.assign(row(M2), { status: 'completed', winner_team_id: semi2.participant1!.teamId })
    }
    const res = await post(report, { leagueId: LEAGUE, matchId: M1, winnerId: semi1.participant1!.teamId, score: { home: 2, away: 0 } })
    expect(res.status).toBe(200)
    const [r1, r2] = storedBracket().rounds
    expect(r1.matches.every(m => m.status === 'completed')).toBe(true)
    const final = r2.matches[0]
    expect([final.participant1?.teamId, final.participant2?.teamId].sort())
      .toEqual([semi1.participant1!.teamId, semi2.participant1!.teamId].sort())
    expect(tables.matches.some(m => m.week_number === 2)).toBe(true)
  })

  it('F-02: the bracket is saved before the match row', async () => {
    const { semi1 } = seedReportFixture()
    await post(report, { leagueId: LEAGUE, matchId: M1, winnerId: semi1.participant1!.teamId, score: { home: 2, away: 0 } })
    const leagueWrite = ops.findIndex(o => o.startsWith('leagues.update:1'))
    const matchWrite = ops.findIndex(o => o.startsWith('matches.update:1'))
    expect(leagueWrite).toBeGreaterThanOrEqual(0)
    expect(leagueWrite).toBeLessThan(matchWrite)
  })

  it('F-03: a failed next-round sync returns 500 and a retry heals it', async () => {
    const { semi1, semi2 } = seedReportFixture()
    // Semi 2 already done, so reporting semi 1 unlocks the final.
    const league = tables.leagues[0]
    const settings = league.settings as { tournament: Tournament }
    settings.tournament = reportMatchResult(settings.tournament, semi2.id, semi2.participant1!.id, { participant1: 2, participant2: 0 })
    Object.assign(row(M2), { status: 'completed', winner_team_id: semi2.participant1!.teamId })

    const body = { leagueId: LEAGUE, matchId: M1, winnerId: semi1.participant1!.teamId, score: { home: 2, away: 0 } }
    failUpsert = 'matches'
    expect((await post(report, body)).status).toBe(500)
    expect(tables.matches.some(m => m.week_number === 2)).toBe(false)

    failUpsert = null
    expect((await post(report, body)).status).toBe(200)
    expect(tables.matches.filter(m => m.week_number === 2)).toHaveLength(1)
  })

  it('F-03: a retry after the bracket saved but the row did not completes the row instead of 409', async () => {
    const { semi1 } = seedReportFixture()
    const settings = tables.leagues[0].settings as { tournament: Tournament }
    settings.tournament = reportMatchResult(settings.tournament, semi1.id, semi1.participant1!.id, { participant1: 2, participant2: 0 })
    const res = await post(report, { leagueId: LEAGUE, matchId: M1, winnerId: semi1.participant1!.teamId, score: { home: 2, away: 0 } })
    expect(res.status).toBe(200)
    expect(row(M1).status).toBe('completed')
  })
})

describe('/api/tournament/start', () => {
  function seedLobby(teamIds: string[]) {
    tables = {
      leagues: [{ id: LEAGUE, draft_id: DRAFT, name: 'Cup', status: 'scheduled', updated_at: 't0',
        settings: { commissionerId: 'host', matchFormat: 'best_of_1' } }],
      drafts: [{ id: DRAFT, host_id: 'host', status: 'setup' }],
      teams: teamIds.map((id, i) => ({ id, name: `Team ${id}`, draft_order: i + 1, draft_id: DRAFT })),
      league_teams: [],
      matches: [],
    }
  }

  it('F-05: closes the lobby before reading teams', async () => {
    seedLobby(['A', 'B', 'C', 'D'])
    const res = await post(start, { leagueId: LEAGUE })
    expect(res.status).toBe(200)
    expect(ops.indexOf('drafts.update')).toBeLessThan(ops.indexOf('teams.select'))
    expect(tables.drafts[0].status).toBe('completed')
  })

  it('F-05: reopens the lobby when there are too few players', async () => {
    seedLobby(['A'])
    const res = await post(start, { leagueId: LEAGUE })
    expect(res.status).toBe(400)
    expect(tables.drafts[0].status).toBe('setup')
  })

  it('F-05: a retry builds league_teams from the bracket, not from a late joiner', async () => {
    seedLobby(['A', 'B', 'C', 'D'])
    expect((await post(start, { leagueId: LEAGUE })).status).toBe(200)
    tables.league_teams = []
    tables.teams.push({ id: 'LATE', name: 'Late', draft_order: 5, draft_id: DRAFT })
    expect((await post(start, { leagueId: LEAGUE })).status).toBe(200)
    expect(tables.league_teams.map(t => t.team_id).sort()).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('/api/tournament/create-from-draft', () => {
  function seedDraft() {
    tables = {
      drafts: [{ id: DRAFT, host_id: 'host', status: 'completed' }],
      teams: ['A', 'B', 'C'].map((id, i) => ({ id, name: `Team ${id}`, draft_order: i + 1, draft_id: DRAFT })),
      leagues: [],
      league_teams: [],
      matches: [],
    }
  }
  const body = { draftId: DRAFT, name: 'Cup', matchFormat: 'best_of_3' }

  it('F-04: rejects a caller who is not the draft host', async () => {
    seedDraft()
    currentUser = 'someone'
    expect((await post(createFromDraft, body)).status).toBe(403)
    expect(tables.leagues).toHaveLength(0)
  })

  it('F-04: creates the league with its roster and matches', async () => {
    seedDraft()
    const res = await post(createFromDraft, body)
    expect(res.status).toBe(200)
    expect(tables.leagues).toHaveLength(1)
    expect(tables.league_teams).toHaveLength(3)
    expect(tables.matches.length).toBeGreaterThan(0)
  })

  it('F-04: a retry after a partial failure reconciles instead of throwing', async () => {
    seedDraft()
    await post(createFromDraft, body)
    tables.league_teams = []
    tables.matches = []
    const res = await post(createFromDraft, body)
    expect(res.status).toBe(200)
    expect(tables.leagues).toHaveLength(1)
    expect(tables.league_teams).toHaveLength(3)
    expect(tables.matches.length).toBeGreaterThan(0)
  })

  it('F-04: still refuses when a regular league exists for the draft', async () => {
    seedDraft()
    tables.leagues.push({ id: 'reg', draft_id: DRAFT, league_type: 'standard', settings: {} })
    expect((await post(createFromDraft, body)).status).toBe(409)
  })
})

describe('/api/tournament/create', () => {
  const body = { name: 'Cup', formatId: 'reg_h', tournamentType: 'single-elimination', matchFormat: 'best_of_3', hostName: 'Host' }

  it('D-06: creates draft, host team and league through the service-role client', async () => {
    tables = { drafts: [], teams: [], leagues: [] }
    const res = await post(createLobby, body)
    expect(res.status).toBe(200)
    expect(tables.drafts).toHaveLength(1)
    expect(tables.teams).toHaveLength(1)
    expect(tables.leagues[0]).toMatchObject({ league_type: 'knockout', draft_id: tables.drafts[0].id })
  })

  it('D-06: returns 503 when the service role key is missing', async () => {
    tables = { drafts: [], teams: [], leagues: [] }
    noServiceKey = true
    expect((await post(createLobby, body)).status).toBe(503)
    expect(tables.drafts).toHaveLength(0)
  })
})
