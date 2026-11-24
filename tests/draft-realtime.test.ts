import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Handler = (payload: unknown) => void

const h = vi.hoisted(() => {
  const state = {
    broadcastHandlers: new Map<string, (payload: unknown) => void>(),
    subscribeCb: null as null | ((status: string) => void),
    draftRow: { data: { deleted_at: null as string | null } as unknown, error: null as unknown },
    channelCalls: 0,
  }
  const channel = {
    on: (type: string, filter: { event?: string }, cb: (payload: unknown) => void) => {
      if (type === 'broadcast' && filter.event) state.broadcastHandlers.set(filter.event, cb)
      return channel
    },
    subscribe: (cb: (status: string) => void) => {
      state.subscribeCb = cb
      return channel
    },
    track: async () => 'ok',
    unsubscribe: async () => 'ok',
    presenceState: () => ({}),
  }
  const supabase = {
    channel: () => {
      state.channelCalls++
      return channel
    },
    getChannels: () => [],
    removeChannel: async () => 'ok',
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => state.draftRow }),
      }),
    }),
  }
  return { state, supabase }
})

vi.mock('@/lib/supabase', () => ({ supabase: h.supabase }))

import { DraftRealtimeManager, type DraftEvent } from '@/lib/draft-realtime'

function makeManager() {
  const events: DraftEvent[] = []
  const statuses: string[] = []
  const manager = new DraftRealtimeManager('11111111-1111-1111-1111-111111111111', 'user_a', {
    onDraftEvent: e => events.push(e),
    onConnectionChange: s => statuses.push(s.status),
  })
  return { manager, events, statuses }
}

describe('DraftRealtimeManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.state.broadcastHandlers.clear()
    h.state.subscribeCb = null
    h.state.channelCalls = 0
    h.state.draftRow = { data: { deleted_at: null }, error: null }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores a draft_deleted broadcast while the draft still exists (H-03)', async () => {
    const { manager, events } = makeManager()
    await manager.subscribe()
    ;(h.state.broadcastHandlers.get('draft_deleted') as Handler)({ payload: {} })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(events.filter(e => e.eventType === 'DELETE')).toHaveLength(0)
    await manager.cleanup()
  })

  it('emits DELETE once the DB confirms the soft delete (H-03)', async () => {
    const { manager, events } = makeManager()
    await manager.subscribe()
    ;(h.state.broadcastHandlers.get('draft_deleted') as Handler)({ payload: {} })
    await vi.advanceTimersByTimeAsync(1000)
    h.state.draftRow = { data: { deleted_at: '2026-11-24T00:00:00Z' }, error: null }
    await vi.advanceTimersByTimeAsync(3000)
    expect(events.filter(e => e.table === 'drafts' && e.eventType === 'DELETE')).toHaveLength(1)
    await manager.cleanup()
  })

  it('does not forward forged pick_made payload data (H-03)', async () => {
    const { manager, events } = makeManager()
    await manager.subscribe()
    ;(h.state.broadcastHandlers.get('pick_made') as Handler)({
      payload: { teamId: 't1', pokemonId: '150', pokemonName: 'Mewtwo' },
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ table: 'picks', eventType: '*', data: {} })
    await manager.cleanup()
  })

  it('retries from scratch on "online" after giving up (H-05)', async () => {
    const { manager, statuses } = makeManager()
    await manager.subscribe()
    for (let i = 0; i <= 10; i++) {
      h.state.subscribeCb?.('CHANNEL_ERROR')
      await vi.advanceTimersByTimeAsync(40_000)
    }
    expect(statuses).toContain('failed')
    const callsBefore = h.state.channelCalls
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(h.state.channelCalls).toBe(callsBefore + 1)
    await manager.cleanup()
    // Listener removed on cleanup
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(h.state.channelCalls).toBe(callsBefore + 1)
  })
})
