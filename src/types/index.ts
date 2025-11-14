export interface Pokemon {
  id: string
  name: string
  types: PokemonType[]
  stats: PokemonStats
  abilities: string[]
  sprite: string
  cost: number
  isLegal: boolean
  moves?: Move[]
  isLegendary?: boolean
  isMythical?: boolean
  isParadox?: boolean
  generation?: number
  tier?: string
}

export interface PokemonType {
  name: string
  color: string
}

export interface PokemonStats {
  hp: number
  attack: number
  defense: number
  specialAttack: number
  specialDefense: number
  speed: number
  total: number
}

export interface Move {
  id: number
  name: string
  type: string
  power: number | null
  accuracy: number | null
  pp: number
  priority: number
  damageClass: 'physical' | 'special' | 'status'
  learnMethod: 'level-up' | 'machine' | 'tutor' | 'egg' | 'other'
  levelLearnedAt: number | null
  description: string
}

export interface MoveLearnDetails {
  level: number | null
  method: string
  version: string
}

export interface Draft {
  id: string
  name: string
  hostId: string
  format: 'snake' | 'auction'
  ruleset: string
  budgetPerTeam: number
  maxTeams: number
  status: 'setup' | 'active' | 'completed' | 'paused'
  currentTurn: number | null
  currentRound: number
  settings: DraftSettings
  createdAt: string
  updatedAt: string
}

export interface DraftSettings {
  timePerPick?: number
  timePerBid?: number
  allowUndos?: boolean
  requireFullRoster?: boolean
  maxPokemonPerTeam?: number
  // League settings
  createLeague?: boolean
  splitIntoConferences?: boolean
  leagueWeeks?: number
}

export interface Team {
  id: string
  draftId: string
  name: string
  ownerId: string | null
  budgetRemaining: number
  draftOrder: number
  picks: Pick[]
}

export interface Pick {
  id: string
  draftId: string
  teamId: string
  pokemonId: string
  pokemonName: string
  cost: number
  pickOrder: number
  round: number
  createdAt: string
}

export interface Participant {
  id: string
  draftId: string
  userId: string | null
  displayName: string
  teamId: string | null
  isHost: boolean
  isAdmin: boolean
  lastSeen: string
}

export interface Auction {
  id: string
  draftId: string
  pokemonId: string
  pokemonName: string
  nominatedBy: string
  currentBid: number
  currentBidder: string | null
  auctionEnd: string
  status: 'active' | 'completed' | 'cancelled'
}

export interface PokemonTier {
  id: string
  draftId: string
  pokemonId: string
  pokemonName: string
  cost: number
  isLegal: boolean
}

export interface BidHistory {
  id: string
  auctionId: string
  teamId: string
  teamName: string
  bidAmount: number
  timestamp: string
  draftId: string
}

export interface WishlistItem {
  id: string
  draftId: string
  participantId: string
  pokemonId: string
  pokemonName: string
  priority: number
  isAvailable: boolean
  cost: number
  createdAt: string
  updatedAt: string
}

export interface CustomFormat {
  id: string
  name: string
  description: string | null
  createdByUserId: string | null
  createdByDisplayName: string
  isPublic: boolean
  pokemonPricing: Record<string, number>
  minCost: number | null
  maxCost: number | null
  timesUsed: number
  createdAt: string
  updatedAt: string
}

// Re-export Format from formats lib for compatibility
export type { PokemonFormat as Format } from '@/lib/formats'

export type DraftPhase = 'setup' | 'drafting' | 'auction' | 'completed'

export interface DraftState {
  draft: Draft | null
  teams: Team[]
  participants: Participant[]
  currentAuction: Auction | null
  availablePokemon: Pokemon[]
  pokemonTiers: PokemonTier[]
  wishlistItems: WishlistItem[]
  draftOrder: string[]
  isLoading: boolean
  error: string | null
}

// =====================================================
// LEAGUE SYSTEM TYPES
// =====================================================

export interface League {
  id: string
  draftId: string
  name: string
  leagueType: 'single' | 'split_conference_a' | 'split_conference_b'
  seasonNumber: number
  status: 'scheduled' | 'active' | 'completed' | 'cancelled'
  startDate: string | null
  endDate: string | null
  currentWeek: number
  totalWeeks: number
  settings: LeagueSettings
  createdAt: string
  updatedAt: string
}

export interface LeagueSettings {
  matchFormat?: 'best_of_1' | 'best_of_3' | 'best_of_5'
  pointsPerWin?: number
  pointsPerDraw?: number
  playoffTeams?: number
  [key: string]: unknown
}

export interface LeagueTeam {
  id: string
  leagueId: string
  teamId: string
  seed: number | null
  createdAt: string
}

export interface Match {
  id: string
  leagueId: string
  weekNumber: number
  matchNumber: number
  homeTeamId: string
  awayTeamId: string
  scheduledDate: string | null
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  homeScore: number
  awayScore: number
  winnerTeamId: string | null
  battleFormat: string
  notes: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface Standing {
  id: string
  leagueId: string
  teamId: string
  wins: number
  losses: number
  draws: number
  pointsFor: number
  pointsAgainst: number
  pointDifferential: number
  rank: number | null
  currentStreak: string | null
  updatedAt: string
}

export interface MatchGame {
  id: string
  matchId: string
  gameNumber: number
  winnerTeamId: string | null
  homeTeamScore: number
  awayTeamScore: number
  durationSeconds: number | null
  notes: string | null
  createdAt: string
  completedAt: string | null
}

// ============================================
// POKEMON TRACKING & TRADES
// ============================================

export interface MatchPokemonKO {
  id: string
  matchId: string
  gameNumber: number
  pokemonId: string // Pokemon species ID
  pickId: string
  koCount: number // Times this Pokemon fainted in this game
  isDeath: boolean // Permanent death (Nuzlocke)
  koDetails?: {
    opponentPokemon?: string
    moveUsed?: string
    turnNumber?: number
    damage?: number
    [key: string]: unknown
  }
  createdAt: string
  updatedAt: string
}

export interface TeamPokemonStatus {
  id: string
  pickId: string
  teamId: string
  leagueId: string
  status: 'alive' | 'fainted' | 'dead'
  totalKos: number
  matchesPlayed: number
  matchesWon: number
  deathMatchId?: string | null
  deathDate?: string | null
  deathDetails?: {
    opponentTeam?: string
    opponentPokemon?: string
    moveUsed?: string
    [key: string]: unknown
  }
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface Trade {
  id: string
  leagueId: string
  weekNumber: number
  teamAId: string
  teamBId: string
  teamAGives: string[] // Array of pick IDs
  teamBGives: string[] // Array of pick IDs
  status: 'proposed' | 'accepted' | 'rejected' | 'completed' | 'cancelled'
  proposedBy: string
  proposedAt: string
  respondedAt?: string | null
  completedAt?: string | null
  notes?: string | null
  commissionerApproved?: boolean | null
  commissionerId?: string | null
  commissionerNotes?: string | null
  createdAt: string
  updatedAt: string
}

export interface TradeApproval {
  id: string
  tradeId: string
  approverUserId: string
  approverRole?: 'commissioner' | 'admin' | 'owner'
  approved: boolean
  comments?: string | null
  createdAt: string
}

// Extended League Settings with new features
export interface ExtendedLeagueSettings extends LeagueSettings {
  enableNuzlocke?: boolean // Enable permanent Pokemon deaths
  enableTrades?: boolean // Allow Pokemon trading between teams
  tradeDeadlineWeek?: number // Week after which trades are locked
  requireCommissionerApproval?: boolean // Trades need approval
  maxMatchesPerWeek?: number // Limit matches per team per week (default: 1)
}

// Trade with team details (for UI)
export interface TradeWithDetails extends Trade {
  teamAName: string
  teamBName: string
  proposedByName: string
  leagueName: string
  teamAGivesPokemon?: Pick[] // Full pick objects for Pokemon being traded
  teamBGivesPokemon?: Pick[]
}

// Match with Pokemon KO stats (for detailed view)
export interface MatchWithKOs extends Match {
  pokemonKOs: MatchPokemonKO[]
  homeTeamDeaths: number // Count of permanent deaths for home team
  awayTeamDeaths: number
}

// Team with Pokemon status (for league roster view)
export interface TeamWithPokemonStatus extends Team {
  pokemonStatuses: TeamPokemonStatus[]
  alivePokemon: number
  deadPokemon: number
}