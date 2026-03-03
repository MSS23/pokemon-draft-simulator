import { supabase } from './supabase'
import { createLogger } from '@/lib/logger'

const log = createLogger('UndoService')

export interface UndoPickParams {
  draftId: string
  teamId: string
  participantId: string
}

export interface UndoPickResult {
  success: boolean
  message: string
  pickId?: string
}

export class UndoService {
  /**
   * Undoes the last pick made by a team
   */
  static async undoLastPick({
    draftId,
    teamId,
  }: UndoPickParams): Promise<UndoPickResult> {
    if (!supabase) {
      return {
        success: false,
        message: 'Supabase not available'
      }
    }

    try {
      const { data, error } = await supabase.rpc('undo_last_pick', {
        p_draft_id: draftId,
        p_team_id: teamId,
      })

      if (error) {
        log.error('Error undoing pick:', error)
        return {
          success: false,
          message: error.message || 'Failed to undo pick'
        }
      }

      const result = data as Record<string, unknown> | null

      return {
        success: (result?.success as boolean) || false,
        message: (result?.message as string) || 'Unknown error',
        pickId: result?.pick_id as string | undefined
      }
    } catch (error) {
      log.error('Error undoing pick:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Gets the draft history for display
   */
  static async getDraftHistory(draftId: string) {
    if (!supabase) {
      return []
    }

    try {
      const { data, error } = await supabase.rpc('get_draft_history', {
        p_draft_id: draftId
      })

      if (error) {
        log.error('Error fetching draft history:', error)
        return []
      }

      return data || []
    } catch (error) {
      log.error('Error fetching draft history:', error)
      return []
    }
  }

  /**
   * Records a draft action (pick, bid, etc.)
   */
  static async recordDraftAction(params: {
    draftId: string
    actionType: 'pick' | 'bid' | 'undo' | 'start' | 'pause' | 'complete'
    teamId: string
    participantId: string
    pokemonId?: string
    pokemonName?: string
    cost?: number
    roundNumber?: number
    pickNumber?: number
    metadata?: Record<string, unknown>
  }) {
    if (!supabase) {
      return null
    }

    try {
      const { data, error } = await supabase.rpc('record_draft_action', {
        p_draft_id: params.draftId,
        p_action_type: params.actionType,
        p_action_data: {
          team_id: params.teamId,
          participant_id: params.participantId,
          pokemon_id: params.pokemonId || null,
          pokemon_name: params.pokemonName || null,
          cost: params.cost || null,
          round_number: params.roundNumber || null,
          pick_number: params.pickNumber || null,
          ...(params.metadata || {})
        }
      })

      if (error) {
        log.error('Error recording draft action:', error)
        return null
      }

      return data
    } catch (error) {
      log.error('Error recording draft action:', error)
      return null
    }
  }

  /**
   * Gets the number of undos remaining for a team
   */
  static async getUndosRemaining(teamId: string): Promise<number> {
    if (!supabase) {
      return 0
    }

    try {
      const { data, error } = await supabase
        .from('teams')
        .select('undos_remaining')
        .eq('id', teamId)
        .single()

      if (error || !data) {
        return 0
      }

      return data.undos_remaining || 0
    } catch (error) {
      log.error('Error getting undos remaining:', error)
      return 0
    }
  }
}
