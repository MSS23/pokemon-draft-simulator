/**
 * Utility functions for draft order management
 * Centralizes snake draft logic to avoid duplication
 */

export interface DraftOrderConfig {
  totalTeams: number
  maxRounds: number
  currentTurn: number
}

/**
 * Generate snake draft order for all rounds
 * In snake drafts: Round 1 goes 1-2-3-4, Round 2 goes 4-3-2-1, etc.
 * 
 * @param totalTeams - Number of teams in the draft
 * @param maxRounds - Maximum number of rounds (Pokemon per team)
 * @returns Array of team order numbers for each turn
 */
export function generateSnakeDraftOrder(totalTeams: number, maxRounds: number): number[] {
  const draftOrder: number[] = []
  
  for (let round = 0; round < maxRounds; round++) {
    if (round % 2 === 0) {
      // Even rounds: Normal order (1, 2, 3, 4...)
      for (let i = 1; i <= totalTeams; i++) {
        draftOrder.push(i)
      }
    } else {
      // Odd rounds: Reverse order (4, 3, 2, 1...)
      for (let i = totalTeams; i >= 1; i--) {
        draftOrder.push(i)
      }
    }
  }
  
  return draftOrder
}

/**
 * Get the current team's draft order based on turn number
 * 
 * @param config - Draft order configuration
 * @returns Draft order number for current team (1-indexed), or null if invalid
 */
export function getCurrentTeamOrder(config: DraftOrderConfig): number | null {
  const { totalTeams, maxRounds, currentTurn } = config
  
  if (totalTeams <= 0 || currentTurn <= 0) return null
  
  const draftOrder = generateSnakeDraftOrder(totalTeams, maxRounds)
  
  if (currentTurn > draftOrder.length) return null
  
  return draftOrder[currentTurn - 1]
}

/**
 * Find current team ID based on draft order
 * 
 * @param teams - Array of teams with draftOrder property
 * @param config - Draft order configuration
 * @returns Current team ID or null if not found
 */
export function getCurrentTeamId<T extends { id: string; draftOrder: number }>(
  teams: T[], 
  config: DraftOrderConfig
): string | null {
  const currentTeamOrder = getCurrentTeamOrder(config)
  
  if (!currentTeamOrder) return null
  
  const currentTeam = teams.find(team => team.draftOrder === currentTeamOrder)
  return currentTeam?.id || null
}

/**
 * Calculate total turns in a snake draft
 * 
 * @param totalTeams - Number of teams
 * @param pokemonPerTeam - Pokemon per team
 * @returns Total number of turns
 */
export function calculateTotalTurns(totalTeams: number, pokemonPerTeam: number): number {
  return totalTeams * pokemonPerTeam
}

/**
 * Get the round number for a given turn
 * 
 * @param turn - Current turn number (1-indexed)
 * @param totalTeams - Number of teams
 * @returns Round number (1-indexed)
 */
export function getTurnRound(turn: number, totalTeams: number): number {
  return Math.ceil(turn / totalTeams)
}

/**
 * Get the pick number within a round for a given turn
 * 
 * @param turn - Current turn number (1-indexed)
 * @param totalTeams - Number of teams
 * @returns Pick number within round (1-indexed)
 */
export function getTurnPickInRound(turn: number, totalTeams: number): number {
  return ((turn - 1) % totalTeams) + 1
}
