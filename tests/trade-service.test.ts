import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn().mockReturnValue({
      subscribe: vi.fn().mockImplementation((cb) => {
        // Simulate immediate subscription
        if (cb) cb('SUBSCRIBED')
        return { send: vi.fn().mockResolvedValue(undefined) }
      }),
      send: vi.fn().mockResolvedValue(undefined),
    }),
    removeChannel: vi.fn(),
  },
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { TradeService } from '@/lib/trade-service'
import { supabase } from '@/lib/supabase'

const mockSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
  channel: ReturnType<typeof vi.fn>
  removeChannel: ReturnType<typeof vi.fn>
}

describe('TradeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // proposeTrade
  // =========================================================================
  describe('proposeTrade', () => {
    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(
        TradeService.proposeTrade(
          'league-1', 'team-1', 'team-2',
          ['pick-1'], ['pick-2'], 'user-1', 1
        )
      ).rejects.toThrow('Supabase not configured')

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should insert trade and return data on success', async () => {
      const tradeData = {
        id: 'trade-1',
        league_id: 'league-1',
        team_a_id: 'team-1',
        team_b_id: 'team-2',
        team_a_gives: ['pick-1'],
        team_b_gives: ['pick-2'],
        proposed_by: 'user-1',
        week_number: 1,
        status: 'proposed',
        notes: null,
        proposed_at: '2025-01-01T00:00:00Z',
        responded_at: null,
        completed_at: null,
        commissioner_approved: null,
        commissioner_id: null,
        commissioner_notes: null,
        counter_to_id: null,
      }

      const mockSingle = vi.fn().mockResolvedValue({ data: tradeData, error: null })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      const result = await TradeService.proposeTrade(
        'league-1', 'team-1', 'team-2',
        ['pick-1'], ['pick-2'], 'user-1', 1
      )

      expect(result.id).toBe('trade-1')
      expect(result.status).toBe('proposed')
      expect(result.team_a_gives).toEqual(['pick-1'])
      expect(result.team_b_gives).toEqual(['pick-2'])
    })

    it('should throw when insert fails', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      await expect(
        TradeService.proposeTrade(
          'league-1', 'team-1', 'team-2',
          ['pick-1'], ['pick-2'], 'user-1', 1
        )
      ).rejects.toThrow('Failed to propose trade')
    })

    it('should include notes when provided', async () => {
      const tradeData = {
        id: 'trade-2',
        league_id: 'league-1',
        team_a_id: 'team-1',
        team_b_id: 'team-2',
        team_a_gives: ['pick-1'],
        team_b_gives: ['pick-2'],
        proposed_by: 'user-1',
        week_number: 1,
        status: 'proposed',
        notes: 'Good deal for both',
        proposed_at: '2025-01-01T00:00:00Z',
        responded_at: null,
        completed_at: null,
        commissioner_approved: null,
        commissioner_id: null,
        commissioner_notes: null,
        counter_to_id: null,
      }

      const mockSingle = vi.fn().mockResolvedValue({ data: tradeData, error: null })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      const result = await TradeService.proposeTrade(
        'league-1', 'team-1', 'team-2',
        ['pick-1'], ['pick-2'], 'user-1', 1, 'Good deal for both'
      )

      expect(result.notes).toBe('Good deal for both')
      // Verify insert was called with notes
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'Good deal for both' })
      )
    })
  })

  // =========================================================================
  // respondToTrade
  // =========================================================================
  describe('respondToTrade', () => {
    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(
        TradeService.respondToTrade('trade-1', false)
      ).rejects.toThrow('Supabase not configured')

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should set status to rejected when not accepted', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { league_id: 'league-1' },
        error: null,
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ update: mockUpdate })

      await TradeService.respondToTrade('trade-1', false)

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' })
      )
    })

    it('should throw when update fails', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ update: mockUpdate })

      await expect(
        TradeService.respondToTrade('trade-1', true)
      ).rejects.toThrow('Failed to respond to trade')
    })
  })

  // =========================================================================
  // executeTrade
  // =========================================================================
  describe('executeTrade', () => {
    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(TradeService.executeTrade('trade-1')).rejects.toThrow(
        'Supabase not configured'
      )

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should call RPC execute_trade with correct params', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: null })

      // Mock the post-execute league_id fetch
      const mockSingle = vi.fn().mockResolvedValue({
        data: { league_id: 'league-1' },
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      await TradeService.executeTrade('trade-1')

      expect(mockSupabase.rpc).toHaveBeenCalledWith('execute_trade', {
        trade_uuid: 'trade-1',
      })
    })

    it('should fall back to manual swap when RPC fails', async () => {
      // RPC fails
      mockSupabase.rpc.mockResolvedValue({
        error: { message: 'RPC not available' },
      })

      // Manual swap: fetch trade, then swap picks, then mark completed
      const tradeData = {
        id: 'trade-1',
        league_id: 'league-1',
        team_a_id: 'team-1',
        team_b_id: 'team-2',
        team_a_gives: ['pick-A'],
        team_b_gives: ['pick-B'],
        status: 'accepted',
      }

      let fromCallCount = 0
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++
        if (fromCallCount === 1) {
          // Fetch trade for manual execution
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: tradeData, error: null }),
              }),
            }),
          }
        }
        // Pick updates and trade status update
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }
      })

      await TradeService.executeTrade('trade-1')

      expect(mockSupabase.rpc).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // cancelTrade
  // =========================================================================
  describe('cancelTrade', () => {
    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(TradeService.cancelTrade('trade-1')).rejects.toThrow(
        'Supabase not configured'
      )

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should update trade status to cancelled', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { league_id: 'league-1' },
        error: null,
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEqStatus = vi.fn().mockReturnValue({ select: mockSelect })
      const mockEqId = vi.fn().mockReturnValue({ eq: mockEqStatus })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId })
      mockSupabase.from.mockReturnValue({ update: mockUpdate })

      await TradeService.cancelTrade('trade-1')

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' })
      )
    })

    it('should throw when cancel fails', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Cannot cancel' },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEqStatus = vi.fn().mockReturnValue({ select: mockSelect })
      const mockEqId = vi.fn().mockReturnValue({ eq: mockEqStatus })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId })
      mockSupabase.from.mockReturnValue({ update: mockUpdate })

      await expect(TradeService.cancelTrade('trade-1')).rejects.toThrow(
        'Failed to cancel trade'
      )
    })
  })

  // =========================================================================
  // getLeagueTrades
  // =========================================================================
  describe('getLeagueTrades', () => {
    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(TradeService.getLeagueTrades('league-1')).rejects.toThrow(
        'Supabase not configured'
      )

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should return empty array when no trades exist', async () => {
      const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await TradeService.getLeagueTrades('league-1')
      expect(result).toEqual([])
    })

    it('should return trades with resolved team names', async () => {
      const tradesData = [
        {
          id: 'trade-1',
          league_id: 'league-1',
          team_a_id: 'team-1',
          team_b_id: 'team-2',
          team_a_gives: ['pick-1'],
          team_b_gives: ['pick-2'],
          status: 'proposed',
          proposed_by: 'user-1',
          proposed_at: '2025-01-01T00:00:00Z',
          responded_at: null,
          completed_at: null,
          notes: null,
          commissioner_approved: null,
          commissioner_id: null,
          commissioner_notes: null,
          counter_to_id: null,
          week_number: 1,
        },
      ]

      const teamsData = [
        { id: 'team-1', name: 'Team Alpha' },
        { id: 'team-2', name: 'Team Beta' },
      ]

      let fromCallCount = 0
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++
        if (fromCallCount === 1) {
          // trades fetch
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: tradesData, error: null }),
              }),
            }),
          }
        }
        // teams lookup
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: teamsData, error: null }),
          }),
        }
      })

      const result = await TradeService.getLeagueTrades('league-1')

      expect(result).toHaveLength(1)
      expect(result[0].teamAName).toBe('Team Alpha')
      expect(result[0].teamBName).toBe('Team Beta')
    })
  })

  // =========================================================================
  // getTradesPendingApproval
  // =========================================================================
  describe('getTradesPendingApproval', () => {
    it('should return empty array when no pending trades', async () => {
      const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
      const mockIs = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEqStatus = vi.fn().mockReturnValue({ is: mockIs })
      const mockEqLeague = vi.fn().mockReturnValue({ eq: mockEqStatus })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqLeague })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await TradeService.getTradesPendingApproval('league-1')
      expect(result).toEqual([])
    })
  })

  // =========================================================================
  // approveTrade (commissioner flow)
  // =========================================================================
  describe('approveTrade', () => {
    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(
        TradeService.approveTrade('trade-1', 'commissioner-1', true)
      ).rejects.toThrow('Supabase not configured')

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should reject trade when approved is false', async () => {
      // First call: update trade status to rejected
      const mockSingle = vi.fn().mockResolvedValue({
        data: { league_id: 'league-1' },
        error: null,
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })

      // Second call: insert trade_approvals
      const mockInsert = vi.fn().mockResolvedValue({ error: null })

      let fromCallCount = 0
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++
        if (fromCallCount === 1) {
          return { update: mockUpdate }
        }
        return { insert: mockInsert }
      })

      await TradeService.approveTrade('trade-1', 'commissioner-1', false, 'Unfair trade')

      // Should update with rejected status
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          commissioner_approved: false,
          commissioner_id: 'commissioner-1',
          status: 'rejected',
          commissioner_notes: 'Unfair trade',
        })
      )
    })
  })

  // =========================================================================
  // hijackTrade
  // =========================================================================
  describe('hijackTrade', () => {
    it('should throw when original trade not found', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      await expect(
        TradeService.hijackTrade(
          'trade-999', 'team-3', ['pick-3'], ['pick-1'], 'team-1', 'user-3', 1
        )
      ).rejects.toThrow('Original trade not found')
    })

    it('should throw when original trade is not in proposed status', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { league_id: 'league-1', status: 'completed' },
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      await expect(
        TradeService.hijackTrade(
          'trade-1', 'team-3', ['pick-3'], ['pick-1'], 'team-1', 'user-3', 1
        )
      ).rejects.toThrow('Can only hijack pending trades')
    })
  })

  // =========================================================================
  // getLeagueActivity
  // =========================================================================
  describe('getLeagueActivity', () => {
    it('should throw when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      await expect(TradeService.getLeagueActivity('league-1')).rejects.toThrow(
        'Supabase not configured'
      )

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })
  })
})
