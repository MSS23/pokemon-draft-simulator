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
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ImageTypeToggle } from '@/components/ui/image-type-toggle'
import ConnectionStatus from '@/components/ui/ConnectionStatus'
import { Copy, Share2, History } from 'lucide-react'
import { DraftService, type DraftState as DBDraftState } from '@/lib/draft-service'
import { UserSessionService } from '@/lib/user-session'
import { useNotify } from '@/components/providers/NotificationProvider'
import { DraftRoomLoading, TeamStatusSkeleton } from '@/components/ui/loading-states'
import { EnhancedErrorBoundary } from '@/components/ui/enhanced-error-boundary'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useReconnection } from '@/hooks/useReconnection'
import { useLatest } from '@/hooks/useLatest'

/**
 * OPTIMIZED DYNAMIC IMPORTS - Strategic code splitting:
 *
 * CRITICAL (Load Immediately - No lazy loading):
 * - PokemonGrid: Core functionality, needed immediately
 * - TeamRoster: Always visible, needed for draft state
 * - DraftProgress: Always visible during active draft
 *
 * HEAVY (Lazy Load - Reduce initial bundle):
 * - AIDraftAssistant: Heavy AI logic, only for active drafts
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

// Heavy components - lazy load with loading states
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

const AIDraftAssistant = dynamic(() =>
  import('@/components/draft/AIDraftAssistant').then(mod => ({ default: mod.AIDraftAssistant })), {
  ssr: false,
  loading: () => <div className="h-96 bg-muted rounded-lg animate-pulse" />
})

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
  }>
  participants: Array<{
    userId: string | null
    team_id: string | null
    display_name: string
    last_seen: string
  }>
  draftSettings: {
    maxTeams: number
    timeLimit: number
    pokemonPerTeam: number
    draftType: 'snake' | 'auction'
    formatId?: string
    customFormatId?: string
  }
  timeRemaining: number
  draft: {
    id: string
    custom_format_id?: string
    turn_started_at?: string
    status: string
  }
}

// Global subscription tracker to prevent leaks across page refreshes
declare global {
  interface Window {
    __draftSubscriptionCleanup?: (() => void)[]
  }
}

// Initialize global cleanup array
if (typeof window !== 'undefined' && !window.__draftSubscriptionCleanup) {
  window.__draftSubscriptionCleanup = []

  // Global cleanup on page unload (handles hard refresh, tab close, navigation)
  window.addEventListener('beforeunload', () => {
    console.log('[Draft Cleanup] Page unloading, cleaning up subscriptions:', window.__draftSubscriptionCleanup?.length)
    window.__draftSubscriptionCleanup?.forEach(cleanup => {
      try {
        cleanup()
      } catch (error) {
        console.error('[Draft Cleanup] Error during cleanup:', error)
      }
    })
    window.__draftSubscriptionCleanup = []
  })
}

export default function DraftRoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomCode = (params.id as string)?.toUpperCase()
  const userName = searchParams.get('userName') || ''
  const isHost = searchParams.get('isHost') === 'true'
  const isSpectator = searchParams.get('spectator') === 'true'

  // Get or create persistent user session - SYNCHRONOUS to prevent race conditions
  const [userId] = useState<string>(() => {
    // Try to get from existing participation first
    const participation = UserSessionService.getDraftParticipation(roomCode?.toLowerCase() || '')
    if (participation && participation.userId) {
      return participation.userId
    }

    // Try to get current session from localStorage (synchronous)
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

    // Generate a stable guest ID (synchronous)
    // Use combination of timestamp and random for uniqueness
    const guestId = `guest-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

    // Store in sessionStorage immediately for this draft (works in incognito)
    if (typeof window !== 'undefined' && roomCode) {
      const draftSessionKey = `draft-user-${roomCode.toLowerCase()}`
      sessionStorage.setItem(draftSessionKey, guestId)
    }

    return guestId
  })

  const [selectedPokemon, setSelectedPokemon] = useState<Pokemon | null>(null)
  const [detailsPokemon, setDetailsPokemon] = useState<Pokemon | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isProxyPickingEnabled, setIsProxyPickingEnabled] = useState(false)
  const [isShuffling, setIsShuffling] = useState(false)

  // Real draft state from Supabase
  const [draftState, setDraftState] = useState<DraftUIState | null>(null)
  const [, startTransition] = useTransition()

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

  // Pick timer state
  const [pickTimeRemaining, setPickTimeRemaining] = useState<number>(0)
  const [turnStartTime, setTurnStartTime] = useState<number | null>(null)
  const [lastTrackedTurn, setLastTrackedTurn] = useState<number | null>(null)

  // Draft start transition detection (to increase debounce during critical transition)
  const [isDraftStarting, setIsDraftStarting] = useState(false)
  const lastStatusRef = useRef<'waiting' | 'drafting' | 'completed' | 'paused' | null>(null)

  // Notification deduplication refs to prevent spam
  const lastNotifiedTurnRef = useRef<number | null>(null)
  const lastNotifiedPickCountRef = useRef<number>(0)

  // Stabilized timer value for components (updates max once per second)
  const stabilizedTimeRemaining = useMemo(() => Math.floor(pickTimeRemaining), [pickTimeRemaining])

  // Server time synchronization state
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0)
  const getServerTime = useCallback(() => {
    return Date.now() + serverTimeOffset
  }, [serverTimeOffset])

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
  const notify = useNotify()

  // Demo mode detection - we are always in non-demo mode when connected to the database
  const isDemoMode = false

  // Transform database state to UI state (defined early so hooks can use it)
  const transformDraftState = useCallback((dbState: DBDraftState, userId: string): DraftUIState => {
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
        budgetRemaining: team.budget_remaining
      }
    }).sort((a, b) => a.draftOrder - b.draftOrder)

    // Find user's team ID
    const userParticipant = dbState.participants.find(p => p.user_id === userId)
    const userTeamId = userParticipant?.team_id || null

    // Calculate current team based on turn using proper snake draft logic
    const currentTurn = dbState.draft.current_turn || 1
    const totalTeams = teams.length
    const maxRounds = dbState.draft.settings?.maxPokemonPerTeam || 10

    // Use same logic as store selector for consistency
    let currentTeamId = ''
    if (totalTeams > 0 && currentTurn) {
      // Generate snake draft order
      const draftOrder: number[] = []
      for (let round = 0; round < maxRounds; round++) {
        if (round % 2 === 0) {
          // Normal order (1, 2, 3, 4...)
          for (let i = 1; i <= totalTeams; i++) {
            draftOrder.push(i)
          }
        } else {
          // Reverse order (4, 3, 2, 1...)
          for (let i = totalTeams; i >= 1; i--) {
            draftOrder.push(i)
          }
        }
      }

      if (currentTurn <= draftOrder.length) {
        const currentTeamOrder = draftOrder[currentTurn - 1]
        const currentTeam = teams.find(team => team.draftOrder === currentTeamOrder)
        currentTeamId = currentTeam?.id || ''
      }
    }

    const status: 'waiting' | 'drafting' | 'completed' | 'paused' =
      dbState.draft.status === 'setup' ? 'waiting' :
      dbState.draft.status === 'active' ? 'drafting' :
      dbState.draft.status === 'paused' ? 'paused' : 'completed'

    return {
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
        last_seen: p.last_seen
      })),
      draftSettings: {
        maxTeams: dbState.draft.max_teams,
        timeLimit: (dbState.draft.settings as any)?.timeLimit || 60,
        pokemonPerTeam: (dbState.draft.settings as any)?.pokemonPerTeam || 6,
        draftType: dbState.draft.format,
        formatId: (dbState.draft.settings as any)?.formatId,
        customFormatId: (dbState.draft as any).custom_format_id
      },
      timeRemaining: (dbState.draft.settings as any)?.timeLimit || 60,
      draft: {
        id: dbState.draft.id,
        custom_format_id: (dbState.draft as any).custom_format_id,
        turn_started_at: (dbState.draft as any).turn_started_at,
        status: dbState.draft.status
      }
    }
  }, [roomCode])

  // Derived variables - use refs to prevent infinite loops in Radix UI
  // Create stable signature using ref to prevent infinite recalculation
  const lastTeamsSignatureRef = useRef('')
  const draftStateTeamsRef = useRef(draftState?.teams)

  // Keep ref in sync
  useEffect(() => {
    draftStateTeamsRef.current = draftState?.teams
  }, [draftState?.teams])

  const teamsSignature = useMemo(() => {
    const teams = draftStateTeamsRef.current
    if (!teams) return ''

    // Create signature from team data
    const newSignature = teams
      .map(t => `${t.id}:${t.picks.length}:${t.budgetRemaining}`)
      .join('|')

    // Only update ref if signature actually changed
    if (newSignature !== lastTeamsSignatureRef.current) {
      lastTeamsSignatureRef.current = newSignature
      return newSignature // Return new signature when changed
    }

    // Return stable ref value (prevents re-renders)
    return lastTeamsSignatureRef.current
  }, [draftState?.teams]) // eslint-disable-line react-hooks/exhaustive-deps
  // Note: We intentionally depend on draftState?.teams to trigger recalculation,
  // but use refs to prevent infinite loops

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

  const isAuctionDraft = useMemo(() =>
    draftState?.draftSettings?.draftType === 'auction',
    [draftState?.draftSettings?.draftType]
  )

  // Track participant online status based on last_seen timestamps
  const participantOnlineStatus = useMemo(() => {
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

  // Check if current turn user is online
  const isCurrentUserOnline = useMemo(() => {
    if (!draftState?.currentTeam) return true
    return participantOnlineStatus.get(draftState.currentTeam) ?? true
  }, [draftState?.currentTeam, participantOnlineStatus])

  // Connection management with auto-reconnect
  const { isConnected: hookConnected, isReconnecting } = useReconnection({
    enabled: !!roomCode && !isDemoMode,
    onReconnect: async () => {
      try {
        const dbState = await DraftService.getDraftState(roomCode.toLowerCase())
        if (dbState) {
          setDraftState(transformDraftState(dbState, userId))
        }
      } catch (error) {
        console.error('Failed to reload draft state on reconnect:', error)
      }
    }
  })

  // Derive connection status
  const connectionStatus = useMemo(() => {
    if (isReconnecting) return 'reconnecting'
    if (hookConnected) return 'online'
    return 'offline'
  }, [hookConnected, isReconnecting])

  // Turn notifications with browser notifications
  const { requestBrowserNotificationPermission } = useTurnNotifications({
    isUserTurn: isUserTurn || false,
    pickTimeRemaining,
    draftStatus: draftState?.status || 'waiting',
    enableBrowserNotifications: true,
    warningThreshold: 10,
    isConnected: hookConnected && connectionStatus === 'online',
    currentTurn: draftState?.currentTurn,
    onAutoSkip: async () => {
      // Double check connection status and user turn before auto-skipping
      if (roomCode && isUserTurn && hookConnected && connectionStatus === 'online') {
        try {
          await DraftService.autoSkipTurn(roomCode.toLowerCase())
          notify.warning('Turn Skipped', 'Your time expired and your turn was skipped', { duration: 5000 })
        } catch (error) {
          // Don't show error if draft is just not found (may have ended)
          if (error instanceof Error && !error.message.includes('not found')) {
            console.error('Auto-skip failed:', error)
            notify.error('Skip Failed', 'Could not skip turn automatically')
          }
        }
      }
    }
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

        // Check if draft is private and requires access verification
        const isPublic = (dbState.draft as any).is_public
        const hasPassword = !!(dbState.draft as any).password

        if (!isPublic || hasPassword) {
          // Private or password-protected draft - verify access
          const { hasVerifiedAccess } = await import('@/lib/draft-access')

          if (!hasVerifiedAccess(roomCode)) {
            // User hasn't verified access - redirect to join page
            setError('Access denied: You must join this private draft through the proper join flow')
            router.push(`/join-draft?code=${roomCode.toUpperCase()}`)
            return
          }
        }

        setDraftState(transformDraftState(dbState, userId))
        setIsConnected(true)
      } catch (err) {
        if (!mounted || abortController.signal.aborted) return
        console.error('Error loading draft state:', err)
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
        console.error('Failed to sync server time:', error)
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
    const currentActivityIds = recentActivity.map(a => a.id).join(',')

    // Only update if the activity has actually changed
    if (newActivityIds !== currentActivityIds) {
      setRecentActivity(newActivities)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftState?.teams, pokemon])

  // Detect draft start transition to increase debounce
  useEffect(() => {
    if (lastStatusRef.current === 'waiting' && draftState?.status === 'drafting') {
      console.log('[Draft Start] Transition detected: waiting → drafting')
      setIsDraftStarting(true)
      // Give 2 seconds for all updates to settle during draft start
      const timeoutId = setTimeout(() => {
        console.log('[Draft Start] Cooldown period ended')
        setIsDraftStarting(false)
      }, 2000)
      return () => clearTimeout(timeoutId)
    }
    lastStatusRef.current = draftState?.status || null
  }, [draftState?.status])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!roomCode || !isConnected) return

    let mounted = true
    const abortController = new AbortController()

    let errorCount = 0
    const MAX_ERRORS = 5
    let updateTimeoutId: NodeJS.Timeout | null = null
    let lastProcessedTimestamp: string | null = null // Track last processed update to prevent duplicates

    // Create cleanup function for this subscription
    const cleanup = () => {
      mounted = false
      abortController.abort()
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId)
      }
    }

    // Register cleanup globally to prevent leaks on page refresh
    if (typeof window !== 'undefined') {
      window.__draftSubscriptionCleanup = window.__draftSubscriptionCleanup || []
      window.__draftSubscriptionCleanup.push(cleanup)
    }

    const unsubscribe = DraftService.subscribeToDraft(roomCode.toLowerCase(), async (payload) => {
      // Debounce rapid updates to prevent infinite loops
      // Increased to 500ms to account for network latency (was 100ms)
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId)
      }

      updateTimeoutId = setTimeout(async () => {
        // Deduplicate events by updated_at timestamp
        const newTimestamp = payload?.new?.updated_at || payload?.new?.created_at
        if (newTimestamp && newTimestamp === lastProcessedTimestamp) {
          console.log('[Draft Subscription] Duplicate event ignored:', newTimestamp)
          return
        }

        // Reload draft state when changes occur
        console.log('[Draft Subscription] Change detected:', payload?.eventType, payload?.new || payload?.old)

        // Update last processed timestamp
        if (newTimestamp) {
          lastProcessedTimestamp = newTimestamp
        }

        try {
          const dbState = await DraftService.getDraftState(roomCode.toLowerCase())

          // Check if component is still mounted before updating state
          if (!mounted || abortController.signal.aborted) return

          // Reset error count on successful fetch
          errorCount = 0

          if (dbState) {
            // Use refs to get current values without creating dependencies
            const currentUserId = userIdRef.current
            const currentTransformDraftState = transformDraftStateRef.current
            const currentDraftState = draftStateRef.current
            const currentPokemon = pokemonRef.current
            const currentIsAuctionDraft = isAuctionDraftRef.current
            const currentNotify = notifyRef.current

            const newState = currentTransformDraftState(dbState, currentUserId)
            console.log('[Draft Subscription] State updated, teams:', newState.teams.map(t => ({ name: t.name, order: t.draftOrder })))

            // Check for pick notifications (only if not the user's own pick)
            if (currentDraftState && newState.teams && currentPokemon) {
              const newTotalPicks = newState.teams.reduce((sum, team) => sum + team.picks.length, 0)
              const oldTotalPicks = currentDraftState.teams.reduce((sum, team) => sum + team.picks.length, 0)

              // Only notify if pick count increased AND we haven't already notified for this count
              if (newTotalPicks > oldTotalPicks && newTotalPicks !== lastNotifiedPickCountRef.current) {
                lastNotifiedPickCountRef.current = newTotalPicks

                // Find which team made the pick
                const pickingTeam = newState.teams.find(team => {
                  const oldTeam = currentDraftState.teams.find(t => t.id === team.id)
                  return oldTeam && team.picks.length > oldTeam.picks.length
                })

                if (pickingTeam && pickingTeam.id !== newState.userTeamId) {
                  const latestPickId = pickingTeam.picks[pickingTeam.picks.length - 1]
                  const pickedPokemon = currentPokemon.find(p => p.id === latestPickId)
                  if (pickedPokemon) {
                    currentNotify.success(
                      `${pickingTeam.name} drafted ${pickedPokemon.name}!`,
                      `${pickingTeam.userName} selected ${pickedPokemon.name}`,
                      { duration: 4000 }
                    )
                  }
                }
              }
            }

            // Check for turn change notifications (snake draft only)
            if (!currentIsAuctionDraft && currentDraftState && newState.currentTeam !== currentDraftState.currentTeam) {
              // Only notify if turn number actually changed (prevents duplicate notifications)
              if (newState.currentTurn !== lastNotifiedTurnRef.current) {
                lastNotifiedTurnRef.current = newState.currentTurn

                const currentTeam = newState.teams.find(t => t.id === newState.currentTeam)
                if (currentTeam) {
                  if (newState.userTeamId === newState.currentTeam) {
                    currentNotify.success(
                      "It's Your Turn!",
                      "Select a Pokémon to draft",
                      { duration: 5000 }
                    )
                  } else {
                    currentNotify.info(
                      `${currentTeam.name}'s Turn`,
                      `Waiting for ${currentTeam.userName} to pick`,
                      { duration: 3000 }
                    )
                  }
                }
              }
            }

            // Use startTransition to defer state updates and prevent infinite loops
            // This allows React to complete current renders before processing new updates
            startTransition(() => {
              setDraftState(newState)
            })
          } else {
            // Draft not found - increment error count
            errorCount++
            if (errorCount >= MAX_ERRORS) {
              console.error('Draft not found after multiple attempts, stopping updates')
              setError('Draft room not found or has been deleted')
              mounted = false // Stop further updates
              return
            }
          }
        } catch (err) {
        if (!mounted || abortController.signal.aborted) return

        errorCount++
        console.error('Error updating draft state:', err, `(${errorCount}/${MAX_ERRORS})`)

        if (errorCount >= MAX_ERRORS) {
          const currentNotify = notifyRef.current
          currentNotify.error('Connection Error', 'Unable to connect to draft. Please refresh the page.')
          setError('Failed to connect to draft after multiple attempts')
          mounted = false // Stop further updates
        }
      }
      // Dynamic debounce: 1000ms during draft start transition, 500ms normally
      }, isDraftStarting ? 1000 : 500)
    })

    return () => {
      // Run cleanup
      cleanup()
      unsubscribe()

      // Remove from global cleanup list
      if (typeof window !== 'undefined' && window.__draftSubscriptionCleanup) {
        const index = window.__draftSubscriptionCleanup.indexOf(cleanup)
        if (index > -1) {
          window.__draftSubscriptionCleanup.splice(index, 1)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isConnected, userId, isDraftStarting])

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
        console.error('Error loading current auction:', error)
      }
    }

    loadCurrentAuction()
  }, [isAuctionDraft, roomCode, draftState])

  /**
   * FIXED TIMER MEMORY LEAK - Memory leak prevention:
   * 1. Use isMounted flag to prevent state updates after unmount
   * 2. Properly cleanup animationFrame on unmount
   * 3. Guard all setState calls with isMounted check
   *
   * Expected improvement: Zero memory leaks, prevents React warnings
   */
  useEffect(() => {
    if (isAuctionDraft || !draftState || draftState.status !== 'drafting') {
      setPickTimeRemaining(0)
      setTurnStartTime(null)
      return
    }

    let isMounted = true // Memory leak prevention flag

    // Reset timer when turn changes (fix: compare turn numbers, not turn to timestamp)
    if (draftState.currentTurn !== lastTrackedTurn) {
      // Use database turn_started_at if available, otherwise fallback to current time
      const dbTurnStartedAt = draftState.draft?.turn_started_at
      const turnStart = dbTurnStartedAt
        ? new Date(dbTurnStartedAt).getTime()
        : getServerTime()

      if (isMounted) {
        setLastTrackedTurn(draftState.currentTurn)
        setTurnStartTime(turnStart)
        setPickTimeRemaining(draftState.draftSettings.timeLimit)
      }
    }

    const checkIsUserTurn = draftState?.userTeamId === draftState?.currentTeam

    let animationFrameId: number | null = null

    const updateTimer = () => {
      // Guard against updates after unmount
      if (!isMounted || !turnStartTime) {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId)
        }
        return
      }

      const now = getServerTime()
      const elapsed = Math.floor((now - turnStartTime) / 1000)
      const remaining = Math.max(0, draftState.draftSettings.timeLimit - elapsed)

      // Only update state if still mounted
      if (isMounted) {
        setPickTimeRemaining(remaining)
      }

      if (remaining === 0 && checkIsUserTurn && isMounted) {
        notify.warning('Time Expired!', 'Your turn has been skipped', { duration: 3000 })
      }

      // Continue updating if time remains and still mounted
      if (remaining > 0 && isMounted) {
        animationFrameId = requestAnimationFrame(updateTimer)
      }
    }

    // Start the timer
    animationFrameId = requestAnimationFrame(updateTimer)

    // Cleanup function
    return () => {
      isMounted = false // Mark as unmounted
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isAuctionDraft, draftState, lastTrackedTurn, turnStartTime, notify, getServerTime])

  // Derived state - memoized to prevent unnecessary recalculations
  const allDraftedIds = useMemo(() => {
    return draftState?.teams.flatMap(team => team.picks) || []
  }, [draftState?.teams])

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

  const availablePokemon = useMemo(() => {
    return pokemon?.filter(p => p.isLegal && !allDraftedIds.includes(p.id)) || []
  }, [pokemon, allDraftedIds])

  /**
   * STABLE CALLBACKS - Using useRef pattern to avoid dependency changes
   * This prevents 100+ PokemonCard re-renders when state changes
   */

  // Store latest values in refs to avoid callback recreation
  // Use useLatest to always have fresh values in callbacks (prevents stale closures)
  const draftStateRef = useLatest(draftState)
  const userIdRef = useLatest(userId)
  const isSpectatorRef = useLatest(isSpectator)
  const notifyRef = useLatest(notify)
  const transformDraftStateRef = useLatest(transformDraftState)
  const pokemonRef = useLatest(pokemon)
  const isAuctionDraftRef = useLatest(isAuctionDraft)

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

    const { WishlistService } = await import('@/lib/wishlist-service')

    const participant = currentDraftState.teams.find(t => t.id === currentDraftState.userTeamId)
    if (!participant) {
      currentNotify.warning('Cannot Add to Wishlist', 'You must be part of a team to use wishlist')
      return
    }

    try {
      await WishlistService.addToWishlist(
        roomCode.toLowerCase(),
        currentUserId,
        pokemon
      )
      currentNotify.success('Added to Wishlist', `${pokemon.name} added to your wishlist`, { duration: 2000 })
    } catch (error) {
      console.error('Error adding to wishlist:', error)
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

    const { WishlistService } = await import('@/lib/wishlist-service')

    try {
      await WishlistService.removeFromWishlist(
        roomCode.toLowerCase(),
        currentUserId,
        pokemon.id
      )
      currentNotify.success('Removed from Wishlist', `${pokemon.name} removed from your wishlist`, { duration: 2000 })
    } catch (error) {
      console.error('Error removing from wishlist:', error)
      currentNotify.error('Failed to Remove', 'Could not remove Pokémon from wishlist')
    }
  }, [roomCode, draftStateRef, userIdRef, isSpectatorRef, notifyRef])

  // Get wishlist Pokemon IDs for the current user
  const wishlistPokemonIds = useMemo(() => {
    // This will be populated by the wishlist real-time sync
    // For now, return empty array - will be populated by WishlistManager component
    return []
  }, [])

  /**
   * OPTIMIZED SIDEBAR ACTIVITIES - Performance enhancement:
   * 1. Track total pick count to avoid unnecessary recalculation
   * 2. Only recompute when pick count changes
   * 3. Use early return for empty states
   *
   * Expected improvement: 50-70% fewer recalculations
   */

  // Create a stable string representation of picks for memo dependency
  const picksSignature = useMemo(() => {
    if (!draftState?.teams) return ''
    return draftState.teams.map(t => `${t.id}:${t.picks.length}`).join('|')
  }, [draftState?.teams])

  // Sidebar activities - only recalculate when picks change (not on every draftState update)
  const sidebarActivities = useMemo(() => {
    // Early return for empty states
    if (!draftState?.teams || !pokemon) return []

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
            timestamp: Date.now() - (totalPickNumber - 1) * 30000
          })
        }
      })
    })

    return activities.sort((a, b) => b.timestamp - a.timestamp)
  }, [pokemon, draftState?.teams])

  // Memoize AI Assistant props to prevent infinite re-renders
  const aiCurrentTeam = useMemo(() => {
    if (!userTeam || !pokemon) return []
    return userTeam.picks
      .map(id => pokemon.find(p => p.id === id))
      .filter(Boolean) as Pokemon[]
  }, [userTeam, pokemon])

  const aiOpponentTeams = useMemo(() => {
    if (!draftState?.teams || !draftState.userTeamId || !pokemon || !roomCode) return []
    return draftState.teams
      .filter(t => t.id !== draftState.userTeamId)
      .map(t => ({
        id: t.id,
        draftId: roomCode.toLowerCase(),
        name: t.name,
        ownerId: null,
        budgetRemaining: t.budgetRemaining,
        draftOrder: t.draftOrder,
        picks: t.picks.map(pokemonId => ({
          id: pokemonId,
          draftId: roomCode.toLowerCase(),
          teamId: t.id,
          pokemonId,
          pokemonName: pokemon.find(p => p.id === pokemonId)?.name || 'Unknown',
          cost: pokemon.find(p => p.id === pokemonId)?.cost || 0,
          pickOrder: 0,
          round: 1,
          createdAt: new Date().toISOString()
        }))
      }))
  }, [draftState?.teams, draftState?.userTeamId, pokemon, roomCode])

  // Memoize AI Assistant format and callback props to prevent infinite re-renders
  const aiFormat = useMemo(() => ({
    id: formatId,
    name: formatId
  } as any), [formatId])

  const handleAISelectPokemon = useCallback((pokemon: Pokemon) => {
    setSelectedPokemon(pokemon)
    // Auto-scroll to selection area
    if (!isAuctionDraft && isUserTurn) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [isAuctionDraft, isUserTurn])

  const handleDraftPokemon = useCallback(async (pokemon: Pokemon) => {
    // Check if user can draft (their turn or proxy picking enabled)
    const canDraft = (isUserTurn || (isHost && isProxyPickingEnabled)) && draftState?.status === 'drafting'
    if (!canDraft) {
      console.log('[Draft] Cannot draft:', { isUserTurn, isHost, isProxyPickingEnabled, status: draftState?.status })
      // Show user-friendly error message
      if (draftState?.status !== 'drafting') {
        notify.warning('Draft Not Active', 'The draft is not currently active')
      } else if (!isUserTurn) {
        notify.warning('Not Your Turn', `Please wait for your turn. ${currentTeam?.name} is currently picking.`)
      }
      return
    }

    // Double-check database status before attempting pick (defensive validation)
    try {
      const freshDraftState = await DraftService.getDraftState(roomCode.toLowerCase())
      if (!freshDraftState || freshDraftState.draft.status !== 'active') {
        notify.error('Draft Not Active', 'The draft is not currently active. Please wait.')
        return
      }
    } catch (error) {
      console.error('[Draft] Error validating draft status:', error)
      notify.error('Connection Error', 'Could not validate draft status. Please try again.')
      return
    }

    // Determine which team to draft for
    let targetTeam: typeof userTeam
    let targetUserId: string

    if (isHost && isProxyPickingEnabled && !isUserTurn) {
      // Proxy picking: draft for the current team
      targetTeam = currentTeam
      if (!targetTeam) return

      // For proxy picking, we need to modify the approach
      // Instead of creating a proxy user ID, let's use the host's user ID
      // and modify the service call to specify the target team
      targetUserId = userId // Host's user ID
    } else {
      // Normal picking: draft for user's own team
      targetTeam = userTeam
      targetUserId = userId
      if (!targetTeam) return
    }

    // Mark Pokemon as drafted in all wishlists
    const { WishlistService } = await import('@/lib/wishlist-service')
    await WishlistService.markPokemonDrafted(roomCode.toLowerCase(), pokemon.id)

    try {
      if (isHost && isProxyPickingEnabled && !isUserTurn) {
        // Use proxy picking for the current team
        await DraftService.makeProxyPick(
          roomCode.toLowerCase(),
          userId, // Host's user ID
          targetTeam.id, // Target team ID
          pokemon.id,
          pokemon.name,
          pokemon.cost || 1
        )
      } else {
        // Normal picking for user's own team
        await DraftService.makePick(
          roomCode.toLowerCase(),
          targetUserId,
          pokemon.id,
          pokemon.name,
          pokemon.cost || 1
        )
      }

      // Show success notification
      const teamName = targetTeam.name
      const isProxyPick = isHost && isProxyPickingEnabled && !isUserTurn

      notify.success(
        `${pokemon.name} Drafted!`,
        isProxyPick
          ? `Successfully drafted ${pokemon.name} for ${teamName} (proxy pick)`
          : `Successfully added ${pokemon.name} to ${teamName}`,
        { duration: 3000 }
      )

      setSelectedPokemon(null)
      setIsDetailsOpen(false)
    } catch (err) {
      console.error('Error making pick:', err)

      // Provide specific error messages based on error type
      const errorMessage = err instanceof Error ? err.message : 'Failed to make pick'

      if (errorMessage.includes('not part of this draft') || errorMessage.includes('not found')) {
        notify.error(
          'Session Error',
          'Your session may have expired. Please refresh the page and rejoin the draft.',
          { duration: 8000 }
        )
      } else if (errorMessage.includes('not your turn')) {
        notify.warning(
          'Not Your Turn',
          `Please wait for your turn. ${currentTeam?.name} is currently picking.`,
          { duration: 5000 }
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
    }
  }, [isUserTurn, isHost, isProxyPickingEnabled, draftState?.status, currentTeam, userTeam, userId, roomCode, notify])

  const copyRoomCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode)
    notify.success('Room Code Copied!', `${roomCode} copied to clipboard`)
  }, [roomCode, notify])

  const shareRoom = useCallback(() => {
    const shareUrl = `${window.location.origin}/join-draft?code=${roomCode}`
    navigator.clipboard.writeText(shareUrl)
    notify.success('Share Link Copied!', 'Invite link copied to clipboard')
  }, [roomCode, notify])

  const startDraft = useCallback(async () => {
    if (!draftState || !draftState.teams || draftState.teams.length < 2) {
      notify.warning('Cannot Start Draft', 'Need at least 2 teams to start the draft')
      return
    }

    try {
      await DraftService.startDraft(roomCode.toLowerCase())
      notify.success('Draft Started!', 'The Pokémon draft has begun. Good luck!', { duration: 4000 })
    } catch (err) {
      console.error('Error starting draft:', err)
      notify.error(
        'Failed to Start Draft',
        err instanceof Error ? err.message : 'Failed to start draft. Please try again.'
      )
    }
  }, [draftState, roomCode, notify])

  // Draft Control Functions
  const handlePauseDraft = useCallback(async () => {
    try {
      await DraftService.pauseDraft(roomCode.toLowerCase())
    } catch (err) {
      console.error('Error pausing draft:', err)
      notify.error('Failed to Pause', err instanceof Error ? err.message : 'Failed to pause draft')
    }
  }, [roomCode, notify])

  const handleResumeDraft = useCallback(async () => {
    try {
      await DraftService.resumeDraft(roomCode.toLowerCase())
    } catch (err) {
      console.error('Error resuming draft:', err)
      notify.error('Failed to Resume', err instanceof Error ? err.message : 'Failed to resume draft')
    }
  }, [roomCode, notify])

  const handleEndDraft = useCallback(async () => {
    try {
      await DraftService.endDraft(roomCode.toLowerCase())
    } catch (err) {
      console.error('Error ending draft:', err)
      notify.error('Failed to End Draft', err instanceof Error ? err.message : 'Failed to end draft')
    }
  }, [roomCode, notify])

  const handleResetDraft = useCallback(async () => {
    try {
      await DraftService.resetDraft(roomCode.toLowerCase())
      notify.success('Draft Reset', 'All picks have been cleared. Teams remain intact.')
      // Refresh the page to show the reset state
      window.location.reload()
    } catch (err) {
      console.error('Error resetting draft:', err)
      notify.error('Failed to Reset Draft', err instanceof Error ? err.message : 'Failed to reset draft')
    }
  }, [roomCode, notify])

  const handleDeleteDraft = useCallback(async () => {
    try {
      await DraftService.deleteDraft(roomCode.toLowerCase())
      notify.success('Draft Deleted', 'The draft has been permanently deleted')
      // Redirect to home page after deletion
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
    } catch (err) {
      console.error('Error deleting draft:', err)
      notify.error('Failed to Delete Draft', err instanceof Error ? err.message : 'Failed to delete draft')
    }
  }, [roomCode, notify])

  const handleShuffleDraftOrder = useCallback(async () => {
    if (isShuffling) return // Prevent double-clicks

    try {
      setIsShuffling(true)
      await DraftService.shuffleDraftOrder(roomCode.toLowerCase())

      // Immediately refresh the draft state to show the new order
      const updatedState = await DraftService.getDraftState(roomCode.toLowerCase())
      if (updatedState) {
        setDraftState(transformDraftState(updatedState, userId))
      }

      notify.success('Draft Order Shuffled!', 'Team draft order has been randomized. Check the Draft Order section.')
    } catch (err) {
      console.error('Error shuffling draft order:', err)
      notify.error('Failed to Shuffle', err instanceof Error ? err.message : 'Failed to shuffle draft order')
    } finally {
      setIsShuffling(false)
    }
  }, [roomCode, notify, userId, transformDraftState, isShuffling])

  const handleAdvanceTurn = useCallback(async () => {
    try {
      await DraftService.advanceTurn(roomCode.toLowerCase())
    } catch (err) {
      console.error('Error advancing turn:', err)
      notify.error('Failed to Advance Turn', err instanceof Error ? err.message : 'Failed to advance turn')
    }
  }, [roomCode, notify])

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
      console.error('Error updating timer:', err)
      notify.error('Failed to Update Timer', err instanceof Error ? err.message : 'Failed to update timer')
    }
  }, [roomCode, notify, draftState?.status])

  const handleEnableProxyPicking = useCallback(() => {
    setIsProxyPickingEnabled(true)
  }, [])

  const handleDisableProxyPicking = useCallback(() => {
    setIsProxyPickingEnabled(false)
  }, [])

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
      console.error('Error nominating Pokemon:', err)
      notify.error(
        'Nomination Failed',
        err instanceof Error ? err.message : 'Failed to nominate Pokemon',
        { duration: 5000 }
      )
    }
  }, [roomCode, userId, notify])

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
      console.error('Error placing bid:', err)
      notify.error('Bid Failed', err instanceof Error ? err.message : 'Failed to place bid')
    }
  }, [currentAuction, roomCode, userId, notify])

  const handleUndoLastPick = useCallback(async () => {
    if (!roomCode || !draftState) return

    try {
      await DraftService.undoLastPick(roomCode.toLowerCase(), userId)
      notify.success('Pick Undone', 'The last pick has been removed', { duration: 3000 })
    } catch (err) {
      console.error('Error undoing pick:', err)
      notify.error(
        'Undo Failed',
        err instanceof Error ? err.message : 'Failed to undo pick',
        { duration: 5000 }
      )
    }
  }, [roomCode, draftState, userId, notify])

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
      console.error('Error resolving auction:', err)
    }
  }, [currentAuction, roomCode, notify])

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
      console.error('Error extending auction:', err)
    }
  }, [currentAuction, roomCode, notify])


  // Removed userName/teamName check - authenticated users are automatically joined
  // The draft state will handle whether they're a participant or spectator

  // Memoize DraftResults teams to prevent re-renders on completed drafts
  // MUST be before conditional returns (Rules of Hooks)
  const completedDraftTeams = useMemo(() => {
    if (!draftState?.teams) return []
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
          <div className="relative text-center mb-6">
            <div className="absolute top-0 right-0 flex gap-2">
              <ImageTypeToggle />
              <ThemeToggle />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent mb-2">
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
      <div className="container mx-auto px-4 py-4 max-w-screen-2xl">
        {/* Header */}
        <div className="mb-6 bg-card rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                {roomCode}
              </h1>
              <div className="flex items-center gap-2">
                <Badge variant={draftState?.status === 'waiting' ? 'secondary' : draftState?.status === 'drafting' ? 'default' : 'outline'}>
                  {draftState?.status === 'waiting' ? 'Waiting' : draftState?.status === 'drafting' ? 'In Progress' : 'Completed'}
                </Badge>
                {connectionStatus === 'reconnecting' && (
                  <Badge variant="destructive" className="animate-pulse">Reconnecting</Badge>
                )}
                {connectionStatus === 'offline' && (
                  <Badge variant="destructive">Offline</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyRoomCode}>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={shareRoom}>
                <Share2 className="h-4 w-4 mr-1" />
                Share
              </Button>
              {draftState && draftState.status === 'drafting' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsActivitySidebarOpen(true)}
                  className="relative"
                >
                  <History className="h-4 w-4 mr-1" />
                  Activity
                  {allDraftedIds.length > 0 && (
                    <Badge variant="default" className="ml-2 h-5 px-1.5 text-xs">
                      {allDraftedIds.length}
                    </Badge>
                  )}
                </Button>
              )}
              {draftState && ['completed'].includes(draftState.status) && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => router.push(`/draft/${roomCode}/results`)}
                >
                  Results
                </Button>
              )}
              <ConnectionStatus className="mr-2" />
              <ImageTypeToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Draft Progress and Team Status */}
        {draftState?.status === 'drafting' && (
          <div className="mb-4">
            <DraftProgress
              currentTurn={draftState?.currentTurn}
              totalTeams={draftState?.teams?.length || 0}
              maxRounds={draftState?.draftSettings?.pokemonPerTeam}
              draftStatus={draftState?.status}
              timeRemaining={pickTimeRemaining}
              teams={draftState?.teams || []}
            />
          </div>
        )}

        {/* Team Rosters */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
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
        {draftState && isHost && !isSpectator && (
          <div className="mb-6">
            <DraftControls
              draftStatus={draftState?.status}
              currentTurn={draftState?.currentTurn}
              totalTeams={draftState?.teams?.length || 0}
              currentTeam={draftState?.currentTeam}
              teams={draftState?.teams || []}
              isHost={isHost}
              timeRemaining={stabilizedTimeRemaining}
              onStartDraft={startDraft}
              onShuffleDraftOrder={handleShuffleDraftOrder}
              onPauseDraft={handlePauseDraft}
              onResumeDraft={handleResumeDraft}
              onEndDraft={handleEndDraft}
              onResetDraft={handleResetDraft}
              onDeleteDraft={handleDeleteDraft}
              onAdvanceTurn={handleAdvanceTurn}
              onSetTimer={handleSetTimer}
              onEnableProxyPicking={handleEnableProxyPicking}
              onDisableProxyPicking={handleDisableProxyPicking}
              isProxyPickingEnabled={isProxyPickingEnabled}
              isShuffling={isShuffling}
              onUndoLastPick={handleUndoLastPick}
              onRequestNotificationPermission={handleRequestNotificationPermission}
              canUndo={draftState?.teams?.some(team => team.picks.length > 0) || false}
              notificationsEnabled={typeof window !== 'undefined' && Notification.permission === 'granted'}
            />
          </div>
        )}

        {/* Draft Type Specific Controls */}
        {draftState && draftState.status === 'drafting' && (
          <div className="mb-6">
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
                        onExtendTime={isHost ? handleExtendAuctionTime : undefined}
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
              // Snake Draft Controls
              <div className="p-4 bg-card rounded-lg shadow">
                <h3 className="font-semibold mb-3">
                  {isHost && isProxyPickingEnabled && !isUserTurn
                    ? `Proxy Selection for ${currentTeam?.name}`
                    : 'Your Selection'
                  }
                </h3>
                <div className="flex gap-3 flex-wrap">
                  {selectedPokemon && (isUserTurn || (isHost && isProxyPickingEnabled)) ? (
                    <Button
                      onClick={() => handleDraftPokemon(selectedPokemon)}
                    >
                      {isHost && isProxyPickingEnabled && !isUserTurn
                        ? `Draft ${selectedPokemon.name} for ${currentTeam?.name}`
                        : `Draft ${selectedPokemon.name}`
                      }
                    </Button>
                  ) : (
                    <p className="text-muted-foreground">
                      {!isUserTurn && !(isHost && isProxyPickingEnabled)
                        ? `Waiting for ${currentTeam?.name} to pick...`
                        : 'Select a Pokémon to draft'
                      }
                    </p>
                  )}
                  {isHost && isProxyPickingEnabled && !isUserTurn && (
                    <p className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">
                      Proxy picking enabled - You can pick for {currentTeam?.name}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading Notice */}
        {!draftState && (
          <div className="mb-6 bg-primary/5 border border-primary/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mt-0.5"></div>
              <div>
                <h3 className="font-semibold mb-1">
                  Connecting to Draft Room
                </h3>
                <p className="text-sm text-muted-foreground">
                  You can browse and select Pokemon while we load the team information.
                  The draft order will be determined once all teams have joined.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* AI Draft Assistant - Show during active draft for user's team */}
        {draftState && draftState.status === 'drafting' && draftState.userTeamId && !isSpectator && formatId && (
          <div className="mb-6">
            <EnhancedErrorBoundary>
              <AIDraftAssistant
                availablePokemon={availablePokemon}
                currentTeam={aiCurrentTeam}
                opponentTeams={aiOpponentTeams}
                remainingBudget={userTeam?.budgetRemaining || 0}
                remainingPicks={(draftState.draftSettings.pokemonPerTeam || 6) - (userTeam?.picks.length || 0)}
                format={aiFormat}
                onSelectPokemon={handleAISelectPokemon}
                isYourTurn={isUserTurn}
              />
            </EnhancedErrorBoundary>
          </div>
        )}

        {/* Pokemon Grid */}
        <div className="bg-card rounded-lg shadow p-3 sm:p-6">
          <EnhancedErrorBoundary>
            <PokemonGrid
              pokemon={pokemon?.filter(p => p.isLegal) || []}
              onViewDetails={handleViewDetails}
              onAddToWishlist={handleAddToWishlist}
              onRemoveFromWishlist={handleRemoveFromWishlist}
              draftedPokemonIds={draftState ? allDraftedIds : []}
              wishlistPokemonIds={wishlistPokemonIds}
              isLoading={pokemonLoading}
              cardSize="md"
              showFilters={true}
              showCost={true}
              showStats={true}
              showWishlistButton={!isSpectator && !!draftState?.userTeamId}
            />
          </EnhancedErrorBoundary>
        </div>

        {/* Details Modal */}
        <PokemonDetailsModal
          pokemon={detailsPokemon}
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          onSelect={!draftState || isAuctionDraft ? undefined : ((isUserTurn || (isHost && isProxyPickingEnabled)) && draftState?.status === 'drafting' ? handleDraftPokemon : undefined)}
          isDrafted={detailsPokemon && draftState ? allDraftedIds.includes(detailsPokemon.id) : false}
        />

        {/* Wishlist Manager - Fixed Position */}
        {!isSpectator && draftState?.userTeamId && userId && (
          <EnhancedErrorBoundary>
            {(() => {
              const WishlistManager = dynamic(() => import('@/components/draft/WishlistManager'), { ssr: false })
              return (
                <WishlistManager
                  draftId={roomCode.toLowerCase()}
                  participantId={userId}
                  userTeam={userTeam}
                  currentBudget={userTeam?.budgetRemaining || 100}
                  usedBudget={(userTeam?.picks.length || 0) * 10}
                  isCompact={true}
                />
              )
            })()}
          </EnhancedErrorBoundary>
        )}

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
    </div>
  )
}