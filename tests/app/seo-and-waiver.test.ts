import { describe, it, expect, vi, beforeEach } from 'vitest'

// I-05/I-06/I-07: waiver deadline tz round-trip, sitemap privacy filter, draft room metadata.
const query = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
}
let limitResult: { data: unknown[] | null } = { data: [] }
let draftResult: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => query }) }))

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))

import { waiverDeadlineToIso, waiverDeadlineToLocalInput } from '@/app/league/[id]/admin/waiver-deadline'
import sitemap from '@/app/sitemap'
import { generateMetadata } from '@/app/draft/[id]/layout'

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  query.select.mockImplementation(() => query)
  query.eq.mockImplementation(() => query)
  query.order.mockImplementation(() => query)
  query.limit.mockImplementation(async () => limitResult)
  query.maybeSingle.mockImplementation(async () => draftResult)
})

describe('waiver deadline conversion', () => {
  it('stores an absolute ISO instant and round-trips to the same local input value', () => {
    const local = '2026-11-30T23:59'
    const iso = waiverDeadlineToIso(local)
    expect(iso).toMatch(/Z$/)
    expect(new Date(iso).getTime()).toBe(new Date(local).getTime())
    expect(waiverDeadlineToLocalInput(iso)).toBe(local)
  })

  it('keeps empty and invalid values empty', () => {
    expect(waiverDeadlineToIso('')).toBe('')
    expect(waiverDeadlineToLocalInput(undefined)).toBe('')
    expect(waiverDeadlineToLocalInput('garbage')).toBe('')
  })
})

describe('sitemap', () => {
  it('only lists leagues whose draft is public', async () => {
    limitResult = { data: [{ id: 'pub-league', updated_at: '2026-01-01' }] }
    const entries = await sitemap()
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('drafts!inner(is_public)'))
    expect(query.eq).toHaveBeenCalledWith('drafts.is_public', true)
    expect(entries.some((e) => e.url.endsWith('/league/pub-league'))).toBe(true)
  })
})

describe('draft/[id] metadata', () => {
  it('is noindex and reflects the real draft status', async () => {
    draftResult = { data: { status: 'completed' }, error: null }
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'abcdef' }), children: null })
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(JSON.stringify(meta.openGraph)).toContain('status=Completed')
    expect(JSON.stringify(meta.openGraph)).not.toContain('status=Live')
    expect(query.eq).toHaveBeenCalledWith('room_code', 'abcdef')
  })

  it('404s an unknown room code', async () => {
    draftResult = { data: null, error: null }
    await expect(
      generateMetadata({ params: Promise.resolve({ id: 'zzzzzz' }), children: null })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('does not 404 when the lookup itself fails', async () => {
    draftResult = { data: null, error: { message: 'network' } }
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'qqqqqq' }), children: null })
    expect(notFound).not.toHaveBeenCalled()
    expect(JSON.stringify(meta.openGraph)).not.toContain('status=')
  })
})
