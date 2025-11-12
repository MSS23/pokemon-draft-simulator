'use client'

import { supabase } from './supabase'
import { BidHistory, Auction } from '@/types'
import { notificationService } from './notification-service'

export interface PlaceBidParams {
  auctionId: string
  teamId: string
  teamName: string
  bidAmount: number
  draftId: string
}

export interface BidHistoryEntry {
  id: string
  auctionId: string
  teamId: string
  teamName: string
  bidAmount: number
  timestamp: string
}

class AuctionService {
  private static instance: AuctionService
  private bidHistoryCache = new Map<string, BidHistoryEntry[]>()

  static getInstance(): AuctionService {
    if (!AuctionService.instance) {
      AuctionService.instance = new AuctionService()
    }
    return AuctionService.instance
  }

  /**
   * Place a bid and record it in bid history
   */
  async placeBid(params: PlaceBidParams): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    const { auctionId, teamId, teamName, bidAmount, draftId } = params

    // Start a transaction-like operation
    try {
      // Get the draft UUID from room code (draftId might be room_code)
      const { DraftService } = await import('./draft-service')
      const draftState = await DraftService.getDraftState(draftId)

      if (!draftState) {
        throw new Error('Draft not found')
      }

      const draftUuid = draftState.draft.id

      // First, record the bid in history
      const { error: historyError } = await (supabase
        .from('bid_history') as any)
        .insert({
          auction_id: auctionId,
          draft_id: draftUuid,  // Use UUID instead of room_code
          team_id: teamId,
          team_name: teamName,
          bid_amount: bidAmount,
        })

      if (historyError) {
        console.error('Error recording bid history:', historyError)
        throw new Error('Failed to record bid history')
      }

      // Then update the auction with the new bid
      const { error: auctionError } = await (supabase
        .from('auctions') as any)
        .update({
          current_bid: bidAmount,
          current_bidder: teamId,
        })
        .eq('id', auctionId)

      if (auctionError) {
        console.error('Error updating auction:', auctionError)
        throw new Error('Failed to update auction')
      }

      // Update local cache
      this.addBidToCache(auctionId, {
        id: `temp-${Date.now()}`,
        auctionId,
        teamId,
        teamName,
        bidAmount,
        timestamp: new Date().toISOString(),
      })

      // Trigger notification
      this.notifyBidPlaced(teamName, bidAmount, teamId)

    } catch (error) {
      console.error('Error placing bid:', error)
      throw error
    }
  }

  /**
   * Get bid history for a specific auction
   */
  async getBidHistory(auctionId: string): Promise<BidHistoryEntry[]> {
    if (!supabase) {
      return this.bidHistoryCache.get(auctionId) || []
    }

    try {
      const { data, error } = await supabase
        .from('bid_history')
        .select('*')
        .eq('auction_id', auctionId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching bid history:', error)
        return this.bidHistoryCache.get(auctionId) || []
      }

      const bidHistory = (data as any[])?.map(bid => ({
        id: bid.id,
        auctionId: bid.auction_id,
        teamId: bid.team_id,
        teamName: bid.team_name,
        bidAmount: bid.bid_amount,
        timestamp: bid.created_at,
      })) || []

      // Update cache
      this.bidHistoryCache.set(auctionId, bidHistory)

      return bidHistory
    } catch (error) {
      console.error('Error getting bid history:', error)
      return this.bidHistoryCache.get(auctionId) || []
    }
  }

  /**
   * Subscribe to real-time bid history updates
   */
  subscribeToBidHistory(auctionId: string, onUpdate: (bidHistory: BidHistoryEntry[]) => void) {
    if (!supabase) {
      console.warn('Supabase not available, using cache only')
      return () => {}
    }

    const channel = supabase
      .channel(`bid-history:${auctionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bid_history',
          filter: `auction_id=eq.${auctionId}`,
        },
        async (payload) => {
          const newBid = payload.new as any
          const bidEntry: BidHistoryEntry = {
            id: newBid.id,
            auctionId: newBid.auction_id,
            teamId: newBid.team_id,
            teamName: newBid.team_name,
            bidAmount: newBid.bid_amount,
            timestamp: newBid.created_at,
          }

          // Update cache
          this.addBidToCache(auctionId, bidEntry)

          // Get updated history and notify
          const updatedHistory = await this.getBidHistory(auctionId)
          onUpdate(updatedHistory)

          // Trigger bid notification
          this.notifyBidPlaced(bidEntry.teamName, bidEntry.bidAmount, bidEntry.teamId)
        }
      )
      .subscribe()

    return () => {
      if (supabase) {
        supabase.removeChannel(channel)
      }
    }
  }

  /**
   * Subscribe to auction status changes for notifications
   */
  subscribeToAuctionUpdates(draftId: string, userTeamId: string | null) {
    if (!supabase) {
      console.warn('Supabase not available, notifications disabled')
      return () => {}
    }

    const channel = supabase
      .channel(`auction-updates:${draftId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'auctions',
          filter: `draft_id=eq.${draftId}`,
        },
        (payload) => {
          const auction = payload.new as any
          this.notifyAuctionStarted(auction.pokemon_name, auction.nominated_by, userTeamId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auctions',
          filter: `draft_id=eq.${draftId}`,
        },
        (payload) => {
          const auction = payload.new as any
          
          // Check if auction completed
          if (auction.status === 'completed') {
            this.notifyAuctionCompleted(
              auction.pokemon_name,
              auction.current_bidder,
              auction.current_bid,
              userTeamId
            )
          }
        }
      )
      .subscribe()

    return () => {
      if (supabase) {
        supabase.removeChannel(channel)
      }
    }
  }

  /**
   * Get auction statistics for analytics
   */
  async getAuctionStats(draftId: string): Promise<{
    totalAuctions: number
    totalBids: number
    averageBidsPerAuction: number
    highestBid: number
    mostActiveTeam: string | null
  }> {
    if (!supabase) {
      return {
        totalAuctions: 0,
        totalBids: 0,
        averageBidsPerAuction: 0,
        highestBid: 0,
        mostActiveTeam: null,
      }
    }

    try {
      // Get auction count
      const { count: auctionCount } = await supabase
        .from('auctions')
        .select('*', { count: 'exact', head: true })
        .eq('draft_id', draftId)

      // Get bid statistics
      const { data: bidStats } = await supabase
        .from('bid_history')
        .select('bid_amount, team_name')
        .eq('draft_id', draftId)

      const totalBids = bidStats?.length || 0
      const averageBidsPerAuction = auctionCount ? totalBids / auctionCount : 0
      const highestBid = (bidStats as any[])?.reduce((max, bid) => Math.max(max, bid.bid_amount), 0) || 0

      // Find most active team
      const teamBidCounts = (bidStats as any[])?.reduce((acc, bid) => {
        acc[bid.team_name] = (acc[bid.team_name] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      const mostActiveTeam = Object.entries(teamBidCounts)
        .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || null

      return {
        totalAuctions: auctionCount || 0,
        totalBids,
        averageBidsPerAuction: Math.round(averageBidsPerAuction * 10) / 10,
        highestBid,
        mostActiveTeam,
      }
    } catch (error) {
      console.error('Error getting auction stats:', error)
      return {
        totalAuctions: 0,
        totalBids: 0,
        averageBidsPerAuction: 0,
        highestBid: 0,
        mostActiveTeam: null,
      }
    }
  }

  /**
   * Clear bid history cache for an auction
   */
  clearCache(auctionId?: string) {
    if (auctionId) {
      this.bidHistoryCache.delete(auctionId)
    } else {
      this.bidHistoryCache.clear()
    }
  }

  // Private helper methods
  private addBidToCache(auctionId: string, bid: BidHistoryEntry) {
    const existing = this.bidHistoryCache.get(auctionId) || []
    existing.push(bid)
    this.bidHistoryCache.set(auctionId, existing)
  }

  private notifyBidPlaced(teamName: string, bidAmount: number, teamId: string) {
    // Note: We don't know the current user's team ID in this context,
    // so notifications will be handled at the component level
    console.log(`Bid placed: ${teamName} bid $${bidAmount}`)
  }

  private notifyAuctionStarted(pokemonName: string, nominatedBy: string, userTeamId: string | null) {
    notificationService.notifyAuctionStarted(pokemonName, nominatedBy)
  }

  private notifyAuctionCompleted(
    pokemonName: string,
    winnerTeamId: string,
    finalBid: number,
    userTeamId: string | null
  ) {
    const didUserWin = winnerTeamId === userTeamId
    notificationService.notifyAuctionResult(pokemonName, 'Winner', finalBid, didUserWin)
  }
}

// Export singleton instance
export const auctionService = AuctionService.getInstance()

// Convenience exports
export const {
  placeBid,
  getBidHistory,
  subscribeToBidHistory,
  subscribeToAuctionUpdates,
  getAuctionStats,
  clearCache
} = auctionService
