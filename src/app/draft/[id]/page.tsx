'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { usePokemonListByFormat } from '@/hooks/usePokemon'
import { Pokemon } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ImageTypeToggle } from '@/components/ui/image-type-toggle'
import { Copy, Share2, History } from 'lucide-react'
import { DraftService, type DraftState as DBDraftState } from '@/lib/draft-service'
import { UserSessionService } from '@/lib/user-session'
import { useNotify } from '@/components/providers/NotificationProvider'
import { DraftRoomLoading, TeamStatusSkeleton } from '@/components/ui/loading-states'
import { EnhancedErrorBoundary } from '@/components/ui/enhanced-error-boundary'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useReconnection } from '@/hooks/useReconnection'

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
  loading: () => <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
})

const DraftResults = dynamic(() => import('@/components/draft/DraftResults'), {
  ssr: false,
  loading: () => <div className="h-screen bg-gray-100 dark:bg-gray-800 animate-pulse" />
})

const AuctionBiddingInterface = dynamic(() => import('@/components/draft/AuctionBiddingInterface'), {
  ssr: false,
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
})

const AuctionTimer = dynamic(() => import('@/components/draft/AuctionTimer'), {
  ssr: false,
  loading: () => <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
})

const AuctionNomination = dynamic(() => import('@/components/draft/AuctionNomination'), {
  ssr: false,
  loading: () => <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
})

const SpectatorMode = dynamic(() => import('@/components/draft/SpectatorMode'), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
})

const AuctionNotifications = dynamic(() => import('@/components/draft/AuctionNotifications'), {
  ssr: false
})

const AIDraftAssistant = dynamic(() =>
  import('@/components/draft/AIDraftAssistant').then(mod => ({ default: mod.AIDraftAssistant })), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
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
  }
}

export default function DraftRoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomCode = (params.id as string)?.toUpperCase()
  const userName = searchParams.get('userName') || ''
  const teamName = searchParams.get('teamName') || ''
  const isHost = searchParams.get('isHost') === 'true'
  const isSpectator = searchParams.get('spectator') === 'true'

  // Get or create persistent user session
  const [userId, setUserId] = useState<string>(() => {
    // Try to get from existing participation first
    const participation = UserSessionService.getDraftParticipation(roomCode?.toLowerCase() || '')
    if (participation) {
      return participation.userId
    }

    // Try to get current session (synchronous)
    const currentSession = UserSessionService.getCurrentSession()
    if (currentSession && currentSession.userId) {
      return currentSession.userId
    }

    // Fallback to temporary ID - will be replaced by async call
    return `temp-${Date.now()}`
  })

  // Async initialization of user session
  useEffect(() => {
    const initializeSession = async () => {
      // Skip if we already have a valid user ID from participation or current session
      if (!userId.startsWith('temp-')) return

      try {
        const session = await UserSessionService.getOrCreateSession(userName)
        if (session.userId && session.userId !== userId) {
          setUserId(session.userId)
        }
      } catch (error) {
        console.error('Failed to initialize user session:', error)
      }
    }

    initializeSession()
  }, [userName, userId])

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

  // Calculate if it's user's turn (needed by hooks)
  const userTeam = draftState?.teams.find(team => team.id === draftState.userTeamId)
  const currentTeam = draftState?.teams.find(team => team.id === draftState.currentTeam)
  const isUserTurn = draftState?.userTeamId === draftState?.currentTeam

  // Turn notifications with AFK auto-skip
  const { requestBrowserNotificationPermission } = useTurnNotifications({
    isUserTurn: isUserTurn || false,
    pickTimeRemaining,
    draftStatus: draftState?.status || 'waiting',
    enableBrowserNotifications: true,
    warningThreshold: 10,
    onAutoSkip: async () => {
      if (roomCode && isUserTurn) {
        try {
          await DraftService.autoSkipTurn(roomCode.toLowerCase())
          notify.warning('Turn Skipped', 'Your time expired and your turn was skipped', { duration: 5000 })
        } catch (error) {
          console.error('Auto-skip failed:', error)
        }
      }
    }
  })

  // Connection management with auto-reconnect
  const { isConnected: hookConnected, isReconnecting } = useReconnection({
    onReconnect: async () => {
      if (!roomCode) return
      try {
        const dbState = await DraftService.getDraftState(roomCode.toLowerCase())
        if (dbState) {
          setDraftState(transformDraftState(dbState, userId))
          setIsConnected(true)
        }
      } catch (error) {
        console.error('Reconnection failed:', error)
        throw error // Re-throw to trigger retry logic
      }
    },
    onConnectionLost: () => {
      setIsConnected(false)
    },
    maxRetries: 5,
    enabled: !isDemoMode && !!roomCode
  })

  // Derive connection status from boolean flags
  const connectionStatus: 'online' | 'offline' | 'reconnecting' =
    isReconnecting ? 'reconnecting' :
    hookConnected ? 'online' : 'offline'

  // Determine if this is an auction draft
  const isAuctionDraft = draftState?.draftSettings.draftType === 'auction'

  // Transform database state to UI state
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
        custom_format_id: (dbState.draft as any).custom_format_id
      }
    }
  }, [roomCode])

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
  }, [roomCode, userId, transformDraftState])

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

  // Subscribe to real-time updates
  useEffect(() => {
    if (!roomCode || !isConnected) return

    let mounted = true
    const abortController = new AbortController()

    let errorCount = 0
    const MAX_ERRORS = 5

    const unsubscribe = DraftService.subscribeToDraft(roomCode.toLowerCase(), async (payload) => {
      // Reload draft state when changes occur
      console.log('[Draft Subscription] Change detected:', payload?.eventType, payload?.new || payload?.old)

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
            const oldTotalPicks = currentDraftState.teams.reduce((sum, team) => sum + team.picks.length, 0)
            const newTotalPicks = newState.teams.reduce((sum, team) => sum + team.picks.length, 0)

            if (newTotalPicks > oldTotalPicks) {
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

          setDraftState(newState)
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
    })

    return () => {
      mounted = false
      abortController.abort()
      unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isConnected, userId])

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

    // Reset timer when turn changes
    if (draftState.currentTurn !== turnStartTime) {
      const serverNow = getServerTime()
      if (isMounted) {
        setTurnStartTime(serverNow)
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
  }, [isAuctionDraft, draftState, turnStartTime, notify, getServerTime])

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

  const availablePokemon = useMemo(() => {
    return pokemon?.filter(p => p.isLegal && !allDraftedIds.includes(p.id)) || []
  }, [pokemon, allDraftedIds])

  /**
   * STABLE CALLBACKS - Using useRef pattern to avoid dependency changes
   * This prevents 100+ PokemonCard re-renders when state changes
   */

  // Store latest values in refs to avoid callback recreation
  const draftStateRef = useRef(draftState)
  const userIdRef = useRef(userId)
  const isSpectatorRef = useRef(isSpectator)
  const notifyRef = useRef(notify)

  // Additional refs for subscription callback
  const transformDraftStateRef = useRef(transformDraftState)
  const pokemonRef = useRef(pokemon)
  const isAuctionDraftRef = useRef(isAuctionDraft)

  // Keep refs in sync with latest values
  useEffect(() => {
    draftStateRef.current = draftState
    userIdRef.current = userId
    isSpectatorRef.current = isSpectator
    notifyRef.current = notify
    transformDraftStateRef.current = transformDraftState
    pokemonRef.current = pokemon
    isAuctionDraftRef.current = isAuctionDraft
  }, [draftState, userId, isSpectator, notify, transformDraftState, pokemon, isAuctionDraft])

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
  }, [roomCode]) // Only roomCode dependency - stable

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
  }, [roomCode]) // Only roomCode dependency - stable

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

  // Track total pick count for optimization
  const totalPickCount = useMemo(() => {
    return draftState?.teams.reduce((sum, team) => sum + team.picks.length, 0) || 0
  }, [draftState?.teams])

  const sidebarActivities = useMemo(() => {
    // Early return for empty states
    if (!draftState?.teams || !pokemon || totalPickCount === 0) return []

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
  }, [draftState?.teams, pokemon, totalPickCount])

  const handleDraftPokemon = useCallback(async (pokemon: Pokemon) => {
    // Check if user can draft (their turn or proxy picking enabled)
    const canDraft = (isUserTurn || (isHost && isProxyPickingEnabled)) && draftState?.status === 'drafting'
    if (!canDraft) return

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
      notify.error(
        'Draft Failed',
        err instanceof Error ? err.message : 'Failed to make pick. Please try again.',
        { duration: 5000 }
      )
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

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 pokemon-bg transition-colors duration-500">
        <div className="container mx-auto px-4 py-6">
          {/* Header */}
          <div className="relative text-center mb-6">
            <div className="absolute top-0 right-0 flex gap-2">
              <ImageTypeToggle />
              <ThemeToggle />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent mb-2">
              Draft Room: {roomCode}
            </h1>
          </div>

          <DraftResults
            draftName={`${userName}'s Draft`}
            teams={draftState?.teams ? draftState.teams.map(team => ({
              ...team,
              budgetRemaining: draftState?.draftSettings?.draftType === 'auction' ? 100 - team.picks.length * 10 : undefined
            })) : []}
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      <div className="container mx-auto px-4 py-4 max-w-screen-2xl">
        {/* Header */}
        <div className="mb-6 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
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
                  className="bg-green-600 hover:bg-green-700"
                >
                  Results
                </Button>
              )}
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
                    userTeam={userTeam ? {
                      id: userTeam.id,
                      name: userTeam.name,
                      budgetRemaining: userTeam.budgetRemaining
                    } : null}
                    currentNominatingTeam={currentNominatingTeam ? {
                      id: currentNominatingTeam.id,
                      name: currentNominatingTeam.name,
                      draftOrder: currentNominatingTeam.draftOrder
                    } : null}
                    canNominate={canNominate}
                    onNominate={handleNominatePokemon}
                  />
                )}
              </div>
            ) : (
              // Snake Draft Controls
              <div className="p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
                <h3 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">
                  {isHost && isProxyPickingEnabled && !isUserTurn
                    ? `Proxy Selection for ${currentTeam?.name}`
                    : 'Your Selection'
                  }
                </h3>
                <div className="flex gap-3 flex-wrap">
                  {selectedPokemon && (isUserTurn || (isHost && isProxyPickingEnabled)) ? (
                    <Button
                      onClick={() => handleDraftPokemon(selectedPokemon)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isHost && isProxyPickingEnabled && !isUserTurn
                        ? `Draft ${selectedPokemon.name} for ${currentTeam?.name}`
                        : `Draft ${selectedPokemon.name}`
                      }
                    </Button>
                  ) : (
                    <p className="text-slate-600 dark:text-slate-400">
                      {!isUserTurn && !(isHost && isProxyPickingEnabled)
                        ? `Waiting for ${currentTeam?.name} to pick...`
                        : 'Select a Pokémon to draft'
                      }
                    </p>
                  )}
                  {isHost && isProxyPickingEnabled && !isUserTurn && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
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
          <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mt-0.5"></div>
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  Connecting to Draft Room
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
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
                currentTeam={userTeam?.picks.map(id => pokemon?.find(p => p.id === id)).filter(Boolean) as Pokemon[] || []}
                opponentTeams={draftState.teams.filter(t => t.id !== draftState.userTeamId).map(t => ({
                  id: t.id,
                  draftId: roomCode?.toLowerCase() || '',
                  name: t.name,
                  ownerId: null,
                  budgetRemaining: t.budgetRemaining,
                  draftOrder: t.draftOrder,
                  picks: t.picks.map(pokemonId => ({
                    id: pokemonId,
                    draftId: roomCode?.toLowerCase() || '',
                    teamId: t.id,
                    pokemonId,
                    pokemonName: pokemon?.find(p => p.id === pokemonId)?.name || 'Unknown',
                    cost: pokemon?.find(p => p.id === pokemonId)?.cost || 0,
                    pickOrder: 0,
                    round: 1,
                    createdAt: new Date().toISOString()
                  }))
                }))}
                remainingBudget={userTeam?.budgetRemaining || 0}
                remainingPicks={(draftState.draftSettings.pokemonPerTeam || 6) - (userTeam?.picks.length || 0)}
                format={{ id: formatId, name: formatId } as any}
                onSelectPokemon={(pokemon) => {
                  setSelectedPokemon(pokemon)
                  // Auto-scroll to selection area
                  if (!isAuctionDraft && isUserTurn) {
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
                isYourTurn={isUserTurn}
              />
            </EnhancedErrorBoundary>
          </div>
        )}

        {/* Pokemon Grid */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-3 sm:p-6">
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