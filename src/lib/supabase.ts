import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Get environment variables with fallbacks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Function to validate Supabase credentials
function isValidSupabaseConfig(url: string, key: string): boolean {
  // Check if values exist and are not placeholder text
  if (!url || !key) return false
  if (url === 'your-supabase-project-url' || key === 'your-supabase-anon-key') return false

  // Basic URL validation
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'https:' && urlObj.hostname.includes('supabase')
  } catch {
    return false
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
          status: 'setup' | 'active' | 'completed' | 'paused'
          current_turn: number | null
          current_round: number
          settings: Record<string, any> | null
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

// Check if we have valid Supabase configuration
export const isSupabaseConfigured = isValidSupabaseConfig(supabaseUrl, supabaseAnonKey)

// Create Supabase client only if we have valid configuration
let supabaseClient: SupabaseClient<Database> | null = null

if (isSupabaseConfigured) {
  try {
    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey)
  } catch (error) {
    console.warn('Failed to create Supabase client:', error)
    supabaseClient = null
  }
}

// Export the client (will be null if not configured)
export const supabase = supabaseClient

// Helper function to check if Supabase is available
export function isSupabaseAvailable(): boolean {
  return supabase !== null
}