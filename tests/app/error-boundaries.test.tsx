import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// I-01: route error boundaries swallow errors (React does not rethrow), so they must report to Sentry.
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (e: unknown) => captureException(e) }))
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) }))

import RootError from '@/app/error'
import DraftError from '@/app/draft/[id]/error'
import LeagueError from '@/app/league/[id]/error'

describe('route error boundaries report to Sentry', () => {
  it.each([
    ['root', RootError],
    ['draft', DraftError],
    ['league', LeagueError],
  ])('%s boundary calls Sentry.captureException with the error', (_name, Boundary) => {
    const err = new Error('boom')
    render(<Boundary error={err} reset={() => {}} />)
    expect(captureException).toHaveBeenCalledWith(err)
  })
})
