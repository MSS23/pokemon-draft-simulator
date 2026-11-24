import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// K-05: a non-room-code id disables the realtime hook, so isLoading never clears; the page must show the error.
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '00000000-0000-0000-0000-000000000000' }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/hooks/useDraftRealtime', () => ({
  useDraftStateWithRealtime: () => ({ draftState: null, isLoading: true, loadError: null, connectionStatus: 'disconnected' }),
}))
vi.mock('@/components/layout/SidebarLayout', () => ({ SidebarLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/draft/ConnectionStatus', () => ({ DraftConnectionStatusBadge: () => null }))
vi.mock('@/components/spectator/SpectatorDraftGrid', () => ({ default: () => null }))
vi.mock('@/components/draft/SpectatorMode', () => ({ default: () => null }))
vi.mock('@/components/team/TeamRoster', () => ({ default: () => null }))
vi.mock('@/components/team/DraftProgress', () => ({ default: () => null }))

import SpectateRoomPage from '@/app/spectate/[id]/page'

describe('SpectateRoomPage with an invalid id', () => {
  it('shows the invalid room code error instead of loading forever', () => {
    render(<SpectateRoomPage />)
    expect(screen.getByText(/invalid room code format/i)).toBeTruthy()
    expect(screen.queryByText(/loading draft/i)).toBeNull()
  })
})
