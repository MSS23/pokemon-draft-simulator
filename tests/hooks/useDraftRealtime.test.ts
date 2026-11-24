import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => {
  const managers: Array<{ subscribe: ReturnType<typeof vi.fn>; cleanup: ReturnType<typeof vi.fn>; resolveCleanup: () => void }> = []
  const calls: string[] = []
  return { managers, calls }
})

vi.mock('@/lib/draft-realtime', () => ({
  DraftRealtimeManager: class {},
  createDraftRealtimeManager: vi.fn(() => {
    let resolveCleanup = () => {}
    const cleanupPromise = new Promise<void>(r => { resolveCleanup = r })
    const m = {
      subscribe: vi.fn(async () => {}),
      cleanup: vi.fn(() => cleanupPromise),
      resolveCleanup: () => resolveCleanup(),
    }
    h.managers.push(m)
    return m
  }),
}))

vi.mock('@/lib/draft-service', () => ({
  DraftService: {
    invalidateDraftStateCache: vi.fn(() => { h.calls.push('invalidate') }),
    getDraftState: vi.fn(async () => { h.calls.push('get'); return null }),
  },
}))

import { useDraftRealtime, useDraftStateWithRealtime } from '@/hooks/useDraftRealtime'

describe('useDraftRealtime', () => {
  beforeEach(() => {
    h.managers.length = 0
    h.calls.length = 0
  })

  it('waits for the previous manager cleanup before subscribing again (H-10)', async () => {
    const { rerender } = renderHook(({ uid }) => useDraftRealtime('draft-1', uid), {
      initialProps: { uid: 'guest-1' },
    })
    await waitFor(() => expect(h.managers[0].subscribe).toHaveBeenCalledTimes(1))

    rerender({ uid: 'user_clerk' })
    expect(h.managers).toHaveLength(2)
    expect(h.managers[0].cleanup).toHaveBeenCalled()
    await Promise.resolve()
    await Promise.resolve()
    expect(h.managers[1].subscribe).not.toHaveBeenCalled()

    h.managers[0].resolveCleanup()
    await waitFor(() => expect(h.managers[1].subscribe).toHaveBeenCalledTimes(1))
  })

  it('invalidates the draft-state cache before every spectator fetch (H-07)', async () => {
    const { result } = renderHook(() => useDraftStateWithRealtime('ABCDEF', 'spec-1'))
    await waitFor(() => expect(h.calls).toContain('get'))
    h.calls.length = 0
    await result.current.refetchDraftState()
    expect(h.calls).toEqual(['invalidate', 'get'])
  })
})
