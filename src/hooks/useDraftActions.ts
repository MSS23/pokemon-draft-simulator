import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pokemon } from '@/types'
import { DraftService, type DraftState as DBDraftState } from '@/lib/draft-service'
import { UserSessionService } from '@/lib/user-session'
import { notify } from '@/lib/notifications'
import { useLatest } from '@/hooks/useLatest'
import { useDraftStore } from '@/stores/draftStore'
import { isPickSafe } from '@/utils/budget-feasibility'
import { getPokemonTier } from '@/lib/tier-utils'
import { createLogger } from '@/lib/logger'

const log = createLogger('useDraftActions')

interface DraftUIState {
  roomCode: string
  status: 'waiting' | 'drafting' | 'completed' | 'paused'
  currentTurn: number
  currentTeam: string
  userTeamId: string | null
  teams: Array<{
    id: string
    name: string
    userName: string
    draftOrder: number
    picks: string[]
    budgetRemaining: number
    pickCosts: number[]
  }>
  participants: Array<{
    userId: string | null
    team_id: string | null
    display_name: string
    last_seen: string
    is_admin?: boolean
    is_host?: boolean
  }>
  draftSettings: {
    maxTeams: number
    timeLimit: number
    pokemonPerTeam: number
    draftType: 'tiered' | 'points' | 'auction'
    formatId?: string
    customFormatId?: string
    scoringSystem?: 'budget' | 'tiered'
    tierConfig?: { tiers: import('@/types').TierDefinition[] }
  }
  timeRemaining: number
  draft: {
    id: string
    custom_format_id?: string
    turn_started_at?: string
    status: string
  }
}

export interface DraftActionsResult {
  handleDraftPokemon: (pokemon: Pokemon) => Promise<void>
  handleInitiateDraft: (pokemon: Pokemon) => void
  handleViewDetails: (pokemon: Pokemon) => void
  handleSetPreDraft: (pokemon: Pokemon) => void
  handleClearPreDraft: () => void
  startDraft: () => Promise<void>
  handlePauseDraft: () => Promise<void>
  handleResumeDraft: () => Promise<void>
  handleEndDraft: () => Promise<void>
  handleResetDraft: () => Promise<void>
  handleDeleteDraft: () => Promise<void>
  handleShuffleDraftOrder: () => Promise<void>
  handleAdvanceTurn: () => Promise<void>
  handleRemoveTeam: (teamId: string) => Promise<void>
  handleSetTimer: (seconds: number) => Promise<void>
  handleUndoLastPick: () => Promise<void>
  handlePingCurrentPlayer: () => Promise<void>
  handleViewResults: () => void
  handleJoinFromLink: () => Promise<void>
  handleAddToWishlist: (pokemon: Pokemon) => Promise<void>
  handleRemoveFromWishlist: (pokemon: Pokemon) => Promise<void>
  copyRoomCode: () => void
  shareRoom: () => void
  handleRequestNotificationPermission: () => void
  noopCallback: () => Promise<void>
  // UI state exposed for page
  isDrafting: boolean
  isShuffling: boolean
  isStarting: boolean
  showOrderReveal: boolean
  setShowOrderReveal: (v: boolean) => void
  selectedPokemon: Pokemon | null
  setSelectedPokemon: (p: Pokemon | null) => void
  detailsPokemon: Pokemon | null
  isDetailsOpen: boolean
  setIsDetailsOpen: (v: boolean) => void
  confirmationPokemon: Pokemon | null
  isConfirmationOpen: boolean
  setIsConfirmationOpen: (v: boolean) => void
  preDraftPokemonId: string | null
  joinTeamName: string
  setJoinTeamName: (v: string) => void
  /** Ref for suppressing realtime refreshes during pick */
  pickInFlightRef: React.MutableRefObject<boolean>
}

interface UseDraftActionsParams {
  draftState: DraftUIState | null
  setDraftState: React.Dispatch<React.SetStateAction<DraftUIState | null>>
  userId: string
  roomCode: string
  isHost: boolean
  isSpectator: boolean
  isUserTurn: boolean
  isAuctionDraft: boolean
  userTeam: DraftUIState['teams'][number] | null
  currentTeam: DraftUIState['teams'][number] | null
  budgetFeasibility: { maxAffordableCost: number; remainingSlots: number } | null
  availablePokemon: Pokemon[]
  shouldShowNotification: (key: string, dedupWindowMs?: number) => boolean
  transformDraftState: (dbState: DBDraftState, currentUserId: string) => DraftUIState
  requestBrowserNotificationPermission: () => void
  authUser: { id: string } | null
}

export function useDraftActions({
  draftState,
  setDraftState,
  userId,
  roomCode,
  isHost: _isHost,
  isSpectator,
  isUserTurn,
  isAuctionDraft: _isAuctionDraft,
  userTeam,
  currentTeam,
  budgetFeasibility,
  availablePokemon,
  shouldShowNotification,
  transformDraftState,
  requestBrowserNotificationPermission,
  authUser,
}: UseDraftActionsParams): DraftActionsResult {
  const router = useRouter()

  const [selectedPokemon, setSelectedPokemon] = useState<Pokemon | null>(null)
  const [detailsPokemon, setDetailsPokemon] = useState<Pokemon | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [confirmationPokemon, setConfirmationPokemon] = useState<Pokemon | null>(null)
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [isShuffling, setIsShuffling] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [showOrderReveal, setShowOrderReveal] = useState(false)
  const [preDraftPokemonId, setPreDraftPokemonId] = useState<string | null>(null)
  const [joinTeamName, setJoinTeamName] = useState('')

  const pickInFlightRef = useRef(false)

  // Show draft order reveal when transitioning to drafting
  const prevStatusRef = useRef<string | null>(null)
  useEffect(() => {
    const currentStatus = draftState?.status
    if (prevStatusRef.current === 'waiting' && currentStatus === 'drafting') {
      setShowOrderReveal(true)
    }
    prevStatusRef.current = currentStatus || null
  }, [draftState?.status])

  // Stable ref for draftState to avoid callback recreation
  const draftStateRef = useRef(draftState)
  const userIdRef = useLatest(userId)
  const isSpectatorRef = useLatest(isSpectator)
  const notifyRef = useLatest(notify)

  useEffect(() => {
    draftStateRef.current = draftState
  }, [draftState])

  // Stable handleViewDetails
  const handleViewDetails = useCallback((pokemon: Pokemon) => {
    setDetailsPokemon(pokemon)
    setIsDetailsOpen(true)
  }, [])

  // handleAddToWishlist
  const handleAddToWishlist = useCallback(async (pokemon: Pokemon) => {
    const currentDraftState = draftStateRef.current
    const currentUserId = userIdRef.current
    const currentIsSpectator = isSpectatorRef.current
    const currentNotify = notifyRef.current

    if (!currentDraftState?.userTeamId || !currentUserId || currentIsSpectator) return

    const participant = currentDraftState.teams.find(t => t.id === currentDraftState.userTeamId)
    if (!participant) {
      currentNotify.warning('Cannot Add to Wishlist', 'You must be part of a team to use wishlist')
      return
    }

    const optimisticId = `optimistic-${Date.now()}`
    const existingItems = useDraftStore.getState().wishlistItemsByParticipantId[currentUserId] || []
    const maxPriority = existingItems.reduce((max, id) => {
      const item = useDraftStore.getState().wishlistItemsById[id]
      return item ? Math.max(max, item.priority) : max
    }, 0)
    useDraftStore.getState().addWishlistItem({
      id: optimisticId,
      draftId: roomCode.toLowerCase(),
      participantId: currentUserId,
      pokemonId: pokemon.id,
      pokemonName: pokemon.name,
      priority: maxPriority + 1,
      isAvailable: true,
      cost: pokemon.cost,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    try {
      const { WishlistService } = await import('@/lib/wishlist-service')
      await WishlistService.addToWishlist(roomCode.toLowerCase(), currentUserId, pokemon)
      currentNotify.success('Added to Wishlist', `${pokemon.name} added to your wishlist`, { duration: 2000 })
    } catch (error) {
      useDraftStore.getState().removeWishlistItem(optimisticId)
      log.error('Error adding to wishlist:', error)
      currentNotify.error('Failed to Add', 'Could not add Pokémon to wishlist')
    }
  }, [roomCode, draftStateRef, userIdRef, isSpectatorRef, notifyRef])

  // handleRemoveFromWishlist
  const handleRemoveFromWishlist = useCallback(async (pokemon: Pokemon) => {
    const currentDraftState = draftStateRef.current
    const currentUserId = userIdRef.current
    const currentIsSpectator = isSpectatorRef.current
    const currentNotify = notifyRef.current

    if (!currentDraftState?.userTeamId || !currentUserId || currentIsSpectator) return

    const itemIds = useDraftStore.getState().wishlistItemsByParticipantId[currentUserId] || []
    const itemToRemove = itemIds.find(id => {
      const item = useDraftStore.getState().wishlistItemsById[id]
      return item && item.pokemonId === pokemon.id
    })
    let removedItem: import('@/types').WishlistItem | null = null
    if (itemToRemove) {
      removedItem = useDraftStore.getState().wishlistItemsById[itemToRemove] || null
      useDraftStore.getState().removeWishlistItem(itemToRemove)
    }

    try {
      const { WishlistService } = await import('@/lib/wishlist-service')
      await WishlistService.removeFromWishlist(roomCode.toLowerCase(), currentUserId, pokemon.id)
      currentNotify.success('Removed from Wishlist', `${pokemon.name} removed from your wishlist`, { duration: 2000 })
    } catch (error) {
      if (removedItem) {
        useDraftStore.getState().addWishlistItem(removedItem)
      }
      log.error('Error removing from wishlist:', error)
      currentNotify.error('Failed to Remove', 'Could not remove Pokémon from wishlist')
    }
  }, [roomCode, draftStateRef, userIdRef, isSpectatorRef, notifyRef])

  // handleInitiateDraft - show confirmation modal
  const handleInitiateDraft = useCallback((pokemon: Pokemon) => {
    const isTieredDraft = draftState?.draftSettings?.scoringSystem === 'tiered'

    if (isTieredDraft) {
      const tierConfig = draftState?.draftSettings?.tierConfig
      if (tierConfig) {
        const tier = getPokemonTier(pokemon.cost, tierConfig.tiers)
        const tierCost = tier ? tier.cost : null
        const budget = userTeam?.budgetRemaining ?? 0
        if (!tier || tierCost === null) {
          notify.error('Unknown Tier', `${pokemon.name} doesn't fit any tier in your configuration.`, { duration: 5000 })
          return
        }
        if (budget < tierCost) {
          notify.error(
            'Not Enough Budget',
            `${tier.label} costs ${tierCost} pts. You have ${budget} pts remaining.`,
            { duration: 5000 }
          )
          return
        }
      }
    } else {
      if (budgetFeasibility && !isPickSafe(
        pokemon.cost,
        userTeam?.budgetRemaining ?? 0,
        budgetFeasibility.remainingSlots,
        availablePokemon.map(p => p.cost).sort((a, b) => a - b)
      )) {
        const minReserve = (userTeam?.budgetRemaining ?? 0) - budgetFeasibility.maxAffordableCost
        notify.error(
          'Pick Blocked',
          `${pokemon.name} (${pokemon.cost} pts) would leave you unable to fill your remaining ${budgetFeasibility.remainingSlots} slots. Max you can spend: ${budgetFeasibility.maxAffordableCost} pts (need ${minReserve} reserved).`,
          { duration: 6000 }
        )
        return
      }
    }

    setConfirmationPokemon(pokemon)
    setIsConfirmationOpen(true)
    setIsDetailsOpen(false)
  }, [budgetFeasibility, userTeam?.budgetRemaining, availablePokemon, draftState?.draftSettings?.scoringSystem, draftState?.draftSettings?.tierConfig])

  // handleDraftPokemon
  const handleDraftPokemon = useCallback(async (pokemon: Pokemon) => {
    const canDraft = isUserTurn && draftState?.status === 'drafting'
    if (!canDraft) {
      if (draftState?.status !== 'drafting') {
        notify.warning('Draft Not Active', 'The draft is not currently active')
      } else if (!isUserTurn) {
        notify.warning('Not Your Turn', `Please wait for your turn. ${currentTeam?.name} is currently picking.`)
      }
      return
    }

    if (isDrafting) return
    setIsDrafting(true)
    pickInFlightRef.current = true

    const targetTeam = userTeam
    const targetUserId = userId
    if (!targetTeam) { setIsDrafting(false); pickInFlightRef.current = false; return }

    // Optimistic update
    const previousState = draftState
    if (draftState) {
      const optimisticTeams = draftState.teams.map(t =>
        t.id === targetTeam.id
          ? { ...t, picks: [...t.picks, pokemon.id], budgetRemaining: t.budgetRemaining - (pokemon.cost || 1) }
          : t
      )
      const nextTurn = draftState.currentTurn + 1

      let nextTeamId = draftState.currentTeam
      const totalTeams = draftState.teams.length
      const maxRounds = draftState.draftSettings?.pokemonPerTeam || 10
      if (totalTeams > 0) {
        const draftOrder: number[] = []
        for (let round = 0; round < maxRounds; round++) {
          if (round % 2 === 0) {
            for (let i = 1; i <= totalTeams; i++) draftOrder.push(i)
          } else {
            for (let i = totalTeams; i >= 1; i--) draftOrder.push(i)
          }
        }
        if (nextTurn <= draftOrder.length) {
          const nextTeamOrder = draftOrder[nextTurn - 1]
          const nextTeam = draftState.teams.find(t => t.draftOrder === nextTeamOrder)
          nextTeamId = nextTeam?.id || nextTeamId
        }
      }

      setDraftState({
        ...draftState,
        teams: optimisticTeams,
        currentTurn: nextTurn,
        currentTeam: nextTeamId,
      })
    }

    // Mark Pokemon as drafted in wishlists (fire-and-forget)
    import('@/lib/wishlist-service').then(({ WishlistService }) => {
      WishlistService.markPokemonDrafted(roomCode.toLowerCase(), pokemon.id)
    }).catch(() => {})

    try {
      const pickCost = pokemon.cost || 1
      if (!pokemon.cost) {
        log.warn(`Pokemon "${pokemon.name}" (id: ${pokemon.id}) has no cost data. Using minimum cost of 1.`)
      }

      await DraftService.makePick(roomCode.toLowerCase(), targetUserId, pokemon.id, pokemon.name, pickCost)

      await new Promise(resolve => setTimeout(resolve, 400))

      try {
        DraftService.invalidateDraftStateCache(roomCode.toLowerCase())
        const freshState = await DraftService.getDraftState(roomCode.toLowerCase())
        if (freshState) {
          setDraftState(transformDraftState(freshState, userId))
        }
      } catch (refreshErr) {
        log.warn('Failed to refresh state after pick:', refreshErr)
      }
      pickInFlightRef.current = false

      notify.success(`${pokemon.name} Drafted!`, `Successfully added ${pokemon.name} to ${targetTeam.name}`, { duration: 3000 })

      setSelectedPokemon(null)
      setIsDetailsOpen(false)
      setPreDraftPokemonId(null)
    } catch (err) {
      log.error('Error making pick:', err)

      if (previousState) {
        setDraftState(previousState)
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to make pick'
      const errorKey = `pick-error-${errorMessage.substring(0, 50)}`

      if (!shouldShowNotification(errorKey, 3000)) {
        setIsDrafting(false)
        return
      }

      try {
        DraftService.invalidateDraftStateCache(roomCode.toLowerCase())
        const freshState = await DraftService.getDraftState(roomCode.toLowerCase())
        if (freshState) {
          setDraftState(transformDraftState(freshState, userId))
        }
      } catch (refreshErr) {
        log.warn('Failed to refresh state after pick error:', refreshErr)
      }

      if (errorMessage.includes('not part of this draft') || errorMessage.includes('not found')) {
        notify.error('Session Error', 'Your session may have expired. Please refresh the page and rejoin the draft.', { duration: 8000 })
      } else if (errorMessage.includes('not your turn')) {
        notify.warning('Turn Changed', 'The turn has advanced. Refreshing your view...', { duration: 3000 })
      } else if (errorMessage.includes('Insufficient budget')) {
        notify.error('Insufficient Budget', errorMessage, { duration: 5000 })
      } else if (errorMessage.includes('not legal in this format')) {
        notify.error('Invalid Pokemon', errorMessage, { duration: 5000 })
      } else if (errorMessage.includes('maximum number')) {
        notify.error('Team Full', errorMessage, { duration: 5000 })
      } else {
        notify.error('Draft Failed', errorMessage, { duration: 5000 })
      }
    } finally {
      setIsDrafting(false)
      pickInFlightRef.current = false
    }
  }, [isUserTurn, draftState, currentTeam, userTeam, userId, roomCode, shouldShowNotification, transformDraftState, isDrafting, setDraftState])

  const handleSetPreDraft = useCallback((pokemon: Pokemon) => {
    const state = draftStateRef.current
    if (!state?.userTeamId || isSpectator) return
    if (state.status !== 'drafting' || state.userTeamId === state.currentTeam) return
    setPreDraftPokemonId(prev => prev === pokemon.id ? null : pokemon.id)
  }, [isSpectator])

  const handleClearPreDraft = useCallback(() => {
    setPreDraftPokemonId(null)
  }, [])

  const copyRoomCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode)
    notify.success('Room Code Copied!', `${roomCode} copied to clipboard`)
  }, [roomCode])

  const shareRoom = useCallback(() => {
    const shareUrl = `${window.location.origin}/join-draft?code=${roomCode}`
    navigator.clipboard.writeText(shareUrl)
    notify.success('Share Link Copied!', 'Invite link copied to clipboard')
  }, [roomCode])

  const startDraft = useCallback(async () => {
    if (!draftState || !draftState.teams || draftState.teams.length < 2) {
      notify.warning('Cannot Start Draft', 'Need at least 2 teams to start the draft')
      return
    }

    if (isStarting) return

    setIsStarting(true)
    try {
      await DraftService.startDraft(roomCode.toLowerCase())
      setShowOrderReveal(true)
      setTimeout(() => { setIsStarting(false) }, 1000)
    } catch (err) {
      log.error('Error starting draft:', err)
      notify.error('Failed to Start Draft', err instanceof Error ? err.message : 'Failed to start draft. Please try again.')
      setIsStarting(false)
    }
  }, [draftState, roomCode, isStarting])

  const handlePauseDraft = useCallback(async () => {
    try {
      await DraftService.pauseDraft(roomCode.toLowerCase())
    } catch (err) {
      log.error('Error pausing draft:', err)
      notify.error('Failed to Pause', err instanceof Error ? err.message : 'Failed to pause draft')
    }
  }, [roomCode])

  const handleResumeDraft = useCallback(async () => {
    try {
      await DraftService.unpauseDraft(roomCode.toLowerCase())
    } catch (err) {
      log.error('Error resuming draft:', err)
      notify.error('Failed to Resume', err instanceof Error ? err.message : 'Failed to resume draft')
    }
  }, [roomCode])

  const handleEndDraft = useCallback(async () => {
    try {
      await DraftService.endDraft(roomCode.toLowerCase())
    } catch (err) {
      log.error('Error ending draft:', err)
      notify.error('Failed to End Draft', err instanceof Error ? err.message : 'Failed to end draft')
    }
  }, [roomCode])

  const handleResetDraft = useCallback(async () => {
    try {
      await DraftService.resetDraft(roomCode.toLowerCase())
      notify.success('Draft Reset', 'All picks have been cleared. Teams remain intact.')
      router.refresh()
    } catch (err) {
      log.error('Error resetting draft:', err)
      notify.error('Failed to Reset Draft', err instanceof Error ? err.message : 'Failed to reset draft')
    }
  }, [roomCode, router])

  const handleDeleteDraft = useCallback(async () => {
    try {
      await DraftService.deleteDraft(roomCode.toLowerCase(), userId)
      UserSessionService.removeDraftParticipation(roomCode.toLowerCase())
      notify.success('Draft Deleted', 'The draft has been deleted. All participants have been notified.')
      setTimeout(() => { router.push('/my-drafts') }, 1500)
    } catch (err) {
      log.error('Error deleting draft:', err)
      notify.error('Failed to Delete Draft', err instanceof Error ? err.message : 'Failed to delete draft')
    }
  }, [roomCode, userId, router])

  const handleShuffleDraftOrder = useCallback(async () => {
    if (isShuffling) return

    try {
      setIsShuffling(true)
      await DraftService.shuffleDraftOrder(roomCode.toLowerCase())

      const updatedState = await DraftService.getDraftState(roomCode.toLowerCase())
      if (updatedState) {
        const newState = transformDraftState(updatedState, userId)
        setDraftState(prev => prev === newState ? prev : newState)
      }

      notify.success('Draft Order Shuffled!', 'Team draft order has been randomized. Check the Draft Order section.')
    } catch (err) {
      log.error('Error shuffling draft order:', err)
      notify.error('Failed to Shuffle', err instanceof Error ? err.message : 'Failed to shuffle draft order')
    } finally {
      setIsShuffling(false)
    }
  }, [roomCode, userId, transformDraftState, isShuffling, setDraftState])

  const handleAdvanceTurn = useCallback(async () => {
    try {
      await DraftService.advanceTurn(roomCode.toLowerCase())
    } catch (err) {
      log.error('Error advancing turn:', err)
      notify.error('Failed to Advance Turn', err instanceof Error ? err.message : 'Failed to advance turn')
    }
  }, [roomCode])

  const handleViewResults = useCallback(() => {
    router.push(`/draft/${roomCode}/results`)
  }, [roomCode, router])

  const handleRemoveTeam = useCallback(async (teamId: string) => {
    try {
      await DraftService.removeTeam(roomCode.toLowerCase(), teamId)
      notify.success('Team Removed', 'The team has been removed from the draft')
    } catch (err) {
      log.error('Error removing team:', err)
      notify.error('Failed to Remove Team', err instanceof Error ? err.message : 'Failed to remove team')
    }
  }, [roomCode])

  const handleSetTimer = useCallback(async (seconds: number) => {
    try {
      const isActive = draftState?.status === 'drafting'
      await DraftService.updateTimerSetting(roomCode.toLowerCase(), seconds)
      if (isActive) {
        notify.info('Timer Updated', `Turn timer will be set to ${seconds} seconds after the current pick completes`)
      } else {
        notify.success('Timer Updated', `Turn timer set to ${seconds} seconds`)
      }
    } catch (err) {
      log.error('Error updating timer:', err)
      notify.error('Failed to Update Timer', err instanceof Error ? err.message : 'Failed to update timer')
    }
  }, [roomCode, draftState?.status])

  const handleUndoLastPick = useCallback(async () => {
    if (!roomCode || !draftState) return

    try {
      await DraftService.undoLastPick(roomCode.toLowerCase(), userId)
      notify.success('Pick Undone', 'The last pick has been removed', { duration: 3000 })
    } catch (err) {
      log.error('Error undoing pick:', err)
      notify.error('Undo Failed', err instanceof Error ? err.message : 'Failed to undo pick', { duration: 5000 })
    }
  }, [roomCode, draftState, userId])

  const lastPingTimeRef = useRef(0)
  const handlePingCurrentPlayer = useCallback(async () => {
    const now = Date.now()
    if (now - lastPingTimeRef.current < 5000) {
      notify.warning('Slow Down', 'Please wait a few seconds between pings')
      return
    }
    lastPingTimeRef.current = now

    try {
      const { supabase } = await import('@/lib/supabase')
      if (!supabase) return

      await supabase.channel(`ping:${roomCode.toLowerCase()}`).send({
        type: 'broadcast',
        event: 'ping_player',
        payload: { from: userId, timestamp: now }
      })

      const team = draftState?.teams.find(t => t.id === draftState?.currentTeam)
      notify.info('Ping Sent', `Notified ${team?.userName || 'current player'}`)
    } catch (err) {
      log.error('Error pinging player:', err)
    }
  }, [roomCode, userId, draftState?.teams, draftState?.currentTeam])

  const handleJoinFromLink = useCallback(async () => {
    if (!authUser?.id || !joinTeamName.trim()) return
    try {
      const { grantDraftAccess } = await import('@/lib/draft-access')
      grantDraftAccess(roomCode, false)
      await DraftService.joinDraft({
        roomCode: roomCode.toLowerCase(),
        userId: authUser.id,
        teamName: joinTeamName.trim(),
      })
      DraftService.invalidateDraftStateCache(roomCode.toLowerCase())
      const dbState = await DraftService.getDraftState(roomCode.toLowerCase())
      if (dbState) {
        setDraftState(transformDraftState(dbState, authUser.id))
      }
      notify.success('Joined!', `You've joined as ${joinTeamName.trim()}`)
    } catch (err) {
      log.error('Error joining from link:', err)
      notify.error('Failed to Join', err instanceof Error ? err.message : 'Could not join draft')
    }
  }, [authUser?.id, joinTeamName, roomCode, transformDraftState, setDraftState])

  const handleRequestNotificationPermission = useCallback(() => {
    requestBrowserNotificationPermission()
  }, [requestBrowserNotificationPermission])

  const noopCallback = useCallback(async () => {}, [])

  return {
    handleDraftPokemon,
    handleInitiateDraft,
    handleViewDetails,
    handleSetPreDraft,
    handleClearPreDraft,
    startDraft,
    handlePauseDraft,
    handleResumeDraft,
    handleEndDraft,
    handleResetDraft,
    handleDeleteDraft,
    handleShuffleDraftOrder,
    handleAdvanceTurn,
    handleRemoveTeam,
    handleSetTimer,
    handleUndoLastPick,
    handlePingCurrentPlayer,
    handleViewResults,
    handleJoinFromLink,
    handleAddToWishlist,
    handleRemoveFromWishlist,
    copyRoomCode,
    shareRoom,
    handleRequestNotificationPermission,
    noopCallback,
    isDrafting,
    isShuffling,
    isStarting,
    showOrderReveal,
    setShowOrderReveal,
    selectedPokemon,
    setSelectedPokemon,
    detailsPokemon,
    isDetailsOpen,
    setIsDetailsOpen,
    confirmationPokemon,
    isConfirmationOpen,
    setIsConfirmationOpen,
    preDraftPokemonId,
    joinTeamName,
    setJoinTeamName,
    pickInFlightRef,
  }
}
