import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'

// Mock AuthContext before importing useDraftSession
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}))

// Mock UserSessionService so tests are deterministic
vi.mock('@/lib/user-session', () => ({
  UserSessionService: {
    getDraftParticipation: vi.fn(() => null),
    getCurrentSession: vi.fn(() => null),
  },
}))

// ============================================================
// DraftRealtimeContext tests
// ============================================================
describe('DraftRealtimeContext', () => {
  it('Test 6: useDraftRealtimeContext() throws when called outside provider', async () => {
    const { useDraftRealtimeContext } = await import('@/app/draft/[id]/DraftRealtimeContext')
    expect(() => {
      renderHook(() => useDraftRealtimeContext())
    }).toThrow('useDraftRealtimeContext must be used within DraftRealtimeContext.Provider')
  })

  it('Test 7: DraftRealtimeContext.Provider passes value to useDraftRealtimeContext consumer', async () => {
    const { DraftRealtimeContext, useDraftRealtimeContext } = await import(
      '@/app/draft/[id]/DraftRealtimeContext'
    )

    const fakeValue = {
      connectionStatus: { status: 'connected' as const },
      onlineUsers: new Set<string>(),
      lastEvent: null,
      error: null,
      refresh: vi.fn(),
      reconnect: vi.fn(),
      isUserOnline: vi.fn(() => false),
    }

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(DraftRealtimeContext.Provider, { value: fakeValue }, children)

    const { result } = renderHook(() => useDraftRealtimeContext(), { wrapper })
    expect(result.current).toBe(fakeValue)
    expect(result.current.connectionStatus.status).toBe('connected')
  })
})

// ============================================================
// ViewerRole derivation tests (via useDraftSession)
// ============================================================
describe('ViewerRole derivation in useDraftSession', () => {
  beforeEach(() => {
    // Clear sessionStorage so the hook always generates a fresh guest id
    sessionStorage.clear()
  })

  it('Test 4: returns "lobby" when participants is undefined (loading state)', async () => {
    const { useDraftSession } = await import('@/hooks/useDraftSession')

    const { result } = renderHook(() =>
      useDraftSession({
        roomCode: 'ABCD01',
        isHostParam: false,
        isSpectatorParam: false,
        participants: undefined,
      })
    )

    expect(result.current.viewerRole).toBe('lobby')
  })

  it('Test 1: returns "host" when participant has is_host=true', async () => {
    const { useAuth } = await import('@/contexts/AuthContext')
    ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: 'user-host-1' } })

    const { useDraftSession } = await import('@/hooks/useDraftSession')

    const participants = [
      { userId: 'user-host-1', is_admin: true, team_id: 'team-1', is_host: true },
    ]

    const { result } = renderHook(() =>
      useDraftSession({
        roomCode: 'ABCD02',
        isHostParam: true,
        isSpectatorParam: false,
        participants,
      })
    )

    expect(result.current.viewerRole).toBe('host')
    // Verify existing returns unchanged
    expect(result.current.isHost).toBe(true)
    expect(result.current.isSpectator).toBe(false)
  })

  it('Test 2: returns "participant" when participant has team_id but is not host', async () => {
    const { useAuth } = await import('@/contexts/AuthContext')
    ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: 'user-part-1' } })

    const { useDraftSession } = await import('@/hooks/useDraftSession')

    const participants = [
      { userId: 'user-part-1', is_admin: false, team_id: 'team-2', is_host: false },
    ]

    const { result } = renderHook(() =>
      useDraftSession({
        roomCode: 'ABCD03',
        isHostParam: false,
        isSpectatorParam: false,
        participants,
      })
    )

    expect(result.current.viewerRole).toBe('participant')
    expect(result.current.isHost).toBe(false)
    expect(result.current.isSpectator).toBe(false)
  })

  it('Test 3: returns "spectator" when isSpectatorParam=true and user not in participants', async () => {
    const { useAuth } = await import('@/contexts/AuthContext')
    ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: 'user-spec-1' } })

    const { useDraftSession } = await import('@/hooks/useDraftSession')

    const participants = [
      { userId: 'user-other-1', is_admin: false, team_id: 'team-3', is_host: false },
    ]

    const { result } = renderHook(() =>
      useDraftSession({
        roomCode: 'ABCD04',
        isHostParam: false,
        isSpectatorParam: true,
        participants,
      })
    )

    expect(result.current.viewerRole).toBe('spectator')
    expect(result.current.isSpectator).toBe(true)
  })

  it('Test 5: returns "lobby" when userId not in participants and isSpectatorParam=false', async () => {
    const { useAuth } = await import('@/contexts/AuthContext')
    ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: 'user-lobby-1' } })

    const { useDraftSession } = await import('@/hooks/useDraftSession')

    const participants = [
      { userId: 'user-other-2', is_admin: false, team_id: 'team-4', is_host: false },
    ]

    const { result } = renderHook(() =>
      useDraftSession({
        roomCode: 'ABCD05',
        isHostParam: false,
        isSpectatorParam: false,
        participants,
      })
    )

    expect(result.current.viewerRole).toBe('lobby')
    expect(result.current.isSpectator).toBe(false)
  })
})
