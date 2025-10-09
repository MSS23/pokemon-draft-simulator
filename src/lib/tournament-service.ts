/**
 * Tournament Bracket System
 * Supports multiple tournament formats:
 * - Single Elimination
 * - Double Elimination
 * - Swiss System
 * - Round Robin
 */

export type TournamentFormat = 'single-elimination' | 'double-elimination' | 'swiss' | 'round-robin'
export type MatchStatus = 'pending' | 'in-progress' | 'completed' | 'bye'

export interface Participant {
  id: string
  name: string
  teamId?: string
  seed?: number
  wins: number
  losses: number
  draws: number
  buchholz?: number // Swiss tiebreaker
  matchPoints: number
}

export interface Match {
  id: string
  roundNumber: number
  matchNumber: number
  participant1?: Participant
  participant2?: Participant
  winner?: Participant
  loser?: Participant
  status: MatchStatus
  score?: {
    participant1: number
    participant2: number
  }
  bracket?: 'winners' | 'losers' // For double elimination
  nextMatchId?: string
  loserNextMatchId?: string // For double elimination
}

export interface Round {
  roundNumber: number
  name: string
  matches: Match[]
  bracket?: 'winners' | 'losers'
}

export interface Tournament {
  id: string
  name: string
  format: TournamentFormat
  participants: Participant[]
  rounds: Round[]
  status: 'setup' | 'in-progress' | 'completed'
  winner?: Participant
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  settings: {
    bestOf?: number // Best of X games
    swissRounds?: number // Number of rounds for Swiss
    pointsForWin: number
    pointsForDraw: number
    pointsForLoss: number
  }
}

/**
 * Create a new tournament
 */
export function createTournament(
  name: string,
  format: TournamentFormat,
  participants: Omit<Participant, 'wins' | 'losses' | 'draws' | 'matchPoints'>[],
  settings?: Partial<Tournament['settings']>
): Tournament {
  const fullParticipants: Participant[] = participants.map(p => ({
    ...p,
    wins: 0,
    losses: 0,
    draws: 0,
    matchPoints: 0,
  }))

  return {
    id: generateId(),
    name,
    format,
    participants: fullParticipants,
    rounds: [],
    status: 'setup',
    createdAt: new Date(),
    settings: {
      bestOf: 1,
      swissRounds: calculateSwissRounds(participants.length),
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
      ...settings,
    },
  }
}

/**
 * Start tournament and generate brackets
 */
export function startTournament(tournament: Tournament): Tournament {
  const shuffled = shuffleParticipants(tournament.participants)
  let rounds: Round[] = []

  switch (tournament.format) {
    case 'single-elimination':
      rounds = generateSingleEliminationBracket(shuffled)
      break
    case 'double-elimination':
      rounds = generateDoubleEliminationBracket(shuffled)
      break
    case 'swiss':
      rounds = generateSwissRound(shuffled, 1, tournament.settings.swissRounds || 0)
      break
    case 'round-robin':
      rounds = generateRoundRobinBracket(shuffled)
      break
  }

  return {
    ...tournament,
    participants: shuffled,
    rounds,
    status: 'in-progress',
    startedAt: new Date(),
  }
}

/**
 * Generate Single Elimination Bracket
 */
function generateSingleEliminationBracket(participants: Participant[]): Round[] {
  // Add byes if not power of 2
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(participants.length)))
  const byesNeeded = nextPowerOf2 - participants.length

  const paddedParticipants = [...participants]
  for (let i = 0; i < byesNeeded; i++) {
    paddedParticipants.push({
      id: `bye-${i}`,
      name: 'BYE',
      seed: participants.length + i + 1,
      wins: 0,
      losses: 0,
      draws: 0,
      matchPoints: 0,
    })
  }

  const rounds: Round[] = []
  const totalRounds = Math.log2(nextPowerOf2)
  let currentRoundParticipants = [...paddedParticipants]
  let matchIdCounter = 1

  for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
    const roundName = getRoundName(roundNum, totalRounds)
    const matches: Match[] = []

    for (let i = 0; i < currentRoundParticipants.length; i += 2) {
      const match: Match = {
        id: `match-${matchIdCounter++}`,
        roundNumber: roundNum,
        matchNumber: Math.floor(i / 2) + 1,
        participant1: currentRoundParticipants[i],
        participant2: currentRoundParticipants[i + 1],
        status: currentRoundParticipants[i + 1]?.name === 'BYE' ? 'bye' : 'pending',
        nextMatchId: roundNum < totalRounds ? `match-${matchIdCounter + Math.floor(i / 4)}` : undefined,
      }

      // Auto-advance byes
      if (match.status === 'bye') {
        match.winner = match.participant1
        match.status = 'completed'
      }

      matches.push(match)
    }

    rounds.push({
      roundNumber: roundNum,
      name: roundName,
      matches,
    })

    // Set up next round participants (winners only)
    currentRoundParticipants = matches
      .filter(m => m.winner)
      .map(m => m.winner!)
  }

  return rounds
}

/**
 * Generate Double Elimination Bracket
 */
function generateDoubleEliminationBracket(participants: Participant[]): Round[] {
  const rounds: Round[] = []

  // Winners bracket
  const winnersRounds = generateSingleEliminationBracket(participants)
  winnersRounds.forEach(round => {
    round.bracket = 'winners'
    rounds.push(round)
  })

  // Losers bracket (simplified - would need more complex logic for full implementation)
  const losersRoundCount = (winnersRounds.length - 1) * 2
  for (let i = 1; i <= losersRoundCount; i++) {
    rounds.push({
      roundNumber: winnersRounds.length + i,
      name: `Losers Round ${i}`,
      matches: [],
      bracket: 'losers',
    })
  }

  // Grand finals
  rounds.push({
    roundNumber: rounds.length + 1,
    name: 'Grand Finals',
    matches: [],
  })

  return rounds
}

/**
 * Generate Swiss Round
 */
function generateSwissRound(
  participants: Participant[],
  roundNumber: number,
  totalRounds: number
): Round[] {
  const rounds: Round[] = []

  for (let r = 1; r <= totalRounds; r++) {
    const matches: Match[] = []

    // Sort by match points and buchholz
    const sorted = [...participants].sort((a, b) => {
      if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints
      return (b.buchholz || 0) - (a.buchholz || 0)
    })

    // Pair participants with similar scores
    const paired = new Set<string>()

    for (let i = 0; i < sorted.length; i++) {
      if (paired.has(sorted[i].id)) continue

      let opponent = null
      for (let j = i + 1; j < sorted.length; j++) {
        if (!paired.has(sorted[j].id)) {
          opponent = sorted[j]
          paired.add(sorted[j].id)
          break
        }
      }

      if (opponent) {
        matches.push({
          id: `swiss-r${r}-m${matches.length + 1}`,
          roundNumber: r,
          matchNumber: matches.length + 1,
          participant1: sorted[i],
          participant2: opponent,
          status: 'pending',
        })
        paired.add(sorted[i].id)
      } else {
        // Bye if odd number
        matches.push({
          id: `swiss-r${r}-bye`,
          roundNumber: r,
          matchNumber: matches.length + 1,
          participant1: sorted[i],
          status: 'bye',
          winner: sorted[i],
        })
        paired.add(sorted[i].id)
      }
    }

    rounds.push({
      roundNumber: r,
      name: `Round ${r}`,
      matches,
    })
  }

  return rounds
}

/**
 * Generate Round Robin Bracket
 */
function generateRoundRobinBracket(participants: Participant[]): Round[] {
  const rounds: Round[] = []
  const n = participants.length
  const isOdd = n % 2 !== 0

  // Add dummy participant if odd
  const players = isOdd ? [...participants, null] : [...participants]
  const totalRounds = players.length - 1

  for (let round = 0; round < totalRounds; round++) {
    const matches: Match[] = []

    for (let i = 0; i < players.length / 2; i++) {
      const home = players[i]
      const away = players[players.length - 1 - i]

      if (home && away) {
        matches.push({
          id: `rr-r${round + 1}-m${i + 1}`,
          roundNumber: round + 1,
          matchNumber: i + 1,
          participant1: home,
          participant2: away,
          status: 'pending',
        })
      }
    }

    rounds.push({
      roundNumber: round + 1,
      name: `Round ${round + 1}`,
      matches,
    })

    // Rotate for next round (keep first player fixed)
    const last = players.pop()!
    players.splice(1, 0, last)
  }

  return rounds
}

/**
 * Report match result
 */
export function reportMatchResult(
  tournament: Tournament,
  matchId: string,
  winnerId: string,
  score?: { participant1: number; participant2: number }
): Tournament {
  const updatedRounds = tournament.rounds.map(round => ({
    ...round,
    matches: round.matches.map(match => {
      if (match.id === matchId) {
        const winner = match.participant1?.id === winnerId
          ? match.participant1
          : match.participant2!
        const loser = match.participant1?.id === winnerId
          ? match.participant2!
          : match.participant1!

        // Update participant records
        winner.wins++
        winner.matchPoints += tournament.settings.pointsForWin
        loser.losses++
        loser.matchPoints += tournament.settings.pointsForLoss

        return {
          ...match,
          winner,
          loser,
          status: 'completed' as MatchStatus,
          score,
        }
      }
      return match
    }),
  }))

  // Advance winners to next round
  advanceWinners(updatedRounds, tournament.format)

  // Check if tournament is complete
  const allMatchesComplete = updatedRounds.every(round =>
    round.matches.every(match => match.status === 'completed' || match.status === 'bye')
  )

  let tournamentWinner: Participant | undefined
  if (allMatchesComplete) {
    const finalRound = updatedRounds[updatedRounds.length - 1]
    const finalMatch = finalRound.matches[0]
    tournamentWinner = finalMatch.winner
  }

  return {
    ...tournament,
    rounds: updatedRounds,
    status: allMatchesComplete ? 'completed' : 'in-progress',
    winner: tournamentWinner,
    completedAt: allMatchesComplete ? new Date() : undefined,
  }
}

/**
 * Advance winners to next matches
 */
function advanceWinners(rounds: Round[], format: TournamentFormat) {
  if (format === 'single-elimination' || format === 'double-elimination') {
    rounds.forEach((round, roundIndex) => {
      round.matches.forEach(match => {
        if (match.winner && match.nextMatchId && roundIndex < rounds.length - 1) {
          const nextRound = rounds[roundIndex + 1]
          const nextMatch = nextRound.matches.find(m => m.id === match.nextMatchId)

          if (nextMatch) {
            if (!nextMatch.participant1) {
              nextMatch.participant1 = match.winner
            } else if (!nextMatch.participant2) {
              nextMatch.participant2 = match.winner
            }
          }
        }

        // Handle losers bracket for double elimination
        if (format === 'double-elimination' && match.loser && match.loserNextMatchId) {
          const loserMatch = rounds
            .flatMap(r => r.matches)
            .find(m => m.id === match.loserNextMatchId)

          if (loserMatch) {
            if (!loserMatch.participant1) {
              loserMatch.participant1 = match.loser
            } else if (!loserMatch.participant2) {
              loserMatch.participant2 = match.loser
            }
          }
        }
      })
    })
  }
}

/**
 * Calculate Buchholz score for Swiss
 */
export function calculateBuchholz(participant: Participant, tournament: Tournament): number {
  let buchholz = 0

  tournament.rounds.forEach(round => {
    round.matches.forEach(match => {
      if (
        match.participant1?.id === participant.id ||
        match.participant2?.id === participant.id
      ) {
        const opponent =
          match.participant1?.id === participant.id
            ? match.participant2
            : match.participant1

        if (opponent) {
          buchholz += opponent.matchPoints
        }
      }
    })
  })

  return buchholz
}

/**
 * Get standings
 */
export function getStandings(tournament: Tournament): Participant[] {
  // Update buchholz for Swiss
  if (tournament.format === 'swiss') {
    tournament.participants.forEach(p => {
      p.buchholz = calculateBuchholz(p, tournament)
    })
  }

  return [...tournament.participants].sort((a, b) => {
    // Sort by match points first
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints

    // Then by wins
    if (b.wins !== a.wins) return b.wins - a.wins

    // Then by buchholz (Swiss tiebreaker)
    if (tournament.format === 'swiss') {
      return (b.buchholz || 0) - (a.buchholz || 0)
    }

    // Then by losses (fewer is better)
    return a.losses - b.losses
  })
}

/**
 * Utility functions
 */
function getRoundName(roundNum: number, totalRounds: number): string {
  const remaining = totalRounds - roundNum + 1

  if (remaining === 1) return 'Finals'
  if (remaining === 2) return 'Semi-Finals'
  if (remaining === 3) return 'Quarter-Finals'

  return `Round ${roundNum}`
}

function calculateSwissRounds(participantCount: number): number {
  // Recommended: log2(participants) rounded up
  return Math.ceil(Math.log2(participantCount))
}

function shuffleParticipants(participants: Participant[]): Participant[] {
  // Seed-based ordering (if seeds exist)
  if (participants.every(p => p.seed)) {
    return [...participants].sort((a, b) => (a.seed || 0) - (b.seed || 0))
  }

  // Random shuffle
  const shuffled = [...participants]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function generateId(): string {
  return `tournament-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get match by ID
 */
export function getMatch(tournament: Tournament, matchId: string): Match | undefined {
  return tournament.rounds.flatMap(r => r.matches).find(m => m.id === matchId)
}

/**
 * Get active matches (in-progress or pending)
 */
export function getActiveMatches(tournament: Tournament): Match[] {
  return tournament.rounds
    .flatMap(r => r.matches)
    .filter(m => m.status === 'pending' || m.status === 'in-progress')
}

/**
 * Export tournament to JSON
 */
export function exportTournament(tournament: Tournament): string {
  return JSON.stringify(tournament, null, 2)
}

/**
 * Import tournament from JSON
 */
export function importTournament(json: string): Tournament {
  const data = JSON.parse(json)
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
    completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
  }
}
