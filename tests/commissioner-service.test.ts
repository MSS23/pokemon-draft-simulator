import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { CommissionerService } from '@/lib/commissioner-service'
import { LeagueService } from '@/lib/league-service'
import { supabase } from '@/lib/supabase'

const mockSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
}

describe('CommissionerService.forceAdvanceWeek', () => {
  beforeEach(() => vi.clearAllMocks())

  it('advances atomically through the force_advance_week RPC', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: { currentWeek: 3, status: 'active' }, error: null })
    await CommissionerService.forceAdvanceWeek('L1')
    expect(mockSupabase.rpc).toHaveBeenCalledWith('force_advance_week', { p_league_id: 'L1' })
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it('throws "not permitted" for a non-commissioner (42501)', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Only the league commissioner can advance the week' } })
    await expect(CommissionerService.forceAdvanceWeek('L1')).rejects.toThrow('Failed to advance week: not permitted')
  })

  it('surfaces other RPC errors', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'League is already completed' } })
    await expect(CommissionerService.forceAdvanceWeek('L1')).rejects.toThrow('League is already completed')
  })
})

describe('LeagueService.updateStandings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('surfaces the RPC error instead of a client fallback that writes 0 rows', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })

    await expect(LeagueService.updateStandings('L1')).rejects.toThrow('permission denied')
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })
})
