import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Static guard for the cost-authority migration. Behaviour against a real
 * Postgres is covered by cases G and H in tests/db/README.md.
 */
const sql = readFileSync(
  path.join(__dirname, '../supabase/migrations/20261029120000_server_costs_untiered_picks_and_auction_floor.sql'),
  'utf8',
)
const fn = (name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  return sql.slice(start, sql.indexOf('$$;', start))
}

describe('server-authoritative cost migration', () => {
  it('resolve_draft_pick_rule never prices a pick from the client cost', () => {
    const body = fn('resolve_draft_pick_rule')
    expect(body).not.toMatch(/v_cost\s*:=\s*p_submitted_cost/)
    expect(body).toMatch(/IF NOT FOUND OR NOT COALESCE\(v_is_legal, FALSE\) OR v_cost IS NULL THEN RETURN;/)
    // tier rows are matched by id only, so a cheap species' name cannot price an expensive id
    expect(body).not.toMatch(/lower\(pokemon_name\)\s*=\s*lower\(p_pokemon_name\)/)
  })

  it('nominate_auction enforces the server cost as the opening-bid floor', () => {
    const body = fn('nominate_auction')
    expect(body).toMatch(/FROM public\.resolve_draft_pick_rule\(p_draft_id, p_pokemon_id, p_pokemon_name, p_starting_bid\)/)
    expect(body).toMatch(/IF p_starting_bid < v_floor THEN/)
  })

  it('keeps the original grants', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.resolve_draft_pick_rule(UUID, TEXT, TEXT, INTEGER) TO service_role;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.nominate_auction(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;')
  })
})
