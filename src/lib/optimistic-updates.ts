'use client'

import { Pokemon, Team, Pick, Auction, BidHistory } from '@/types'

export interface OptimisticAction {
  id: string
  type: 'pick' | 'bid' | 'nominate' | 'join' | 'leave'
  timestamp: string
  data: any
  status: 'pending' | 'confirmed' | 'failed'
  retryCount: number
}

export interface OptimisticState {
  teams: Team[]
  picks: Pick[]
  auctions: Auction[]
  bidHistory: BidHistory[]
  pendingActions: OptimisticAction[]
}

export interface OptimisticPickAction {
  pokemonId: string
  pokemonName: string
  teamId: string
  cost: number
  round: number
}

export interface OptimisticBidAction {
  auctionId: string
  teamId: string
  teamName: string
  bidAmount: number
}

export interface OptimisticNominateAction {
  pokemonId: string
  pokemonName: string
  teamId: string
  startingBid: number
  duration: number
}

class OptimisticUpdatesService {
  private static instance: OptimisticUpdatesService
  private state: OptimisticState = {
    teams: [],
    picks: [],
    auctions: [],
    bidHistory: [],
    pendingActions: []
  }
  private listeners = new Set<(state: OptimisticState) => void>()

  static getInstance(): OptimisticUpdatesService {
    if (!OptimisticUpdatesService.instance) {
      OptimisticUpdatesService.instance = new OptimisticUpdatesService()
    }
    return OptimisticUpdatesService.instance
  }

  /**
   * Subscribe to optimistic state changes
   */
  subscribe(listener: (state: OptimisticState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Update the base state from server
   */
  updateBaseState(state: Partial<OptimisticState>) {
    this.state = { ...this.state, ...state }
    this.notifyListeners()
  }

  /**
   * Apply an optimistic pick action
   */
  optimisticPick(action: OptimisticPickAction): string {
    const actionId = `pick-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const optimisticAction: OptimisticAction = {
      id: actionId,
      type: 'pick',
      timestamp: new Date().toISOString(),
      data: action,
      status: 'pending',
      retryCount: 0
    }

    // Create optimistic pick
    const optimisticPick: Pick = {
      id: `temp-${actionId}`,
      draftId: '', // Will be filled from context
      teamId: action.teamId,
      pokemonId: action.pokemonId,
      pokemonName: action.pokemonName,
      cost: action.cost,
      pickOrder: this.state.picks.length + 1,
      round: action.round,
      createdAt: new Date().toISOString()
    }

    // Update state
    this.state = {
      ...this.state,
      picks: [...this.state.picks, optimisticPick],
      pendingActions: [...this.state.pendingActions, optimisticAction]
    }

    this.notifyListeners()
    return actionId
  }

  /**
   * Apply an optimistic bid action
   */
  optimisticBid(action: OptimisticBidAction): string {
    const actionId = `bid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const optimisticAction: OptimisticAction = {
      id: actionId,
      type: 'bid',
      timestamp: new Date().toISOString(),
      data: action,
      status: 'pending',
      retryCount: 0
    }

    // Update auction with optimistic bid
    const updatedAuctions = this.state.auctions.map(auction => 
      auction.id === action.auctionId
        ? {
            ...auction,
            currentBid: action.bidAmount,
            currentBidder: action.teamId
          }
        : auction
    )

    // Create optimistic bid history entry
    const optimisticBidEntry: BidHistory = {
      id: `temp-${actionId}`,
      auctionId: action.auctionId,
      teamId: action.teamId,
      teamName: action.teamName,
      bidAmount: action.bidAmount,
      timestamp: new Date().toISOString(),
      draftId: '' // Will be filled from context
    }

    // Update state
    this.state = {
      ...this.state,
      auctions: updatedAuctions,
      bidHistory: [...this.state.bidHistory, optimisticBidEntry],
      pendingActions: [...this.state.pendingActions, optimisticAction]
    }

    this.notifyListeners()
    return actionId
  }

  /**
   * Apply an optimistic nomination action
   */
  optimisticNominate(action: OptimisticNominateAction): string {
    const actionId = `nominate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const optimisticAction: OptimisticAction = {
      id: actionId,
      type: 'nominate',
      timestamp: new Date().toISOString(),
      data: action,
      status: 'pending',
      retryCount: 0
    }

    // Create optimistic auction
    const optimisticAuction: Auction = {
      id: `temp-${actionId}`,
      draftId: '', // Will be filled from context
      pokemonId: action.pokemonId,
      pokemonName: action.pokemonName,
      nominatedBy: action.teamId,
      currentBid: action.startingBid,
      currentBidder: action.teamId,
      auctionEnd: new Date(Date.now() + action.duration * 1000).toISOString(),
      status: 'active'
    }

    // Update state
    this.state = {
      ...this.state,
      auctions: [...this.state.auctions, optimisticAuction],
      pendingActions: [...this.state.pendingActions, optimisticAction]
    }

    this.notifyListeners()
    return actionId
  }

  /**
   * Confirm a pending action (remove from pending, action already applied)
   */
  confirmAction(actionId: string) {
    const action = this.state.pendingActions.find(a => a.id === actionId)
    if (!action) return

    // Mark as confirmed and remove from pending
    this.state = {
      ...this.state,
      pendingActions: this.state.pendingActions.filter(a => a.id !== actionId)
    }

    this.notifyListeners()
  }

  /**
   * Fail a pending action (revert optimistic changes)
   */
  failAction(actionId: string, error?: string) {
    const action = this.state.pendingActions.find(a => a.id === actionId)
    if (!action) return

    // Revert optimistic changes based on action type
    switch (action.type) {
      case 'pick':
        this.state = {
          ...this.state,
          picks: this.state.picks.filter(p => !p.id.includes(actionId)),
          pendingActions: this.state.pendingActions.filter(a => a.id !== actionId)
        }
        break

      case 'bid':
        // Revert auction state and bid history
        this.state = {
          ...this.state,
          bidHistory: this.state.bidHistory.filter(b => !b.id.includes(actionId)),
          pendingActions: this.state.pendingActions.filter(a => a.id !== actionId)
        }
        // Note: Auction state reversal is complex and might need server reconciliation
        break

      case 'nominate':
        this.state = {
          ...this.state,
          auctions: this.state.auctions.filter(a => !a.id.includes(actionId)),
          pendingActions: this.state.pendingActions.filter(a => a.id !== actionId)
        }
        break
    }

    this.notifyListeners()
  }

  /**
   * Retry a failed action
   */
  retryAction(actionId: string) {
    const action = this.state.pendingActions.find(a => a.id === actionId)
    if (!action) return

    // Increment retry count and reset status
    const updatedAction = {
      ...action,
      status: 'pending' as const,
      retryCount: action.retryCount + 1
    }

    this.state = {
      ...this.state,
      pendingActions: this.state.pendingActions.map(a => 
        a.id === actionId ? updatedAction : a
      )
    }

    this.notifyListeners()
    return updatedAction
  }

  /**
   * Get current optimistic state
   */
  getState(): OptimisticState {
    return { ...this.state }
  }

  /**
   * Get pending actions for UI feedback
   */
  getPendingActions(): OptimisticAction[] {
    return [...this.state.pendingActions]
  }

  /**
   * Clear all optimistic state (useful for cleanup)
   */
  reset() {
    this.state = {
      teams: [],
      picks: [],
      auctions: [],
      bidHistory: [],
      pendingActions: []
    }
    this.notifyListeners()
  }

  /**
   * Reconcile with server state (merge optimistic and real data)
   */
  reconcileWithServer(serverState: Partial<OptimisticState>) {
    // Remove any optimistic entries that have been confirmed by server
    const serverPickIds = new Set(serverState.picks?.map(p => p.pokemonId) || [])
    const serverBidIds = new Set(serverState.bidHistory?.map(b => b.id) || [])
    const serverAuctionIds = new Set(serverState.auctions?.map(a => a.id) || [])

    // Filter out optimistic entries that are now confirmed
    const filteredPicks = this.state.picks.filter(pick => 
      !pick.id.startsWith('temp-') || !serverPickIds.has(pick.pokemonId)
    )

    const filteredBidHistory = this.state.bidHistory.filter(bid =>
      !bid.id.startsWith('temp-') || !serverBidIds.has(bid.id)
    )

    const filteredAuctions = this.state.auctions.filter(auction =>
      !auction.id.startsWith('temp-') || !serverAuctionIds.has(auction.id)
    )

    // Merge with server state
    this.state = {
      ...this.state,
      ...serverState,
      picks: [...(serverState.picks || []), ...filteredPicks],
      bidHistory: [...(serverState.bidHistory || []), ...filteredBidHistory],
      auctions: [...(serverState.auctions || []), ...filteredAuctions]
    }

    this.notifyListeners()
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.state))
  }
}

// Export singleton instance
export const optimisticUpdatesService = OptimisticUpdatesService.getInstance()

// Convenience exports
export const {
  subscribe,
  updateBaseState,
  optimisticPick,
  optimisticBid,
  optimisticNominate,
  confirmAction,
  failAction,
  retryAction,
  getState,
  getPendingActions,
  reset,
  reconcileWithServer
} = optimisticUpdatesService