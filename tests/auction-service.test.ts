import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase module - start with null for "supabase not available" tests
vi.mock('@/lib/supabase', () => ({
  supabase: null,
}))

// Mock notification service
vi.mock('@/lib/notification-service', () => ({
  notificationService: {
    notifyAuctionStarted: vi.fn(),
    notifyAuctionResult: vi.fn(),
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

// Import the singleton instance (uses mocked supabase = null)
import { auctionService } from '@/lib/auction-service'

describe('AuctionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear all cached data between tests
    auctionService.clearCache()
  })

  describe('getInstance', () => {
    it('should return a singleton instance', async () => {
      // Import twice and verify identity
      const mod1 = await import('@/lib/auction-service')
      const mod2 = await import('@/lib/auction-service')

      expect(mod1.auctionService).toBe(mod2.auctionService)
    })
  })

  describe('placeBid', () => {
    it('should throw when supabase is null', async () => {
      await expect(
        auctionService.placeBid({
          auctionId: 'auction-1',
          teamId: 'team-1',
          teamName: 'Team Alpha',
          bidAmount: 50,
          draftId: 'draft-1',
        })
      ).rejects.toThrow('Supabase not available')
    })
  })

  describe('getBidHistory', () => {
    it('should return empty array when supabase is null and no cache', async () => {
      const result = await auctionService.getBidHistory('auction-1')

      expect(result).toEqual([])
    })

    it('should return cached data when supabase is null and cache exists', async () => {
      const cachedBids = [
        {
          id: 'bid-1',
          auctionId: 'auction-99',
          teamId: 'team-1',
          teamName: 'Team Alpha',
          bidAmount: 25,
          timestamp: '2025-01-01T00:00:00Z',
        },
        {
          id: 'bid-2',
          auctionId: 'auction-99',
          teamId: 'team-2',
          teamName: 'Team Beta',
          bidAmount: 30,
          timestamp: '2025-01-01T00:01:00Z',
        },
      ]

      // Access private cache to seed test data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serviceAny = auctionService as any
      serviceAny.bidHistoryCache.set('auction-99', cachedBids)

      const result = await auctionService.getBidHistory('auction-99')

      expect(result).toEqual(cachedBids)
      expect(result).toHaveLength(2)
      expect(result[0].teamName).toBe('Team Alpha')
      expect(result[1].bidAmount).toBe(30)
    })
  })

  describe('getAuctionStats', () => {
    it('should return zeros when supabase is null', async () => {
      const result = await auctionService.getAuctionStats('draft-1')

      expect(result).toEqual({
        totalAuctions: 0,
        totalBids: 0,
        averageBidsPerAuction: 0,
        highestBid: 0,
        mostActiveTeam: null,
      })
    })
  })

  describe('clearCache', () => {
    it('should clear specific auction cache', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serviceAny = auctionService as any

      // Seed cache with data for two auctions
      serviceAny.bidHistoryCache.set('auction-A', [
        {
          id: 'bid-1',
          auctionId: 'auction-A',
          teamId: 'team-1',
          teamName: 'Team Alpha',
          bidAmount: 10,
          timestamp: '2025-01-01T00:00:00Z',
        },
      ])
      serviceAny.bidHistoryCache.set('auction-B', [
        {
          id: 'bid-2',
          auctionId: 'auction-B',
          teamId: 'team-2',
          teamName: 'Team Beta',
          bidAmount: 20,
          timestamp: '2025-01-01T00:01:00Z',
        },
      ])

      // Clear only auction-A
      auctionService.clearCache('auction-A')

      // auction-A should be gone, auction-B should remain
      const resultA = await auctionService.getBidHistory('auction-A')
      const resultB = await auctionService.getBidHistory('auction-B')

      expect(resultA).toEqual([])
      expect(resultB).toHaveLength(1)
      expect(resultB[0].teamName).toBe('Team Beta')
    })

    it('should clear all cache when no auctionId provided', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serviceAny = auctionService as any

      // Seed cache with data for two auctions
      serviceAny.bidHistoryCache.set('auction-X', [
        {
          id: 'bid-1',
          auctionId: 'auction-X',
          teamId: 'team-1',
          teamName: 'Team Alpha',
          bidAmount: 15,
          timestamp: '2025-01-01T00:00:00Z',
        },
      ])
      serviceAny.bidHistoryCache.set('auction-Y', [
        {
          id: 'bid-2',
          auctionId: 'auction-Y',
          teamId: 'team-2',
          teamName: 'Team Beta',
          bidAmount: 25,
          timestamp: '2025-01-01T00:01:00Z',
        },
      ])

      // Clear all
      auctionService.clearCache()

      // Both should be empty
      const resultX = await auctionService.getBidHistory('auction-X')
      const resultY = await auctionService.getBidHistory('auction-Y')

      expect(resultX).toEqual([])
      expect(resultY).toEqual([])
    })
  })
})
