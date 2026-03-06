'use client'

/**
 * Draft Room Page - Multi-user real-time Pokemon drafting
 * Cache bust: 2025-10-14-v3-fix-infinite-loop
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
// ConnectionStatus from ui/ConnectionStatus is replaced by DraftConnectionStatusBadge
import { Copy, Share2, History, Crown, Clock, CheckCircle2, Eye } from 'lucide-react'
import { DraftService, type DraftState as DBDraftState } from '@/lib/draft-service'
import { UserSessionService } from '@/lib/user-session'
import { useAuth } from '@/contexts/AuthContext'
import { notify } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { DraftRoomLoading, TeamStatusSkeleton } from '@/components/ui/loading-states'
import { EnhancedErrorBoundary } from '@/components/ui/enhanced-error-boundary'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useLatest } from '@/hooks/useLatest'
import { useDraftRealtime } from '@/hooks/useDraftRealtime'
import { DraftConnectionStatusBadge } from '@/components/draft/ConnectionStatus'
import { getMaxAffordableCost, isPickSafe } from '@/utils/budget-feasibility'
import { getPokemonTier } from '@/lib/tier-utils'

/**
 * OPTIMIZED DYNAMIC IMPORTS - Strategic code splitting:
 *
 * CRITICAL (Load Immediately - No lazy loading):
 * - PokemonGrid: Core functionality, needed immediately
 * - TeamRoster: Always visible, needed for draft state
 * - DraftProgress: Always visible during active draft
 *
 * HEAVY (Lazy Load - Reduce initial bundle):
 * - AuctionBiddingInterface: Auction-specific, only for auction drafts
 * - DraftResults: Only needed at completion
 * - DraftControls: Only for hosts, can lazy load
 *
 * Expected improvement: 15-25% faster initial load
 */

// Critical components - load immediately
import PokemonGrid from '@/components/pokemon/PokemonGrid'
import TeamRoster from '@/components/team/TeamRoster'
import DraftProgress from '@/components/team/DraftProgress'
import PokemonDetailsModal from '@/components/pokemon/PokemonDetailsModal'
import DraftActivitySidebar from '@/components/draft/DraftActivitySidebar'
import { AuthModal } from '@/components/auth/AuthModal'
import { createLogger } from '@/lib/logger'
import { useDraftStore } from '@/stores/draftStore'

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
    pickCosts: number[]  // costs of each pick, for tier slot tracking
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

// No global subscription tracker needed - useDraftRealtime handles cleanup via AbortController

// Stable empty array to prevent infinite re-renders (React #185)
// Inline `return []` creates a new reference every render, triggering memo/effect loops
const EMPTY_ARRAY: never[] = []

export default function DraftRoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomCode = (params.id as string)?.toUpperCase()
  const userName = searchParams.get('userName') || ''
  const isHost = searchParams.get('isHost') === 'true'
  const isSpectator = searchParams.get('spectator') === 'true'

  // Get authenticated user - PRIMARY source for userId
  const { user: authUser } = useAuth()

  // Get or create persistent user session
  // Priority: 1) Supabase auth ID, 2) stored participation, 3) stored session, 4) sessionStorage, 5) guest ID
  const userId = useMemo(() => {
    // Primary: Supabase auth user ID (matches participant records)
    if (authUser?.id) {
      return authUser.id
    }

    // Secondary: existing draft participation from localStorage
    const participation = UserSessionService.getDraftParticipation(roomCode?.toLowerCase() || '')
    if (participation && participation.userId) {
      return participation.userId
    }

    // Tertiary: current session from localStorage
    const currentSession = UserSessionService.getCurrentSession()
    if (currentSession && currentSession.userId) {
      return currentSession.userId
    }

    // Try sessionStorage for this specific draft (for incognito mode)
    if (typeof window !== 'undefined' && roomCode) {
      const draftSessionKey = `draft-user-${roomCode.toLowerCase()}`
      const storedId = sessionStorage.getItem(draftSessionKey)
      if (storedId) {
        return storedId
      }
    }

    // Last resort: generate a stable guest ID
    const guestId = `guest-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

    // Store in sessionStorage immediately for this draft (works in incognito)
    if (typeof window !== 'undefined' && roomCode) {
      const draftSessionKey = `draft-user-${roomCode.toLowerCase()}`
      sessionStorage.setItem(draftSessionKey, guestId)
    }

    return guestId
  }, [authUser?.id, roomCode])

  const [selectedPokemon, setSelectedPokemon] = useState<Pokemon | null>(null)
  const [detailsPokemon, setDetailsPokemon] = useState<Pokemon | null>(null)
  const [preDraftPokemonId, setPreDraftPokemonId] = useState<string | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [confirmationPokemon, setConfirmationPokemon] = useState<Pokemon | null>(null)
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [, setIsConnected] = useState(false)
  const [, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  // Proxy picking removed - feature not implemented on backend
  const [isShuffling, setIsShuffling] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [showOrderReveal, setShowOrderReveal] = useState(false)
  const prevStatusRef = useRef<string | null>(null)

  // Real draft state from Supabase
  const [draftState, setDraftState] = useState<DraftUIState | null>(null)
  const [, startTransition] = useTransition()

  // Show draft order reveal when transitioning to drafting
  useEffect(() => {
    const currentStatus = draftState?.status
    if (prevStatusRef.current === 'waiting' && currentStatus === 'drafting') {
      setShowOrderReveal(true)
    }
    prevStatusRef.current = currentStatus || null
  }, [draftState?.status])

  // Auction-specific state
  const [currentAuction, setCurrentAuction] = useState<{
    id: string;
    pokemon_id: string;
    pokemon_name: string;
    nominated_by: string;
    current_bid: number;
    current_bidder: string | null;
    auction_end: string;
    status: "active" | "completed" | "cancelled";
  } | null>(null)
  const [auctionTimeRemaining, setAuctionTimeRemaining] = useState(0)

  // Pick timer state - countdown based on turn_started_at and timeLimit
  const [pickTimeRemaining, setPickTimeRemaining] = useState(0)

  // Pick timer countdown effect
  useEffect(() => {
    const turnStartedAt = draftState?.draft?.turn_started_at
    const timeLimit = draftState?.draftSettings?.timeLimit || 0
    const isDrafting = draftState?.status === 'drafting'

    if (!isDrafting || !turnStartedAt || timeLimit <= 0) {
      setPickTimeRemaining(0)
      return
    }

    const calculateRemaining = () => {
      const elapsed = Math.floor((Date.now() - new Date(turnStartedAt).getTime()) / 1000)
      return Math.max(0, timeLimit - elapsed)
    }

    setPickTimeRemaining(calculateRemaining())

    const interval = setInterval(() => {
      setPickTimeRemaining(calculateRemaining())
    }, 1000)

    return () => clearInterval(interval)
  }, [draftState?.draft?.turn_started_at, draftState?.draftSettings?.timeLimit, draftState?.status])

  // Draft start transition detection (to increase debounce during critical transition)
  const [, setIsDraftStarting] = useState(false)
  const lastStatusRef = useRef<'waiting' | 'drafting' | 'completed' | 'paused' | null>(null)

  // Notification deduplication refs to prevent spam
  const lastNotifiedTurnRef = useRef<number | null>(null)
  const lastNotifiedPickCountRef = useRef<number>(0)
  const lastTurnNotificationTime = useRef<number>(0) // Timestamp of last turn notification for time-based throttling
  const shownNotifications = useRef<Map<string, number>>(new Map())

  // Notification deduplication helper - prevents showing the same notification multiple times
  const shouldShowNotification = useCallback((key: string, dedupWindowMs: number = 3000): boolean => {
    const now = Date.now()
    const lastShown = shownNotifications.current.get(key)

    if (lastShown && now - lastShown < dedupWindowMs) {
      return false // Too recent, skip
    }

    shownNotifications.current.set(key, now)

    // Cleanup old entries (older than 10 seconds)
    for (const [k, timestamp] of shownNotifications.current.entries()) {
      if (now - timestamp > 10000) {
        shownNotifications.current.delete(k)
      }
    }

    return true
  }, [])

  // Server time synchronization state
  const [, setServerTimeOffset] = useState<number>(0)

  // Spectator mode state
  const [recentActivity, setRecentActivity] = useState<Array<{
    id: string
    type: 'pick' | 'bid' | 'auction_start' | 'auction_end' | 'join' | 'leave'
    teamName: string
    pokemonName?: string
    amount?: number
    timestamp: string
  }>>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [isActivitySidebarOpen, setIsActivitySidebarOpen] = useState(false)

  // Use format-specific Pokemon list
  const formatId = draftState?.draftSettings?.formatId
  const customFormatId = draftState?.draft?.custom_format_id
  const { data: pokemon, isLoading: pokemonLoading } = usePokemonListByFormat(
    formatId === 'custom' ? undefined : formatId,
    customFormatId,
    true
  )
  // Demo mode detection - we are always in non-demo mode when connected to the database
  const isDemoMode = false

  // Transform database state to UI state (defined early so hooks can use it)
  // Store previous transformed state to prevent unnecessary re-renders
  const prevTransformedStateRef = useRef<{ dbStateHash: string, uiState: DraftUIState } | null>(null)

  const transformDraftState = useCallback((dbState: DBDraftState, currentUserId: string): DraftUIState => {
    // Build a hash of ONLY the fields that affect the UI.
    // Exclude updated_at and last_seen — they change on every heartbeat
    // and would cause infinite re-renders if included.
    const pickIds = dbState.picks.map(p => p.id).sort().join(',')
    const teamBudgets = dbState.teams.map(t => `${t.id}:${t.budget_remaining}:${t.draft_order}`).sort().join(',')
    const participantList = dbState.participants.map(p => `${p.user_id}:${p.team_id}:${p.display_name}`).sort().join(',')
    const dbStateHash = `${dbState.draft.current_turn}|${dbState.draft.status}|${pickIds}|${teamBudgets}|${participantList}|${dbState.draft.turn_started_at || ''}`

    // Return cached state if nothing meaningful changed
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

    // Find user's team ID
    const userParticipant = dbState.participants.find(p => p.user_id === currentUserId)
    const userTeamId = userParticipant?.team_id || null

    // Calculate current team based on turn using proper snake draft logic
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
        // Derive user-facing draftType from stored settings or DB format
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
          timeLimit: dbState.draft.settings?.timeLimit || 60,
          pokemonPerTeam: dbState.draft.settings?.pokemonPerTeam || 6,
          draftType,
          formatId: dbState.draft.settings?.formatId,
          customFormatId: dbState.draft.custom_format_id ?? undefined,
          scoringSystem,
          tierConfig: dbState.draft.settings?.tierConfig as { tiers: import('@/types').TierDefinition[] } | undefined,
        }
      })(),
      timeRemaining: dbState.draft.settings?.timeLimit || 60,
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

  // Create stable team references that only change when actual team data changes
  const userTeam = useMemo(() => {
    if (!draftState?.teams || !draftState.userTeamId) return null
    const team = draftState.teams.find(t => t.id === draftState.userTeamId)
    return team || null
  }, [draftState?.userTeamId, draftState?.teams])

  const currentTeam = useMemo(() => {
    if (!draftState?.teams || !draftState.currentTeam) return null
    const team = draftState.teams.find(t => t.id === draftState.currentTeam)
    return team || null
  }, [draftState?.currentTeam, draftState?.teams])

  const isUserTurn = useMemo(() =>
    draftState?.userTeamId === draftState?.currentTeam,
    [draftState?.userTeamId, draftState?.currentTeam]
  )

  const isAdmin = useMemo(() => {
    if (!draftState?.participants || !userId) return false
    const me = draftState.participants.find(p => p.userId === userId)
    return me?.is_admin === true
  }, [draftState?.participants, userId])

  const isAuctionDraft = useMemo(() =>
    draftState?.draftSettings?.draftType === 'auction',
    [draftState?.draftSettings?.draftType]
  )

  // Track participant online status based on last_seen timestamps
  const _participantOnlineStatus = useMemo(() => {
    if (!draftState?.participants) return new Map<string, boolean>()

    const OFFLINE_THRESHOLD_MS = 45000 // 45 seconds (30s heartbeat + 15s buffer)
    const now = Date.now()

    return new Map(
      draftState.participants.map(participant => {
        const lastSeenTime = new Date(participant.last_seen).getTime()
        const isOnline = (now - lastSeenTime) < OFFLINE_THRESHOLD_MS
        return [participant.team_id || participant.userId, isOnline]
      })
    )
  }, [draftState?.participants])


  // Suppress realtime refreshes while a pick is in flight to prevent stale data
  // from overwriting the optimistic update or the manual refresh result
  const pickInFlightRef = useRef(false)

  // Unified real-time system - single source of truth for connection & events
  const {
    connectionStatus: realtimeConnectionStatus,
    reconnect: realtimeReconnect,
  } = useDraftRealtime(draftState?.draft?.id || null, userId, {
    enabled: !!draftState?.draft?.id && !isDemoMode,
    refreshDebounce: 300,
    onRefreshNeeded: async () => {
      if (!roomCode) return
      // Skip realtime-triggered refreshes while a pick is in flight to prevent
      // stale data from overwriting the optimistic update or manual refresh
      if (pickInFlightRef.current) {
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
        notify.success('Draft Complete!', 'Redirecting to results...', { duration: 3000 })
        setTimeout(() => {
          router.push(`/draft/${roomCode}/results`)
        }, 3000)
      }
    },
    onDraftDeleted: () => {
      notify.error('Draft Deleted', 'This draft has been deleted. Redirecting...', { duration: 6000 })
      // Send native browser notification so participants see it even if tab is backgrounded
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

  // Derive connection status from the single real-time system
  const connectionStatus = useMemo(() => {
    if (realtimeConnectionStatus.status === 'connected') return 'online'
    if (realtimeConnectionStatus.status === 'reconnecting') return 'reconnecting'
    if (realtimeConnectionStatus.status === 'connecting') return 'reconnecting'
    return 'offline'
  }, [realtimeConnectionStatus.status])

  // Stable no-op callback to prevent infinite re-renders (React #185)
  // Inline `async () => {}` creates a new reference every render, re-triggering effects
  const noopAutoSkip = useCallback(async () => {
    // Timer disabled - no auto-skip
  }, [])

  // Turn notifications with browser notifications
  const { requestBrowserNotificationPermission } = useTurnNotifications({
    isUserTurn: isUserTurn || false,
    pickTimeRemaining,
    draftStatus: draftState?.status || 'waiting',
    enableBrowserNotifications: true,
    warningThreshold: 10,
    isConnected: connectionStatus === 'online',
    currentTurn: draftState?.currentTurn,
    onAutoSkip: noopAutoSkip
  })

  // Load initial draft state
  useEffect(() => {
    let mounted = true
    const abortController = new AbortController()

    const loadDraftState = async () => {
      if (!roomCode) return

      try {
        setIsLoading(true)
        const dbState = await DraftService.getDraftState(roomCode.toLowerCase())

        // Check if component is still mounted
        if (!mounted || abortController.signal.aborted) return

        if (!dbState) {
          setError('Draft room not found')
          return
        }

        // Anyone with the room code can view/spectate the draft
        // Only verified participants can make picks (enforced in makePick)

        const newState = transformDraftState(dbState, userId)
        setDraftState(prev => prev === newState ? prev : newState)
        setIsConnected(true)
      } catch (err) {
        if (!mounted || abortController.signal.aborted) return
        log.error('Error loading draft state:', err)
        setError('Failed to load draft room')
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadDraftState()

    return () => {
      mounted = false
      abortController.abort()
    }
  }, [roomCode, userId, transformDraftState, router])

  // Server time synchronization - prevents timer drift
  useEffect(() => {
    if (!roomCode || isDemoMode) return

    const syncTime = async () => {
      try {
        const start = performance.now()
        const serverTimeData = await DraftService.getServerTime(roomCode.toLowerCase())
        const latency = (performance.now() - start) / 2 // Estimate one-way latency

        // Calculate offset between server and client time
        const offset = serverTimeData.serverTime - Date.now() + latency
        setServerTimeOffset(offset)
      } catch (error) {
        log.error('Failed to sync server time:', error)
      }
    }

    // Initial sync
    syncTime()

    // Re-sync every 5 minutes to account for clock drift
    const interval = setInterval(syncTime, 300000)

    return () => clearInterval(interval)
  }, [roomCode, isDemoMode])

  // Update session activity periodically
  useEffect(() => {
    if (!roomCode) return

    // Update activity immediately
    UserSessionService.updateActivity()

    // Update activity every 30 seconds
    const interval = setInterval(() => {
      UserSessionService.updateActivity()
    }, 30000)

    return () => clearInterval(interval)
  }, [roomCode])

  // Update draft participation status when draft completes
  useEffect(() => {
    if (draftState?.status === 'completed' && roomCode) {
      UserSessionService.updateDraftParticipation(roomCode, { status: 'completed' })
    }
  }, [draftState?.status, roomCode])

  // Track previous activity IDs to prevent infinite loops
  const previousActivityIdsRef = useRef<string>('')

  // Track picks and populate recent activity for spectator mode
  useEffect(() => {
    if (!draftState?.teams || !pokemon) return

    const newActivities: typeof recentActivity = []

    // Process all picks from all teams
    draftState.teams.forEach(team => {
      team.picks.forEach((pokemonId, index) => {
        const pokemonData = pokemon.find(p => p.id === pokemonId)
        if (pokemonData) {
          newActivities.push({
            id: `${team.id}-pick-${index}`,
            type: 'pick',
            teamName: team.name,
            pokemonName: pokemonData.name,
            timestamp: new Date(Date.now() - (draftState.teams.reduce((sum, t) => sum + t.picks.length, 0) - index) * 1000).toISOString()
          })
        }
      })
    })

    // Sort by timestamp descending (most recent first)
    newActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Create stable ID string for comparison
    const newActivityIds = newActivities.map(a => a.id).join(',')

    // Only update if the activity has actually changed
    if (newActivityIds !== previousActivityIdsRef.current) {
      previousActivityIdsRef.current = newActivityIds
      setRecentActivity(newActivities)
    }
  }, [draftState?.teams, pokemon])

  // Detect draft start transition to increase debounce
  const hasNotifiedDraftStart = useRef(false)
  useEffect(() => {
    if (lastStatusRef.current === 'waiting' && draftState?.status === 'drafting') {
      log.info('Transition detected: waiting → drafting')
      setIsDraftStarting(true)

      // Show success notification only once using idempotency guard
      if (!hasNotifiedDraftStart.current) {
        hasNotifiedDraftStart.current = true
        notify.success(
          'Draft Started!',
          'The draft is now active. Good luck with your picks!'
        )
      }

      // Give 3 seconds for all updates to settle during draft start (increased from 2s)
      const timeoutId = setTimeout(() => {
        log.info('Cooldown period ended')
        setIsDraftStarting(false)
        // Reset notification guard for potential future transitions
        hasNotifiedDraftStart.current = false
      }, 3000)
      return () => clearTimeout(timeoutId)
    }
    lastStatusRef.current = draftState?.status || null
  }, [draftState?.status])

  // Notification logic - watches draftState changes and shows pick/turn notifications
  // This replaces the old DraftService.subscribeToDraft notification logic
  const prevDraftStateRef = useRef<DraftUIState | null>(null)
  useEffect(() => {
    const prevState = prevDraftStateRef.current
    if (!draftState || !prevState || !pokemon) {
      prevDraftStateRef.current = draftState
      return
    }

    // Check for pick notifications (only for other teams' picks)
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
          notify.pickMade(pickedPokemon.name, pickingTeam.name, false)

          // Check if this pick takes away the user's pre-drafted Pokemon
          if (preDraftPokemonId && latestPickId === preDraftPokemonId) {
            setPreDraftPokemonId(null)
            notify.warning(
              'Pre-draft Pick Taken!',
              `${pickedPokemon.name} was taken by ${pickingTeam.name}. Please select a new Pokémon.`,
              { duration: 6000 }
            )
          }
        }
      }
    }

    // Check for turn change notifications (snake draft only)
    // Use currentTurn (not currentTeam) to handle snake draft reversals where same team picks twice
    if (!isAuctionDraft && draftState.currentTurn !== prevState.currentTurn) {
      if (draftState.currentTurn !== lastNotifiedTurnRef.current) {
        const now = Date.now()
        const MIN_NOTIFICATION_INTERVAL = 1500
        const timeSinceLastNotification = now - lastTurnNotificationTime.current

        if (timeSinceLastNotification >= MIN_NOTIFICATION_INTERVAL || lastTurnNotificationTime.current === 0) {
          lastNotifiedTurnRef.current = draftState.currentTurn
          lastTurnNotificationTime.current = now

          if (draftState.userTeamId === draftState.currentTeam) {
            notify.yourTurn(pickTimeRemaining > 0 ? pickTimeRemaining : undefined)

            // Auto-open confirmation modal for pre-drafted Pokemon when user's turn starts
            if (preDraftPokemonId) {
              const preDraftedPokemon = pokemon.find(p => p.id === preDraftPokemonId)
              if (preDraftedPokemon && !allDraftedIds.includes(preDraftPokemonId)) {
                setConfirmationPokemon(preDraftedPokemon)
                setIsConfirmationOpen(true)
              }
            }
          }
          // Removed opponent turn notifications - too spammy, pick notifications suffice
        }
      }
    }

    prevDraftStateRef.current = draftState
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pickTimeRemaining read from closure is intentional (avoid re-running effect every second)
  }, [draftState, pokemon, isAuctionDraft])

  // Load current auction for auction drafts
  useEffect(() => {
    const loadCurrentAuction = async () => {
      if (!isAuctionDraft || !roomCode) return

      try {
        const auction = await DraftService.getCurrentAuction(roomCode.toLowerCase())
        setCurrentAuction(auction)

        // Calculate time remaining for active auctions
        if (auction && auction.status === 'active') {
          const endTime = new Date(auction.auction_end).getTime()
          const now = Date.now()
          const remaining = Math.max(0, Math.floor((endTime - now) / 1000))
          setAuctionTimeRemaining(remaining)
        } else {
          setAuctionTimeRemaining(0)
        }
      } catch (error) {
        log.error('Error loading current auction:', error)
      }
    }

    loadCurrentAuction()
  }, [isAuctionDraft, roomCode, draftState?.currentTurn, draftState?.status])

  // Timer disabled - no turn time limits

  // Derived state - memoized to prevent unnecessary recalculations
  const allDraftedIds = useMemo(() => {
    if (!draftState?.teams) return EMPTY_ARRAY
    return draftState.teams.flatMap(team => team.picks)
  }, [draftState?.teams])

  // Map pokemonId → team name for "drafted by" display in the grid
  const draftedByTeamMap = useMemo(() => {
    if (!draftState?.teams) return {}
    const map: Record<string, string> = {}
    draftState.teams.forEach(team => {
      team.picks.forEach(pokemonId => {
        map[pokemonId] = team.name
      })
    })
    return map
  }, [draftState?.teams])

  // Memoize legal pokemon list to prevent new array on every render
  const legalPokemon = useMemo(() => {
    if (!pokemon) return EMPTY_ARRAY
    return pokemon.filter(p => p.isLegal)
  }, [pokemon])

  // Calculate current nominating team for auction drafts
  const currentNominatingTeam = useMemo(() => {
    if (!isAuctionDraft || !draftState || currentAuction) return null

    const { teams } = draftState
    if (!teams.length) return null

    // Round-robin nomination: each team nominates once per round
    const totalPicks = teams.reduce((sum, team) => sum + team.picks.length, 0)
    const currentNominatorIndex = totalPicks % teams.length
    const sortedTeams = [...teams].sort((a, b) => a.draftOrder - b.draftOrder)

    return sortedTeams[currentNominatorIndex] || null
  }, [isAuctionDraft, draftState, currentAuction])

  const canNominate = useMemo(() => {
    if (!isAuctionDraft || currentAuction || draftState?.status !== 'drafting') return false
    if (!currentNominatingTeam || !userTeam) return false
    return currentNominatingTeam.id === userTeam.id
  }, [isAuctionDraft, currentAuction, draftState?.status, currentNominatingTeam, userTeam])

  // Memoize AuctionNomination props to prevent infinite re-renders
  const nominationUserTeam = useMemo(() => {
    if (!userTeam) return null
    return {
      id: userTeam.id,
      name: userTeam.name,
      budgetRemaining: userTeam.budgetRemaining
    }
  }, [userTeam])

  const nominationCurrentTeam = useMemo(() => {
    if (!currentNominatingTeam) return null
    return {
      id: currentNominatingTeam.id,
      name: currentNominatingTeam.name,
      draftOrder: currentNominatingTeam.draftOrder
    }
  }, [currentNominatingTeam])

  const _availablePokemon = useMemo(() => {
    return pokemon?.filter(p => p.isLegal && !allDraftedIds.includes(p.id)) || []
  }, [pokemon, allDraftedIds])

  // Budget feasibility guard: compute max affordable cost for current user
  const budgetFeasibility = useMemo(() => {
    if (!userTeam || !draftState?.draftSettings) return null
    const maxPokemon = draftState.draftSettings.pokemonPerTeam || 6
    const remainingSlots = maxPokemon - (userTeam.picks.length || 0)
    if (remainingSlots <= 0) return null

    // Get sorted costs of available (undrafted, legal) Pokemon
    const availableCosts = _availablePokemon
      .map(p => p.cost)
      .sort((a, b) => a - b)

    // If Pokemon data hasn't loaded yet, don't show a false "budget locked" warning
    if (availableCosts.length < remainingSlots) return null
    if (availableCosts.length === 0) return null

    const maxAffordable = getMaxAffordableCost(
      userTeam.budgetRemaining,
      remainingSlots,
      availableCosts
    )

    return {
      maxAffordableCost: maxAffordable,
      remainingSlots,
    }
  }, [userTeam, _availablePokemon, draftState?.draftSettings])

  // For tiered drafts, budget remaining is the constraint (same field as points drafts)
  // No separate slot tracking needed — any combination is valid within budget

  /**
   * STABLE CALLBACKS - Using useRef pattern to avoid dependency changes
   * This prevents 100+ PokemonCard re-renders when state changes
   */

  // Store latest values in refs to avoid callback recreation
  // CRITICAL FIX: Don't use useLatest for draftState to prevent infinite loop
  // useLatest creates useEffect that triggers on EVERY change, causing circular updates
  const draftStateRef = useRef(draftState)
  const userIdRef = useLatest(userId)
  const isSpectatorRef = useLatest(isSpectator)
  const notifyRef = useLatest(notify)

  // Manually update draftStateRef only when needed (not on every render)
  // This breaks the infinite loop: subscription → setDraftState → useLatest → subscription
  useEffect(() => {
    draftStateRef.current = draftState
  }, [draftState])

  // Stable handleViewDetails - never changes
  const handleViewDetails = useCallback((pokemon: Pokemon) => {
    setDetailsPokemon(pokemon)
    setIsDetailsOpen(true)
  }, [])

  // Stable handleAddToWishlist - reads from refs instead of closure
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

    // Optimistic update: add to store immediately
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
      await WishlistService.addToWishlist(
        roomCode.toLowerCase(),
        currentUserId,
        pokemon
      )
      currentNotify.success('Added to Wishlist', `${pokemon.name} added to your wishlist`, { duration: 2000 })
    } catch (error) {
      // Revert optimistic update
      useDraftStore.getState().removeWishlistItem(optimisticId)
      log.error('Error adding to wishlist:', error)
      currentNotify.error('Failed to Add', 'Could not add Pokémon to wishlist')
    }
  }, [roomCode, draftStateRef, userIdRef, isSpectatorRef, notifyRef])

  // Stable handleRemoveFromWishlist - reads from refs instead of closure
  const handleRemoveFromWishlist = useCallback(async (pokemon: Pokemon) => {
    const currentDraftState = draftStateRef.current
    const currentUserId = userIdRef.current
    const currentIsSpectator = isSpectatorRef.current
    const currentNotify = notifyRef.current

    if (!currentDraftState?.userTeamId || !currentUserId || currentIsSpectator) return

    // Optimistic update: remove from store immediately
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
      await WishlistService.removeFromWishlist(
        roomCode.toLowerCase(),
        currentUserId,
        pokemon.id
      )
      currentNotify.success('Removed from Wishlist', `${pokemon.name} removed from your wishlist`, { duration: 2000 })
    } catch (error) {
      // Revert optimistic update
      if (removedItem) {
        useDraftStore.getState().addWishlistItem(removedItem)
      }
      log.error('Error removing from wishlist:', error)
      currentNotify.error('Failed to Remove', 'Could not remove Pokémon from wishlist')
    }
  }, [roomCode, draftStateRef, userIdRef, isSpectatorRef, notifyRef])

  // Get wishlist Pokemon IDs from Zustand store (populated by WishlistManager's useWishlistSync)
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

  /**
   * OPTIMIZED SIDEBAR ACTIVITIES - Performance enhancement:
   * 1. Track total pick count to avoid unnecessary recalculation
   * 2. Only recompute when pick count changes
   * 3. Use early return for empty states
   *
   * Expected improvement: 50-70% fewer recalculations
   */

  // Sidebar activities - only recalculate when picks change (not on every draftState update)
  const sidebarActivities = useMemo(() => {
    // Early return for empty states - use stable reference to prevent re-render loops
    if (!draftState?.teams || !pokemon) return EMPTY_ARRAY

    const activities: Array<{
      id: string
      teamId: string
      teamName: string
      userName: string
      pokemonId: string
      pokemonName: string
      pickNumber: number
      round: number
      timestamp: number
    }> = []

    let totalPickNumber = 0

    // Process all teams and their picks
    draftState.teams.forEach(team => {
      team.picks.forEach((pokemonId, index) => {
        totalPickNumber++
        const pokemonData = pokemon.find(p => p.id === pokemonId)
        if (pokemonData) {
          const round = Math.floor(index / draftState.teams.length) + 1

          activities.push({
            id: `${team.id}-pick-${index}`,
            teamId: team.id,
            teamName: team.name,
            userName: team.userName,
            pokemonId,
            pokemonName: pokemonData.name,
            pickNumber: totalPickNumber,
            round,
            // Use pick number as stable ordering instead of Date.now() which causes infinite recalculation
            timestamp: totalPickNumber
          })
        }
      })
    })

    return activities.sort((a, b) => b.timestamp - a.timestamp)
  }, [pokemon, draftState?.teams])

  // Handler to show confirmation modal before drafting
  const handleInitiateDraft = useCallback((pokemon: Pokemon) => {
    const isTieredDraft = draftState?.draftSettings?.scoringSystem === 'tiered'

    if (isTieredDraft) {
      // Budget guard: check the tier's point cost against remaining budget
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
      // Budget feasibility guard: block picks that would make team impossible to fill
      if (budgetFeasibility && !isPickSafe(
        pokemon.cost,
        userTeam?.budgetRemaining ?? 0,
        budgetFeasibility.remainingSlots,
        _availablePokemon.map(p => p.cost).sort((a, b) => a - b)
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
    setIsDetailsOpen(false) // Close details modal when showing confirmation
  }, [budgetFeasibility, userTeam?.budgetRemaining, _availablePokemon])

  const [isDrafting, setIsDrafting] = useState(false)
  const [joinTeamName, setJoinTeamName] = useState('')
  const [isJoiningFromLink, setIsJoiningFromLink] = useState(false)
  const [showJoinAuthModal, setShowJoinAuthModal] = useState(false)

  const handleDraftPokemon = useCallback(async (pokemon: Pokemon) => {
    // Check if user can draft (their turn)
    const canDraft = isUserTurn && draftState?.status === 'drafting'
    if (!canDraft) {
      log.info('Cannot draft:', { isUserTurn, isHost, status: draftState?.status })
      if (draftState?.status !== 'drafting') {
        notify.warning('Draft Not Active', 'The draft is not currently active')
      } else if (!isUserTurn) {
        notify.warning('Not Your Turn', `Please wait for your turn. ${currentTeam?.name} is currently picking.`)
      }
      return
    }

    // Prevent double-picks while one is in flight
    if (isDrafting) return
    setIsDrafting(true)
    pickInFlightRef.current = true

    const targetTeam = userTeam
    const targetUserId = userId
    if (!targetTeam) { setIsDrafting(false); pickInFlightRef.current = false; return }

    // Optimistic update: immediately add pick to local state so UI feels instant
    // Also advance the turn so the UI shows the next team's turn
    const previousState = draftState
    if (draftState) {
      const optimisticTeams = draftState.teams.map(t =>
        t.id === targetTeam.id
          ? { ...t, picks: [...t.picks, pokemon.id], budgetRemaining: t.budgetRemaining - (pokemon.cost || 1) }
          : t
      )
      const nextTurn = draftState.currentTurn + 1

      // Derive next team from snake draft order (same logic as transformDraftState)
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
        currentTeam: nextTeamId
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

      await DraftService.makePick(
        roomCode.toLowerCase(),
        targetUserId,
        pokemon.id,
        pokemon.name,
        pickCost
      )

      // Brief delay so Supabase's read layer sees the committed write before we query it.
      // Without this, getDraftState can return pre-pick data (read-your-writes race),
      // overwriting the optimistic update and making the pick disappear for the picker.
      await new Promise(resolve => setTimeout(resolve, 400))

      // Refresh with confirmed server data (high priority - no startTransition)
      try {
        DraftService.invalidateDraftStateCache(roomCode.toLowerCase())
        const freshState = await DraftService.getDraftState(roomCode.toLowerCase())
        if (freshState) {
          setDraftState(transformDraftState(freshState, userId))
        }
      } catch (refreshErr) {
        log.warn('Failed to refresh state after pick:', refreshErr)
      }
      // Safe to allow realtime refreshes now — server state is committed
      pickInFlightRef.current = false

      notify.success(
        `${pokemon.name} Drafted!`,
        `Successfully added ${pokemon.name} to ${targetTeam.name}`,
        { duration: 3000 }
      )

      setSelectedPokemon(null)
      setIsDetailsOpen(false)
      setPreDraftPokemonId(null)
    } catch (err) {
      log.error('Error making pick:', err)

      // Revert optimistic update on error
      if (previousState) {
        setDraftState(previousState)
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to make pick'
      const errorKey = `pick-error-${errorMessage.substring(0, 50)}`

      if (!shouldShowNotification(errorKey, 3000)) {
        setIsDrafting(false)
        return
      }

      // Refresh state to get latest from server
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
        notify.error(
          'Session Error',
          'Your session may have expired. Please refresh the page and rejoin the draft.',
          { duration: 8000 }
        )
      } else if (errorMessage.includes('not your turn')) {
        notify.warning(
          'Turn Changed',
          'The turn has advanced. Refreshing your view...',
          { duration: 3000 }
        )
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
      // If pickInFlightRef wasn't already cleared by the success path,
      // clear it now (e.g. on error after revert)
      pickInFlightRef.current = false
    }
  }, [isUserTurn, isHost, draftState, currentTeam, userTeam, userId, roomCode, shouldShowNotification, transformDraftState, isDrafting])

  const handleSetPreDraft = useCallback((pokemon: Pokemon) => {
    // Only allow pre-drafting when it's not your turn, draft is active, and user is a participant
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

    // Prevent multiple simultaneous start attempts
    if (isStarting) {
      log.info('Already starting, ignoring duplicate call')
      return
    }

    setIsStarting(true)
    try {
      await DraftService.startDraft(roomCode.toLowerCase())
      // Show draft order reveal immediately for the host
      setShowOrderReveal(true)
      log.info('Start request sent, showing order reveal for host...')

      // Reset isStarting after a delay to allow status transition to complete
      // The transition useEffect will handle the final state stabilization
      setTimeout(() => {
        setIsStarting(false)
      }, 1000)
    } catch (err) {
      log.error('Error starting draft:', err)
      notify.error(
        'Failed to Start Draft',
        err instanceof Error ? err.message : 'Failed to start draft. Please try again.'
      )
      setIsStarting(false) // Re-enable button immediately on error
    }
  }, [draftState, roomCode, isStarting])

  // Draft Control Functions
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
      // Refresh the page to show the reset state
      router.refresh()
    } catch (err) {
      log.error('Error resetting draft:', err)
      notify.error('Failed to Reset Draft', err instanceof Error ? err.message : 'Failed to reset draft')
    }
  }, [roomCode, router])

  const handleDeleteDraft = useCallback(async () => {
    try {
      // Pass userId for soft delete and broadcast
      await DraftService.deleteDraft(roomCode.toLowerCase(), userId)

      // Clean up local participation tracking
      UserSessionService.removeDraftParticipation(roomCode.toLowerCase())

      notify.success('Draft Deleted', 'The draft has been deleted. All participants have been notified.')

      // Redirect to home page after deletion
      setTimeout(() => {
        router.push('/my-drafts')
      }, 1500)
    } catch (err) {
      log.error('Error deleting draft:', err)
      notify.error('Failed to Delete Draft', err instanceof Error ? err.message : 'Failed to delete draft')
    }
  }, [roomCode, userId, router])

  const handleShuffleDraftOrder = useCallback(async () => {
    if (isShuffling) return // Prevent double-clicks

    try {
      setIsShuffling(true)
      await DraftService.shuffleDraftOrder(roomCode.toLowerCase())

      // Immediately refresh the draft state to show the new order
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
  }, [roomCode, userId, transformDraftState, isShuffling])

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

  // Proxy picking handlers removed - feature not implemented

  // Ping current player (host-only)
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

  // Listen for incoming pings (non-host players)
  useEffect(() => {
    if (!roomCode || isHost) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null

    const setup = async () => {
      const { supabase } = await import('@/lib/supabase')
      if (!supabase) return

      channel = supabase.channel(`ping:${roomCode.toLowerCase()}`)
      channel.on('broadcast', { event: 'ping_player' }, () => {
        // Only notify if it's this user's turn
        if (draftStateRef.current?.userTeamId === draftStateRef.current?.currentTeam) {
          notify.yourTurn()
        }
      }).subscribe()
    }

    setup()
    return () => {
      if (channel) channel.unsubscribe()
    }
  }, [roomCode, isHost])

  // Auction-specific handlers
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

      notify.success(
        'Auction Started!',
        `${pokemon.name} has been nominated for auction`,
        { duration: 3000 }
      )

      setSelectedPokemon(null)
    } catch (err) {
      log.error('Error nominating Pokemon:', err)
      notify.error(
        'Nomination Failed',
        err instanceof Error ? err.message : 'Failed to nominate Pokemon',
        { duration: 5000 }
      )
    }
  }, [roomCode, userId])

  const handlePlaceBid = useCallback(async (amount: number) => {
    if (!currentAuction) return

    try {
      await DraftService.placeBid(
        roomCode.toLowerCase(),
        userId,
        currentAuction.id,
        amount
      )

      notify.success(
        'Bid Placed!',
        `You bid $${amount} on ${currentAuction.pokemon_name}`,
        { duration: 2000 }
      )
    } catch (err) {
      log.error('Error placing bid:', err)
      notify.error('Bid Failed', err instanceof Error ? err.message : 'Failed to place bid')
    }
  }, [currentAuction, roomCode, userId])

  const handleUndoLastPick = useCallback(async () => {
    if (!roomCode || !draftState) return

    try {
      await DraftService.undoLastPick(roomCode.toLowerCase(), userId)
      notify.success('Pick Undone', 'The last pick has been removed', { duration: 3000 })
    } catch (err) {
      log.error('Error undoing pick:', err)
      notify.error(
        'Undo Failed',
        err instanceof Error ? err.message : 'Failed to undo pick',
        { duration: 5000 }
      )
    }
  }, [roomCode, draftState, userId])

  const handleJoinFromLink = useCallback(async () => {
    if (!authUser?.id || !joinTeamName.trim()) return
    setIsJoiningFromLink(true)
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
    } finally {
      setIsJoiningFromLink(false)
    }
  }, [authUser?.id, joinTeamName, roomCode, transformDraftState])

  const handleRequestNotificationPermission = useCallback(() => {
    requestBrowserNotificationPermission()
  }, [requestBrowserNotificationPermission])

  const handleAuctionTimeExpired = useCallback(async () => {
    if (!currentAuction) return

    try {
      await DraftService.resolveAuction(roomCode.toLowerCase(), currentAuction.id)
      notify.info(
        'Auction Ended',
        `Auction for ${currentAuction.pokemon_name} has concluded`,
        { duration: 3000 }
      )
    } catch (err) {
      log.error('Error resolving auction:', err)
    }
  }, [currentAuction, roomCode])

  const handleExtendAuctionTime = useCallback(async (seconds: number) => {
    if (!currentAuction) return

    try {
      await DraftService.extendAuctionTime(
        roomCode.toLowerCase(),
        currentAuction.id,
        seconds
      )
      notify.info(
        'Auction Extended',
        `Added ${seconds} seconds to the auction`,
        { duration: 2000 }
      )
    } catch (err) {
      log.error('Error extending auction:', err)
    }
  }, [currentAuction, roomCode])


  // Removed userName/teamName check - authenticated users are automatically joined
  // The draft state will handle whether they're a participant or spectator

  // Memoize DraftResults teams to prevent re-renders on completed drafts
  // MUST be before conditional returns (Rules of Hooks)
  const completedDraftTeams = useMemo(() => {
    if (!draftState?.teams) return EMPTY_ARRAY
    return draftState.teams.map(team => ({
      ...team,
      budgetRemaining: draftState?.draftSettings?.draftType === 'auction'
        ? 100 - team.picks.length * 10
        : undefined
    }))
  }, [draftState?.teams, draftState?.draftSettings?.draftType])

  // Show error state
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

  // Show full loading only if no room code
  if (!roomCode) {
    return <DraftRoomLoading />
  }

  // Handle draft completion - show results page
  if (draftState?.status === 'completed') {
    return (
      <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
        <div className="container mx-auto px-4 py-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold brand-gradient-text mb-2">
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

              // Create export data
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

              // Create JSON file
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
    <div className="min-h-screen bg-background transition-colors duration-500">
      <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 max-w-screen-2xl">
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
            <Button variant="ghost" size="icon" onClick={copyRoomCode} className="h-8 w-8" title="Copy room code">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={shareRoom} className="h-8 w-8" title="Share room">
              <Share2 className="h-4 w-4" />
            </Button>
            {draftState && draftState.status === 'drafting' && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsActivitySidebarOpen(true)}
                className="h-8 w-8 relative"
                title="Draft activity"
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
        {showOrderReveal && draftState && (
          <DraftOrderReveal
            teams={draftState.teams}
            userTeamId={draftState.userTeamId}
            onComplete={() => setShowOrderReveal(false)}
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

            {/* Join from link — shown to visitors who don't have a team yet */}
            {!draftState.userTeamId && !isSpectator && draftState.teams.length < draftState.draftSettings.maxTeams && (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                {authUser ? (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Your team name"
                      value={joinTeamName}
                      onChange={(e) => setJoinTeamName(e.target.value)}
                      className="h-8 text-sm flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && handleJoinFromLink()}
                    />
                    <Button
                      size="sm"
                      onClick={handleJoinFromLink}
                      disabled={isJoiningFromLink || !joinTeamName.trim()}
                      className="h-8 shrink-0"
                    >
                      {isJoiningFromLink ? 'Joining...' : 'Join Draft'}
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
                onClick={startDraft}
                disabled={isStarting}
                className="mt-3 bg-green-600 hover:bg-green-700 w-full animate-pulse"
              >
                {isStarting ? 'Starting...' : 'All Teams Ready — Start Draft'}
              </Button>
            )}
          </div>
        )}

        {/* Draft Progress and Team Status */}
        {draftState?.status === 'drafting' && (
          <div className="mb-4">
            <DraftProgress
              currentTurn={draftState?.currentTurn}
              totalTeams={draftState?.teams?.length || 0}
              maxRounds={draftState?.draftSettings?.pokemonPerTeam}
              draftStatus={draftState?.status}
              timeRemaining={pickTimeRemaining}
              userTeamId={draftState?.userTeamId ?? undefined}
              isUserTurn={isUserTurn}
              teams={draftState?.teams || []}
            />
          </div>
        )}

        {/* Team Rosters */}
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {draftState ? (
            // Show actual teams when draft state is loaded
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
            // Show skeleton loading states while connecting
            Array.from({ length: 4 }).map((_, i) => (
              <TeamStatusSkeleton key={`skeleton-${i}`} />
            ))
          )}
        </div>

        {/* Spectator Mode */}
        {draftState && (isSpectator || !draftState.userTeamId) && (
          <div className="mb-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <SpectatorMode
                draftId={roomCode?.toLowerCase() || ''}
                currentPhase={draftState?.status === 'waiting' ? 'setup' :
                             draftState?.status === 'drafting' && !isAuctionDraft ? 'drafting' :
                             draftState?.status === 'drafting' && isAuctionDraft ? 'auction' : 'completed'}
                participantCount={draftState?.teams?.reduce((count, team) => count + (team.userName ? 1 : 0), 0) || 0}
                currentAction={currentAuction ? {
                  type: 'bid',
                  teamName: currentTeam?.name || 'Unknown',
                  pokemonName: currentAuction.pokemon_name,
                  timeRemaining: auctionTimeRemaining
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
              onStartDraft={startDraft}
              onShuffleDraftOrder={handleShuffleDraftOrder}
              onPauseDraft={handlePauseDraft}
              onResumeDraft={handleResumeDraft}
              onEndDraft={handleEndDraft}
              onResetDraft={handleResetDraft}
              onDeleteDraft={handleDeleteDraft}
              onAdvanceTurn={handleAdvanceTurn}
              onSetTimer={handleSetTimer}
              onEnableProxyPicking={noopAutoSkip}
              onDisableProxyPicking={noopAutoSkip}
              isProxyPickingEnabled={false}
              isShuffling={isShuffling}
              onUndoLastPick={handleUndoLastPick}
              onRequestNotificationPermission={handleRequestNotificationPermission}
              onPingCurrentPlayer={handlePingCurrentPlayer}
              onViewResults={handleViewResults}
              onRemoveTeam={draftState?.status === 'waiting' ? handleRemoveTeam : undefined}
              canUndo={draftState?.teams?.some(team => team.picks.length > 0) || false}
              notificationsEnabled={typeof Notification !== 'undefined' && Notification.permission === 'granted'}
              maxPokemonPerTeam={draftState?.draftSettings?.pokemonPerTeam || 6}
            />
          </div>
        )}

        {/* Draft Type Specific Controls - hidden for spectators */}
        {draftState && draftState.status === 'drafting' && !isSpectator && draftState.userTeamId && (
          <div className="mb-3">
            {isAuctionDraft ? (
              // Auction Draft Controls
              <div className="space-y-4">
                {/* Current Auction or Timer */}
                {currentAuction ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <AuctionBiddingInterface
                        currentAuction={currentAuction}
                        pokemon={pokemon?.find(p => p.id === currentAuction.pokemon_id) || null}
                        userTeamId={draftState?.userTeamId}
                        teams={draftState?.teams || []}
                        timeRemaining={auctionTimeRemaining}
                        isUserTurn={true} // Always allow bidding in auction
                        onPlaceBid={handlePlaceBid}
                        onNominatePokemon={(pokemon: Pokemon) => handleNominatePokemon(pokemon, 1, 300)}
                        draftId={roomCode?.toLowerCase() || ''}
                      />
                    </div>
                    <div>
                      <AuctionTimer
                        auctionEndTime={currentAuction.auction_end}
                        isActive={currentAuction.status === 'active'}
                        onTimeExpired={handleAuctionTimeExpired}
                        onExtendTime={(isHost || isAdmin) ? handleExtendAuctionTime : undefined}
                        isHost={isHost}
                      />
                    </div>
                  </div>
                ) : (
                  // No active auction - show nomination interface
                  <AuctionNomination
                    selectedPokemon={selectedPokemon}
                    userTeam={nominationUserTeam}
                    currentNominatingTeam={nominationCurrentTeam}
                    canNominate={canNominate}
                    onNominate={handleNominatePokemon}
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
                {selectedPokemon && isUserTurn ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold truncate flex-1">
                      Draft <span className="text-primary">{selectedPokemon.name}</span>?
                    </span>
                    <Button
                      onClick={() => handleDraftPokemon(selectedPokemon)}
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

        {/* Pre-draft Banner */}
        {preDraftPokemonId && !isUserTurn && draftState?.status === 'drafting' && draftState?.userTeamId && !isSpectator && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg text-sm">
            <span className="text-purple-500 flex-shrink-0">🔖</span>
            <span className="text-purple-800 dark:text-purple-200">
              Pre-drafted: <strong>{legalPokemon.find(p => p.id === preDraftPokemonId)?.name ?? '...'}</strong>
              {' '}— will auto-confirm when your turn starts
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearPreDraft}
              className="ml-auto h-6 px-2 text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 flex-shrink-0"
            >
              Clear
            </Button>
          </div>
        )}

        {/* Pokemon Grid */}
        <div className="bg-card rounded-lg shadow-sm border p-2 sm:p-4">
          <EnhancedErrorBoundary>
            <PokemonGrid
              pokemon={legalPokemon}
              onViewDetails={isUserTurn && draftState?.status === 'drafting' && !isAuctionDraft && !isSpectator ? handleInitiateDraft : handleViewDetails}
              onQuickDraft={undefined}
              onAddToWishlist={handleAddToWishlist}
              onRemoveFromWishlist={handleRemoveFromWishlist}
              onPreDraft={!isUserTurn && draftState?.status === 'drafting' && !isAuctionDraft && !!draftState?.userTeamId && !isSpectator ? handleSetPreDraft : undefined}
              onClearPreDraft={!isUserTurn && draftState?.status === 'drafting' && !isAuctionDraft && !!draftState?.userTeamId && !isSpectator ? (p) => { if (p.id === preDraftPokemonId) handleClearPreDraft() } : undefined}
              preDraftPokemonId={preDraftPokemonId}
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
              maxAffordableCost={draftState?.draftSettings?.scoringSystem === 'tiered' ? undefined : budgetFeasibility?.maxAffordableCost}
              remainingSlots={budgetFeasibility?.remainingSlots}
              draftedByTeamMap={draftedByTeamMap}
            />
          </EnhancedErrorBoundary>
        </div>

        {/* Details Modal */}
        <PokemonDetailsModal
          pokemon={detailsPokemon}
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          onSelect={!draftState || isAuctionDraft || isSpectator || !draftState?.userTeamId ? undefined : (isUserTurn && draftState?.status === 'drafting' ? handleInitiateDraft : undefined)}
          isDrafted={detailsPokemon && draftState ? allDraftedIds.includes(detailsPokemon.id) : false}
          isAtPickLimit={userTeam ? userTeam.picks.length >= (draftState?.draftSettings?.pokemonPerTeam || 6) : false}
          currentPicks={userTeam?.picks.length || 0}
          maxPicks={draftState?.draftSettings?.pokemonPerTeam || 6}
        />

        {/* Draft Confirmation Modal */}
        <DraftConfirmationModal
          pokemon={confirmationPokemon}
          isOpen={isConfirmationOpen}
          onClose={() => setIsConfirmationOpen(false)}
          onConfirm={async (pokemon) => {
            await handleDraftPokemon(pokemon)
            setIsConfirmationOpen(false)
          }}
          isLoading={isDrafting}
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
    </div>
  )
}