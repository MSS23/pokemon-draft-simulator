import { Draft, Team } from '@/types'

export const generateSnakeDraftOrder = (teams: Team[], rounds: number): number[] => {
  const order: number[] = []
  const teamCount = teams.length

  for (let round = 0; round < rounds; round++) {
    if (round % 2 === 0) {
      // Normal order (1, 2, 3, 4...)
      for (let i = 1; i <= teamCount; i++) {
        order.push(i)
      }
    } else {
      // Reverse order (4, 3, 2, 1...)
      for (let i = teamCount; i >= 1; i--) {
        order.push(i)
      }
    }
  }

  return order
}

export const getCurrentPick = (draftOrder: number[], currentTurn: number): {
  round: number
  pick: number
  teamOrder: number
} => {
  const teamCount = Math.max(...draftOrder)
  const round = Math.floor((currentTurn - 1) / teamCount) + 1
  const pick = currentTurn
  const teamOrder = draftOrder[currentTurn - 1]

  return { round, pick, teamOrder }
}

export const getNextTeamTurn = (
  draftOrder: number[],
  currentTurn: number
): number | null => {
  if (currentTurn >= draftOrder.length) return null
  return draftOrder[currentTurn]
}

export const isDraftComplete = (
  draft: Draft,
  teams: Team[],
  draftOrder: number[]
): boolean => {
  if (draft.format === 'snake') {
    return draft.currentTurn ? draft.currentTurn > draftOrder.length : false
  }

  if (draft.format === 'auction') {
    // Check if all teams have spent their budget or reached max picks
    const maxPicks = draft.settings.maxPokemonPerTeam || 10
    return teams.every(team =>
      team.budgetRemaining === 0 || team.picks.length >= maxPicks
    )
  }

  return false
}

export const canTeamAffordPokemon = (team: Team, cost: number): boolean => {
  return team.budgetRemaining >= cost
}

export const getTeamByOrder = (teams: Team[], order: number): Team | null => {
  return teams.find(team => team.draftOrder === order) || null
}

export const formatTimeRemaining = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export const generateDraftId = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export const createShareableLink = (draftId: string): string => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/draft/${draftId}`
  }
  return `/draft/${draftId}`
}

export const validateTeamName = (name: string): string | null => {
  if (!name.trim()) return 'Team name is required'
  if (name.length < 2) return 'Team name must be at least 2 characters'
  if (name.length > 30) return 'Team name must be less than 30 characters'
  if (!/^[a-zA-Z0-9\s-_]+$/.test(name)) {
    return 'Team name can only contain letters, numbers, spaces, hyphens, and underscores'
  }
  return null
}

export const validateDraftName = (name: string): string | null => {
  if (!name.trim()) return 'Draft name is required'
  if (name.length < 3) return 'Draft name must be at least 3 characters'
  if (name.length > 50) return 'Draft name must be less than 50 characters'
  return null
}

export const getAuctionTimeRemaining = (endTime: string): number => {
  const end = new Date(endTime).getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((end - now) / 1000))
}

export const calculateTeamValue = (team: Team): number => {
  return team.picks.reduce((total, pick) => total + pick.cost, 0)
}

export const getTeamStats = (team: Team) => {
  return {
    totalSpent: calculateTeamValue(team),
    remainingBudget: team.budgetRemaining,
    pokemonCount: team.picks.length,
    averageCost: team.picks.length > 0
      ? Math.round(calculateTeamValue(team) / team.picks.length)
      : 0
  }
}

export const getRoundInfo = (currentTurn: number, teamCount: number) => {
  const round = Math.floor((currentTurn - 1) / teamCount) + 1
  const pickInRound = ((currentTurn - 1) % teamCount) + 1
  const isReverseRound = round % 2 === 0

  return {
    round,
    pickInRound,
    isReverseRound,
    totalPicks: currentTurn
  }
}