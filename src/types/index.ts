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