/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Lifecycle writes in src/lib/draft-lifecycle-service.ts: status preconditions,
 * error propagation, removeTeam FK ordering + renumbering, timer changes and
 * draft-state cache invalidation. Supabase is a recording chainable stub.
 */

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { draftStarted: vi.fn() } }))
vi.mock('@/lib/draft-broadcast', () => ({ broadcastOnDraftChannel: vi.fn() }))
vi.mock('@/lib/user-session', () => ({
  UserSessionService: { updateDraftParticipation: vi.fn(), getDraftParticipation: vi.fn() },
}))

const getDraftState = vi.fn()
const invalidateDraftStateCache = vi.fn()
vi.mock('@/lib/draft-service', () => ({
  DraftService: {
    getDraftState: (...a: unknown[]) => getDraftState(...a),
    invalidateDraftStateCache: (...a: unknown[]) => invalidateDraftStateCache(...a),
  },
}))

interface Call { table: string; op: string; payload?: unknown; filters: Array<[string, ...unknown[]]> }
let calls: Call[]
// Per-call result override: return a result for a given call, or undefined for the default.
let resultFor: (c: Call) => { data?: unknown; error?: unknown } | undefined

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc(fn: string, args: unknown) {
      const call: Call = { table: `rpc:${fn}`, op: 'rpc', payload: args, filters: [] }
      calls.push(call)
      return Promise.resolve(resultFor(call) ?? { data: { success: true, started: true }, error: null })
    },
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] }
      calls.push(call)
      const b: any = {}
      b.update = (payload: unknown) => { call.op = 'update'; call.payload = payload; return b }
      b.delete = () => { call.op = 'delete'; return b }
      b.select = (...a: unknown[]) => { call.filters.push(['select', ...a]); return b }
      for (const m of ['eq', 'in']) b[m] = (...a: unknown[]) => { call.filters.push([m, ...a]); return b }
      b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(resultFor(call) ?? { data: [{ id: 'x' }], error: null }).then(onF, onR)
      return b
    },
  },
}))

import {
  pauseDraft, unpauseDraft, endDraft, startDraft, shuffleDraftOrder, removeTeam, resetDraft, updateTimerSetting,
} from '@/lib/draft-lifecycle-service'

const teams = [
  { id: 't1', name: 'A', draft_order: 1 },
  { id: 't2', name: 'B', draft_order: 2 },
  { id: 't3', name: 'C', draft_order: 3 },
]
const state = (status: string, extra: Record<string, unknown> = {}) => ({
  draft: { id: 'uuid-1', room_code: 'ABC123', status, settings: { timeLimit: 120 }, budget_per_team: 100, ...extra },
  teams,
  participants: teams.map(t => ({ id: `p-${t.id}`, team_id: t.id })),
  picks: [],
})
const hasFilter = (c: Call, ...f: unknown[]) =>
  c.filters.some(x => JSON.stringify(x) === JSON.stringify(f))

beforeEach(() => {
  calls = []
  resultFor = () => undefined
  getDraftState.mockReset()
  invalidateDraftStateCache.mockReset()
})

describe('status preconditions (C-07)', () => {
  it('pauseDraft only updates an active draft and throws when 0 rows match', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    resultFor = () => ({ data: [], error: null })
    await expect(pauseDraft('ABC123')).rejects.toThrow(/active/)
    expect(hasFilter(calls[0], 'eq', 'status', 'active')).toBe(true)
  })

  it('unpauseDraft guards on status=paused in the write itself', async () => {
    getDraftState.mockResolvedValue(state('paused'))
    resultFor = () => ({ data: [], error: null }) // DB says it is no longer paused
    await expect(unpauseDraft('ABC123')).rejects.toThrow('Draft is not paused')
    expect(hasFilter(calls[0], 'eq', 'status', 'paused')).toBe(true)
  })

  it('endDraft only completes active/paused drafts and treats 0 rows as a no-op', async () => {
    getDraftState.mockResolvedValue(state('active'))
    resultFor = () => ({ data: [], error: null })
    await expect(endDraft('ABC123')).resolves.toBeUndefined()
    expect(hasFilter(calls[0], 'in', 'status', ['active', 'paused'])).toBe(true)
  })
})

describe('start/shuffle via host RPCs (C-08, B-26)', () => {
  it('startDraft calls start_draft with the draft uuid and writes no seats itself', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    await startDraft('ABC123')
    expect(calls.map(c => c.table)).toEqual(['rpc:start_draft'])
    expect(calls[0].payload).toEqual({ p_draft_id: 'uuid-1', p_shuffle: true })
  })

  it('startDraft is idempotent when the RPC reports the draft already active', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    resultFor = () => ({ data: { started: false, reason: 'already active' }, error: null })
    await expect(startDraft('ABC123')).resolves.toBeUndefined()
  })

  it('startDraft throws when another tab already left setup', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    resultFor = () => ({ data: null, error: { message: 'Draft cannot be started from status completed' } })
    await expect(startDraft('ABC123')).rejects.toThrow(/no longer in setup/)
  })

  it('startDraft maps 42501 to a permission error', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    resultFor = () => ({ data: null, error: { code: '42501', message: 'Only the host can start the draft' } })
    await expect(startDraft('ABC123')).rejects.toThrow(/Permission denied/)
  })

  it('shuffleDraftOrder calls shuffle_draft_order and surfaces its error', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    resultFor = () => ({ data: { success: false, error: 'Only the host can shuffle the draft order' }, error: null })
    await expect(shuffleDraftOrder('ABC123')).rejects.toThrow('Only the host can shuffle the draft order')
    expect(calls.map(c => c.table)).toEqual(['rpc:shuffle_draft_order'])
  })

  it('shuffleDraftOrder rejects on a transport error', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    resultFor = () => ({ data: null, error: { message: 'rls' } })
    await expect(shuffleDraftOrder('ABC123')).rejects.toThrow(/shuffle/)
  })
})

describe('resetDraft (B-15)', () => {
  it('runs one reset_draft RPC and surfaces its error', async () => {
    getDraftState.mockResolvedValue(state('active'))
    await resetDraft('ABC123')
    expect(calls.map(c => c.table)).toEqual(['rpc:reset_draft'])
    resultFor = () => ({ data: { success: false, error: 'Only the host can reset the draft' }, error: null })
    await expect(resetDraft('ABC123')).rejects.toThrow('Only the host can reset the draft')
  })
})

describe('removeTeam (C-04)', () => {
  it('calls the atomic remove_team RPC with the draft uuid', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    resultFor = () => ({ data: null, error: null })
    await removeTeam('ABC123', 't1')
    expect(calls.map(c => c.table)).toEqual(['rpc:remove_team'])
    expect(calls[0].payload).toEqual({ p_draft_id: 'uuid-1', p_team_id: 't1' })
  })

  it('throws a readable error when the RPC fails', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    resultFor = () => ({ data: null, error: { code: '42501', message: 'denied' } })
    await expect(removeTeam('ABC123', 't1')).rejects.toThrow('Only the host can remove teams')
    resultFor = () => ({ data: null, error: { message: 'boom' } })
    await expect(removeTeam('ABC123', 't1')).rejects.toThrow('Failed to remove team')
  })
})

describe('updateTimerSetting (C-06)', () => {
  it('restarts the current turn clock when changed mid-draft', async () => {
    getDraftState.mockResolvedValue(state('active'))
    resultFor = () => ({ data: null, error: null })
    await updateTimerSetting('ABC123', 30)
    const payload = calls[0].payload as any
    expect(payload.settings.timeLimit).toBe(30)
    expect(payload.settings.pendingTimerChange).toBeUndefined()
    expect(typeof payload.turn_started_at).toBe('string')
  })

  it('does not touch turn_started_at before the draft starts', async () => {
    getDraftState.mockResolvedValue(state('setup'))
    resultFor = () => ({ data: null, error: null })
    await updateTimerSetting('ABC123', 30)
    expect((calls[0].payload as any).turn_started_at).toBeUndefined()
  })
})

describe('cache invalidation (C-05)', () => {
  it.each([
    ['pauseDraft', () => pauseDraft('ABC123'), 'active'],
    ['unpauseDraft', () => unpauseDraft('ABC123'), 'paused'],
    ['endDraft', () => endDraft('ABC123'), 'active'],
    ['shuffleDraftOrder', () => shuffleDraftOrder('ABC123'), 'setup'],
    ['updateTimerSetting', () => updateTimerSetting('ABC123', 60), 'active'],
  ])('%s clears the whole draft-state cache', async (_name, run, status) => {
    getDraftState.mockResolvedValue(state(status as string))
    await run()
    expect(invalidateDraftStateCache).toHaveBeenCalledWith()
  })
})
