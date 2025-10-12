import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { DraftSettings, LeagueSettings, SpectatorEventMetadata } from '@/types/supabase-helpers'

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
  console.log('[Supabase Config]', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlPrefix: supabaseUrl?.substring(0, 30),
    urlLength: supabaseUrl?.length
  })
}

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.')
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
          status: 'setup' | 'active' | 'completed' | 'paused'
          current_turn: number | null
          current_round: number
          settings: DraftSettings | null
          room_code: string | null
          is_public: boolean
          spectator_count: number
          description: string | null
          tags: string[] | null
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
          status?: 'setup' | 'active' | 'completed' | 'paused'
          current_turn?: number | null
          current_round?: number
          settings?: DraftSettings | null
          room_code?: string | null
          is_public?: boolean
          spectator_count?: number
          description?: string | null
          tags?: string[] | null
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
          status?: 'setup' | 'active' | 'completed' | 'paused'
          current_turn?: number | null
          current_round?: number
          settings?: DraftSettings | null
          room_code?: string | null
          is_public?: boolean
          spectator_count?: number
          description?: string | null
          tags?: string[] | null
        }
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
        }
        Insert: {
          id?: string
          created_at?: string
          draft_id: string
          name: string
          owner_id?: string | null
          budget_remaining?: number
          draft_order: number
        }
        Update: {
          id?: string
          created_at?: string
          draft_id?: string
          name?: string
          owner_id?: string | null
          budget_remaining?: number
          draft_order?: number
        }
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
          last_seen?: string
        }
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
      }
      user_profiles: {
        Row: {
          id: string
          user_id: string
          display_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          display_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          display_name?: string
          created_at?: string
          updated_at?: string
        }
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
      }
    }
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
export const isSupabaseConfigured = true
export const isSupabaseAvailable = () => true