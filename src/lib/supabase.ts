import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { DraftSettings, LeagueSettings, SpectatorEventMetadata } from '@/types/supabase-helpers'
import { createLogger } from '@/lib/logger'

const log = createLogger('Supabase')

// Augment Window interface for Supabase instance tracking
declare global {
  interface Window {
    __supabaseInstance?: SupabaseClient<Database>
  }
}

// CACHE BUST: Build 2025-10-07-12:00
// Get environment variables - these are embedded at build time for NEXT_PUBLIC_ prefixed vars
// Environment variables are provided by Vercel at build time
// Force read from process.env to ensure fresh values
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const supabaseAnonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

// Debug logging for production troubleshooting
if (typeof window !== 'undefined') {
  log.info('', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlPrefix: supabaseUrl?.substring(0, 30),
    urlLength: supabaseUrl?.length
  })
}

// Validate configuration - warn but don't throw at module scope
// (throwing crashes Next.js static page generation during build)
const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey)
if (!supabaseConfigured) {
  const missingVars = []
  if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseAnonKey) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  // Only throw at runtime, not during build-time static generation
  if (typeof window !== 'undefined') {
    log.warn(`Missing required environment variables: ${missingVars.join(', ')}. Set these in your deployment environment.`)
  }
}

// Database types
export type Database = {
  public: {
    Tables: {
      drafts: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          name: string
          host_id: string
          format: 'snake' | 'auction'
          ruleset: string
          budget_per_team: number
          max_teams: number
          status: 'setup' | 'active' | 'completed' | 'paused' | 'deleted'
          current_turn: number | null
          current_round: number
          turn_started_at: string | null
          settings: DraftSettings | null
          room_code: string | null
          is_public: boolean
          spectator_count: number
          description: string | null
          tags: string[] | null
          password: string | null
          custom_format_id: string | null
          deleted_at: string | null
          deleted_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          name: string
          host_id: string
          format: 'snake' | 'auction'
          ruleset?: string
          budget_per_team?: number
          max_teams?: number
          status?: 'setup' | 'active' | 'completed' | 'paused' | 'deleted'
          current_turn?: number | null
          current_round?: number
          turn_started_at?: string | null
          settings?: DraftSettings | null
          room_code?: string | null
          is_public?: boolean
          spectator_count?: number
          description?: string | null
          tags?: string[] | null
          password?: string | null
          custom_format_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          name?: string
          host_id?: string
          format?: 'snake' | 'auction'
          ruleset?: string
          budget_per_team?: number
          max_teams?: number
          status?: 'setup' | 'active' | 'completed' | 'paused' | 'deleted'
          current_turn?: number | null
          current_round?: number
          turn_started_at?: string | null
          settings?: DraftSettings | null
          room_code?: string | null
          is_public?: boolean
          spectator_count?: number
          description?: string | null
          tags?: string[] | null
          password?: string | null
          custom_format_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          created_at: string
          draft_id: string
          name: string
          owner_id: string | null
          budget_remaining: number
          draft_order: number
          undos_remaining: number
        }
        Insert: {
          id?: string
          created_at?: string
          draft_id: string
          name: string
          owner_id?: string | null
          budget_remaining?: number
          draft_order: number
          undos_remaining?: number
        }
        Update: {
          id?: string
          created_at?: string
          draft_id?: string
          name?: string
          owner_id?: string | null
          budget_remaining?: number
          draft_order?: number
          undos_remaining?: number
        }
        Relationships: []
      }
      picks: {
        Row: {
          id: string
          created_at: string
          draft_id: string
          team_id: string
          pokemon_id: string
          pokemon_name: string
          cost: number
          pick_order: number
          round: number
        }
        Insert: {
          id?: string
          created_at?: string
          draft_id: string
          team_id: string
          pokemon_id: string
          pokemon_name: string
          cost: number
          pick_order: number
          round: number
        }
        Update: {
          id?: string
          created_at?: string
          draft_id?: string
          team_id?: string
          pokemon_id?: string
          pokemon_name?: string
          cost?: number
          pick_order?: number
          round?: number
        }
        Relationships: []
      }
      participants: {
        Row: {
          id: string
          created_at: string
          draft_id: string
          user_id: string | null
          display_name: string
          team_id: string | null
          is_host: boolean
          is_admin: boolean
          last_seen: string
        }
        Insert: {
          id?: string
          created_at?: string
          draft_id: string
          user_id?: string | null
          display_name: string
          team_id?: string | null
          is_host?: boolean
          is_admin?: boolean
          last_seen?: string
        }
        Update: {
          id?: string
          created_at?: string
          draft_id?: string
          user_id?: string | null
          display_name?: string
          team_id?: string | null
          is_host?: boolean
          is_admin?: boolean
          last_seen?: string
        }
        Relationships: []
      }
      pokemon_tiers: {
        Row: {
          id: string
          created_at: string
          draft_id: string
          pokemon_id: string
          pokemon_name: string
          cost: number
          is_legal: boolean
        }
        Insert: {
          id?: string
          created_at?: string
          draft_id: string
          pokemon_id: string
          pokemon_name: string
          cost: number
          is_legal?: boolean
        }
        Update: {
          id?: string
          created_at?: string
          draft_id?: string
          pokemon_id?: string
          pokemon_name?: string
          cost?: number
          is_legal?: boolean
        }
        Relationships: []
      }
      auctions: {
        Row: {
          id: string
          created_at: string
          draft_id: string
          pokemon_id: string
          pokemon_name: string
          nominated_by: string
          current_bid: number
          current_bidder: string | null
          auction_end: string
          status: 'active' | 'completed' | 'cancelled'
        }
        Insert: {
          id?: string
          created_at?: string
          draft_id: string
          pokemon_id: string
          pokemon_name: string
          nominated_by: string
          current_bid?: number
          current_bidder?: string | null
          auction_end: string
          status?: 'active' | 'completed' | 'cancelled'
        }
        Update: {
          id?: string
          created_at?: string
          draft_id?: string
          pokemon_id?: string
          pokemon_name?: string
          nominated_by?: string
          current_bid?: number
          current_bidder?: string | null
          auction_end?: string
          status?: 'active' | 'completed' | 'cancelled'
        }
        Relationships: []
      }
      bid_history: {
        Row: {
          id: string
          created_at: string
          auction_id: string
          draft_id: string
          team_id: string
          team_name: string
          bid_amount: number
        }
        Insert: {
          id?: string
          created_at?: string
          auction_id: string
          draft_id: string
          team_id: string
          team_name: string
          bid_amount: number
        }
        Update: {
          id?: string
          created_at?: string
          auction_id?: string
          draft_id?: string
          team_id?: string
          team_name?: string
          bid_amount?: number
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          draft_id: string
          participant_id: string
          pokemon_id: string
          pokemon_name: string
          priority: number
          is_available: boolean
          cost: number
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          draft_id: string
          participant_id: string
          pokemon_id: string
          pokemon_name: string
          priority: number
          is_available?: boolean
          cost: number
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          draft_id?: string
          participant_id?: string
          pokemon_id?: string
          pokemon_name?: string
          priority?: number
          is_available?: boolean
          cost?: number
        }
        Relationships: []
      }
      spectator_events: {
        Row: {
          id: string
          draft_id: string
          event_type: string
          spectator_id: string | null
          metadata: SpectatorEventMetadata
          created_at: string
        }
        Insert: {
          id?: string
          draft_id: string
          event_type: string
          spectator_id?: string | null
          metadata?: SpectatorEventMetadata
          created_at?: string
        }
        Update: {
          id?: string
          draft_id?: string
          event_type?: string
          spectator_id?: string | null
          metadata?: SpectatorEventMetadata
          created_at?: string
        }
        Relationships: []
      }
      custom_formats: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          name: string
          description: string | null
          pokemon_pricing: Record<string, number>
          total_pokemon: number
          min_cost: number
          max_cost: number
          avg_cost: number
          created_by_user_id: string | null
          created_by_display_name: string
          is_public: boolean
          times_used: number
          last_used_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          name: string
          description?: string | null
          pokemon_pricing: Record<string, number>
          total_pokemon?: number
          min_cost?: number
          max_cost?: number
          avg_cost?: number
          created_by_user_id?: string | null
          created_by_display_name: string
          is_public?: boolean
          times_used?: number
          last_used_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          name?: string
          description?: string | null
          pokemon_pricing?: Record<string, number>
          total_pokemon?: number
          min_cost?: number
          max_cost?: number
          avg_cost?: number
          created_by_user_id?: string | null
          created_by_display_name?: string
          is_public?: boolean
          times_used?: number
          last_used_at?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          user_id: string
          created_at: string
          updated_at: string
          email: string | null
          display_name: string | null
          avatar_url: string | null
          username: string | null
          bio: string | null
          twitter_profile: string | null
          twitch_channel: string | null
          is_verified: boolean
          total_drafts_created: number
          total_drafts_participated: number
          favorite_pokemon: string | null
          stats: Record<string, unknown> | null
          preferences: Record<string, unknown> | null
        }
        Insert: {
          user_id: string
          created_at?: string
          updated_at?: string
          email?: string | null
          display_name?: string | null
          avatar_url?: string | null
          username?: string | null
          bio?: string | null
          twitter_profile?: string | null
          twitch_channel?: string | null
          is_verified?: boolean
          total_drafts_created?: number
          total_drafts_participated?: number
          favorite_pokemon?: string | null
          stats?: Record<string, unknown> | null
          preferences?: Record<string, unknown> | null
        }
        Update: {
          user_id?: string
          created_at?: string
          updated_at?: string
          email?: string | null
          display_name?: string | null
          avatar_url?: string | null
          username?: string | null
          bio?: string | null
          twitter_profile?: string | null
          twitch_channel?: string | null
          is_verified?: boolean
          total_drafts_created?: number
          total_drafts_participated?: number
          favorite_pokemon?: string | null
          stats?: Record<string, unknown> | null
          preferences?: Record<string, unknown> | null
        }
        Relationships: []
      }
      leagues: {
        Row: {
          id: string
          draft_id: string
          name: string
          league_type: 'single' | 'split_conference_a' | 'split_conference_b'
          season_number: number
          status: 'scheduled' | 'active' | 'completed' | 'cancelled'
          start_date: string | null
          end_date: string | null
          current_week: number
          total_weeks: number
          settings: LeagueSettings
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          draft_id: string
          name: string
          league_type?: 'single' | 'split_conference_a' | 'split_conference_b'
          season_number?: number
          status?: 'scheduled' | 'active' | 'completed' | 'cancelled'
          start_date?: string | null
          end_date?: string | null
          current_week?: number
          total_weeks: number
          settings?: LeagueSettings
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          draft_id?: string
          name?: string
          league_type?: 'single' | 'split_conference_a' | 'split_conference_b'
          season_number?: number
          status?: 'scheduled' | 'active' | 'completed' | 'cancelled'
          start_date?: string | null
          end_date?: string | null
          current_week?: number
          total_weeks?: number
          settings?: LeagueSettings
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      league_teams: {
        Row: {
          id: string
          league_id: string
          team_id: string
          seed: number | null
          created_at: string
        }
        Insert: {
          id?: string
          league_id: string
          team_id: string
          seed?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          league_id?: string
          team_id?: string
          seed?: number | null
          created_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          league_id: string
          week_number: number
          match_number: number
          home_team_id: string
          away_team_id: string
          scheduled_date: string | null
          status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
          home_score: number
          away_score: number
          winner_team_id: string | null
          battle_format: string
          notes: string | null
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          league_id: string
          week_number: number
          match_number: number
          home_team_id: string
          away_team_id: string
          scheduled_date?: string | null
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
          home_score?: number
          away_score?: number
          winner_team_id?: string | null
          battle_format: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          league_id?: string
          week_number?: number
          match_number?: number
          home_team_id?: string
          away_team_id?: string
          scheduled_date?: string | null
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
          home_score?: number
          away_score?: number
          winner_team_id?: string | null
          battle_format?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      standings: {
        Row: {
          id: string
          league_id: string
          team_id: string
          wins: number
          losses: number
          draws: number
          points_for: number
          points_against: number
          point_differential: number
          rank: number | null
          current_streak: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          league_id: string
          team_id: string
          wins?: number
          losses?: number
          draws?: number
          points_for?: number
          points_against?: number
          point_differential?: number
          rank?: number | null
          current_streak?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          league_id?: string
          team_id?: string
          wins?: number
          losses?: number
          draws?: number
          points_for?: number
          points_against?: number
          point_differential?: number
          rank?: number | null
          current_streak?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      match_games: {
        Row: {
          id: string
          match_id: string
          game_number: number
          winner_team_id: string | null
          home_team_score: number
          away_team_score: number
          duration_seconds: number | null
          notes: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          match_id: string
          game_number: number
          winner_team_id?: string | null
          home_team_score?: number
          away_team_score?: number
          duration_seconds?: number | null
          notes?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          match_id?: string
          game_number?: number
          winner_team_id?: string | null
          home_team_score?: number
          away_team_score?: number
          duration_seconds?: number | null
          notes?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          id: string
          league_id: string
          week_number: number
          team_a_id: string
          team_b_id: string
          team_a_gives: string[]
          team_b_gives: string[]
          status: 'proposed' | 'accepted' | 'rejected' | 'completed' | 'cancelled'
          proposed_by: string
          proposed_at: string
          responded_at: string | null
          completed_at: string | null
          notes: string | null
          commissioner_approved: boolean | null
          commissioner_id: string | null
          commissioner_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          league_id: string
          week_number: number
          team_a_id: string
          team_b_id: string
          team_a_gives: string[]
          team_b_gives: string[]
          status?: 'proposed' | 'accepted' | 'rejected' | 'completed' | 'cancelled'
          proposed_by: string
          proposed_at?: string
          responded_at?: string | null
          completed_at?: string | null
          notes?: string | null
          commissioner_approved?: boolean | null
          commissioner_id?: string | null
          commissioner_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          league_id?: string
          week_number?: number
          team_a_id?: string
          team_b_id?: string
          team_a_gives?: string[]
          team_b_gives?: string[]
          status?: 'proposed' | 'accepted' | 'rejected' | 'completed' | 'cancelled'
          proposed_by?: string
          proposed_at?: string
          responded_at?: string | null
          completed_at?: string | null
          notes?: string | null
          commissioner_approved?: boolean | null
          commissioner_id?: string | null
          commissioner_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      trade_approvals: {
        Row: {
          id: string
          trade_id: string
          approver_user_id: string
          approver_role: 'commissioner' | 'admin' | 'owner'
          approved: boolean
          comments: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trade_id: string
          approver_user_id: string
          approver_role?: 'commissioner' | 'admin' | 'owner'
          approved: boolean
          comments?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trade_id?: string
          approver_user_id?: string
          approver_role?: 'commissioner' | 'admin' | 'owner'
          approved?: boolean
          comments?: string | null
          created_at?: string
        }
        Relationships: []
      }
      match_pokemon_kos: {
        Row: {
          id: string
          match_id: string
          game_number: number
          pick_id: string
          pokemon_id: string
          ko_count: number
          is_death: boolean
          ko_details: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          match_id: string
          game_number: number
          pick_id: string
          pokemon_id: string
          ko_count?: number
          is_death?: boolean
          ko_details?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          match_id?: string
          game_number?: number
          pick_id?: string
          pokemon_id?: string
          ko_count?: number
          is_death?: boolean
          ko_details?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_pokemon_status: {
        Row: {
          id: string
          pick_id: string
          pokemon_id: string
          pokemon_name: string
          team_id: string
          league_id: string
          status: 'alive' | 'fainted' | 'dead'
          total_kos: number
          matches_played: number
          matches_won: number
          death_match_id: string | null
          death_date: string | null
          death_details: Record<string, unknown> | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          pick_id: string
          pokemon_id: string
          pokemon_name: string
          team_id: string
          league_id: string
          status?: 'alive' | 'fainted' | 'dead'
          total_kos?: number
          matches_played?: number
          matches_won?: number
          death_match_id?: string | null
          death_date?: string | null
          death_details?: Record<string, unknown> | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          pick_id?: string
          pokemon_id?: string
          pokemon_name?: string
          team_id?: string
          league_id?: string
          status?: 'alive' | 'fainted' | 'dead'
          total_kos?: number
          matches_played?: number
          matches_won?: number
          death_match_id?: string | null
          death_date?: string | null
          death_details?: Record<string, unknown> | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      weekly_summaries: {
        Row: {
          id: string
          league_id: string
          week_number: number
          headline: string | null
          summary_text: string | null
          top_performer_team_id: string | null
          top_performer_reason: string | null
          most_kos_pokemon_id: string | null
          most_kos_pick_id: string | null
          most_kos_count: number
          biggest_upset_match_id: string | null
          biggest_upset_description: string | null
          total_matches: number
          total_kos: number
          total_deaths: number
          total_trades: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          league_id: string
          week_number: number
          headline?: string | null
          summary_text?: string | null
          top_performer_team_id?: string | null
          top_performer_reason?: string | null
          most_kos_pokemon_id?: string | null
          most_kos_pick_id?: string | null
          most_kos_count?: number
          biggest_upset_match_id?: string | null
          biggest_upset_description?: string | null
          total_matches?: number
          total_kos?: number
          total_deaths?: number
          total_trades?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          league_id?: string
          week_number?: number
          headline?: string | null
          summary_text?: string | null
          top_performer_team_id?: string | null
          top_performer_reason?: string | null
          most_kos_pokemon_id?: string | null
          most_kos_pick_id?: string | null
          most_kos_count?: number
          biggest_upset_match_id?: string | null
          biggest_upset_description?: string | null
          total_matches?: number
          total_kos?: number
          total_deaths?: number
          total_trades?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      weekly_highlights: {
        Row: {
          id: string
          league_id: string
          week_number: number
          type: string
          title: string
          description: string
          icon: string | null
          team_id: string | null
          match_id: string | null
          pick_id: string | null
          trade_id: string | null
          display_order: number
          is_pinned: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          league_id: string
          week_number: number
          type: string
          title: string
          description: string
          icon?: string | null
          team_id?: string | null
          match_id?: string | null
          pick_id?: string | null
          trade_id?: string | null
          display_order?: number
          is_pinned?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          league_id?: string
          week_number?: number
          type?: string
          title?: string
          description?: string
          icon?: string | null
          team_id?: string | null
          match_id?: string | null
          pick_id?: string | null
          trade_id?: string | null
          display_order?: number
          is_pinned?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      draft_results: {
        Row: {
          id: string
          draft_id: string
          total_picks: number
          total_teams: number
          duration_seconds: number | null
          winner_team_id: string | null
          stats: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          draft_id: string
          total_picks?: number
          total_teams?: number
          duration_seconds?: number | null
          winner_team_id?: string | null
          stats?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          draft_id?: string
          total_picks?: number
          total_teams?: number
          duration_seconds?: number | null
          winner_team_id?: string | null
          stats?: Record<string, unknown> | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_public_drafts: {
        Row: {
          id: string
          name: string
          description: string | null
          format: string
          status: string
          max_teams: number
          current_round: number
          spectator_count: number
          tags: string[] | null
          created_at: string
          updated_at: string
          teams_joined: number
          total_picks: number
          last_activity: string
        }
        Relationships: []
      }
      trade_history: {
        Row: {
          id: string
          league_id: string
          week_number: number
          team_a_id: string
          team_b_id: string
          team_a_gives: string[]
          team_b_gives: string[]
          status: string
          proposed_by: string
          proposed_at: string
          responded_at: string | null
          completed_at: string | null
          notes: string | null
          commissioner_approved: boolean | null
          commissioner_id: string | null
          commissioner_notes: string | null
          created_at: string
          updated_at: string
          team_a_name: string
          team_b_name: string
          proposed_by_name: string
          league_name: string
        }
        Relationships: []
      }
      draft_history: {
        Row: {
          id: string
          name: string
          host_id: string
          format: string
          ruleset: string
          status: string
          room_code: string | null
          completed_at: string | null
          created_at: string
          total_teams: number
          total_picks: number
        }
        Relationships: []
      }
    }
    Functions: {
      update_team_budget: {
        Args: { team_id: string; cost_to_subtract: number }
        Returns: undefined
      }
      advance_draft_turn: {
        Args: { draft_id: string }
        Returns: undefined
      }
      place_bid: {
        Args: { auction_id: string; bidder_team_id: string; bid_amount: number }
        Returns: undefined
      }
      promote_to_admin: {
        Args: { p_draft_id: string; p_user_id: string }
        Returns: undefined
      }
      demote_from_admin: {
        Args: { p_draft_id: string; p_user_id: string }
        Returns: undefined
      }
      execute_trade: {
        Args: { trade_uuid: string }
        Returns: undefined
      }
      increment_pokemon_match_stats: {
        Args: { p_pick_id: string; p_won: boolean }
        Returns: undefined
      }
      undo_last_pick: {
        Args: { p_draft_id: string; p_team_id: string }
        Returns: Record<string, unknown>
      }
      get_draft_history: {
        Args: { p_draft_id: string }
        Returns: Record<string, unknown>[]
      }
      record_draft_action: {
        Args: { p_draft_id: string; p_action_type: string; p_action_data: Record<string, unknown> }
        Returns: undefined
      }
      generate_week_summary: {
        Args: { p_league_id: string; p_week_number: number }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
  }
}

// Create singleton Supabase client with proper instance tracking
let supabaseInstance: SupabaseClient<Database> | null = null

// Track if we've already created an instance in this session
if (typeof window !== 'undefined') {
  if (window.__supabaseInstance) {
    supabaseInstance = window.__supabaseInstance
  }
}

export const supabase = (() => {
  if (!supabaseConfigured) {
    // Return a placeholder during build — pages that use supabase
    // are dynamic and won't be statically generated
    return null as unknown as SupabaseClient<Database>
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Use a unique storage key to avoid conflicts
        storageKey: 'sb-pokemon-draft-auth-token'
      },
      global: {
        headers: {
          'X-Client-Info': 'pokemon-draft-app'
        }
      }
    })

    // Store instance reference in window to prevent duplication
    if (typeof window !== 'undefined') {
      window.__supabaseInstance = supabaseInstance
    }
  }
  return supabaseInstance
})()

// Helper to check if Supabase is configured
export const isSupabaseConfigured = supabaseConfigured
export const isSupabaseAvailable = () => supabaseConfigured