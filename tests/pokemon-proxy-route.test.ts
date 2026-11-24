import { describe, it, expect, vi, afterEach } from 'vitest'
import { GET } from '@/app/api/pokemon/[id]/route'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('GET /api/pokemon/[id]', () => {
  it('returns 502 when PokeAPI sends headers but stalls the body', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      // Body never arrives; only an abort can settle it.
      text: () => new Promise<string>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      }),
    })))

    const pending = GET({} as never, { params: Promise.resolve({ id: '25' }) })
    await vi.advanceTimersByTimeAsync(10_000)
    const res = await pending

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'PokeAPI unavailable' })
  })

  it('proxies a normal response with cache headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '{"id":25}',
    })))

    const res = await GET({} as never, { params: Promise.resolve({ id: '25' }) })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"id":25}')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=86400')
  })
})
