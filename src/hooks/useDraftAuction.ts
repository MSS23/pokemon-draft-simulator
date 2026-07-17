import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Pokemon } from '@/types'
import { DraftService } from '@/lib/draft-service'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import {
  calculateDeadlineTimeRemaining,
  estimateServerClockOffset,
} from '@/lib/draft-timer'

const log = createLogger('useDraftAuction')

export interface AuctionState {
  id: string
  pokemon_id: string
  pokemon_name: string
  nominated_by: string
  current_bid: number
  current_bidder: string | null
  auction_end: string
  status: 'active' | 'completed' | 'cancelled'
}

export interface DraftAuctionResult {
  currentAuction: AuctionState | null
  auctionTimeRemaining: number
  canNominate: boolean
  nominationUserTeam: { id: string; name: string; budgetRemaining: number } | null
  nominationCurrentTeam: { id: string; name: string; draftOrder: number } | null
  currentNominatingTeam: { id: string; name: string; userName: string; draftOrder: number; picks: string[]; budgetRemaining: number; pickCosts: number[] } | null
  handleNominatePokemon: (pokemon: Pokemon, startingBid: number, duration: number) => Promise<void>
  handlePlaceBid: (amount: number) => Promise<void>
  handleAuctionTimeExpired: () => Promise<void>
  handleExtendAuctionTime: (seconds: number) => Promise<void>
}

interface UseDraftAuctionParams {
  isAuctionDraft: boolean
  roomCode: string
  userId: string
  draftStatus?: 'waiting' | 'drafting' | 'completed' | 'paused'
  currentTurn?: number
  teams: Array<{
    id: string
    name: string
    userName: string
    draftOrder: number
    picks: string[]
    budgetRemaining: number
    pickCosts: number[]
  }>
  userTeam: {
    id: string
    name: string
    budgetRemaining: number
    draftOrder: number
    picks: string[]
  } | null
  selectedPokemon: Pokemon | null
  setSelectedPokemon: (p: Pokemon | null) => void
}

export function useDraftAuction({
  isAuctionDraft,
  roomCode,
  userId,
  draftStatus,
  currentTurn,
  teams,
  userTeam,
  selectedPokemon: _selectedPokemon,
  setSelectedPokemon,
}: UseDraftAuctionParams): DraftAuctionResult {
  const [currentAuction, setCurrentAuction] = useState<AuctionState | null>(null)
  const [auctionTimeRemaining, setAuctionTimeRemaining] = useState(0)
  const serverClockOffsetMs = useRef(0)

  // Load current auction for auction drafts
  useEffect(() => {
    const loadCurrentAuction = async () => {
      if (!isAuctionDraft || !roomCode) return

      try {
        const auction = await DraftService.getCurrentAuction(roomCode.toLowerCase())
        setCurrentAuction(auction)

        if (auction && auction.status === 'active') {
          setAuctionTimeRemaining(calculateDeadlineTimeRemaining({
            deadline: auction.auction_end,
            serverClockOffsetMs: serverClockOffsetMs.current,
          }))
        } else {
          setAuctionTimeRemaining(0)
        }
      } catch (error) {
        log.error('Error loading current auction:', error)
      }
    }

    loadCurrentAuction()
  }, [isAuctionDraft, roomCode, currentTurn, draftStatus])

  // Price, bidder, status, new nominations and time extensions are live server
  // state. Subscribe to the auction row itself so every participant sees the
  // same headline values without reloading.
  useEffect(() => {
    if (!isAuctionDraft || !roomCode || !supabase) return
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    const subscribe = async () => {
      try {
        const draft = await DraftService.getDraftState(roomCode.toLowerCase())
        if (!draft || cancelled || !supabase) return

        channel = supabase
          .channel(`auction-live:${draft.draft.id}`, { config: { private: true } })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'auctions',
            filter: `draft_id=eq.${draft.draft.id}`,
          }, (payload) => {
            if (payload.eventType === 'DELETE') {
              const deleted = payload.old as Partial<AuctionState>
              setCurrentAuction((current) => current?.id === deleted.id ? null : current)
              return
            }
            const nextAuction = payload.new as AuctionState
            setCurrentAuction(nextAuction)
            if (nextAuction.status !== 'active') {
              setTimeout(() => {
                setCurrentAuction((current) => current?.id === nextAuction.id ? null : current)
              }, 3000)
            }
          })
          .subscribe()
      } catch (error) {
        log.warn('Could not subscribe to live auction state', error)
      }
    }

    subscribe()
    return () => {
      cancelled = true
      if (channel && supabase) supabase.removeChannel(channel)
    }
  }, [isAuctionDraft, roomCode])

  useEffect(() => {
    if (!isAuctionDraft || currentAuction?.status !== 'active') {
      setAuctionTimeRemaining(0)
      return
    }

    let cancelled = false
    const update = () => setAuctionTimeRemaining(calculateDeadlineTimeRemaining({
      deadline: currentAuction.auction_end,
      serverClockOffsetMs: serverClockOffsetMs.current,
    }))
    const syncClock = async () => {
      try {
        const startedAt = Date.now()
        const result = await DraftService.getServerTime(roomCode)
        const receivedAt = Date.now()
        if (!cancelled) {
          serverClockOffsetMs.current = estimateServerClockOffset(startedAt, receivedAt, result.serverTime)
          update()
        }
      } catch (error) {
        log.warn('Auction clock sync failed; using device clock as fallback', error)
      }
    }

    update()
    syncClock()
    const interval = setInterval(update, 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [currentAuction?.auction_end, currentAuction?.status, isAuctionDraft, roomCode])

  // Calculate current nominating team for auction drafts
  const currentNominatingTeam = useMemo(() => {
    if (!isAuctionDraft || !teams.length || currentAuction) return null

    const currentNominatorIndex = (Math.max(currentTurn ?? 1, 1) - 1) % teams.length
    const sortedTeams = [...teams].sort((a, b) => a.draftOrder - b.draftOrder)

    return sortedTeams[currentNominatorIndex] || null
  }, [isAuctionDraft, teams, currentAuction, currentTurn])

  const canNominate = useMemo(() => {
    if (!isAuctionDraft || currentAuction || draftStatus !== 'drafting') return false
    if (!currentNominatingTeam || !userTeam) return false
    return currentNominatingTeam.id === userTeam.id
  }, [isAuctionDraft, currentAuction, draftStatus, currentNominatingTeam, userTeam])

  const nominationUserTeam = useMemo(() => {
    if (!userTeam) return null
    return {
      id: userTeam.id,
      name: userTeam.name,
      budgetRemaining: userTeam.budgetRemaining,
    }
  }, [userTeam])

  const nominationCurrentTeam = useMemo(() => {
    if (!currentNominatingTeam) return null
    return {
      id: currentNominatingTeam.id,
      name: currentNominatingTeam.name,
      draftOrder: currentNominatingTeam.draftOrder,
    }
  }, [currentNominatingTeam])

  const handleNominatePokemon = useCallback(async (pokemon: Pokemon, startingBid: number, duration: number) => {
    try {
      await DraftService.nominatePokemon(
        roomCode.toLowerCase(),
        userId,
        pokemon.id,
        pokemon.name,
        startingBid,
        duration
      )
      setCurrentAuction(await DraftService.getCurrentAuction(roomCode.toLowerCase()))
      notify.success('Auction Started!', `${pokemon.name} has been nominated for auction`, { duration: 3000 })
      setSelectedPokemon(null)
    } catch (err) {
      log.error('Error nominating Pokemon:', err)
      notify.error('Nomination Failed', err instanceof Error ? err.message : 'Failed to nominate Pokemon', { duration: 5000 })
    }
  }, [roomCode, userId, setSelectedPokemon])

  const handlePlaceBid = useCallback(async (amount: number) => {
    if (!currentAuction) return

    try {
      await DraftService.placeBid(roomCode.toLowerCase(), userId, currentAuction.id, amount)
      setCurrentAuction(await DraftService.getCurrentAuction(roomCode.toLowerCase()))
      notify.success('Bid Placed!', `You bid $${amount} on ${currentAuction.pokemon_name}`, { duration: 2000 })
    } catch (err) {
      log.error('Error placing bid:', err)
      notify.error('Bid Failed', err instanceof Error ? err.message : 'Failed to place bid')
    }
  }, [currentAuction, roomCode, userId])

  const handleAuctionTimeExpired = useCallback(async () => {
    if (!currentAuction) return

    try {
      await DraftService.resolveAuction(roomCode.toLowerCase(), currentAuction.id)
      notify.info('Auction Ended', `Auction for ${currentAuction.pokemon_name} has concluded`, { duration: 3000 })
    } catch (err) {
      log.error('Error resolving auction:', err)
    }
  }, [currentAuction, roomCode])

  const handleExtendAuctionTime = useCallback(async (seconds: number) => {
    if (!currentAuction) return

    try {
      await DraftService.extendAuctionTime(roomCode.toLowerCase(), currentAuction.id, seconds)
      setCurrentAuction(await DraftService.getCurrentAuction(roomCode.toLowerCase()))
      notify.info('Auction Extended', `Added ${seconds} seconds to the auction`, { duration: 2000 })
    } catch (err) {
      log.error('Error extending auction:', err)
    }
  }, [currentAuction, roomCode])

  return {
    currentAuction,
    auctionTimeRemaining,
    canNominate,
    nominationUserTeam,
    nominationCurrentTeam,
    currentNominatingTeam,
    handleNominatePokemon,
    handlePlaceBid,
    handleAuctionTimeExpired,
    handleExtendAuctionTime,
  }
}
