import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))

import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { MobileSidebar } from '@/components/layout/MobileSidebar'
import DraftActivitySidebar from '@/components/draft/DraftActivitySidebar'
import { OnTheClockHero } from '@/components/draft/OnTheClockHero'

vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => null }))

describe('icon-only nav controls', () => {
  it('names the New link and marks the current page', () => {
    render(<MobileBottomNav />)
    expect(screen.getByRole('link', { name: 'New' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page')
  })

  it('names the hamburger trigger', () => {
    render(<MobileSidebar />)
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy()
  })
})

describe('DraftActivitySidebar', () => {
  const base = { activities: [], pokemon: [], currentUserTeamId: null }

  it('is inert while closed', () => {
    const { container } = render(<DraftActivitySidebar {...base} isOpen={false} onClose={vi.fn()} />)
    expect(container.querySelector('[role="dialog"]')?.hasAttribute('inert')).toBe(true)
  })

  it('focuses the named close button and closes on Escape when open', () => {
    const onClose = vi.fn()
    render(<DraftActivitySidebar {...base} isOpen onClose={onClose} />)
    const close = screen.getByRole('button', { name: 'Close activity' })
    expect(document.activeElement).toBe(close)
    expect(close.closest('[role="dialog"]')?.hasAttribute('inert')).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('OnTheClockHero live region', () => {
  const teams = [
    { id: 'a', name: 'Alpha', draftOrder: 1, picks: [] },
    { id: 'b', name: 'Bravo', draftOrder: 2, picks: [] },
  ]
  const props = { teams, currentTeamId: 'a', userTeamId: 'b', currentTurn: 1, maxRounds: 6, timeLimit: 60, draftStatus: 'drafting' as const }

  it('does not change on clock ticks, only on turn change', () => {
    const { rerender } = render(<OnTheClockHero {...props} timeRemaining={30} />)
    const status = () => screen.getByRole('status').textContent
    expect(status()).toBe('Alpha is on the clock, round 1')
    rerender(<OnTheClockHero {...props} timeRemaining={29} />)
    expect(status()).toBe('Alpha is on the clock, round 1')
    rerender(<OnTheClockHero {...props} timeRemaining={60} currentTeamId="b" currentTurn={2} />)
    expect(status()).toBe('Your turn, round 1')
  })
})
