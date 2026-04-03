import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockAddEventListener = vi.fn()
const mockRemoveEventListener = vi.fn()

function createMockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('useMediaQuery', () => {
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    mockAddEventListener.mockReset()
    mockRemoveEventListener.mockReset()
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('returns false when matchMedia does not match', async () => {
    window.matchMedia = createMockMatchMedia(false)
    const { useMediaQuery } = await import('@/hooks/useMediaQuery')
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))
    expect(result.current).toBe(false)
  })

  it('returns true when matchMedia matches', async () => {
    window.matchMedia = createMockMatchMedia(true)
    const { useMediaQuery } = await import('@/hooks/useMediaQuery')
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))
    expect(result.current).toBe(true)
  })

  it('useIsMobile returns true for max-width: 767px when matched', async () => {
    window.matchMedia = createMockMatchMedia(true)
    const { useIsMobile } = await import('@/hooks/useMediaQuery')
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('registers and cleans up change listener', async () => {
    window.matchMedia = createMockMatchMedia(false)
    const { useMediaQuery } = await import('@/hooks/useMediaQuery')
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'))

    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    unmount()
    expect(mockRemoveEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('updates when matchMedia fires change event', async () => {
    window.matchMedia = createMockMatchMedia(false)
    const { useMediaQuery } = await import('@/hooks/useMediaQuery')
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))

    expect(result.current).toBe(false)

    // Simulate a change event
    const changeHandler = mockAddEventListener.mock.calls[0][1]
    act(() => {
      changeHandler({ matches: true } as MediaQueryListEvent)
    })

    expect(result.current).toBe(true)
  })
})
