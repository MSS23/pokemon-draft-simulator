import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const h = vi.hoisted(() => {
  const state = {
    wishlistHandler: null as null | (() => void),
    subscribeCb: null as null | ((status: string) => void),
    wishlistFetches: 0,
    channelCalls: 0,
  }
  const channel = {
    on: (_type: string, filter: { table?: string }, cb: () => void) => {
      if (filter.table === 'wishlist_items') state.wishlistHandler = cb
      return channel
    },
    subscribe: (cb: (status: string) => void) => {
      state.subscribeCb = cb
      return channel
    },
    unsubscribe: vi.fn(async () => 'ok'),
    state: 'joined',
  }
  const supabase = {
    channel: vi.fn(() => {
      state.channelCalls++
      return channel
    }),
    removeChannel: vi.fn(async () => 'ok'),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: 'draft-uuid' }, error: null }),
          order: async () => {
            if (table === 'wishlist_items') state.wishlistFetches++
            return { data: [], error: null }
          },
        }),
      }),
    }),
  }
  return { state, supabase, channel }
})

vi.mock('@/lib/supabase', () => ({ supabase: h.supabase }))
vi.mock('@/lib/wishlist-service', () => ({ WishlistService: { markPokemonDrafted: vi.fn() } }))

import { useWishlistSync } from '@/hooks/useWishlistSync'

async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

describe('useWishlistSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.state.wishlistHandler = null
    h.state.subscribeCb = null
    h.state.wishlistFetches = 0
    h.state.channelCalls = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces a burst of changes into one trailing refetch (H-09)', async () => {
    renderHook(() => useWishlistSync({ draftId: 'abcdef', participantId: 'p-1' }))
    await flush()
    const initial = h.state.wishlistFetches
    h.state.wishlistHandler?.()
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })
    h.state.wishlistHandler?.()
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })
    h.state.wishlistHandler?.()
    expect(h.state.wishlistFetches).toBe(initial)
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(h.state.wishlistFetches).toBe(initial + 1)
  })

  it('does not re-create a channel after unmount and removes it (H-09)', async () => {
    const { unmount } = renderHook(() => useWishlistSync({ draftId: 'abcdef', participantId: 'p-1' }))
    await flush()
    expect(h.state.channelCalls).toBe(1)
    h.state.subscribeCb?.('CHANNEL_ERROR')
    unmount()
    expect(h.supabase.removeChannel).toHaveBeenCalledWith(h.channel)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(h.state.channelCalls).toBe(1)
  })
})
