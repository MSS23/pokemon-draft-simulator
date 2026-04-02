'use client'

/**
 * Draft Room Page - Multi-user real-time Pokemon drafting
 * Cache bust: 2025-10-14-v3-fix-infinite-loop
 *
 * Hooks extracted into focused modules:
 * - useDraftSession: userId resolution, auth state
 * - useDraftActions: all draft action callbacks + UI state
 * - useDraftAuction: auction-specific state and callbacks
 * - useDraftTimers: pick timer, auto-skip logic
 * - useDraftActivity: activity feed, sidebar, notification dedup
 */

import { useState, useEffect, useCallback, useMemo, useRef, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { usePokemonListByFormat } from '@/hooks/usePokemon'
import { Pokemon } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Copy, Share2, History, Crown, Clock, CheckCircle2, Eye } from 'lucide-react'
import { DraftService, type DraftState as DBDraftState } from '@/lib/draft-service'
import { UserSessionService } from '@/lib/user-session'
import { notify } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { DraftRoomLoading, TeamStatusSkeleton } from '@/components/ui/loading-states'
import { EnhancedErrorBoundary } from '@/components/ui/enhanced-error-boundary'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useDraftRealtime } from '@/hooks/useDraftRealtime'
import { DraftConnectionStatusBadge } from '@/components/draft/ConnectionStatus'
import { getMaxAffordableCost } from '@/utils/budget-feasibility'
import { useDraftSession } from '@/hooks/useDraftSession'
import { useDraftActions } from '@/hooks/useDraftActions'
import { useDraftAuction } from '@/hooks/useDraftAuction'
import { useDraftTimers } from '@/hooks/useDraftTimers'
import { useDraftActivity } from '@/hooks/useDraftActivity'

// Critical components - load immediately
import PokemonGrid from '@/components/pokemon/PokemonGrid'
import TeamRoster from '@/components/team/TeamRoster'
import DraftProgress from '@/components/team/DraftProgress'
import PokemonDetailsModal from '@/components/pokemon/PokemonDetailsModal'
import DraftActivitySidebar from '@/components/draft/DraftActivitySidebar'
import { AuthModal } from '@/components/auth/AuthModal'
import SoundToggle from '@/components/draft/SoundToggle'
import { DraftTour } from '@/components/draft/DraftTour'
import { NotificationPrompt } from '@/components/draft/NotificationPrompt'
import { createLogger } from '@/lib/logger'
import { useDraftStore } from '@/stores/draftStore'
import { draftSounds } from '@/lib/draft-sounds'

const log = createLogger('DraftPage')

// Heavy components - lazy load with loading states
const DraftConfirmationModal = dynamic(() => import('@/components/draft/DraftConfirmationModal'), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted rounded-lg animate-pulse" />
})

const DraftControls = dynamic(() => import('@/components/draft/DraftControls'), {
  ssr: false,
  loading: () => <div className="h-20 bg-muted rounded-lg animate-pulse" />
})

const DraftResults = dynamic(() => import('@/components/draft/DraftResults'), {
  ssr: false,
  loading: () => <div className="h-screen bg-muted animate-pulse" />
})

const AuctionBiddingInterface = dynamic(() => import('@/components/draft/AuctionBiddingInterface'), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted rounded-lg animate-pulse" />
})

const AuctionTimer = dynamic(() => import('@/components/draft/AuctionTimer'), {
  ssr: false,
  loading: () => <div className="h-32 bg-muted rounded-lg animate-pulse" />
})

const AuctionNomination = dynamic(() => import('@/components/draft/AuctionNomination'), {
  ssr: false,
  loading: () => <div className="h-40 bg-muted rounded-lg animate-pulse" />
})

const SpectatorMode = dynamic(() => import('@/components/draft/SpectatorMode'), {
  ssr: false,
  loading: () => <div className="h-96 bg-muted rounded-lg animate-pulse" />
})

const AuctionNotifications = dynamic(() => import('@/components/draft/AuctionNotifications'), {
  ssr: false
})

const WishlistManager = dynamic(() => import('@/components/draft/WishlistManager'), { ssr: false })

const DraftOrderReveal = dynamic(() => import('@/components/draft/DraftOrderReveal'), { ssr: false })

const ConfettiCelebration = dynamic(() => import('@/components/draft/ConfettiCelebration'), { ssr: false })

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

// Stable empty array to prevent infinite re-renders (React #185)
const EMPTY_ARRAY: never[] = []

type MobileTab = 'pokemon' | 'team' | 'board'

export default function DraftRoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomCode = (params.id as string)?.toUpperCase()
  const userName = searchParams.get('userName') || ''
  const isHostParam = searchParams.get('isHost') === 'true'
  const isSpectatorParam = searchParams.get('spectator') === 'true'

  // Mobile tab state
  const [activeTab, setActiveTab] = useState<MobileTab>('pokemon')

  // Real draft state from Supabase
  const [draftState, setDraftState] = useState<DraftUIState | null>(null)
  const [, startTransition] = useTransition()
  const [error, setError] = useState('')

  // --- Session hook ---
  const {
    userId,
    isHost,
    isSpectator,
    isAdmin,
    showJoinAuthModal,
    setShowJoinAuthModal,
    authUser,
  } = useDraftSession({
    roomCode,
    isHostParam,
    isSpectatorParam,
    participants: draftState?.participants,
  })

  // --- Derived state ---
  const userTeam = useMemo(() => {
    if (!draftState?.teams || !draftState.userTeamId) return null
    return draftState.teams.find(t => t.id === draftState.userTeamId) || null
  }, [draftState?.userTeamId, draftState?.teams])

  const currentTeam = useMemo(() => {
    if (!draftState?.teams || !draftState.currentTeam) return null
    return draftState.teams.find(t => t.id === draftState.currentTeam) || null
  }, [draftState?.currentTeam, draftState?.teams])

  const isUserTurn = useMemo(() =>
    draftState?.userTeamId === draftState?.currentTeam,
    [draftState?.userTeamId, draftState?.currentTeam]
  )

  const isAuctionDraft = useMemo(() =>
    draftState?.draftSettings?.draftType === 'auction',
    [draftState?.draftSettings?.draftType]
  )

  const allDraftedIds = useMemo(() => {
    if (!draftState?.teams) return EMPTY_ARRAY
    return draftState.teams.flatMap(team => team.picks)
  }, [draftState?.teams])

  const draftedByTeamMap = useMemo(() => {
    if (!draftState?.teams) return {}
    const map: Record<string, string> = {}
    draftState.teams.forEach(team => {
      team.picks.forEach(pokemonId => { map[pokemonId] = team.name })
    })
    return map
  }, [draftState?.teams])

  // --- Pokemon data ---
  const formatId = draftState?.draftSettings?.formatId
  const customFormatId = draftState?.draft?.custom_format_id
  const { data: pokemon, isLoading: pokemonLoading } = usePokemonListByFormat(
    formatId === 'custom' ? undefined : formatId,
    customFormatId,
    true
  )

  const legalPokemon = useMemo(() => {
    if (!pokemon) return EMPTY_ARRAY
    return pokemon.filter(p => p.isLegal)
  }, [pokemon])

  const availablePokemon = useMemo(() => {
    return pokemon?.filter(p => p.isLegal && !allDraftedIds.includes(p.id)) || []
  }, [pokemon, allDraftedIds])

  // Budget feasibility
  const budgetFeasibility = useMemo(() => {
    if (!userTeam || !draftState?.draftSettings) return null
    const maxPokemon = draftState.draftSettings.pokemonPerTeam || 6
    const remainingSlots = maxPokemon - (userTeam.picks.length || 0)
    if (remainingSlots <= 0) return null

    const availableCosts = availablePokemon
      .map(p => p.cost)
      .sort((a, b) => a - b)

    if (availableCosts.length < remainingSlots) return null
    if (availableCosts.length === 0) return null

    const maxAffordable = getMaxAffordableCost(
      userTeam.budgetRemaining,
      remainingSlots,
      availableCosts
    )

    return { maxAffordableCost: maxAffordable, remainingSlots }
  }, [userTeam, availablePokemon, draftState?.draftSettings])

  // --- Transform DB state to UI state ---
  const prevTransformedStateRef = useRef<{ dbStateHash: string, uiState: DraftUIState } | null>(null)

  const transformDraftState = useCallback((dbState: DBDraftState, currentUserId: string): DraftUIState => {
    const pickIds = dbState.picks.map(p => p.id).sort().join(',')
    const teamBudgets = dbState.teams.map(t => `${t.id}:${t.budget_remaining}:${t.draft_order}`).sort().join(',')
    const participantList = dbState.participants.map(p => `${p.user_id}:${p.team_id}:${p.display_name}`).sort().join(',')
    const dbStateHash = `${dbState.draft.current_turn}|${dbState.draft.status}|${pickIds}|${teamBudgets}|${participantList}|${dbState.draft.turn_started_at || ''}`

    if (prevTransformedStateRef.current?.dbStateHash === dbStateHash) {
      return prevTransformedStateRef.current.uiState
    }

    const teams = dbState.teams.map(team => {
      const participant = dbState.participants.find(p => p.team_id === team.id)
      const teamPicks = dbState.picks
        .filter(pick => pick.team_id === team.id)
        .sort((a, b) => a.pick_order - b.pick_order)
        .map(pick => pick.pokemon_id)

      return {
        id: team.id,
        name: team.name,
        userName: participant?.display_name || 'Unknown',
        draftOrder: team.draft_order,
        picks: teamPicks,
        budgetRemaining: team.budget_remaining,
        pickCosts: dbState.picks
          .filter(pick => pick.team_id === team.id)
          .sort((a, b) => a.pick_order - b.pick_order)
          .map(pick => pick.cost)
      }
    }).sort((a, b) => a.draftOrder - b.draftOrder)

    const userParticipant = dbState.participants.find(p => p.user_id === currentUserId)
    const userTeamId = userParticipant?.team_id || null

    const currentTurn = dbState.draft.current_turn || 1
    const totalTeams = teams.length
    const maxRounds = dbState.draft.settings?.maxPokemonPerTeam || 10

    let currentTeamId = ''
    if (totalTeams > 0 && currentTurn) {
      const draftOrder: number[] = []
      for (let round = 0; round < maxRounds; round++) {
        if (round % 2 === 0) {
          for (let i = 1; i <= totalTeams; i++) draftOrder.push(i)
        } else {
          for (let i = totalTeams; i >= 1; i--) draftOrder.push(i)
        }
      }
      if (currentTurn <= draftOrder.length) {
        const currentTeamOrder = draftOrder[currentTurn - 1]
        const team = teams.find(t => t.draftOrder === currentTeamOrder)
        currentTeamId = team?.id || ''
      }
    }

    const status: 'waiting' | 'drafting' | 'completed' | 'paused' =
      dbState.draft.status === 'setup' ? 'waiting' :
      dbState.draft.status === 'active' ? 'drafting' :
      dbState.draft.status === 'paused' ? 'paused' : 'completed'

    const uiState: DraftUIState = {
      roomCode,
      status,
      currentTurn,
      currentTeam: currentTeamId,
      userTeamId,
      teams,
      participants: dbState.participants.map(p => ({
        userId: p.user_id,
        team_id: p.team_id,
        display_name: p.display_name,
        last_seen: p.last_seen,
        is_admin: p.is_admin,
        is_host: p.is_host,
      })),
      draftSettings: (() => {
        const scoringSystem = dbState.draft.settings?.scoringSystem as 'budget' | 'tiered' | undefined
        const storedDraftType = dbState.draft.settings?.draftType as string | undefined
        let draftType: 'tiered' | 'points' | 'auction'
        if (storedDraftType === 'tiered' || storedDraftType === 'points' || storedDraftType === 'auction') {
          draftType = storedDraftType
        } else if (dbState.draft.format === 'auction') {
          draftType = 'auction'
        } else if (scoringSystem === 'tiered') {
          draftType = 'tiered'
        } else {
          draftType = 'points'
        }
        return {
          maxTeams: dbState.draft.max_teams,
          timeLimit: dbState.draft.settings?.timeLimit ?? 0,
          pokemonPerTeam: dbState.draft.settings?.pokemonPerTeam || 6,
          draftType,
          formatId: dbState.draft.settings?.formatId,
          customFormatId: dbState.draft.custom_format_id ?? undefined,
          scoringSystem,
          tierConfig: dbState.draft.settings?.tierConfig as { tiers: import('@/types').TierDefinition[] } | undefined,
        }
      })(),
      timeRemaining: dbState.draft.settings?.timeLimit ?? 0,
      draft: {
        id: dbState.draft.id,
        custom_format_id: dbState.draft.custom_format_id ?? undefined,
        turn_started_at: dbState.draft.turn_started_at ?? undefined,
        status: dbState.draft.status
      }
    }

    prevTransformedStateRef.current = { dbStateHash, uiState }
    return uiState
  }, [roomCode])

  // --- Activity hook ---
  const {
    recentActivity,
    sidebarActivities,
    isActivitySidebarOpen,
    setIsActivitySidebarOpen,
    showNotifications,
    setShowNotifications,
    shouldShowNotification,
  } = useDraftActivity({
    teams: draftState?.teams,
    pokemon,
  })

  // --- Timers hook ---
  const { pickTimeRemaining, handleAutoSkip } = useDraftTimers({
    turnStartedAt: draftState?.draft?.turn_started_at,
    timeLimit: draftState?.draftSettings?.timeLimit || 0,
    isDrafting: draftState?.status === 'drafting',
    isUserTurn: isUserTurn || false,
    draftId: draftState?.draft?.id,
    currentTeamId: draftState?.currentTeam,
    roomCode,
  })

  // --- Actions hook ---
  const actions = useDraftActions({
    draftState,
    setDraftState,
    userId,
    roomCode,
    isHost,
    isSpectator,
    isUserTurn: isUserTurn || false,
    isAuctionDraft: isAuctionDraft || false,
    userTeam: userTeam || null,
    currentTeam: currentTeam || null,
    budgetFeasibility,
    availablePokemon,
    shouldShowNotification,
    transformDraftState,
    requestBrowserNotificationPermission: () => turnNotifications.requestBrowserNotificationPermission(),
    authUser: authUser ?? null,
  })

  // --- Auction hook ---
  const auction = useDraftAuction({
    isAuctionDraft: isAuctionDraft || false,
    roomCode,
    userId,
    draftStatus: draftState?.status,
    currentTurn: draftState?.currentTurn,
    teams: draftState?.teams || [],
    userTeam: userTeam || null,
    selectedPokemon: actions.selectedPokemon,
    setSelectedPokemon: actions.setSelectedPokemon,
  })

  // --- Realtime (stays in page.tsx due to tight coupling with pickInFlightRef) ---
  const {
    connectionStatus: realtimeConnectionStatus,
    reconnect: realtimeReconnect,
  } = useDraftRealtime(draftState?.draft?.id || null, userId, {
    enabled: !!draftState?.draft?.id,
    refreshDebounce: 300,
    onRefreshNeeded: async () => {
      if (!roomCode) return
      if (actions.pickInFlightRef.current) {
        log.info('Skipping realtime refresh — pick in flight')
        return
      }
      try {
        DraftService.invalidateDraftStateCache(roomCode.toLowerCase())
        const dbState = await DraftService.getDraftState(roomCode.toLowerCase())
        if (dbState) {
          startTransition(() => {
            setDraftState(transformDraftState(dbState, userId))
          })
        }
      } catch (error) {
        log.error('Error refreshing state:', error)
      }
    },
    onStatusChange: (newStatus) => {
      if (newStatus === 'completed') {
        draftSounds.play('celebration')
        setShowCelebration(true)
        notify.success('Draft Complete!', 'Redirecting to results...', { duration: 3000 })
        setTimeout(() => { router.push(`/draft/${roomCode}/results`) }, 3000)
      }
    },
    onDraftDeleted: () => {
      notify.error('Draft Deleted', 'This draft has been deleted. Redirecting...', { duration: 6000 })
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('Draft Deleted', {
            body: `Draft room ${roomCode} has been deleted.`,
            icon: '/icons/icon-192x192.png',
            tag: 'draft-deleted',
            requireInteraction: true
          })
        } catch { /* native notification not supported */ }
      }
      if (userId) {
        UserSessionService.removeDraftParticipation(roomCode.toLowerCase())
      }
      setTimeout(() => router.push('/my-drafts?deleted=true'), 1000)
    }
  })

  const connectionStatus = useMemo(() => {
    if (realtimeConnectionStatus.status === 'connected') return 'online'
    if (realtimeConnectionStatus.status === 'reconnecting') return 'reconnecting'
    if (realtimeConnectionStatus.status === 'connecting') return 'reconnecting'
    return 'offline'
  }, [realtimeConnectionStatus.status])

  // --- Turn notifications ---
  const turnNotifications = useTurnNotifications({
    isUserTurn: isUserTurn || false,
    pickTimeRemaining,
    draftStatus: draftState?.status || 'waiting',
    enableBrowserNotifications: true,
    warningThreshold: 10,
    isConnected: connectionStatus === 'online',
    currentTurn: draftState?.currentTurn,
    onAutoSkip: handleAutoSkip,
    draftName: `Draft ${roomCode}`,
    roomCode,
    timeLimit: draftState?.draftSettings?.timeLimit
  })

  // --- Your-turn flash overlay ---
  const [showTurnFlash, setShowTurnFlash] = useState(false)
  // --- Draft completion celebration ---
  const [showCelebration, setShowCelebration] = useState(false)

  // --- Load initial draft state ---
  useEffect(() => {
    let mounted = true
    const abortController = new AbortController()

    const loadDraftState = async () => {
      if (!roomCode) return

      try {
        const dbState = await DraftService.getDraftState(roomCode.toLowerCase())

        if (!mounted || abortController.signal.aborted) return

        if (!dbState) {
          setError('Draft room not found')
          return
        }

        const newState = transformDraftState(dbState, userId)
        setDraftState(prev => prev === newState ? prev : newState)
      } catch (err) {
        if (!mounted || abortController.signal.aborted) return
        log.error('Error loading draft state:', err)
        setError('Failed to load draft room')
      }
    }

    loadDraftState()

    return () => {
      mounted = false
      abortController.abort()
    }
  }, [roomCode, userId, transformDraftState, router])

  // --- Session activity heartbeat ---
  useEffect(() => {
    if (!roomCode) return
    UserSessionService.updateActivity()
    const interval = setInterval(() => { UserSessionService.updateActivity() }, 30000)
    return () => clearInterval(interval)
  }, [roomCode])

  // Update draft participation status when draft completes
  useEffect(() => {
    if (draftState?.status === 'completed' && roomCode) {
      UserSessionService.updateDraftParticipation(roomCode, { status: 'completed' })
    }
  }, [draftState?.status, roomCode])

  // --- Draft start transition detection ---
  const lastStatusRef = useRef<'waiting' | 'drafting' | 'completed' | 'paused' | null>(null)
  const hasNotifiedDraftStart = useRef(false)
  useEffect(() => {
    if (lastStatusRef.current === 'waiting' && draftState?.status === 'drafting') {
      log.info('Transition detected: waiting → drafting')

      if (!hasNotifiedDraftStart.current) {
        hasNotifiedDraftStart.current = true
        notify.success('Draft Started!', 'The draft is now active. Good luck with your picks!')
      }

      const timeoutId = setTimeout(() => {
        hasNotifiedDraftStart.current = false
      }, 3000)
      return () => clearTimeout(timeoutId)
    }
    lastStatusRef.current = draftState?.status || null
  }, [draftState?.status])

  // --- Notification logic for pick/turn changes ---
  const prevDraftStateRef = useRef<DraftUIState | null>(null)
  const lastNotifiedTurnRef = useRef<number | null>(null)
  const lastNotifiedPickCountRef = useRef<number>(0)
  const lastTurnNotificationTime = useRef<number>(0)

  useEffect(() => {
    const prevState = prevDraftStateRef.current
    if (!draftState || !prevState || !pokemon) {
      prevDraftStateRef.current = draftState
      return
    }

    const newTotalPicks = draftState.teams.reduce((sum, team) => sum + team.picks.length, 0)
    const oldTotalPicks = prevState.teams.reduce((sum, team) => sum + team.picks.length, 0)

    if (newTotalPicks > oldTotalPicks && newTotalPicks !== lastNotifiedPickCountRef.current) {
      lastNotifiedPickCountRef.current = newTotalPicks

      const pickingTeam = draftState.teams.find(team => {
        const oldTeam = prevState.teams.find(t => t.id === team.id)
        return oldTeam && team.picks.length > oldTeam.picks.length
      })

      if (pickingTeam && pickingTeam.id !== draftState.userTeamId) {
        const latestPickId = pickingTeam.picks[pickingTeam.picks.length - 1]
        const pickedPokemon = pokemon.find(p => p.id === latestPickId)
        if (pickedPokemon) {
          // Play pick sound at reduced volume for opponent picks
          draftSounds.play('pick-confirm')
          notify.pickMade(pickedPokemon.name, pickingTeam.name, false)

          if (actions.preDraftPokemonId && latestPickId === actions.preDraftPokemonId) {
            actions.handleClearPreDraft()
            notify.warning(
              'Pre-draft Pick Taken!',
              `${pickedPokemon.name} was taken by ${pickingTeam.name}. Please select a new Pokémon.`,
              { duration: 6000 }
            )
          }
        }
      }
    }

    if (!isAuctionDraft && draftState.currentTurn !== prevState.currentTurn) {
      if (draftState.currentTurn !== lastNotifiedTurnRef.current) {
        const now = Date.now()
        const MIN_NOTIFICATION_INTERVAL = 1500
        const timeSinceLastNotification = now - lastTurnNotificationTime.current

        if (timeSinceLastNotification >= MIN_NOTIFICATION_INTERVAL || lastTurnNotificationTime.current === 0) {
          lastNotifiedTurnRef.current = draftState.currentTurn
          lastTurnNotificationTime.current = now

          if (draftState.userTeamId === draftState.currentTeam) {
            draftSounds.play('your-turn')
            setShowTurnFlash(true)
            setTimeout(() => setShowTurnFlash(false), 500)
            notify.yourTurn(pickTimeRemaining > 0 ? pickTimeRemaining : undefined)

            if (actions.preDraftPokemonId) {
              const preDraftedPokemon = pokemon.find(p => p.id === actions.preDraftPokemonId)
              if (preDraftedPokemon && !allDraftedIds.includes(actions.preDraftPokemonId)) {
                actions.setIsConfirmationOpen(true)
                // Set confirmation pokemon via initiate flow would be better,
                // but we need to set it directly here
              }
            }
          }
        }
      }
    }

    prevDraftStateRef.current = draftState
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pickTimeRemaining read from closure is intentional
  }, [draftState, pokemon, isAuctionDraft])

  // --- Listen for incoming pings ---
  const draftStateRef = useRef(draftState)
  useEffect(() => { draftStateRef.current = draftState }, [draftState])

  useEffect(() => {
    if (!roomCode || isHost) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null

    const setup = async () => {
      const { supabase } = await import('@/lib/supabase')
      if (!supabase) return

      channel = supabase.channel(`ping:${roomCode.toLowerCase()}`)
      channel.on('broadcast', { event: 'ping_player' }, () => {
        if (draftStateRef.current?.userTeamId === draftStateRef.current?.currentTeam) {
          notify.yourTurn()
        }
      }).subscribe()
    }

    setup()
    return () => { if (channel) channel.unsubscribe() }
  }, [roomCode, isHost])

  // --- Wishlist Pokemon IDs from Zustand ---
  const storeWishlistItemsById = useDraftStore(state => state.wishlistItemsById)
  const storeWishlistByParticipant = useDraftStore(state => state.wishlistItemsByParticipantId)
  const wishlistPokemonIds = useMemo(() => {
    if (!userId) return EMPTY_ARRAY
    const itemIds = storeWishlistByParticipant[userId]
    if (!itemIds || itemIds.length === 0) return EMPTY_ARRAY
    const ids = itemIds
      .map(id => storeWishlistItemsById[id])
      .filter(item => item && item.isAvailable)
      .map(item => item.pokemonId)
    return ids.length > 0 ? ids : EMPTY_ARRAY
  }, [userId, storeWishlistByParticipant, storeWishlistItemsById])

  // Memoize DraftResults teams
  const completedDraftTeams = useMemo(() => {
    if (!draftState?.teams) return EMPTY_ARRAY
    return draftState.teams.map(team => ({
      ...team,
      budgetRemaining: draftState?.draftSettings?.draftType === 'auction'
        ? 100 - team.picks.length * 10
        : undefined
    }))
  }, [draftState?.teams, draftState?.draftSettings?.draftType])

  // ============================================================
  // RENDER
  // ============================================================

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} className="w-full">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!roomCode) {
    return <DraftRoomLoading />
  }

  // Handle draft completion - show results page
  if (draftState?.status === 'completed') {
    return (
      <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight brand-gradient-text mb-2">
              Draft Room: {roomCode}
            </h1>
          </div>

          <DraftResults
            draftName={`${userName}'s Draft`}
            teams={completedDraftTeams}
            picks={draftState?.teams ? draftState.teams.flatMap(team =>
              team.picks.map((pokemonId, index) => ({
                id: `${team.id}-${index}`,
                team_id: team.id,
                pokemon_id: pokemonId,
                pokemon_name: pokemon?.find(p => p.id === pokemonId)?.name || 'Unknown',
                cost: pokemon?.find(p => p.id === pokemonId)?.cost || 1,
                pick_order: index + 1,
                round: Math.floor(index / (draftState.teams?.length || 1)) + 1,
                created_at: new Date().toISOString()
              }))
            ) : []}
            draftSettings={draftState?.draftSettings}
            startTime={new Date(Date.now() - (draftState?.timeRemaining || 0) * 60 * 1000).toISOString()}
            endTime={new Date().toISOString()}
            onShare={() => {
              const shareUrl = `${window.location.origin}/draft/${roomCode}`
              navigator.clipboard.writeText(shareUrl)
              notify.success('Share Link Copied!', 'Draft results link copied to clipboard')
            }}
            onExport={() => {
              if (!draftState) return

              const exportData = {
                draftName: `${userName}'s Draft`,
                roomCode,
                format: draftState.draftSettings.draftType,
                completedAt: new Date().toISOString(),
                teams: draftState.teams.map(team => ({
                  name: team.name,
                  trainer: team.userName,
                  pokemon: team.picks.map(pokemonId => {
                    const p = pokemon?.find(poke => poke.id === pokemonId)
                    return {
                      name: p?.name || 'Unknown',
                      id: pokemonId,
                      cost: p?.cost || 0,
                      types: p?.types?.map(t => t.name) || []
                    }
                  }),
                  budgetRemaining: team.budgetRemaining
                }))
              }

              const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(jsonBlob)
              const a = document.createElement('a')
              a.href = url
              a.download = `pokemon-draft-${roomCode}-${new Date().toISOString().split('T')[0]}.json`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(url)

              notify.success('Exported!', 'Draft results have been downloaded as JSON')
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background transition-colors duration-500 draft-room-mobile">
      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4 max-w-screen-2xl">
        {/* Header */}
        <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2 sm:gap-3 px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-xl font-bold font-mono tracking-wider truncate">
              {roomCode}
            </h1>
            <Badge
              variant={draftState?.status === 'drafting' ? 'default' : 'secondary'}
              className={cn(
                'flex-shrink-0 text-xs',
                draftState?.status === 'drafting' && 'animate-pulse'
              )}
            >
              {draftState?.status === 'waiting' ? 'Waiting' : draftState?.status === 'drafting' ? 'Live' : 'Done'}
            </Badge>
            <DraftConnectionStatusBadge
              status={realtimeConnectionStatus}
              onReconnect={realtimeReconnect}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <SoundToggle className="flex-shrink-0" />
            <Button variant="ghost" size="icon" onClick={actions.copyRoomCode} className="h-8 w-8" title="Copy room code">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={actions.shareRoom} className="h-8 w-8" title="Share room">
              <Share2 className="h-4 w-4" />
            </Button>
            {draftState && draftState.status === 'drafting' && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsActivitySidebarOpen(true)}
                className="h-8 w-8 relative"
                id="tour-activity-btn" title="Draft activity"
              >
                <History className="h-4 w-4" />
                {allDraftedIds.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                    {allDraftedIds.length}
                  </span>
                )}
              </Button>
            )}
            {draftState && (draftState.status as string) === 'completed' && (
              <Button
                size="sm"
                onClick={() => router.push(`/draft/${roomCode}/results`)}
                className="h-8"
              >
                Results
              </Button>
            )}
          </div>
        </div>

        {/* Draft Order Reveal */}
        {actions.showOrderReveal && draftState && (
          <DraftOrderReveal
            teams={draftState.teams}
            userTeamId={draftState.userTeamId}
            onComplete={() => actions.setShowOrderReveal(false)}
          />
        )}

        {/* Waiting Lobby */}
        {draftState?.status === 'waiting' && (
          <div className="mb-4 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
              <span className="font-semibold text-sm">
                {draftState.teams.length}/{draftState.draftSettings.maxTeams} Teams
              </span>
              <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="brand-gradient-bg h-full rounded-full transition-all duration-500"
                  style={{ width: `${(draftState.teams.length / draftState.draftSettings.maxTeams) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {draftState.teams.map((team, idx) => (
                <Badge key={team.id} variant="secondary" className="text-xs py-0.5 px-2">
                  <CheckCircle2 className="h-3 w-3 text-green-500 mr-1" />
                  {team.name}
                  {idx === 0 && <Crown className="h-3 w-3 text-yellow-500 ml-1" />}
                </Badge>
              ))}
              {Array.from({ length: draftState.draftSettings.maxTeams - draftState.teams.length }).map((_, i) => (
                <Badge key={`empty-${i}`} variant="outline" className="text-xs py-0.5 px-2 border-dashed">
                  Waiting...
                </Badge>
              ))}
            </div>

            {/* Join from link */}
            {!draftState.userTeamId && !isSpectator && draftState.teams.length < draftState.draftSettings.maxTeams && (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                {authUser ? (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Your team name"
                      value={actions.joinTeamName}
                      onChange={(e) => actions.setJoinTeamName(e.target.value)}
                      className="h-8 text-sm flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && actions.handleJoinFromLink()}
                    />
                    <Button
                      size="sm"
                      onClick={actions.handleJoinFromLink}
                      disabled={actions.isStarting || !actions.joinTeamName.trim()}
                      className="h-8 shrink-0"
                    >
                      Join Draft
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground flex-1 min-w-0">There are open slots — want to join?</p>
                    <Button size="sm" className="h-8 shrink-0" onClick={() => setShowJoinAuthModal(true)}>
                      Sign In to Join
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => router.push(`/draft/${roomCode}?spectator=true`)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Spectate
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Share code <span className="font-mono font-bold text-foreground">{roomCode}</span> to invite players
              {!isHost && !isAdmin && ' — host will start once everyone joins'}
              {(isHost || isAdmin) && draftState.teams.length < 2 && ' — need at least 2 teams'}
              {(isHost || isAdmin) && draftState.teams.length >= 2 && draftState.teams.length < draftState.draftSettings.maxTeams &&
                ` — you can start now or wait for all ${draftState.draftSettings.maxTeams}`}
            </div>

            {(isHost || isAdmin) && draftState.teams.length >= draftState.draftSettings.maxTeams && (
              <Button
                onClick={actions.startDraft}
                disabled={actions.isStarting}
                className="mt-3 bg-green-600 hover:bg-green-700 w-full animate-pulse"
              >
                {actions.isStarting ? 'Starting...' : 'All Teams Ready — Start Draft'}
              </Button>
            )}
          </div>
        )}

        {/* Notification permission prompt */}
        {draftState?.status === 'drafting' && !isSpectator && draftState?.userTeamId && (
          <div className="mb-3">
            <NotificationPrompt />
          </div>
        )}

        {/* Draft Progress — sticky on mobile */}
        {draftState?.status === 'drafting' && (
          <div className="mb-2 md:mb-4 sticky top-0 z-30 bg-background/95 backdrop-blur-sm -mx-2 px-2 pt-1 pb-2 md:static md:mx-0 md:px-0 md:pt-0 md:pb-0 md:bg-transparent md:backdrop-blur-none" id="tour-draft-progress">
            <DraftProgress
              currentTurn={draftState?.currentTurn}
              totalTeams={draftState?.teams?.length || 0}
              maxRounds={draftState?.draftSettings?.pokemonPerTeam}
              draftStatus={draftState?.status}
              timeRemaining={pickTimeRemaining}
              userTeamId={draftState?.userTeamId ?? undefined}
              isUserTurn={isUserTurn}
              teams={draftState?.teams || []}
              compact={true}
            />
          </div>
        )}

        {/* Mobile Tab Bar — only on small screens during active draft */}
        {draftState?.status === 'drafting' && (
          <div className="flex md:hidden border-b border-border sticky top-[auto] z-20 bg-background mb-2">
            <button
              className={cn(
                'flex-1 py-3 text-sm font-medium transition-colors min-h-[44px]',
                activeTab === 'pokemon'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground'
              )}
              onClick={() => setActiveTab('pokemon')}
            >
              Pokemon
            </button>
            <button
              className={cn(
                'flex-1 py-3 text-sm font-medium transition-colors min-h-[44px]',
                activeTab === 'team'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground'
              )}
              onClick={() => setActiveTab('team')}
            >
              My Team
            </button>
            <button
              className={cn(
                'flex-1 py-3 text-sm font-medium transition-colors min-h-[44px]',
                activeTab === 'board'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground'
              )}
              onClick={() => setActiveTab('board')}
            >
              Board
            </button>
          </div>
        )}

        {/* Team Rosters — hidden on mobile unless "board" tab is active */}
        <div id="tour-team-rosters" className={cn(
          'mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3',
          draftState?.status === 'drafting' && activeTab !== 'board' && 'hidden md:grid'
        )}>
          {draftState ? (
            (draftState?.teams || []).map((team) => (
              <EnhancedErrorBoundary key={team.id}>
                <TeamRoster
                  team={team}
                  isCurrentTeam={team.id === draftState?.currentTeam}
                  isUserTeam={team.id === draftState?.userTeamId}
                  showTurnIndicator={draftState?.status === 'drafting'}
                  maxPokemonPerTeam={draftState?.draftSettings?.pokemonPerTeam}
                  scoringSystem={draftState?.draftSettings?.scoringSystem}
                  tierConfig={draftState?.draftSettings?.tierConfig}
                />
              </EnhancedErrorBoundary>
            ))
          ) : (
            Array.from({ length: 4 }).map((_, i) => (
              <TeamStatusSkeleton key={`skeleton-${i}`} />
            ))
          )}
        </div>

        {/* Spectator Mode */}
        {draftState && (isSpectator || !draftState.userTeamId) && (
          <div className={cn(
            'mb-4 grid grid-cols-1 lg:grid-cols-3 gap-3',
            draftState?.status === 'drafting' && activeTab !== 'board' && 'hidden md:grid'
          )}>
            <div className="lg:col-span-2">
              <SpectatorMode
                draftId={roomCode?.toLowerCase() || ''}
                currentPhase={draftState?.status === 'waiting' ? 'setup' :
                             draftState?.status === 'drafting' && !isAuctionDraft ? 'drafting' :
                             draftState?.status === 'drafting' && isAuctionDraft ? 'auction' : 'completed'}
                participantCount={draftState?.teams?.reduce((count, team) => count + (team.userName ? 1 : 0), 0) || 0}
                currentAction={auction.currentAuction ? {
                  type: 'bid',
                  teamName: currentTeam?.name || 'Unknown',
                  pokemonName: auction.currentAuction.pokemon_name,
                  timeRemaining: auction.auctionTimeRemaining
                } : isUserTurn && draftState?.status === 'drafting' ? {
                  type: 'pick',
                  teamName: currentTeam?.name || 'Unknown',
                  timeRemaining: draftState?.timeRemaining
                } : undefined}
                recentActivity={recentActivity}
                onRequestNotifications={() => setShowNotifications(true)}
              />
            </div>
            <div className="lg:col-span-1">
              <AuctionNotifications
                draftId={roomCode?.toLowerCase() || ''}
                userTeamId={null}
                isVisible={showNotifications}
                onToggle={() => setShowNotifications(!showNotifications)}
              />
            </div>
          </div>
        )}

        {/* Draft Controls */}
        {draftState && (isHost || isAdmin) && !isSpectator && (
          <div className="mb-3">
            <DraftControls
              draftStatus={draftState?.status}
              currentTurn={draftState?.currentTurn}
              totalTeams={draftState?.teams?.length || 0}
              currentTeam={draftState?.currentTeam}
              teams={draftState?.teams || []}
              isHost={isHost}
              isAdmin={isAdmin}
              timeRemaining={pickTimeRemaining}
              onStartDraft={actions.startDraft}
              onShuffleDraftOrder={actions.handleShuffleDraftOrder}
              onPauseDraft={actions.handlePauseDraft}
              onResumeDraft={actions.handleResumeDraft}
              onEndDraft={actions.handleEndDraft}
              onResetDraft={actions.handleResetDraft}
              onDeleteDraft={actions.handleDeleteDraft}
              onAdvanceTurn={actions.handleAdvanceTurn}
              onSetTimer={actions.handleSetTimer}
              onEnableProxyPicking={actions.noopCallback}
              onDisableProxyPicking={actions.noopCallback}
              isProxyPickingEnabled={false}
              isShuffling={actions.isShuffling}
              onUndoLastPick={actions.handleUndoLastPick}
              onRequestNotificationPermission={actions.handleRequestNotificationPermission}
              onPingCurrentPlayer={actions.handlePingCurrentPlayer}
              onViewResults={actions.handleViewResults}
              onRemoveTeam={draftState?.status === 'waiting' ? actions.handleRemoveTeam : undefined}
              canUndo={draftState?.teams?.some(team => team.picks.length > 0) || false}
              notificationsEnabled={typeof Notification !== 'undefined' && Notification.permission === 'granted'}
              maxPokemonPerTeam={draftState?.draftSettings?.pokemonPerTeam || 6}
            />
          </div>
        )}

        {/* Draft Type Specific Controls - hidden for spectators */}
        {draftState && draftState.status === 'drafting' && !isSpectator && draftState.userTeamId && (
          <div className={cn(
            'mb-3',
            activeTab !== 'pokemon' && 'hidden md:block'
          )}>
            {isAuctionDraft ? (
              <div className="space-y-4">
                {auction.currentAuction ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <AuctionBiddingInterface
                        currentAuction={auction.currentAuction}
                        pokemon={pokemon?.find(p => p.id === auction.currentAuction!.pokemon_id) || null}
                        userTeamId={draftState?.userTeamId}
                        teams={draftState?.teams || []}
                        timeRemaining={auction.auctionTimeRemaining}
                        isUserTurn={true}
                        onPlaceBid={auction.handlePlaceBid}
                        onNominatePokemon={(pokemon: Pokemon) => auction.handleNominatePokemon(pokemon, 1, 300)}
                        draftId={roomCode?.toLowerCase() || ''}
                      />
                    </div>
                    <div>
                      <AuctionTimer
                        auctionEndTime={auction.currentAuction.auction_end}
                        isActive={auction.currentAuction.status === 'active'}
                        onTimeExpired={auction.handleAuctionTimeExpired}
                        onExtendTime={(isHost || isAdmin) ? auction.handleExtendAuctionTime : undefined}
                        isHost={isHost}
                      />
                    </div>
                  </div>
                ) : (
                  <AuctionNomination
                    selectedPokemon={actions.selectedPokemon}
                    userTeam={auction.nominationUserTeam}
                    currentNominatingTeam={auction.nominationCurrentTeam}
                    canNominate={auction.canNominate}
                    onNominate={auction.handleNominatePokemon}
                  />
                )}
              </div>
            ) : (
              <div className={cn(
                'px-4 py-3 rounded-lg border transition-all',
                isUserTurn
                  ? 'bg-primary/5 border-primary/30 ring-2 ring-primary/20 shadow-sm'
                  : 'bg-muted/30 border-border'
              )}>
                {actions.selectedPokemon && isUserTurn ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold truncate flex-1">
                      Draft <span className="text-primary">{actions.selectedPokemon.name}</span>?
                    </span>
                    <Button
                      onClick={() => actions.handleDraftPokemon(actions.selectedPokemon!)}
                      size="sm"
                      className="px-6 flex-shrink-0 font-semibold"
                    >
                      Confirm Pick
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    {!isUserTurn
                      ? `Waiting for ${currentTeam?.name} to pick...`
                      : 'Select a Pokémon from the grid below'
                    }
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Loading Notice */}
        {!draftState && (
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary flex-shrink-0"></div>
            Connecting to draft room...
          </div>
        )}

        {/* Wishlist Manager - Above Pokemon Grid */}
        <div id="tour-wishlist" className={cn(
          draftState?.status === 'drafting' && activeTab !== 'pokemon' && 'hidden md:block'
        )}>
        {!isSpectator && draftState?.userTeamId && userId && (
          <EnhancedErrorBoundary>
            <WishlistManager
              draftId={roomCode.toLowerCase()}
              participantId={userId}
              userTeam={userTeam}
              currentBudget={userTeam?.budgetRemaining || 100}
              usedBudget={(userTeam?.picks.length || 0) * 10}
              isCompact={true}
            />
          </EnhancedErrorBoundary>
        )}
        </div>

        {/* Pre-draft Banner */}
        {actions.preDraftPokemonId && !isUserTurn && draftState?.status === 'drafting' && draftState?.userTeamId && !isSpectator && (
          <div className={cn(
            'mb-2 flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg text-sm',
            activeTab !== 'pokemon' && 'hidden md:flex'
          )}>
            <span className="text-purple-500 flex-shrink-0">🔖</span>
            <span className="text-purple-800 dark:text-purple-200">
              Pre-drafted: <strong>{legalPokemon.find(p => p.id === actions.preDraftPokemonId)?.name ?? '...'}</strong>
              {' '}-- will auto-confirm when your turn starts
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={actions.handleClearPreDraft}
              className="ml-auto h-6 px-2 text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 flex-shrink-0"
            >
              Clear
            </Button>
          </div>
        )}

        {/* Mobile: User's team summary — visible in "team" tab */}
        {draftState?.status === 'drafting' && userTeam && (
          <div className={cn(
            'mb-3 md:hidden',
            activeTab !== 'team' && 'hidden'
          )}>
            <TeamRoster
              team={userTeam}
              isCurrentTeam={userTeam.id === draftState?.currentTeam}
              isUserTeam={true}
              showTurnIndicator={true}
              maxPokemonPerTeam={draftState?.draftSettings?.pokemonPerTeam}
              scoringSystem={draftState?.draftSettings?.scoringSystem}
              tierConfig={draftState?.draftSettings?.tierConfig}
            />
            {/* Other teams (collapsed) */}
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground px-1">Other Teams</p>
              {(draftState?.teams || []).filter(t => t.id !== userTeam.id).map((team) => (
                <TeamRoster
                  key={team.id}
                  team={team}
                  isCurrentTeam={team.id === draftState?.currentTeam}
                  isUserTeam={false}
                  showTurnIndicator={true}
                  maxPokemonPerTeam={draftState?.draftSettings?.pokemonPerTeam}
                  scoringSystem={draftState?.draftSettings?.scoringSystem}
                  tierConfig={draftState?.draftSettings?.tierConfig}
                />
              ))}
            </div>
          </div>
        )}

        {/* Pokemon Grid */}
        <div id="tour-pokemon-grid" className={cn(
          'bg-card rounded-lg shadow-sm border p-2 sm:p-4',
          draftState?.status === 'drafting' && activeTab !== 'pokemon' && 'hidden md:block'
        )}>
          <EnhancedErrorBoundary>
            <PokemonGrid
              pokemon={legalPokemon}
              onViewDetails={isUserTurn && draftState?.status === 'drafting' && !isAuctionDraft && !isSpectator ? actions.handleInitiateDraft : actions.handleViewDetails}
              onQuickDraft={undefined}
              onAddToWishlist={actions.handleAddToWishlist}
              onRemoveFromWishlist={actions.handleRemoveFromWishlist}
              onPreDraft={!isUserTurn && draftState?.status === 'drafting' && !isAuctionDraft && !!draftState?.userTeamId && !isSpectator ? actions.handleSetPreDraft : undefined}
              onClearPreDraft={!isUserTurn && draftState?.status === 'drafting' && !isAuctionDraft && !!draftState?.userTeamId && !isSpectator ? (p) => { if (p.id === actions.preDraftPokemonId) actions.handleClearPreDraft() } : undefined}
              preDraftPokemonId={actions.preDraftPokemonId}
              draftedPokemonIds={allDraftedIds}
              wishlistPokemonIds={wishlistPokemonIds}
              isLoading={pokemonLoading}
              cardSize="md"
              showFilters={true}
              showCost={true}
              showStats={true}
              showWishlistButton={!isSpectator && !!draftState?.userTeamId}
              showQuickDraft={false}
              scoringSystem={draftState?.draftSettings?.scoringSystem}
              tierConfig={draftState?.draftSettings?.tierConfig}
              budgetRemaining={userTeam?.budgetRemaining}
              maxAffordableCost={draftState?.status === 'drafting' && draftState?.draftSettings?.scoringSystem !== 'tiered' ? budgetFeasibility?.maxAffordableCost : undefined}
              remainingSlots={draftState?.status === 'drafting' ? budgetFeasibility?.remainingSlots : undefined}
              draftedByTeamMap={draftedByTeamMap}
            />
          </EnhancedErrorBoundary>
        </div>

        {/* Details Modal */}
        <PokemonDetailsModal
          pokemon={actions.detailsPokemon}
          isOpen={actions.isDetailsOpen}
          onClose={() => actions.setIsDetailsOpen(false)}
          onSelect={!draftState || isAuctionDraft || isSpectator || !draftState?.userTeamId ? undefined : (isUserTurn && draftState?.status === 'drafting' ? actions.handleInitiateDraft : undefined)}
          isDrafted={actions.detailsPokemon && draftState ? allDraftedIds.includes(actions.detailsPokemon.id) : false}
          isAtPickLimit={userTeam ? userTeam.picks.length >= (draftState?.draftSettings?.pokemonPerTeam || 6) : false}
          currentPicks={userTeam?.picks.length || 0}
          maxPicks={draftState?.draftSettings?.pokemonPerTeam || 6}
        />

        {/* Draft Confirmation Modal */}
        <DraftConfirmationModal
          pokemon={actions.confirmationPokemon}
          isOpen={actions.isConfirmationOpen}
          onClose={() => actions.setIsConfirmationOpen(false)}
          onConfirm={async (pokemon) => {
            await actions.handleDraftPokemon(pokemon)
            actions.setIsConfirmationOpen(false)
          }}
          isLoading={actions.isDrafting}
          currentBudget={userTeam?.budgetRemaining || 100}
          draftedCount={userTeam?.picks.length || 0}
          maxDrafts={draftState?.draftSettings?.pokemonPerTeam || 6}
        />

        {/* Draft Activity Sidebar */}
        {draftState && (
          <DraftActivitySidebar
            isOpen={isActivitySidebarOpen}
            onClose={() => setIsActivitySidebarOpen(false)}
            activities={sidebarActivities}
            pokemon={pokemon || []}
            currentUserTeamId={draftState.userTeamId}
          />
        )}
      </div>

      {/* Auth modal for join-from-link flow */}
      <AuthModal isOpen={showJoinAuthModal} onClose={() => setShowJoinAuthModal(false)} />

      {/* Your-turn flash overlay */}
      {showTurnFlash && (
        <div
          className="fixed inset-0 z-50 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at center, rgba(74,222,128,0.25), transparent 70%)',
            animation: 'turnFlashFade 0.5s ease-out forwards',
          }}
        />
      )}

      {/* Draft completion celebration */}
      <ConfettiCelebration show={showCelebration} />
      {/* Draft Room Tour */}
      <DraftTour />
    </div>
  )
}
