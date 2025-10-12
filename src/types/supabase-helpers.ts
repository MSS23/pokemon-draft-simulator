/**
 * Supabase Type Helpers
 *
 * This file provides type-safe helpers for working with Supabase database types.
 * It eliminates the need for 'as any' casts and provides shorthand type exports.
 */

import type { Database } from '@/lib/supabase'

// Base table types
export type Tables = Database['public']['Tables']
export type Views = Database['public']['Views']

// Table name type
export type TableName = keyof Tables

// Generic type helpers for table operations
export type Row<T extends TableName> = Tables[T]['Row']
export type Insert<T extends TableName> = Tables[T]['Insert']
export type Update<T extends TableName> = Tables[T]['Update']

// Shorthand exports for common table types
export type DraftRow = Row<'drafts'>
export type DraftInsert = Insert<'drafts'>
export type DraftUpdate = Update<'drafts'>

export type TeamRow = Row<'teams'>
export type TeamInsert = Insert<'teams'>
export type TeamUpdate = Update<'teams'>

export type PickRow = Row<'picks'>
export type PickInsert = Insert<'picks'>
export type PickUpdate = Update<'picks'>

export type ParticipantRow = Row<'participants'>
export type ParticipantInsert = Insert<'participants'>
export type ParticipantUpdate = Update<'participants'>

export type PokemonTierRow = Row<'pokemon_tiers'>
export type PokemonTierInsert = Insert<'pokemon_tiers'>
export type PokemonTierUpdate = Update<'pokemon_tiers'>

export type AuctionRow = Row<'auctions'>
export type AuctionInsert = Insert<'auctions'>
export type AuctionUpdate = Update<'auctions'>

export type BidHistoryRow = Row<'bid_history'>
export type BidHistoryInsert = Insert<'bid_history'>
export type BidHistoryUpdate = Update<'bid_history'>

export type WishlistItemRow = Row<'wishlist_items'>
export type WishlistItemInsert = Insert<'wishlist_items'>
export type WishlistItemUpdate = Update<'wishlist_items'>

export type SpectatorEventRow = Row<'spectator_events'>
export type SpectatorEventInsert = Insert<'spectator_events'>
export type SpectatorEventUpdate = Update<'spectator_events'>

export type CustomFormatRow = Row<'custom_formats'>
export type CustomFormatInsert = Insert<'custom_formats'>
export type CustomFormatUpdate = Update<'custom_formats'>

export type UserProfileRow = Row<'user_profiles'>
export type UserProfileInsert = Insert<'user_profiles'>
export type UserProfileUpdate = Update<'user_profiles'>

export type LeagueRow = Row<'leagues'>
export type LeagueInsert = Insert<'leagues'>
export type LeagueUpdate = Update<'leagues'>

export type LeagueTeamRow = Row<'league_teams'>
export type LeagueTeamInsert = Insert<'league_teams'>
export type LeagueTeamUpdate = Update<'league_teams'>

export type MatchRow = Row<'matches'>
export type MatchInsert = Insert<'matches'>
export type MatchUpdate = Update<'matches'>

export type StandingRow = Row<'standings'>
export type StandingInsert = Insert<'standings'>
export type StandingUpdate = Update<'standings'>

export type MatchGameRow = Row<'match_games'>
export type MatchGameInsert = Insert<'match_games'>
export type MatchGameUpdate = Update<'match_games'>

// View types
export type ActivePublicDraftRow = Views['active_public_drafts']['Row']

// Query result type helper
export type QueryResult<T> = {
  data: T | null
  error: Error | null
}

// Type-safe settings interfaces to replace Record<string, any>

/**
 * Draft settings stored in drafts.settings JSONB column
 */
export interface DraftSettings {
  /** Time limit per pick in seconds */
  timeLimit?: number
  /** Time limit for auction bids in seconds */
  pickTimeLimitSeconds?: number
  /** Maximum Pokemon per team */
  maxPokemonPerTeam?: number
  /** Format ID (e.g., 'vgc-reg-h') */
  formatId?: string
  /** Auction duration in seconds */
  auctionDurationSeconds?: number
  /** Pending timer change (applied on next turn) */
  pendingTimerChange?: number
  /** Allow undoing picks */
  allowUndos?: boolean
  /** Require full roster before completion */
  requireFullRoster?: boolean
  /** Create league after draft completes */
  createLeague?: boolean
  /** Split league into conferences */
  splitIntoConferences?: boolean
  /** Number of league weeks */
  leagueWeeks?: number
  /** Password for private drafts */
  password?: string | null
  /** Custom format ID if using custom format */
  customFormatId?: string | null
  /** Additional custom settings */
  [key: string]: unknown
}

/**
 * League settings stored in leagues.settings JSONB column
 */
export interface LeagueSettings {
  /** Match format (best of 1, 3, or 5) */
  matchFormat?: 'best_of_1' | 'best_of_3' | 'best_of_5'
  /** Points awarded for a win */
  pointsPerWin?: number
  /** Points awarded for a draw */
  pointsPerDraw?: number
  /** Number of teams in playoffs */
  playoffTeams?: number
  /** Week length in days */
  weekLength?: number
  /** Allow ties */
  allowTies?: boolean
  /** Automatic match scheduling */
  autoSchedule?: boolean
  /** Additional custom settings */
  [key: string]: unknown
}

/**
 * Spectator event metadata - discriminated union based on event type
 */
export type SpectatorEventMetadata =
  | { type: 'join'; spectatorName: string; timestamp: string }
  | { type: 'leave'; spectatorName: string; timestamp: string }
  | { type: 'chat'; spectatorName: string; message: string; timestamp: string }
  | { type: 'reaction'; spectatorName: string; reaction: string; targetPickId?: string; timestamp: string }
  | { type: 'view_team'; spectatorName: string; teamId: string; timestamp: string }
  | { type: 'custom'; [key: string]: unknown }

/**
 * Type guard for spectator event metadata
 */
export function isSpectatorEventMetadata(obj: unknown): obj is SpectatorEventMetadata {
  if (!obj || typeof obj !== 'object') return false
  const metadata = obj as Record<string, unknown>
  return typeof metadata.type === 'string'
}

/**
 * Helper to create type-safe draft settings
 */
export function createDraftSettings(settings: Partial<DraftSettings>): DraftSettings {
  return {
    timeLimit: settings.timeLimit ?? 60,
    maxPokemonPerTeam: settings.maxPokemonPerTeam ?? 10,
    formatId: settings.formatId ?? 'vgc-reg-h',
    allowUndos: settings.allowUndos ?? false,
    requireFullRoster: settings.requireFullRoster ?? true,
    ...settings
  }
}

/**
 * Helper to create type-safe league settings
 */
export function createLeagueSettings(settings: Partial<LeagueSettings>): LeagueSettings {
  return {
    matchFormat: settings.matchFormat ?? 'best_of_3',
    pointsPerWin: settings.pointsPerWin ?? 3,
    pointsPerDraw: settings.pointsPerDraw ?? 1,
    playoffTeams: settings.playoffTeams ?? 4,
    ...settings
  }
}
