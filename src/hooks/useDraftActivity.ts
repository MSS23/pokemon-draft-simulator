import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Pokemon } from '@/types'

// Stable empty array to prevent infinite re-renders
const EMPTY_ARRAY: never[] = []

export interface ActivityItem {
  id: string
  type: 'pick' | 'bid' | 'auction_start' | 'auction_end' | 'join' | 'leave'
  teamName: string
  pokemonName?: string
  amount?: number
  timestamp: string
}

export interface SidebarActivity {
  id: string
  teamId: string
  teamName: string
  userName: string
  pokemonId: string
  pokemonName: string
  pickNumber: number
  round: number
  timestamp: number
}

export interface DraftActivityResult {
  recentActivity: ActivityItem[]
  sidebarActivities: SidebarActivity[]
  isActivitySidebarOpen: boolean
  setIsActivitySidebarOpen: (v: boolean) => void
  showNotifications: boolean
  setShowNotifications: (v: boolean) => void
  shouldShowNotification: (key: string, dedupWindowMs?: number) => boolean
}

interface UseDraftActivityParams {
  teams?: Array<{
    id: string
    name: string
    userName: string
    picks: string[]
  }>
  pokemon: Pokemon[] | undefined
}

export function useDraftActivity({
  teams,
  pokemon,
}: UseDraftActivityParams): DraftActivityResult {
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [isActivitySidebarOpen, setIsActivitySidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  // Notification deduplication
  const shownNotifications = useRef<Map<string, number>>(new Map())
  const shouldShowNotification = useCallback((key: string, dedupWindowMs: number = 3000): boolean => {
    const now = Date.now()
    const lastShown = shownNotifications.current.get(key)

    if (lastShown && now - lastShown < dedupWindowMs) {
      return false
    }

    shownNotifications.current.set(key, now)

    for (const [k, timestamp] of shownNotifications.current.entries()) {
      if (now - timestamp > 10000) {
        shownNotifications.current.delete(k)
      }
    }

    return true
  }, [])

  // Track previous activity IDs to prevent infinite loops
  const previousActivityIdsRef = useRef<string>('')

  // Populate recent activity for spectator mode
  useEffect(() => {
    if (!teams || !pokemon) return

    const newActivities: ActivityItem[] = []

    teams.forEach(team => {
      team.picks.forEach((pokemonId, index) => {
        const pokemonData = pokemon.find(p => p.id === pokemonId)
        if (pokemonData) {
          newActivities.push({
            id: `${team.id}-pick-${index}`,
            type: 'pick',
            teamName: team.name,
            pokemonName: pokemonData.name,
            timestamp: new Date(Date.now() - (teams.reduce((sum, t) => sum + t.picks.length, 0) - index) * 1000).toISOString()
          })
        }
      })
    })

    newActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const newActivityIds = newActivities.map(a => a.id).join(',')

    if (newActivityIds !== previousActivityIdsRef.current) {
      previousActivityIdsRef.current = newActivityIds
      setRecentActivity(newActivities)
    }
  }, [teams, pokemon])

  // Sidebar activities
  const sidebarActivities = useMemo((): SidebarActivity[] => {
    if (!teams || !pokemon) return EMPTY_ARRAY as unknown as SidebarActivity[]

    const activities: SidebarActivity[] = []
    let totalPickNumber = 0

    teams.forEach(team => {
      team.picks.forEach((pokemonId, index) => {
        totalPickNumber++
        const pokemonData = pokemon.find(p => p.id === pokemonId)
        if (pokemonData) {
          const round = Math.floor(index / teams.length) + 1
          activities.push({
            id: `${team.id}-pick-${index}`,
            teamId: team.id,
            teamName: team.name,
            userName: team.userName,
            pokemonId,
            pokemonName: pokemonData.name,
            pickNumber: totalPickNumber,
            round,
            timestamp: totalPickNumber,
          })
        }
      })
    })

    return activities.sort((a, b) => b.timestamp - a.timestamp)
  }, [pokemon, teams])

  return {
    recentActivity,
    sidebarActivities,
    isActivitySidebarOpen,
    setIsActivitySidebarOpen,
    showNotifications,
    setShowNotifications,
    shouldShowNotification,
  }
}
