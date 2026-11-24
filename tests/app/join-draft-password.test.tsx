import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// D-01: the page must not pre-check the password (oracle); the join POST does it server-side.
const { push, joinAsSpectator, joinDraft, grantDraftAccess } = vi.hoisted(() => ({
  push: vi.fn(), joinAsSpectator: vi.fn(), joinDraft: vi.fn(), grantDraftAccess: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('code=ABC123'),
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user_1', email: 'ash@b.c', user_metadata: {} }, loading: false }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Ash' }, error: null }) }) }) }),
  },
}))
vi.mock('@/components/layout/SidebarLayout', () => ({ SidebarLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) }))
vi.mock('@/lib/draft-service', () => ({ DraftService: { joinAsSpectator, joinDraft } }))
vi.mock('@/lib/draft-access', () => ({ grantDraftAccess }))

import JoinDraftPage from '@/app/join-draft/page'

async function openSpectatorJoin() {
  render(<JoinDraftPage />)
  await screen.findByText('Draft Found!')
  await userEvent.type(screen.getByPlaceholderText('Enter draft password'), 'hunter2')
  await userEvent.click(screen.getByRole('button', { name: /spectate/i }))
  await userEvent.click(screen.getByRole('button', { name: /join draft/i }))
}

describe('JoinDraftPage password handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      hasPassword: true, currentTeams: 1, maxTeams: 4, draftType: 'snake', timeLimit: 60,
    }), { status: 200 })))
  })

  it('shows the join POST 401 message and grants no access', async () => {
    joinAsSpectator.mockRejectedValue(new Error('Incorrect password.'))
    await openSpectatorJoin()
    expect(await screen.findByText('Incorrect password.')).toBeTruthy()
    expect(grantDraftAccess).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('grants access only after a successful join', async () => {
    joinAsSpectator.mockResolvedValue({ draftId: 'd1' })
    await openSpectatorJoin()
    await waitFor(() => expect(push).toHaveBeenCalledWith('/draft/abc123?spectator=true'))
    expect(joinAsSpectator).toHaveBeenCalledWith(expect.objectContaining({ password: 'hunter2' }))
    expect(grantDraftAccess).toHaveBeenCalledWith('ABC123', false)
  })
})
