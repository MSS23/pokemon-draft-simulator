import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { submitMatchResult, reportResult, notify } = vi.hoisted(() => ({
  submitMatchResult: vi.fn(),
  reportResult: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/lib/league-service', () => ({ LeagueService: { submitMatchResult } }))
vi.mock('@/lib/knockout-service', () => ({ KnockoutService: { reportResult } }))
vi.mock('@/lib/notifications', () => ({ notify }))

import { TournamentMatchView } from '@/components/tournament/TournamentMatchView'
import type { Match, Team } from '@/types'

const match = {
  id: 'm1', leagueId: 'l1', homeTeamId: 'h', awayTeamId: 'a', status: 'scheduled', battleFormat: 'best_of_1',
  homeTeam: { id: 'h', name: 'Home' }, awayTeam: { id: 'a', name: 'Away' },
} as unknown as Match & { homeTeam: Team; awayTeam: Team }

describe('TournamentMatchView bracket retry', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('offers a retry that re-reports without resubmitting when the bracket update fails after confirmation', async () => {
    submitMatchResult.mockResolvedValue({ status: 'confirmed' })
    reportResult.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({})
    const onClose = vi.fn()
    const onResultRecorded = vi.fn()

    render(
      <TournamentMatchView
        isOpen onClose={onClose} match={match} opponentSheet={[]} opponentName="Away" yourName="Home"
        canRecordResult currentUserTeamId="h" onResultRecorded={onResultRecorded}
      />
    )

    fireEvent.click(screen.getByText('Record Match Result'))
    fireEvent.click(screen.getAllByText('Home').find(el => el.tagName === 'BUTTON')!)
    fireEvent.click(screen.getByText(/Submit Result/))

    const retry = await screen.findByText('Retry bracket update')
    expect(onClose).not.toHaveBeenCalled()
    expect(notify.error).toHaveBeenCalled()

    fireEvent.click(retry)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(submitMatchResult).toHaveBeenCalledTimes(1)
    expect(reportResult).toHaveBeenCalledTimes(2)
    expect(reportResult).toHaveBeenLastCalledWith('l1', 'm1', 'h', { home: 1, away: 0 })
    expect(onResultRecorded).toHaveBeenCalledTimes(1)
  })
})
