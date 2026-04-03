/**
 * k6 Load Test: Draft Pick Latency
 *
 * Tests: 8 concurrent players making picks via Supabase RPC
 * Thresholds: p95 pick latency < 500ms, error rate < 1%
 *
 * Prerequisites:
 * - A test draft must exist in Supabase with 8 teams and 'active' status
 * - Set env vars: SUPABASE_URL, SUPABASE_ANON_KEY, DRAFT_ID
 * - See tests/load/README.md for full setup instructions
 *
 * Run: k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e DRAFT_ID=... tests/load/draft-load-test.js
 */

import http from 'k6/http'
import { sleep, check } from 'k6'
import { Trend } from 'k6/metrics'
import { vu } from 'k6/execution'

// Custom metric for pick latency (separate from generic http_req_duration)
const pickLatency = new Trend('pick_latency', true)

// Pokemon pool — 20 valid national dex numbers to rotate through
// These are base-form, non-legendary Pokemon safe for any format
const POKEMON_POOL = [
  '1',   // Bulbasaur
  '4',   // Charmander
  '7',   // Squirtle
  '25',  // Pikachu
  '39',  // Jigglypuff
  '52',  // Meowth
  '54',  // Psyduck
  '58',  // Growlithe
  '63',  // Abra
  '74',  // Geodude
  '92',  // Gastly
  '102', // Exeggcute
  '113', // Chansey
  '129', // Magikarp
  '133', // Eevee
  '143', // Snorlax
  '147', // Dratini
  '152', // Chikorita
  '155', // Cyndaquil
  '158', // Totodile
]

const POKEMON_NAMES = {
  '1':   'bulbasaur',
  '4':   'charmander',
  '7':   'squirtle',
  '25':  'pikachu',
  '39':  'jigglypuff',
  '52':  'meowth',
  '54':  'psyduck',
  '58':  'growlithe',
  '63':  'abra',
  '74':  'geodude',
  '92':  'gastly',
  '102': 'exeggcute',
  '113': 'chansey',
  '129': 'magikarp',
  '133': 'eevee',
  '143': 'snorlax',
  '147': 'dratini',
  '152': 'chikorita',
  '155': 'cyndaquil',
  '158': 'totodile',
}

/**
 * Options block — defines the load profile and thresholds.
 * PERF-04 success criteria: p95 < 500ms, error rate < 1%
 */
export const options = {
  scenarios: {
    draft_picks: {
      executor: 'constant-vus',
      vus: 8,          // 8 concurrent players (one per draft team)
      duration: '60s', // 60-second sustained load
    },
  },
  thresholds: {
    // PERF-04 success criteria:
    'http_req_duration{scenario:draft_picks}': ['p(95)<500'], // p95 under 500ms
    'http_req_failed{scenario:draft_picks}': ['rate<0.01'],   // <1% error rate
    // Named metric for pick latency specifically:
    'pick_latency': ['p(95)<500'],
  },
}

/**
 * Setup function — validates env vars and returns shared config.
 * Runs once before VUs start.
 */
export function setup() {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DRAFT_ID']
  for (const key of required) {
    if (!__ENV[key]) {
      throw new Error(`Missing required env var: ${key}. See tests/load/README.md`)
    }
  }

  return {
    supabaseUrl: __ENV.SUPABASE_URL,
    anonKey: __ENV.SUPABASE_ANON_KEY,
    draftId: __ENV.DRAFT_ID,
  }
}

/**
 * Default function — the per-VU scenario.
 * Each VU simulates one player making draft picks.
 */
export default function (data) {
  const { supabaseUrl, anonKey, draftId } = data

  // VU id is 1-indexed; map to 0-indexed team slot (0–7 for 8 teams)
  const vuId = vu.idInTest - 1
  const iteration = vu.iterationInScenario

  // Select a Pokemon from the pool, spread across VUs and iterations to
  // reduce collisions (each VU picks a different Pokemon each iteration)
  const pokemonIndex = (iteration * 8 + vuId) % POKEMON_POOL.length
  const pokemonId = POKEMON_POOL[pokemonIndex]
  const pokemonName = POKEMON_NAMES[pokemonId]

  // Derive team_id slot from VU id — the load test caller should ensure the
  // test draft has team IDs that follow a predictable pattern, or this VU
  // will always send the same team_id. The test validates RPC response shape
  // and latency; turn-order validation is handled server-side.
  // For simplicity we pass the VU slot as a stable team identifier suffix so
  // different VUs target different teams. The server's atomic RPC function
  // handles turn-order enforcement and will reject out-of-turn picks with a
  // non-success response (counted but not a hard HTTP failure).
  const teamSlot = (vuId % 8) + 1

  // Headers required by Supabase REST API
  const headers = {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  }

  // Payload matches make_draft_pick RPC signature from draft-picks-service.ts
  const payload = JSON.stringify({
    p_draft_id: draftId,
    p_team_id: `team-slot-${teamSlot}`, // Placeholder — replace with real team UUIDs for a real test
    p_user_id: `load-test-user-${teamSlot}`,
    p_pokemon_id: pokemonId,
    p_pokemon_name: pokemonName,
    p_cost: 5, // A nominal cost that fits within any reasonable budget
    p_expected_turn: null, // null skips server-side turn validation for load testing
  })

  // Make the pick request and record latency
  const startTime = Date.now()
  const res = http.post(
    `${supabaseUrl}/rest/v1/rpc/make_draft_pick`,
    payload,
    { headers, tags: { rpc: 'make_draft_pick' } }
  )
  const elapsed = Date.now() - startTime

  // Record to custom pick_latency metric
  pickLatency.add(elapsed)

  // Validate response
  const isSuccess = check(res, {
    'status is 200': (r) => r.status === 200,
    'no error in body': (r) => {
      if (!r.body) return false
      try {
        const body = JSON.parse(r.body)
        // Supabase RPC errors come back as { code, message, details, hint }
        // Our make_draft_pick RPC returns { success: bool, error?: string }
        // Accept both: HTTP 200 with success=true, or HTTP 200 with a known
        // "not your turn" error (turn contention is expected under concurrent load)
        if (body && typeof body === 'object' && body.error) {
          const errMsg = String(body.error).toLowerCase()
          // Turn contention errors are expected — they are not test failures
          if (errMsg.includes('not your turn') || errMsg.includes('already drafted')) {
            return true
          }
          console.log(`[VU ${vu.idInTest}] RPC error: ${body.error}`)
          return false
        }
        // Supabase REST error envelope
        if (body && body.message) {
          console.log(`[VU ${vu.idInTest}] Supabase error: ${body.message}`)
          return false
        }
        return true
      } catch (_) {
        return true // Non-JSON body is fine for some RPC responses
      }
    },
  })

  if (!isSuccess) {
    console.log(`[VU ${vu.idInTest}] Pick failed — status: ${res.status}, body: ${res.body}`)
  }

  // Simulate realistic think time between picks (1 second)
  sleep(1)
}
