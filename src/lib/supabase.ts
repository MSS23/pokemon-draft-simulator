import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Get environment variables - these are embedded at build time for NEXT_PUBLIC_ prefixed vars
// Environment variables are provided by Vercel at build time
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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
          settings: Record<string, any> | null
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
          settings?: Record<string, any> | null
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
          settings?: Record<string, any> | null
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
          metadata: Record<string, any>
          created_at: string
        }
        Insert: {
          id?: string
          draft_id: string
          event_type: string
          spectator_id?: string | null
          metadata?: Record<string, any>
          created_at?: string
        }
        Update: {
          id?: string
          draft_id?: string
          event_type?: string
          spectator_id?: string | null
          metadata?: Record<string, any>
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

// Create and export the Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Helper to check if Supabase is configured
export const isSupabaseConfigured = true
export const isSupabaseAvailable = () => true