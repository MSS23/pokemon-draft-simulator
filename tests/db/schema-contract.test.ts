// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  checkContract,
  collectRpcCallSites,
  parseDatabaseType,
  parseRpcCallSites,
  tsCategories,
  type OpenApiDoc,
  type ParsedTypes,
} from './schema-contract'

const ROOT = path.resolve(__dirname, '../..')
const types = parseDatabaseType(fs.readFileSync(path.join(ROOT, 'src/lib/supabase.ts'), 'utf8'))
const calls = collectRpcCallSites(path.join(ROOT, 'src'))

/** An OpenAPI doc that matches `t` exactly, shaped like PostgREST's output. */
function docFor(t: ParsedTypes): OpenApiDoc {
  const byCategory = {
    boolean: { type: 'boolean', format: 'boolean' },
    number: { type: 'integer', format: 'integer' },
    array: { type: 'array', format: 'text[]' },
    string: { type: 'string', format: 'text' },
    json: { format: 'jsonb' },
    any: { format: 'jsonb' },
  }
  const prop = (ts: string) => byCategory[tsCategories(ts)[0]]
  const definitions = Object.fromEntries(
    Object.entries(t.relations).map(([rel, cols]) => [
      rel,
      { properties: Object.fromEntries(Object.entries(cols).map(([c, ts]) => [c, prop(ts)])) },
    ])
  )
  const fnArgs: Record<string, Set<string>> = {}
  for (const [fn, keys] of Object.entries(t.functions)) fnArgs[fn] = new Set(keys)
  for (const c of calls) c.keys.forEach((k) => (fnArgs[c.name] ??= new Set()).add(k))
  const paths = Object.fromEntries(
    Object.entries(fnArgs).map(([fn, keys]) => [
      `/rpc/${fn}`,
      { post: { parameters: [{ in: 'body', name: 'args', schema: { properties: Object.fromEntries([...keys].map((k) => [k, {}])) } }] } },
    ])
  )
  return { definitions, paths }
}

describe('schema-contract parser (offline)', () => {
  it('reads every table/view Row and function from src/lib/supabase.ts', () => {
    expect(Object.keys(types.relations).length).toBeGreaterThan(25)
    expect(types.relations.auctions).toMatchObject({ current_bidder: 'string | null', current_bid: 'number' })
    expect(types.relations.drafts.settings).toBe('DraftSettings | null')
    expect(types.relations.active_public_drafts).toBeDefined() // views count too
    expect(types.functions.make_draft_pick).toEqual([
      'p_draft_id', 'p_team_id', 'p_user_id', 'p_pokemon_id', 'p_pokemon_name', 'p_cost', 'p_expected_turn',
    ])
    expect(types.functions.whoami).toEqual([])
  })

  it('reads literal .rpc() call sites, including `as never` casts and nested values', () => {
    const src = `
      await db.rpc('a_fn', { p_x: f(1, 2), p_y: { nested: true }, p_z })
      await supabase.rpc('b_fn' as never, { p_league_id: id } as never)
      await db.rpc('whoami')`
    expect(parseRpcCallSites(src, 'x.ts').map((s) => [s.name, s.keys])).toEqual([
      ['a_fn', ['p_x', 'p_y', 'p_z']],
      ['b_fn', ['p_league_id']],
      ['whoami', []],
    ])
    expect(calls.find((c) => c.name === 'system_make_pick')?.keys).toContain('p_expected_turn')
  })

  it('passes when the DB matches the types', () => {
    expect(checkContract(types, calls, docFor(types))).toEqual([])
  })

  it('flags the auctions.current_bidder drift that reached prod', () => {
    const doc = docFor(types)
    const auctions = doc.definitions!.auctions.properties!
    auctions.current_bidder_id = { type: 'string', format: 'uuid' }
    delete auctions.current_bidder
    expect(checkContract(types, calls, doc)).toEqual(['column auctions.current_bidder is missing'])
  })

  it('flags a type mismatch, a missing table, a missing RPC and an unknown RPC parameter', () => {
    const doc = docFor(types)
    doc.definitions!.teams.properties!.budget_remaining = { type: 'string', format: 'text' }
    delete doc.definitions!.bid_history
    delete doc.paths!['/rpc/resolve_auction']
    doc.paths!['/rpc/place_bid'].post.parameters![0].schema = { properties: { p_auction_id: {} } }
    const problems = checkContract(types, calls, doc)
    expect(problems).toContain('column teams.budget_remaining: TS `number` but DB is text')
    expect(problems).toContain('relation bid_history is missing')
    expect(problems.some((p) => p.startsWith('rpc resolve_auction is missing'))).toBe(true)
    expect(problems.some((p) => p.startsWith('rpc place_bid: no parameter named auction_id'))).toBe(true)
  })
})

// Live checks: point at a local `supabase start` stack or a staging project.
// SUPABASE_TEST_URL is the API URL (e.g. http://127.0.0.1:54321), not a postgres:// URL.
const TEST_URL = process.env.SUPABASE_TEST_URL?.replace(/\/$/, '')
const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY
const PROD_REF = 'dwqlxyeefzcclqdzteez'

describe.skipIf(!TEST_URL || !SERVICE_KEY)('schema contract vs live PostgREST', () => {
  it('every table, column and RPC used by the client exists with a compatible type', async () => {
    const res = await fetch(`${TEST_URL}/rest/v1/`, {
      headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, Accept: 'application/openapi+json' },
    })
    expect(res.status).toBe(200)
    expect(checkContract(types, calls, (await res.json()) as OpenApiDoc)).toEqual([])
  })
})

// Calls the RPCs as anon; a regressed grant would execute them, so never on prod.
describe.skipIf(!TEST_URL || !ANON_KEY || TEST_URL.includes(PROD_REF))('RPC grants (anon)', () => {
  const NIL = '00000000-0000-0000-0000-000000000000'
  const cases: Array<[string, Record<string, unknown>]> = [
    ['make_draft_pick', { p_draft_id: NIL, p_team_id: NIL, p_user_id: 'anon', p_pokemon_id: '0', p_pokemon_name: 'x', p_cost: 0, p_expected_turn: 1 }],
    ['system_make_pick', { p_draft_id: NIL, p_team_id: NIL, p_pokemon_id: '0', p_pokemon_name: 'x', p_cost: 0, p_expected_turn: 1 }],
    ['system_advance_turn', { p_draft_id: NIL, p_expected_turn: 1 }],
    ['system_skip_nomination', { p_draft_id: NIL, p_expected_turn: 1 }],
  ]
  for (const [fn, args] of cases) {
    it(`anon cannot execute ${fn}`, async () => {
      const res = await fetch(`${TEST_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      const body = (await res.json()) as { code?: string }
      expect([401, 403]).toContain(res.status)
      expect(body.code).toBe('42501')
    })
  }
})
